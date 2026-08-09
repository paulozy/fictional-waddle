"use server";

import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { envObrigatoria } from "@/lib/config";
import {
  ErroMercadoPago,
  estornarPagamento,
  urlDeAutorizacao,
} from "@/lib/pagamentos/mercado-pago";
import { obterCredencial, removerCredenciais } from "@/lib/pagamentos/credenciais";
import { COOKIE_STATE } from "@/lib/pagamentos/oauth-state";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor, exigirUsuario } from "@/lib/supabase/server";

/**
 * Conectar e desconectar a conta do PSP do dono.
 *
 * Segue o padrão de `conexao-whatsapp/actions.ts`: tipo de retorno próprio e
 * rico em vez de `EstadoFormulario`, e uma tradução central de erro do provedor
 * — um `ErroMercadoPago` cru chegando à UI vira "erro inesperado", sem nada que
 * indique a causa nem o que fazer.
 */

export type ResultadoConexao = { url: string; erro: null } | { url: null; erro: string };

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
export async function iniciarConexaoMercadoPago(): Promise<ResultadoConexao> {
  await exigirUsuario();

  try {
    const state = randomBytes(32).toString("base64url");

    (await cookies()).set(COOKIE_STATE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });

    return { url: urlDeAutorizacao({ redirectUri: redirectUri(), state }), erro: null };
  } catch (erro) {
    return { url: null, erro: mensagemDeErro(erro) };
  }
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
export async function salvarPrazoSinal(formData: FormData): Promise<void> {
  const usuarioId = await exigirUsuario();

  const bruto = Number(formData.get("minutos"));
  if (!Number.isFinite(bruto)) return;

  /**
   * Piso de 30 minutos, e não 5.
   *
   * A doc do Mercado Pago documenta 30 minutos como período mínimo do
   * `date_of_expiration` de um Pix. Com prazo menor, TODA cobrança daquele
   * tenant seria recusada na criação — e como a falha é fail-open, o
   * agendamento sairia confirmado sem sinal, tendo como único sinal um
   * `console.error`. O dono levaria dias para descobrir.
   *
   * Ainda não foi medido contra o servidor real (o spike nunca chegou a criar
   * cobrança — ver o beco sem saída do sandbox no README dele). Na primeira
   * passada real, confirmar; se o limite for outro, este é o número a ajustar.
   */
  const minutos = Math.min(1440, Math.max(30, Math.round(bruto)));

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
