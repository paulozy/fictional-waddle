import "server-only";

import { envObrigatoria } from "@/lib/config";

/**
 * Único ponto de acoplamento com a Evolution API.
 *
 * A V0 roda contra a **2.3.7**. A 2.4.0 introduziu ativação obrigatória de
 * licença: sem ativar, todos os endpoints de negócio respondem
 * `503 LICENSE_REQUIRED`. Manter tudo atrás deste módulo é o que permite trocar
 * de versão (ou de provedor) mexendo num arquivo só.
 *
 * Autenticação é sempre o header `apikey`. A chave global gerencia instâncias; o
 * `hash` devolvido no create serve para operar aquela instância.
 */

/**
 * `STATUS_INSTANCE` é o **único** evento que carrega o
 * `disconnectionReasonCode`. Sem ele o app recebe o `CONNECTION_UPDATE` de
 * queda e nunca o motivo — e os motivos pedem respostas diferentes: `401`
 * (loggedOut) significa que o dono desvinculou o aparelho e só re-parear
 * resolve, enquanto os outros são transitórios e voltam sozinhos.
 *
 * A assinatura só vale depois de `configurarWebhook` rodar de novo na
 * instância; `gerarQrCode` reregistra a cada chamada, então instâncias antigas
 * passam a mandar o evento na próxima geração de QR.
 */
export const NOME_EVENTOS_WEBHOOK = [
  "MESSAGES_UPSERT",
  "CONNECTION_UPDATE",
  "QRCODE_UPDATED",
  "STATUS_INSTANCE",
] as const;

export type { EstadoConexao } from "@/lib/tipos";
import type { EstadoConexao } from "@/lib/tipos";

/**
 * Tetos por operação.
 *
 * Um valor único não serve: `/instance/create` sobe uma sessão Baileys e gera o
 * QR (medido em ~10s+ num self-hosted local), enquanto `connectionState` e
 * `sendText` respondem em milissegundos. Com 10s para tudo, o create abortava do
 * lado do cliente **depois** de ter dado certo no servidor, deixando uma
 * instância órfã em `connecting` e um "erro inesperado" na tela.
 *
 * `EVOLUTION_TIMEOUT_MS` sobrescreve o default — útil num servidor lento e nos
 * testes.
 */
const TIMEOUT_PADRAO_MS = 10_000;
const TIMEOUT_CRIAR_INSTANCIA_MS = 60_000;

function timeoutPadrao(): number {
  const configurado = Number(process.env.EVOLUTION_TIMEOUT_MS);
  return Number.isFinite(configurado) && configurado > 0
    ? configurado
    : TIMEOUT_PADRAO_MS;
}

export class ErroEvolutionApi extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly corpo?: unknown,
    /** Verdadeiro quando a instância existe na API mas não está licenciada. */
    readonly licencaAusente = false,
  ) {
    super(message);
    this.name = "ErroEvolutionApi";
  }

  /**
   * A instância já existe. A Evolution responde 403 nesse caso, o que é fácil
   * confundir com problema de credencial.
   */
  get instanciaJaExiste(): boolean {
    if (this.status !== 403) return false;
    return JSON.stringify(this.corpo ?? "").includes("already in use");
  }
}

function urlBase(): string {
  return envObrigatoria("EVOLUTION_API_URL").replace(/\/+$/, "");
}

function urlDoWebhook(instancia: string): string {
  const base = envObrigatoria("WEBHOOK_BASE_URL").replace(/\/+$/, "");
  return `${base}/api/webhook/whatsapp/${instancia}`;
}

/**
 * Config de webhook registrada na instância.
 *
 * `byEvents: false` é obrigatório para o nosso desenho: com `true`, a Evolution
 * anexa o nome do evento à URL (`/webhook/messages-upsert`) e a rota única
 * `/api/webhook/whatsapp/[instance]` nunca receberia nada. O dispatch é feito
 * pelo campo `event` do corpo.
 *
 * O header secreto é a autenticação real do webhook — o `[instance]` da URL é um
 * UUID, não um segredo.
 */
function configWebhook(instancia: string) {
  return {
    enabled: true,
    url: urlDoWebhook(instancia),
    byEvents: false,
    base64: false,
    headers: {
      "Content-Type": "application/json",
      "x-agendazap-secret": envObrigatoria("WEBHOOK_SECRET"),
    },
    events: [...NOME_EVENTOS_WEBHOOK],
  };
}

