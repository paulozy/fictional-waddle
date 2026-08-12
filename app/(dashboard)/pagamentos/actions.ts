"use server";

import { randomBytes } from "node:crypto";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { envObrigatoria } from "@/lib/config";
import {
  ErroMercadoPago,
  estornarPagamento,
  urlDeAutorizacao,
} from "@/lib/pagamentos/mercado-pago";
import { obterCredencial, removerCredenciais } from "@/lib/pagamentos/credenciais";
import { COOKIE_STATE } from "@/lib/pagamentos/oauth-state";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import {
  CHAVES_MENSAGEM,
  validarModelo,
  type ChaveMensagem,
} from "@/lib/bot/modelo-mensagem";
import { criarClienteServidor, exigirUsuario } from "@/lib/supabase/server";

/**
 * Conectar e desconectar a conta do PSP do dono.
 *
 * Segue o padrão de `conexao-whatsapp/actions.ts`: tipo de retorno próprio e
 * rico em vez de `EstadoFormulario`, e uma tradução central de erro do provedor
 * — um `ErroMercadoPago` cru chegando à UI vira "erro inesperado", sem nada que
 * indique a causa nem o que fazer.
 */

function redirectUri(): string {
  return envObrigatoria("MERCADO_PAGO_REDIRECT_URI");
}

function mensagemDeErro(erro: unknown): string {
  // Só a mensagem, nunca o objeto: um `ErroMercadoPago` carrega o corpo da
  // resposta do provedor, e despejá-lo já significou token em claro no log.
  console.error("falha na conexão com o Mercado Pago", {
    erro: erro instanceof Error ? erro.message : String(erro),
  });

  if (erro instanceof ErroMercadoPago) {
    if (erro.credencialInvalida) {
      return "O Mercado Pago recusou as credenciais da aplicação. Confira o Client ID e o Client Secret.";
    }
    if (erro.status === 504 || erro.status === 503) {
      return "O Mercado Pago não respondeu. Tente de novo em instantes.";
    }
    return "O Mercado Pago recusou a operação. Tente de novo em instantes.";
  }

  if (erro instanceof Error && erro.message.includes("PAGAMENTO_CRYPTO_KEY")) {
    // Erro de configuração nossa, não do dono. Sem esta distinção ele tentaria
    // reconectar para sempre.
    return "A cobrança de sinal não está configurada neste ambiente. Fale com o suporte.";
  }

  return "Não foi possível falar com o Mercado Pago agora.";
}

/**
 * Devolve a URL para onde mandar o dono autorizar.
 *
 * O `state` é sorteado aqui e guardado num cookie `httpOnly`. Sem ele, qualquer
 * pessoa poderia induzir o dono a abrir uma URL de callback com um `code` de
 * OUTRA conta Mercado Pago — e nós gravaríamos aquela conta como destino dos
 * sinais dele. É CSRF com dinheiro na ponta.
 */
export async function conectarMercadoPago(): Promise<void> {
  await exigirUsuario();

  let destino: string;

  /**
   * Nenhum `redirect()` dentro do `try`.
   *
   * `redirect()` sinaliza por exceção (`NEXT_REDIRECT`), então chamá-lo aqui
   * dentro faria o próprio `catch` engolir a navegação e transformá-la num erro
   * genérico. Montar o destino primeiro e navegar uma única vez no fim remove
   * essa classe inteira de problema.
   */
  try {
    const origemDoRedirect = new URL(redirectUri()).origin;
    const origemAtual = (await headers()).get("origin");

    if (origemAtual && origemAtual !== origemDoRedirect) {
      destino = "/pagamentos?conexao=origem_divergente";
    } else {
      const state = randomBytes(32).toString("base64url");

      (await cookies()).set(COOKIE_STATE, state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 600,
      });

      destino = urlDeAutorizacao({ redirectUri: redirectUri(), state });
    }
  } catch (erro) {
    console.error("falha ao iniciar conexão com o Mercado Pago", {
      erro: erro instanceof Error ? erro.message : String(erro),
    });
    destino = "/pagamentos?conexao=erro_ao_iniciar";
  }

  redirect(destino);
}

