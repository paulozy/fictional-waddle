import {
  formatarQuando,
  montarTextoSinalRecebido,
  montarTextoSinalSemHorario,
} from "@/lib/bot/mensagens-pagamento";
import { ErroEvolutionApi, enviarTexto } from "@/lib/evolution-api";
import { assinaturaValida } from "@/lib/pagamentos/assinatura-webhook";
import { obterCredencial } from "@/lib/pagamentos/credenciais";
import { consultarPagamento } from "@/lib/pagamentos/mercado-pago";
import { criarClienteAdmin } from "@/lib/supabase/admin";

type ClienteAdmin = ReturnType<typeof criarClienteAdmin>;

/**
 * Notificações de pagamento do Mercado Pago.
 *
 * Chega **sem sessão** e de fora, então tudo aqui é defensivo. Três invariantes
 * governam o arquivo:
 *
 * 1. **A assinatura é o único portão**, e é fail-closed. Sem segredo configurado,
 *    ninguém entra.
 * 2. **O corpo da notificação NÃO é confiável.** A assinatura cobre um manifesto
 *    montado a partir do id do recurso, do `x-request-id` e do `ts` — não o
 *    payload. Um POST forjado com `status: "approved"` é sintaticamente idêntico
 *    a um legítimo. Por isso o status vem sempre de uma RECONSULTA à API do MP,
 *    com o token do dono.
 * 3. **Nunca lançar** — mas *responder* 200 e *pedir reentrega* são coisas
 *    diferentes, e confundir as duas custa dinheiro real (ver `reentregar`).
 */

export const maxDuration = 30;

/**
 * Tratado em definitivo: o MP pode parar de reentregar.
 *
 * Vale para o que **não muda se tentar de novo**: id desconhecido, tópico que
 * não tratamos, pagamento que ainda não foi aprovado, reentrega de algo já
 * processado, valor divergente.
 */
function ok(detalhe?: string) {
  return Response.json({ ok: true, detalhe: detalhe ?? null });
}

/**
 * Falha transitória: pede ao MP que reentregue.
 *
 * **Esta distinção é a diferença entre um cliente atendido e um cliente que
 * pagou e ficou sem horário.** Não existe reconciliação em lugar nenhum: este
 * endpoint é o único chamador de `consultarPagamento`, então uma notificação
 * respondida com 200 por engano é uma confirmação perdida PARA SEMPRE.
 *
 * O caminho do dano é silencioso: o Pix caiu, respondemos 200 por um timeout de
 * 10s, `sinal_status` fica `aguardando`, a varredura de prazo cancela o
 * agendamento minutos depois com `sinal_nao_pago`, e como `confirmar_sinal_pago`
 * nunca rodou, `estorno_pendente` **não** é marcado — o caso não aparece nem na
 * lista de devoluções do painel. Ninguém no sistema fica sabendo.
 *
 * O laço de reentrega que se quer evitar é o de erro PERMANENTE, e todos esses
 * já respondem 200 acima.
 */
function reentregar(detalhe: string) {
  return Response.json({ ok: false, detalhe }, { status: 503 });
}

/**
 * O `data.id` chega na query string (`?data.id=123&type=payment`) e também no
 * corpo. A query é a fonte preferida porque **é ela que o MP usa para montar o
 * manifesto assinado** — ler do corpo e validar contra a query deixaria os dois
 * fora de sincronia num payload forjado.
 */
function extrairIdDoPagamento(url: URL, corpo: unknown): string | null {
  const daQuery = url.searchParams.get("data.id") ?? url.searchParams.get("id");
  if (daQuery) return daQuery;

  const dados = corpo as { data?: { id?: unknown } } | null;
  const doCorpo = dados?.data?.id;

  return doCorpo == null ? null : String(doCorpo);
}

