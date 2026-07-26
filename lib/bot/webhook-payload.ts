/**
 * Leitura do payload de webhook da Evolution API. Módulo **puro**.
 *
 * Todo o cuidado aqui é contra dado do mundo real: mensagem do próprio bot
 * (que viraria loop infinito), grupo, status, mídia sem texto, e JID no formato
 * novo `@lid` que não carrega telefone.
 */

export type EventoWebhook =
  | "mensagem"
  | "conexao"
  | "qrcode"
  | "status"
  | "ignorado";

export type MensagemWebhook = {
  /** `data.key.id` — chave de idempotência. */
  id: string;
  /** JID cru. É a identidade da conversa; nunca reconstruir número a partir dele. */
  remoteJid: string;
  texto: string;
  /** `data.pushName` — único nome de cliente disponível na V0. */
  pushName: string | null;
  /** Best-effort: só existe quando o JID é `@s.whatsapp.net`. */
  telefone: string | null;
};

type Registro = Record<string, unknown>;

function objeto(valor: unknown): Registro | null {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
    ? (valor as Registro)
    : null;
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.length > 0 ? valor : null;
}

/**
 * Classifica o payload pelo campo `event` do corpo.
 *
 * `QRCODE_UPDATED` já era assinado em `NOME_EVENTOS_WEBHOOK`, mas caía no
 * `"ignorado"` — a aplicação recebia toda regeração de QR e jogava fora. Ele não
 * altera dado nenhum; serve de sinal de vida durante o pareamento, quando o dono
 * está olhando a tela sem saber se o servidor travou.
 */
export function classificarEvento(payload: unknown): EventoWebhook {
  const corpo = objeto(payload);
  const evento = texto(corpo?.event)?.toUpperCase().replace(/[.\-]/g, "_");

  if (evento === "MESSAGES_UPSERT") return "mensagem";
  if (evento === "CONNECTION_UPDATE") return "conexao";
  if (evento === "QRCODE_UPDATED") return "qrcode";
  if (evento === "STATUS_INSTANCE") return "status";
  return "ignorado";
}

/**
 * Motivo numérico da queda da conexão, quando a Evolution informa.
 *
 * Vem **só** no `STATUS_INSTANCE` — o `CONNECTION_UPDATE` de queda diz que
 * caiu, nunca por quê. A diferença importa para o suporte e, adiante, para o
 * texto da tela: `401` (`loggedOut`) é o dono tendo desvinculado o aparelho, e
 * exige re-parear; `428` e afins são quedas transitórias que voltam sozinhas.
 *
 * Duas formas de payload porque a Evolution move o campo entre versões: solto
 * em `data`, ou aninhado sob `data.status`. Ler as duas evita depender da
 * versão do servidor, como já se faz em `extrairContagemQrCode`.
 */
export function extrairMotivoDesconexao(payload: unknown): number | null {
  const dados = objeto(objeto(payload)?.data);
  const direto = dados?.disconnectionReasonCode;
  const aninhado = objeto(dados?.status)?.disconnectionReasonCode;
  const valor = typeof direto === "number" ? direto : aninhado;

  return typeof valor === "number" ? valor : null;
}

/**
 * Quantas vezes o QR já foi regerado, quando o evento traz essa contagem.
 *
 * A Evolution manda em `data.qrcode.count` numa versão e em `data.count` em
 * outra; ler as duas evita depender da versão do servidor.
 */
export function extrairContagemQrCode(payload: unknown): number | null {
  const dados = objeto(objeto(payload)?.data);
  const aninhado = objeto(dados?.qrcode)?.count;
  const direto = dados?.count;
  const valor = typeof aninhado === "number" ? aninhado : direto;

  return typeof valor === "number" ? valor : null;
}

/**
 * Telefone a partir do JID, quando dá.
 *
 * `5511999998888@s.whatsapp.net` → `5511999998888`.
 * `154417159582282@lid` → `null`: Linked ID não é telefone, e tratar como se
 * fosse produziria número inválido.
 */
export function telefoneDoJid(remoteJid: string): string | null {
  const [identificador, dominio] = remoteJid.split("@");
  if (dominio !== "s.whatsapp.net") return null;

  // Alguns JIDs vêm com sufixo de dispositivo (`:12`) ou agenda (`_1`).
  const digitos = identificador.split(/[:_]/)[0];
  return /^\d{8,15}$/.test(digitos) ? digitos : null;
}

export function ehGrupo(remoteJid: string): boolean {
  return remoteJid.endsWith("@g.us");
}

export function ehBroadcast(remoteJid: string): boolean {
  return remoteJid === "status@broadcast" || remoteJid.endsWith("@broadcast");
}

/**
 * Extrai a mensagem de um `MESSAGES_UPSERT`, ou `null` quando deve ser ignorada.
 *
 * Motivos de ignorar, todos observados em produção:
 *  - `fromMe: true` — é a própria resposta do bot voltando; processar cria loop
 *  - grupo (`@g.us`) — o bot não atende grupo
 *  - `status@broadcast` — status do WhatsApp, não é conversa
 *  - mídia sem legenda (áudio, sticker, imagem) — a V0 é menu numerado
 */