export async function desconectarMercadoPago(): Promise<{ erro: string | null }> {
  const usuarioId = await exigirUsuario();

  try {
    await removerCredenciais(criarClienteAdmin(), usuarioId);
    revalidatePath("/pagamentos");
    return { erro: null };
  } catch (erro) {
    return { erro: mensagemDeErro(erro) };
  }
}

/**
 * Estorna um sinal, a pedido do dono.
 *
 * **Nunca automático.** O dinheiro está na conta dele e a contestação bate nela,
 * então devolver é decisão dele — nossa parte é tornar a decisão fácil e
 * registrar que foi tomada.
 */
export async function estornarSinal(
  cobrancaId: string,
): Promise<{ erro: string | null }> {
  const usuarioId = await exigirUsuario();
  const admin = criarClienteAdmin();

  try {
    const { data: cobranca } = await admin
      .from("cobrancas_sinal")
      .select("id, agendamento_id, provedor_pagamento_id, status, estornado_em")
      // A service role ignora RLS: este filtro é a única barreira entre tenants.
      .eq("usuario_id", usuarioId)
      .eq("id", cobrancaId)
      .maybeSingle();

    if (!cobranca) return { erro: "Cobrança não encontrada." };
    if (cobranca.estornado_em) return { erro: null }; // já devolvido: idempotente
    if (cobranca.status !== "pago") {
      return { erro: "Só é possível estornar uma cobrança paga." };
    }

    const credencial = await obterCredencial(admin, usuarioId);
    if (!credencial) {
      return { erro: "Conecte sua conta do Mercado Pago para estornar." };
    }

    await estornarPagamento({
      accessToken: credencial.accessToken,
      pagamentoId: cobranca.provedor_pagamento_id,
      // Estável por cobrança: uma retentativa não devolve duas vezes.
      chaveIdempotencia: `estorno-${cobranca.id}`,
    });

    // Só depois de o PSP confirmar. Marcar antes deixaria o painel dizendo
    // "devolvido" para um dinheiro que continua na conta.
    await admin
      .from("cobrancas_sinal")
      .update({
        status: "estornado",
        estornado_em: new Date().toISOString(),
        estorno_pendente: false,
      })
      .eq("usuario_id", usuarioId)
      .eq("id", cobrancaId);

    await admin
      .from("agendamentos")
      .update({ sinal_status: "estornado" })
      .eq("usuario_id", usuarioId)
      .eq("id", cobranca.agendamento_id);

    revalidatePath("/pagamentos");
    revalidatePath("/agendamentos");
    return { erro: null };
  } catch (erro) {
    return { erro: mensagemDeErro(erro) };
  }
}

/**
 * Prazo para pagar o sinal, em minutos.
 *
 * Sem estado de retorno, no idioma de `alternarServico`: vai direto em
 * `action={}` de um `<form>`, sem ilha de cliente. O `<input type="number">` já
 * carrega `min`/`max`, então o navegador barra o valor fora da faixa antes do
 * envio; aqui o valor é **limitado**, não recusado — devolver erro exigiria
 * hidratar a página inteira para exibir uma mensagem que quase ninguém verá.
 *
 * Valor não numérico não grava nada, e o formulário volta com o valor atual.
 */
/**
 * A política de cancelamento do sinal, escrita pelo dono.
 *
 * **Sem ela a cobrança não liga** (`lib/pagamentos/capacidade.ts`), e o motivo não
 * é burocracia: o bot pedia um Pix sem nunca dizer ao cliente final o que
 * acontece com aquele dinheiro se ele desmarcar. Os Termos jogam a política para
 * o estabelecimento — o que resolve entre nós e o dono, e não resolve nada com
 * quem paga.
 *
 * **Não existe padrão de fábrica**, de propósito. Um texto nosso ("devolvemos em
 * até X dias") seria a Encaixaria decidindo a política comercial de terceiro e
 * anunciando isso ao cliente dele, em nome dele. O que a tela oferece é um
 * exemplo no `placeholder`, que ensina o formato sem ser gravado.
 *
 * Escrita pelo client que respeita RLS: esta coluna **está** no grant por coluna
 * de `perfis`, diferente de `plano` e `pagamento_conectado_em`. A distinção é a
 * mesma do resto da tabela — aqueles são afirmações sobre dinheiro e direito,
 * este é conteúdo autoral do dono, como `nome_estabelecimento`.
 */