function ehNotificacaoDePagamento(url: URL, corpo: unknown): boolean {
  const tipo =
    url.searchParams.get("type") ??
    url.searchParams.get("topic") ??
    (corpo as { type?: string } | null)?.type;

  return tipo === "payment";
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const corpo = await request.json().catch(() => null);

  const pagamentoId = extrairIdDoPagamento(url, corpo);
  if (!pagamentoId) return ok("sem id de pagamento");

  /**
   * A validação vem ANTES de qualquer consulta ao banco.
   *
   * Sem isso, um atacante com uma lista de ids conseguiria nos fazer varrer a
   * tabela e bater na API do MP à vontade — um amplificador de tráfego que não
   * custa nada para ele e custa por requisição para nós.
   */
  if (
    !assinaturaValida({
      header: request.headers.get("x-signature"),
      dataId: pagamentoId,
      requestId: request.headers.get("x-request-id"),
      segredo: process.env.MERCADO_PAGO_WEBHOOK_SECRET ?? "",
    })
  ) {
    console.warn("webhook de pagamento com assinatura inválida", {
      pagamento_id: pagamentoId,
    });
    // 401 e não 200: aqui a reentrega do MP é desejável (pode ser segredo em
    // rotação), e um 200 diria a um atacante que o payload foi aceito.
    return Response.json({ erro: "assinatura inválida" }, { status: 401 });
  }

  // Merchant orders e outros tópicos chegam no mesmo endpoint.
  if (!ehNotificacaoDePagamento(url, corpo)) return ok("tópico não tratado");

  const admin = criarClienteAdmin();

  const { data: cobranca, error: erroLeitura } = await admin
    .from("cobrancas_sinal")
    .select("id, usuario_id, agendamento_id, valor_centavos, status")
    .eq("provedor_pagamento_id", pagamentoId)
    .maybeSingle();

  /**
   * O `error` precisa ser lido, e não descartado.
   *
   * Sem isto, uma instabilidade do PostgREST fica indistinguível de "notificação
   * de outra aplicação" — as duas dariam `cobranca` nulo — e um pagamento real
   * seria descartado com 200.
   */
  if (erroLeitura) {
    console.error("falha ao ler cobrança na notificação de pagamento", {
      pagamento_id: pagamentoId,
      codigo: erroLeitura.code,
    });
    return reentregar("falha ao ler cobrança");
  }

  // Notificação de outra aplicação, ou de cobrança que nunca foi nossa. Este
  // sim é definitivo: reentregar não faria a linha aparecer.
  if (!cobranca) return ok("cobrança desconhecida");

  try {
    return await processarPagamento(admin, cobranca, pagamentoId);
  } catch (erro) {
    /**
     * Timeout do MP, `/oauth/token` fora do ar, erro da RPC, chave de cifra
     * ausente — todos transitórios, todos recuperáveis por reentrega. Nunca
     * lançamos (500 sem corpo), mas também não fingimos que deu certo.
     */
    console.error("falha ao processar notificação de pagamento", {
      usuario_id: cobranca.usuario_id,
      pagamento_id: pagamentoId,
      erro: erro instanceof Error ? erro.message : String(erro),
    });
    return reentregar("falha transitória");
  }
}

type Cobranca = {
  id: string;
  usuario_id: string;
  agendamento_id: string;
  valor_centavos: number;
  status: string;
};