export function extrairMensagem(payload: unknown): MensagemWebhook | null {
  const dados = objeto(objeto(payload)?.data);
  if (!dados) return null;

  const chave = objeto(dados.key);
  if (!chave) return null;

  if (chave.fromMe === true) return null;

  const remoteJid = texto(chave.remoteJid);
  const id = texto(chave.id);
  if (!remoteJid || !id) return null;

  if (ehGrupo(remoteJid) || ehBroadcast(remoteJid)) return null;

  const mensagem = objeto(dados.message);
  if (!mensagem) return null;

  // O texto vem em `conversation` na mensagem simples e em
  // `extendedTextMessage.text` quando há citação, link ou formatação.
  const conteudo =
    texto(mensagem.conversation) ??
    texto(objeto(mensagem.extendedTextMessage)?.text);

  if (!conteudo || conteudo.trim().length === 0) return null;

  return {
    id,
    remoteJid,
    texto: conteudo,
    pushName: texto(dados.pushName),
    telefone: telefoneDoJid(remoteJid),
  };
}

/**
 * Reduz um JID (ou um número digitado à mão) ao identificador comparável:
 * só dígitos, sem domínio e sem sufixo de dispositivo.
 *
 * `5511999998888:12@s.whatsapp.net` → `5511999998888`
 * `+55 (11) 99999-8888`             → `5511999998888`
 * `154417159582282@lid`             → `154417159582282`
 */
export function normalizarIdentificadorJid(valor: string): string {
  const semDominio = valor.split("@")[0] ?? "";
  return semDominio.split(/[:_]/)[0].replace(/\D/g, "");
}

/**
 * Lê `BOT_JIDS_PERMITIDOS` (lista separada por vírgula).
 *
 * Aceita número solto ou JID completo, com ou sem formatação — é uma variável
 * digitada à mão, então ser tolerante evita "não funciona e não sei por quê".
 */
export function lerListaPermitidos(bruto: string | undefined): string[] {
  if (!bruto) return [];

  return bruto
    .split(",")
    .map((item) => normalizarIdentificadorJid(item.trim()))
    .filter((item) => item.length > 0);
}

/**
 * Guarda de teste: com a lista preenchida, o bot só atende esses remetentes.
 *
 * **Lista vazia atende todos** — esse é o comportamento de produção, e é o
 * default justamente para a variável não virar um jeito silencioso de o bot
 * parar de atender clientes reais.
 *
 * Serve para parear um número pessoal sem responder a contatos de verdade.
 * Atenção com `@lid`: como esse JID não carrega telefone, para liberar um
 * remetente nesse formato é preciso pôr o próprio identificador `@lid` na lista.
 */
export function jidPermitido(remoteJid: string, permitidos: string[]): boolean {
  if (permitidos.length === 0) return true;
  return permitidos.includes(normalizarIdentificadorJid(remoteJid));
}

/** Extrai o estado de um `CONNECTION_UPDATE`. `open` significa pareado. */
export function extrairEstadoConexao(payload: unknown): string | null {
  return texto(objeto(objeto(payload)?.data)?.state);
}

export type NumeroDono = {
  /** Só dígitos, comparável — é o que entra no hash do livro-caixa. */
  numero: string;
  /**
   * Domínio do JID de origem (`s.whatsapp.net` ou `lid`), quando havia um.
   *
   * Devolvido junto porque o `numero` sozinho não distingue um telefone de um
   * Linked ID: `normalizarIdentificadorJid` descarta o domínio, então
   * `5511999998888@s.whatsapp.net` e `154417159582282@lid` viram ambos "só
   * dígitos". Se um upgrade da Evolution passar a reportar o dono em formato
   * `@lid`, cada tenant grava uma segunda linha no livro-caixa na próxima
   * reconexão: a idempotência por conta continua valendo (nada quebra à vista),
   * mas a proteção entre contas de todo número reivindicado no formato antigo
   * cai a zero. Sem este campo, isso aconteceria sem sinal nenhum.
   */
  dominio: string | null;
};

/**
 * Número do **dono** da instância — o WhatsApp do estabelecimento que acabou de
 * ser pareado —, normalizado. Não confundir com o remetente da mensagem: aqui o
 * identificador é de quem nos paga, não do cliente dele.
 *
 * Duas fontes, porque a Evolution entrega o mesmo dado por dois caminhos e
 * nenhum deles é garantido em toda versão:
 *  - `data.wuid` no `CONNECTION_UPDATE` com `state: "open"` — já vem sem o
 *    sufixo de dispositivo, é o caminho principal
 *  - `sender` no topo do corpo — presente em todo webhook, serve de rede de
 *    segurança quando o `wuid` não vem
 *
 * É o identificador escasso do produto: o pareamento por QR exige a conta
 * WhatsApp logada num aparelho, então é o que sustenta "um trial por número"
 * (ver `supabase/migrations/20260725121600_trial_por_numero.sql`).
 */
export function extrairNumeroDono(payload: unknown): NumeroDono | null {
  const corpo = objeto(payload);
  const bruto = texto(objeto(corpo?.data)?.wuid) ?? texto(corpo?.sender);
  if (!bruto) return null;

  const numero = normalizarIdentificadorJid(bruto);
  if (numero.length === 0) return null;

  return { numero, dominio: texto(bruto.split("@")[1]) };
}