export async function salvarPoliticaSinal(formData: FormData): Promise<void> {
  const usuarioId = await exigirUsuario();

  const texto = String(formData.get("politica") ?? "").trim();

  /*
    Os limites espelham o CHECK `perfis_politica_sinal_tamanho`, e são checados
    aqui para virar mensagem em vez de erro 23514 sem contexto.

    O piso de 20 não é arbitrário: o campo existe para **informar**, e "ok"
    satisfaria um `not null` sem informar nada — com o efeito colateral de nos
    deixar afirmar que houve divulgação. O teto de 400 existe porque isto entra em
    toda cobrança, e o WhatsApp trunca mensagem longa com "Ler mais" justamente na
    parte que precisa ser lida antes de pagar.
  */
  if (texto.length < 20 || texto.length > 400) return;

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("perfis")
    .update({ politica_sinal: texto })
    .eq("id", usuarioId);

  if (error) {
    console.error("falha ao salvar política do sinal", {
      usuario_id: usuarioId,
      codigo: error.code,
    });
    return;
  }

  revalidatePath("/pagamentos");
}

export async function salvarPrazoSinal(formData: FormData): Promise<void> {
  const usuarioId = await exigirUsuario();

  /**
   * Campo vazio precisa ser barrado **antes** do `Number`, e é uma armadilha
   * medida: `Number("")` é `0` e `Number("  ")` também — os dois são finitos,
   * então passavam pela checagem abaixo e caíam no piso do clamp. Efeito prático:
   * apagar o conteúdo do campo e salvar **mudava** o prazo em silêncio, para 15,
   * enquanto o JSDoc acima promete que valor inválido não grava nada. Um teste
   * pegou a divergência entre o código e a própria documentação dele.
   */
  const texto = String(formData.get("minutos") ?? "").trim();
  if (texto === "") return;

  const bruto = Number(texto);
  if (!Number.isFinite(bruto)) return;

  /**
   * Piso de 15 minutos, e o número mudou por medição — não por leitura de doc.
   *
   * A versão anterior travava em 30 e justificava com "a doc do MP documenta 30
   * minutos como mínimo do `date_of_expiration`", afirmando que prazo menor faria
   * **toda cobrança ser recusada na criação**. Medido contra a API de produção em
   * 2026-08-11, isso está errado, e errado no sentido pior:
   *
   *  - `2 min`  → o MP **aceita criar** o pagamento, sem reclamar de nada. Quem
   *    recusa é o app do banco do cliente **na hora de pagar**, com
   *    `PIXPP02 — conta destino não pode receber esse Pix no momento`;
   *  - `30 min` → funciona ponta a ponta, pagamento liquidado.
   *
   * A consequência de a recusa ser no pagamento e não na criação é que o sintoma
   * **não passa pelo nosso log**: aparece no celular do cliente, com um texto que
   * o faz desconfiar da conta do salão. Nem `console.error` haveria — para nós, a
   * cobrança nasceu perfeita.
   *
   * **15 minutos ainda não foi medido.** É o valor pedido para o tenant de teste,
   * e está entre um ponto que falha (2) e um que funciona (30). Se aparecer
   * `PIXPP02` com 15, o piso volta a subir — e a evidência vai estar no relato do
   * cliente, não aqui.
   */
  const minutos = Math.min(1440, Math.max(15, Math.round(bruto)));

  // Client que respeita RLS: esta coluna É escrevível pelo dono (está no grant
  // por coluna de `perfis`), diferente de `plano` e `pagamento_conectado_em`.
  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("perfis")
    .update({ sinal_minutos_validade: minutos })
    .eq("id", usuarioId);

  if (error) {
    console.error("falha ao salvar prazo do sinal", {
      usuario_id: usuarioId,
      codigo: error.code,
    });
    return;
  }

  revalidatePath("/pagamentos");
}