async function processarPagamento(
  admin: ClienteAdmin,
  cobranca: Cobranca,
  pagamentoId: string,
) {
  const credencial = await obterCredencial(admin, cobranca.usuario_id);

  if (!credencial) {
    // Sem token não há como reconsultar, e sem reconsultar não se promove nada.
    // O sinal fica pendente e vence sozinho; o dono vê a pendência no painel.
    console.error("notificação de pagamento sem credencial do dono", {
      usuario_id: cobranca.usuario_id,
    });
    return ok("sem credencial");
  }

  /**
   * Invariante 2, materializada: o status vem daqui, nunca do corpo do POST.
   *
   * "A notificação diz que algo mudou, não que pagou" — e mudanças que não são
   * pagamento (autorização, atualização de status intermediário) chegam pelo
   * mesmo canal.
   */
  const pagamento = await consultarPagamento({
    accessToken: credencial.accessToken,
    pagamentoId,
  });

  if (!pagamento.aprovado) {
    return ok(`pagamento em ${pagamento.status}`);
  }

  const { data: resultado, error } = await admin.rpc("confirmar_sinal_pago", {
    p_provedor_pagamento_id: pagamentoId,
    // Da RECONSULTA, não do corpo. É o que impede um POST forjado de "pagar"
    // um valor que ninguém depositou.
    p_valor_centavos: pagamento.valorCentavos,
  });

  if (error) throw error;

  // Reentrega é o caso normal, não erro: o MP reenvia a mesma notificação
  // várias vezes, e mandar a confirmação de novo duplicaria a mensagem.
  if (resultado === "ja_processado") return ok("já processado");

  if (resultado === "valor_divergente") {
    console.error("valor pago diverge do cobrado", {
      usuario_id: cobranca.usuario_id,
      esperado: cobranca.valor_centavos,
      recebido: pagamento.valorCentavos,
    });
    return ok("valor divergente");
  }

  await avisarCliente(admin, cobranca, resultado as string);

  return ok(String(resultado));
}

/**
 * Manda ao cliente o desfecho.
 *
 * Falha de envio **não** propaga: o dinheiro já entrou e o agendamento já foi
 * promovido no banco. Derrubar por causa da Evolution API faria o MP reentregar,
 * e a reentrega cairia em `ja_processado` — que não reenvia mensagem nenhuma. O
 * cliente ficaria sem aviso e o horário existiria. Mesma escolha de
 * `enviarComTolerancia` no webhook do bot.
 */
async function avisarCliente(
  admin: ClienteAdmin,
  cobranca: Cobranca,
  resultado: string,
) {
  /**
   * Duas consultas, e não um join.
   *
   * A FK de `agendamentos.usuario_id` aponta para `auth.users`, não para
   * `perfis`, então o PostgREST não tem relação para embutir — pedir
   * `perfis:usuario_id(...)` falha no gerador de tipos, não em runtime, que é
   * a hora certa de descobrir.
   */
  const [{ data: agendamento }, { data: perfil }] = await Promise.all([
    admin
      .from("agendamentos")
      .select("data_hora, servicos(nome), clientes_finais(remote_jid)")
      .eq("usuario_id", cobranca.usuario_id)
      .eq("id", cobranca.agendamento_id)
      .maybeSingle(),
    admin
      .from("perfis")
      .select("evolution_instance_name, fuso_horario, nome_estabelecimento")
      .eq("id", cobranca.usuario_id)
      .maybeSingle(),
  ]);

  const destino = agendamento?.clientes_finais?.remote_jid;

  if (!agendamento || !destino || !perfil?.evolution_instance_name) {
    console.error("não foi possível avisar o cliente sobre o sinal", {
      usuario_id: cobranca.usuario_id,
      agendamento_id: cobranca.agendamento_id,
    });
    return;
  }

  const texto =
    resultado === "estorno_pendente"
      ? // O nome do estabelecimento é opcional no perfil, e este texto manda o
        // cliente procurar alguém — sem nome, a frase genérica ainda funciona,
        // porque a conversa acontece no próprio número do salão.
        montarTextoSinalSemHorario(
          perfil.nome_estabelecimento ?? "o estabelecimento",
        )
      : montarTextoSinalRecebido({
          valorCentavos: cobranca.valor_centavos,
          servicoNome: agendamento.servicos?.nome ?? "seu serviço",
          quando: formatarQuando(agendamento.data_hora, perfil.fuso_horario),
        });

  try {
    await enviarTexto(perfil.evolution_instance_name, destino, texto);
  } catch (erro) {
    console.error("falha ao avisar cliente sobre o sinal", {
      usuario_id: cobranca.usuario_id,
      status: erro instanceof ErroEvolutionApi ? erro.status : null,
    });
  }
}
