import "server-only";

import { envObrigatoria } from "@/lib/config";

/**
 * Único ponto de acoplamento com o Mercado Pago.
 *
 * O modelo é **nunca custodiar**: o dono autoriza a própria conta por OAuth e
 * toda cobrança é criada com o token DELE, então o `collector_id` é ele por
 * construção e o Pix pousa na conta dele. Dinheiro passando pela nossa conta
 * seria conta bolsão, vedada pelo art. 90-A do Regulamento do Pix
 * (Res. BCB 269/2022) — e não é problema que se resolva com código.
 *
 * Consequência prática para quem mexer aqui: **nenhuma função deste módulo usa
 * credencial nossa para movimentar dinheiro.** `MERCADO_PAGO_CLIENT_SECRET` só
 * aparece no fluxo de OAuth (trocar código e renovar token); tudo que cria,
 * consulta ou estorna cobrança recebe o `accessToken` do dono por parâmetro.
 */

/**
 * Base da API, sobrescrevível.
 *
 * Não é firula de configuração: é o que permite o teste ponta a ponta rodar
 * contra um stub local, **sem nenhuma credencial real e sem tocar em `.env` do
 * projeto**. Sem isso, testar o fluxo exigiria sandbox — que, medido no spike,
 * não cobre este caso (`user_allowed_only_in_test`).
 */
const URL_PADRAO = "https://api.mercadopago.com";

/**
 * O MP **valida o TLD do `payer.email`** e recusa `@…test` (medido no spike).
 * Mas a identidade do cliente final neste produto é o `remote_jid` do WhatsApp:
 * não temos e-mail dele, e pedir um custaria uma etapa de conversa para
 * satisfazer um campo de formulário de terceiro.
 *
 * Então vai um endereço genérico nosso, e isso é minimização (LGPD Art. 6º, III)
 * e não gambiarra: um e-mail que não coletamos é um dado pessoal que não passa a
 * existir num sistema que não precisa dele.
 */
const EMAIL_PAGADOR_PADRAO = "pagamentos@newgensoftware.xyz";

const TIMEOUT_PADRAO_MS = 10_000;

function timeoutPadrao(): number {
  const configurado = Number(process.env.MERCADO_PAGO_TIMEOUT_MS);
  return Number.isFinite(configurado) && configurado > 0
    ? configurado
    : TIMEOUT_PADRAO_MS;
}

function urlBase(): string {
  return (process.env.MERCADO_PAGO_API_URL || URL_PADRAO).replace(/\/+$/, "");
}