async function chamar<T>(
  caminho: string,
  opcoes: {
    metodo?: "GET" | "POST" | "DELETE";
    corpo?: unknown;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  const url = `${urlBase()}${caminho}`;
  let resposta: Response;

  try {
    resposta = await fetch(url, {
      method: opcoes.metodo ?? "GET",
      headers: {
        "Content-Type": "application/json",
        apikey: envObrigatoria("EVOLUTION_API_ADMIN_KEY"),
      },
      body:
        opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
      // Nunca cachear: estado de conexão e QR code mudam a cada segundo.
      cache: "no-store",
      // `fetch` não tem timeout por default. Sem isto, um Evolution que aceita a
      // conexão e não responde travaria o handler até a plataforma matar a
      // função.
      signal: AbortSignal.timeout(opcoes.timeoutMs ?? timeoutPadrao()),
    });
  } catch (erro) {
    // Converte falha de transporte em erro tipado. Um DOMException cru vazando
    // até a UI virava "erro inesperado", sem nada que indicasse a causa.
    const ehTimeout =
      erro instanceof DOMException &&
      (erro.name === "TimeoutError" || erro.name === "AbortError");

    throw new ErroEvolutionApi(
      ehTimeout
        ? `Evolution API não respondeu em ${opcoes.timeoutMs ?? timeoutPadrao()}ms em ${caminho}`
        : `Não foi possível alcançar a Evolution API em ${caminho}`,
      // 504/503 sintéticos: não vieram do servidor, descrevem a falha local.
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
    const licencaAusente =
      resposta.status === 503 && texto.includes("LICENSE_REQUIRED");

    throw new ErroEvolutionApi(
      licencaAusente
        ? "A instância da Evolution API não está licenciada (503 LICENSE_REQUIRED). " +
          "A V0 roda na versão 2.3.7, que não exige ativação."
        : `Evolution API respondeu ${resposta.status} em ${caminho}`,
      resposta.status,
      corpo,
      licencaAusente,
    );
  }

  return corpo as T;
}

type RespostaCriarInstancia = {
  instance?: { instanceName?: string; status?: string };
  hash?: string | { apikey?: string };
  qrcode?: {
    base64?: string;
    code?: string;
    pairingCode?: string | null;
    count?: number;
  };
};

/**
 * Cria a instância do usuário, já com o webhook registrado.
 *
 * O nome da instância é o `usuario_id`, para que o webhook resolva o tenant a
 * partir da URL sem ambiguidade.
 *
 * `numero` é opcional e é o que faz a Evolution devolver **código de
 * pareamento** junto do QR: sem ele o Baileys nunca chama
 * `requestPairingCode` e `pairingCode` volta `null`. Passar aqui, e não só no
 * `/instance/connect`, não é redundância — o controller da Evolution só honra
 * o `number` do connect quando o estado é `close`, e uma instância recém-criada
 * fica em `connecting` respondendo com o QR em cache. Verificado contra a
 * 2.3.7: criar com `number` devolve `qrcode.pairingCode` preenchido.
 */
export async function criarInstancia(usuarioId: string, numero?: string) {
  const resposta = await chamar<RespostaCriarInstancia>("/instance/create", {
    metodo: "POST",
    corpo: {
      instanceName: usuarioId,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
      ...(numero ? { number: numero } : {}),
      webhook: configWebhook(usuarioId),
    },
    // Sobe uma sessão Baileys e gera o QR: é a operação mais lenta da API.
    timeoutMs: TIMEOUT_CRIAR_INSTANCIA_MS,
  });

  return {
    qrCodeBase64: resposta.qrcode?.base64 ?? null,
    // Só vem preenchido quando `numero` foi informado acima.
    codigoPareamento: resposta.qrcode?.pairingCode ?? null,
    /**
     * Linha de base para detectar QR em cache nas buscas seguintes (ver
     * `lib/qr-pareamento.ts`). O create da 2.3.7 já devolve `count: 1`;
     * assumir zero aqui faria a primeira renovação parecer código novo.
     */
    regeracoes:
      typeof resposta.qrcode?.count === "number" ? resposta.qrcode.count : null,
    // Em algumas versões `hash` é string, em outras um objeto com apikey.
    tokenInstancia:
      typeof resposta.hash === "string"
        ? resposta.hash
        : (resposta.hash?.apikey ?? null),
  };
}

type RespostaConectar = {
  base64?: string;
  code?: string;
  pairingCode?: string | null;
  count?: number;
};

/**
 * QR code atual da instância, para exibir no dashboard.
 *
 * `count` é quantas vezes a Evolution já regerou o QR nesta sessão de
 * pareamento. Importa por dois motivos: é o sinal de que o código anterior
 * expirou (o QR do Baileys morre em segundos, e o tempo exato varia por versão
 * e servidor — por isso a tela trata expiração como evento observado e não como
 * temporizador chutado), e é o que se compara com o `QRCODE_LIMIT` da Evolution,
 * default 30, depois do qual a instância desiste e fica presa em `connecting`.
 *
 * `numero` habilita o **código de pareamento**, que é o único caminho de
 * onboarding possível pelo celular — lá o QR está no mesmo aparelho que
 * precisaria fotografá-lo. Ressalva medida na 2.3.7: o controller só honra o
 * `number` quando a instância está em `close`; em `connecting`/`open` ele
 * devolve o QR em cache e ignora o parâmetro. Daí `criarInstancia` também
 * aceitar o número — juntos, os dois cobrem primeiro acesso e reconexão.
 */
export async function obterQrCode(instancia: string, numero?: string) {
  const busca = numero ? `?number=${encodeURIComponent(numero)}` : "";
  const resposta = await chamar<RespostaConectar>(
    `/instance/connect/${encodeURIComponent(instancia)}${busca}`,
  );

  return {
    base64: resposta.base64 ?? null,
    codigo: resposta.code ?? null,
    codigoPareamento: resposta.pairingCode ?? null,
    regeracoes: typeof resposta.count === "number" ? resposta.count : null,
  };
}

/** Traduz o vocabulário da Evolution para o nosso. `open` = pareado. */
export function traduzirEstado(estado: string | undefined): EstadoConexao {
  switch (estado) {
    case "open":
      return "conectado";
    case "connecting":
      return "conectando";
    default:
      return "desconectado";
  }
}

/**
 * Consulta o estado real da conexão.
 *
 * Necessário mesmo tendo o webhook `CONNECTION_UPDATE`: webhook se perde, e a
 * sessão cai sozinha com frequência (celular sem bateria, WhatsApp Web
 * deslogado, chip trocado). A tela de conexão consulta isto no carregamento em
 * vez de confiar apenas no último evento recebido.
 */
export async function obterEstadoConexao(
  instancia: string,
): Promise<EstadoConexao> {
  const resposta = await chamar<{ instance?: { state?: string } }>(
    `/instance/connectionState/${encodeURIComponent(instancia)}`,
  );

  return traduzirEstado(resposta.instance?.state);
}

/** (Re)registra o webhook de uma instância que já existe. */
export async function configurarWebhook(instancia: string) {
  await chamar(`/webhook/set/${encodeURIComponent(instancia)}`, {
    metodo: "POST",
    corpo: { webhook: configWebhook(instancia) },
  });
}

/**
 * Envia texto.
 *
 * `destino` é o JID cru recebido no webhook, ou o JID guardado no primeiro
 * contato. Nunca reconstruir número a partir de telefone (DDI, 9º dígito): é
 * fonte de bug, e JIDs `@lid` não carregam telefone algum.
 *
 * O corpo é **plano** (`{ number, text }`). O formato `{ textMessage: { text } }`
 * é da v1 e ainda aparece em muitos tutoriais.
 */
export async function enviarTexto(
  instancia: string,
  destino: string,
  texto: string,
) {
  await chamar(`/message/sendText/${encodeURIComponent(instancia)}`, {
    metodo: "POST",
    corpo: { number: destino, text: texto },
  });
}

/**
 * Exclui a instância. O verbo é DELETE — com POST a Evolution v2 responde
 * `404 Cannot POST /instance/delete/...`, que é fácil de confundir com
 * "instância não existe".
 */
export async function excluirInstancia(instancia: string) {
  await chamar(`/instance/delete/${encodeURIComponent(instancia)}`, {
    metodo: "DELETE",
  });
}