/**
 * Estado do formulário de mensagem.
 *
 * `export type` num arquivo `"use server"` é seguro: tipo é apagado na
 * compilação, então não vira export não-async — a regra que vale ali é sobre
 * valor, e é por isso que `COOKIE_STATE` mora em `oauth-state.ts`.
 *
 * A `chave` viaja no estado porque as mensagens compartilham a mesma action: sem
 * ela, um erro numa apareceria embaixo das outras.
 */
export type EstadoMensagem =
  | undefined
  | { ok: true; chave: ChaveMensagem }
  | { erro: string; chave: ChaveMensagem | null };

function ehChaveMensagem(valor: string): valor is ChaveMensagem {
  return (CHAVES_MENSAGEM as string[]).includes(valor);
}

/**
 * Salva (ou volta ao padrão) um texto do bot sobre sinal.
 *
 * Devolve estado, ao contrário de `salvarPrazoSinal`: aqui **recusar é o ponto**.
 * Um placeholder digitado errado precisa parar na tela com explicação — se
 * passasse, o cliente receberia `{valro}` no WhatsApp e o dono descobriria dias
 * depois, pelo cliente. É a mesma direção do léxico fechado da conversa: a falha
 * aceitável é "corrija isto", nunca "aceitei o que você não quis dizer".
 *
 * Campo em branco **apaga a linha** em vez de gravar string vazia: ausência de
 * linha é o que a leitura do bot entende como "usa o padrão", e gravar branco
 * faria o bot enviar mensagem vazia — que a Evolution aceita e o cliente recebe
 * como uma bolha em branco.
 *
 * Client que respeita RLS: estes textos são conteúdo do dono, e a tabela lhe dá
 * CRUD completo — diferente das colunas de sinal, que afirmam que dinheiro entrou.
 */
export async function salvarMensagemSinal(
  _anterior: EstadoMensagem,
  formData: FormData,
): Promise<EstadoMensagem> {
  const usuarioId = await exigirUsuario();

  const chave = String(formData.get("chave") ?? "");
  if (!ehChaveMensagem(chave)) {
    // Só chega aqui com FormData forjado: a tela manda um campo oculto fixo.
    return { erro: "Mensagem desconhecida.", chave: null };
  }

  /**
   * `restaurar` é caminho próprio, e não "salvar com o campo vazio".
   *
   * Desde que o campo nasce preenchido com o texto padrão, apagar tudo deixou de
   * ser o gesto natural de voltar atrás — e um botão explícito também não corre o
   * risco de o dono limpar o campo por engano e gravar isso. Os dois desfechos
   * apagam a linha: ausência de linha é o que a leitura do bot entende como "usa o
   * padrão".
   */
  const restaurar = formData.get("acao") === "restaurar";

  const validacao = restaurar
    ? ({ ok: true, texto: "" } as const)
    : validarModelo(chave, String(formData.get("texto") ?? ""));

  if (!validacao.ok) return { erro: validacao.erro, chave };

  const supabase = await criarClienteServidor();

  const { error } =
    validacao.texto === ""
      ? await supabase
          .from("mensagens_tenant")
          .delete()
          .eq("usuario_id", usuarioId)
          .eq("chave", chave)
      : await supabase.from("mensagens_tenant").upsert(
          {
            usuario_id: usuarioId,
            chave,
            texto: validacao.texto,
            atualizado_em: new Date().toISOString(),
          },
          { onConflict: "usuario_id,chave" },
        );

  if (error) {
    console.error("falha ao salvar mensagem do sinal", {
      usuario_id: usuarioId,
      chave,
      codigo: error.code,
    });
    return { erro: "Não foi possível salvar este texto.", chave };
  }

  revalidatePath("/pagamentos");
  return { ok: true, chave };
}