export class ErroMercadoPago extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly corpo?: unknown,
  ) {
    super(message);
    this.name = "ErroMercadoPago";
  }

  /**
   * Token inválido ou revogado.
   *
   * É o caminho de UX mais importante deste módulo: significa que o dono
   * desautorizou a aplicação no painel do MP, e a única saída é ele reconectar.
   * Confundir isso com falha genérica faria o painel pedir "tente de novo" para
   * sempre.
   */
  get credencialInvalida(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

async function chamar<T>(
  caminho: string,
  opcoes: {
    metodo?: "GET" | "POST";
    corpo?: unknown;
    token?: string;
    idempotencia?: string;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  const url = `${urlBase()}${caminho}`;
  const cabecalhos: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (opcoes.token) cabecalhos.Authorization = `Bearer ${opcoes.token}`;

  /**
   * `X-Idempotency-Key` é obrigatório na criação de pagamento, e por um motivo
   * que custa dinheiro: sem ela, uma retentativa de rede depois de o MP já ter
   * criado a cobrança geraria uma SEGUNDA cobrança para o mesmo agendamento — e
   * o cliente poderia pagar as duas.
   */
  if (opcoes.idempotencia) cabecalhos["X-Idempotency-Key"] = opcoes.idempotencia;

  let resposta: Response;

  try {
    resposta = await fetch(url, {
      method: opcoes.metodo ?? "GET",
      headers: cabecalhos,
      body:
        opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
      // Nunca cachear: status de pagamento muda, e servir cache aqui seria
      // afirmar que alguém pagou com base numa resposta velha.
      cache: "no-store",
      signal: AbortSignal.timeout(opcoes.timeoutMs ?? timeoutPadrao()),
    });
  } catch (erro) {
    const ehTimeout =
      erro instanceof DOMException &&
      (erro.name === "TimeoutError" || erro.name === "AbortError");

    throw new ErroMercadoPago(
      ehTimeout
        ? `Mercado Pago não respondeu em ${opcoes.timeoutMs ?? timeoutPadrao()}ms em ${caminho}`
        : `Não foi possível alcançar o Mercado Pago em ${caminho}`,
      // 504/503 sintéticos: descrevem a falha local, não vieram do servidor.
      ehTimeout ? 504 : 503,
      erro instanceof Error ? erro.message : String(erro),
    );
  }

  const texto = await resposta.text();
  let corpo: unknown = texto;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    // Resposta não-JSON (proxy, gateway): mantém o texto cru para o log.
  }

  if (!resposta.ok) {
    throw new ErroMercadoPago(
      `Mercado Pago respondeu ${resposta.status} em ${caminho}`,
      resposta.status,
      corpo,
    );
  }

  return corpo as T;
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

export type TokensDoDono = {
  accessToken: string;
  refreshToken: string;
  /** Instante absoluto em que o access token vence. */
  expiraEm: Date;
  /** `user_id` do dono no MP. É o que prova que o recebedor é ele. */
  contaExternaId: string;
};

type RespostaToken = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user_id?: number | string;
};

function interpretarTokens(bruto: RespostaToken, origem: string): TokensDoDono {
  const { access_token, refresh_token, expires_in, user_id } = bruto;

  /**
   * `refresh_token` ausente quase sempre significa `offline_access` desmarcado
   * nas permissões da aplicação — e a falha só apareceria 180 dias depois, como
   * "o bot parou de mandar o Pix". Falhar aqui, alto, é o que transforma um bug
   * de configuração num erro legível no dia da conexão.
   */
  if (!access_token || !refresh_token || !expires_in || user_id == null) {
    /**
     * O corpo cru NÃO vai no erro.
     *
     * Quando falta só o `refresh_token` (o caso comum: `offline_access`
     * desmarcado), esse corpo ainda contém um `access_token` VÁLIDO — e quem
     * captura um `ErroMercadoPago` costuma logar o objeto inteiro. Seria o
     * segredo mais sensível do projeto em texto plano no log da plataforma.
     * Vai só a lista de campos ausentes, que é o que ajuda a diagnosticar.
     */
    const ausentes = [
      !access_token && "access_token",
      !refresh_token && "refresh_token",
      !expires_in && "expires_in",
      user_id == null && "user_id",
    ].filter(Boolean);

    throw new ErroMercadoPago(
      `Resposta de ${origem} incompleta (faltou: ${ausentes.join(", ")}). ` +
        "Sem refresh_token, confira se a permissão `offline_access` está ligada " +
        "nas configurações avançadas da aplicação.",
      502,
    );
  }

  return {
    accessToken: access_token,
    refreshToken: refresh_token,
    expiraEm: new Date(Date.now() + expires_in * 1000),
    contaExternaId: String(user_id),
  };
}

/** Fecha o OAuth: troca o `code` do callback pelo primeiro par de tokens. */
export async function trocarCodigoPorToken(
  codigo: string,
  redirectUri: string,
): Promise<TokensDoDono> {
  const bruto = await chamar<RespostaToken>("/oauth/token", {
    metodo: "POST",
    corpo: {
      grant_type: "authorization_code",
      client_id: envObrigatoria("MERCADO_PAGO_CLIENT_ID"),
      client_secret: envObrigatoria("MERCADO_PAGO_CLIENT_SECRET"),
      code: codigo,
      redirect_uri: redirectUri,
    },
  });

  return interpretarTokens(bruto, "troca de código");
}

/**
 * Renova o access token.
 *
 * **O `refresh_token` ROTACIONA** — medido contra o MP em 2026-07-29 (Q2 do
 * spike): o valor devolvido aqui é diferente do enviado, e o antigo deixa de
 * valer. Quem chama é obrigado a gravar o PAR NOVO na mesma operação; perder a
 * regravação mata a conexão daquele tenant em silêncio, e o sintoma só aparece
 * dias depois, sem erro em lugar nenhum.
 */
export async function renovarToken(
  refreshToken: string,
): Promise<TokensDoDono> {
  const bruto = await chamar<RespostaToken>("/oauth/token", {
    metodo: "POST",
    corpo: {
      grant_type: "refresh_token",
      client_id: envObrigatoria("MERCADO_PAGO_CLIENT_ID"),
      client_secret: envObrigatoria("MERCADO_PAGO_CLIENT_SECRET"),
      refresh_token: refreshToken,
    },
  });

  return interpretarTokens(bruto, "renovação de token");
}

/** URL para onde mandar o dono autorizar. */
export function urlDeAutorizacao(dados: {
  redirectUri: string;
  state: string;
}): string {
  const parametros = new URLSearchParams({
    client_id: envObrigatoria("MERCADO_PAGO_CLIENT_ID"),
    response_type: "code",
    platform_id: "mp",
    redirect_uri: dados.redirectUri,
    state: dados.state,
  });

  return `https://auth.mercadopago.com.br/authorization?${parametros}`;
}

// ---------------------------------------------------------------------------
// Cobrança
// ---------------------------------------------------------------------------

export type PixCriado = {
  /** Id do pagamento no MP. Chave de idempotência do nosso webhook. */
  pagamentoId: string;
  /** Copia-e-cola EMV, como devolvido pelo MP. Nunca fabricado por nós. */
  copiaECola: string;
  /** `user_id` que vai RECEBER. Conferido contra o do dono. `null` = o MP não informou. */
  collectorId: string | null;
};

type RespostaPagamento = {
  id?: number | string;
  status?: string;
  transaction_amount?: number;
  collector_id?: number | string;
  external_reference?: string;
  point_of_interaction?: {
    transaction_data?: { qr_code?: string };
  };
};

/**
 * ISO com offset explícito em vez do `Z`.
 *
 * O `date_of_expiration` do MP é documentado no formato
 * `yyyy-MM-dd'T'HH:mm:ss.SSSZ`, com Z sendo deslocamento (`-03:00`), não a letra
 * Zulu que `toISOString()` produz. Mandar `Z` é o tipo de coisa que funciona no
 * sandbox e é recusada em produção.
 */
function comOffsetExplicito(quando: Date): string {
  return `${quando.toISOString().replace("Z", "")}+00:00`;
}

/**
 * Cria o Pix na conta do DONO.
 *
 * `accessToken` é dele, então `collector_id` é ele e 100% do valor vai para ele
 * — não passamos `application_fee`, e não há split. É o que sustenta, na
 * prática, a afirmação de que nunca custodiamos.
 */
export async function criarPagamentoPix(dados: {
  accessToken: string;
  valorCentavos: number;
  descricao: string;
  /** Nosso id da cobrança, devolvido nas notificações. */
  referenciaExterna: string;
  expiraEm: Date;
  urlNotificacao: string;
  /** Estável por cobrança: é o que impede cobrança dupla numa retentativa. */
  chaveIdempotencia: string;
}): Promise<PixCriado> {
  const bruto = await chamar<RespostaPagamento>("/v1/payments", {
    metodo: "POST",
    token: dados.accessToken,
    idempotencia: dados.chaveIdempotencia,
    corpo: {
      // Centavos são a unidade interna justamente para não fazer aritmética em
      // float com dinheiro de terceiro; a conversão acontece só aqui, na borda.
      transaction_amount: Number((dados.valorCentavos / 100).toFixed(2)),
      description: dados.descricao,
      payment_method_id: "pix",
      external_reference: dados.referenciaExterna,
      notification_url: dados.urlNotificacao,
      date_of_expiration: comOffsetExplicito(dados.expiraEm),
      payer: {
        email: process.env.MERCADO_PAGO_EMAIL_PAGADOR || EMAIL_PAGADOR_PADRAO,
      },
    },
  });

  const copiaECola = bruto.point_of_interaction?.transaction_data?.qr_code;

  if (bruto.id == null || !copiaECola) {
    // Sem o payload não há o que mandar ao cliente, e inventar um a partir de
    // chave guardada seria dinheiro indo para o lugar errado — com falha
    // silenciosa do nosso lado.
    throw new ErroMercadoPago(
      "Mercado Pago não devolveu o código Pix da cobrança",
      502,
      bruto,
    );
  }

  return {
    pagamentoId: String(bruto.id),
    copiaECola,
    /**
     * `null` e não `""` quando ausente: quem confere precisa distinguir "veio
     * outro recebedor" de "não deu para conferir". Com string vazia, uma guarda
     * escrita como `if (x && x !== esperado)` se desliga sozinha no caso em que
     * mais deveria travar.
     */
    collectorId: bruto.collector_id == null ? null : String(bruto.collector_id),
  };
}

export type PagamentoConsultado = {
  pagamentoId: string;
  status: string;
  valorCentavos: number;
  referenciaExterna: string | null;
  /** `approved` é o único status que significa "o dinheiro entrou". */
  aprovado: boolean;
};

/**
 * Reconsulta o pagamento.
 *
 * Obrigatório antes de promover qualquer agendamento: **a notificação diz que
 * algo mudou, não que pagou**, e o corpo dela não é coberto pela assinatura
 * (ver `assinatura-webhook.ts`). Sem esta chamada, um POST forjado com
 * `status: "approved"` liberaria horário sem dinheiro nenhum.
 */
export async function consultarPagamento(dados: {
  accessToken: string;
  pagamentoId: string;
}): Promise<PagamentoConsultado> {
  const bruto = await chamar<RespostaPagamento>(
    `/v1/payments/${encodeURIComponent(dados.pagamentoId)}`,
    { token: dados.accessToken },
  );

  return {
    pagamentoId: String(bruto.id ?? dados.pagamentoId),
    status: bruto.status ?? "desconhecido",
    valorCentavos: Math.round((bruto.transaction_amount ?? 0) * 100),
    referenciaExterna: bruto.external_reference ?? null,
    aprovado: bruto.status === "approved",
  };
}

/**
 * Estorna, total ou parcialmente.
 *
 * Nunca chamada automaticamente. É a conta do dono, e a contestação bate nela —
 * quem decide devolver é ele, por um botão no painel.
 */
export async function estornarPagamento(dados: {
  accessToken: string;
  pagamentoId: string;
  chaveIdempotencia: string;
}): Promise<void> {
  await chamar(
    `/v1/payments/${encodeURIComponent(dados.pagamentoId)}/refunds`,
    {
      metodo: "POST",
      token: dados.accessToken,
      idempotencia: dados.chaveIdempotencia,
      corpo: {},
    },
  );
}
