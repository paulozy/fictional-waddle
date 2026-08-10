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
 * Quem mandou a mensagem que chegou no `MESSAGES_UPSERT`.
 *
 * `"dono"` é o próprio estabelecimento digitando na conversa do cliente, pelo
 * celular ou pelo WhatsApp Web — o sinal de que ele assumiu o atendimento à mão.
 * Não carrega texto porque a engine não vai interpretar nada: o único efeito é
 * pausar o bot naquela conversa.
 */
export type LeituraMensagem =
  | { origem: "cliente"; mensagem: MensagemWebhook }
  | { origem: "dono"; remoteJid: string; id: string }
  | null;

/**
 * Cabeçalho comum a qualquer mensagem que valha a pena olhar.
 *
 * Devolve `null` no que se ignora **independente de quem mandou**:
 *  - grupo (`@g.us`) — o bot não atende grupo, e o dono conversando em grupo
 *    também não é atendimento a cliente
 *  - `status@broadcast` — status do WhatsApp, não é conversa
 *  - `key` incompleta (sem JID ou sem id)
 */
function lerCabecalho(
  payload: unknown,
): { dados: Registro; remoteJid: string; id: string; fromMe: boolean } | null {
  const dados = objeto(objeto(payload)?.data);
  if (!dados) return null;

  const chave = objeto(dados.key);
  if (!chave) return null;

  const remoteJid = texto(chave.remoteJid);
  const id = texto(chave.id);
  if (!remoteJid || !id) return null;

  if (ehGrupo(remoteJid) || ehBroadcast(remoteJid)) return null;

  return { dados, remoteJid, id, fromMe: chave.fromMe === true };
}

/**
 * Texto da mensagem, quando existe.
 *
 * Vem em `conversation` na mensagem simples e em `extendedTextMessage.text`
 * quando há citação, link ou formatação. Mídia sem legenda (áudio, sticker,
 * imagem) não tem texto nenhum — e a V0 é menu numerado.
 */
function textoDaMensagem(dados: Registro): string | null {
  const mensagem = objeto(dados.message);
  if (!mensagem) return null;

  const conteudo =
    texto(mensagem.conversation) ??
    texto(objeto(mensagem.extendedTextMessage)?.text);

  return conteudo && conteudo.trim().length > 0 ? conteudo : null;
}

/**
 * Lê um `MESSAGES_UPSERT` e diz de quem é a mensagem.
 *
 * **Porta única de propósito.** Antes existia um `extrairMensagem` que devolvia
 * `null` para `fromMe: true`, e aquele `null` misturava três coisas diferentes:
 * "não é conversa", "não tem texto" e "foi o dono que digitou". A terceira é
 * informação valiosa — é o único sinal que o produto tem de que o dono assumiu o
 * atendimento — e estava sendo jogada fora.
 *
 * ## Por que `fromMe` pode ser lido como "o dono digitou"
 *
 * Medido contra a Evolution 2.3.7 em 2026-08-10, instância descartável:
 *
 * | origem | evento | `fromMe` | `data.source` | `key.id` |
 * |---|---|---|---|---|
 * | cliente, celular dele | `messages.upsert` | `false` | `android` | `ACBBDAED…` |
 * | dono, digitando no celular | `messages.upsert` | **`true`** | `android` | `AC95918F…` |
 * | dono, pelo WhatsApp Web | `messages.upsert` | **`true`** | `web` | `3EB03BFB…` |
 * | nós, por `sendText` | **`send.message`** | `true` | `web` | `3EB02FBC…` |
 *
 * A última linha é a que sustenta tudo: **o que nós enviamos nunca chega como
 * `messages.upsert`**, só como `send.message` — evento que
 * `NOME_EVENTOS_WEBHOOK` não assina. Verificado buscando os ids enviados em todo
 * o tráfego capturado: zero ocorrências em `messages.upsert`. Logo, dentro deste
 * evento, `fromMe: true` é sempre o dono, e não há necessidade de registrar os
 * ids que enviamos para se distinguir deles.
 *
 * **`data.source` NÃO serve para isso**, e a medição confirmou o furo: o dono
 * pelo WhatsApp Web e o nosso próprio envio dão os dois `web`, com id no mesmo
 * formato `3EB0…` (é o `getDevice` do Baileys derivando o dispositivo do formato
 * do id). Quem dependesse de `source` deixaria de detectar o dono no computador.
 *
 * **Cuidado ao mexer em `NOME_EVENTOS_WEBHOOK`:** assinar `SEND_MESSAGE`
 * quebraria esta leitura em silêncio — toda mensagem do bot passaria a parecer o
 * dono e pausaria o bot para aquele cliente, sem erro em lugar nenhum. Há teste
 * afirmando a ausência do evento na lista.
 */
export function lerMensagem(payload: unknown): LeituraMensagem {
  const cabecalho = lerCabecalho(payload);
  if (!cabecalho) return null;

  const { dados, remoteJid, id, fromMe } = cabecalho;

  /**
   * O dono não precisa ter mandado texto.
   *
   * Mandar uma foto do resultado, um áudio explicando o preço ou um sticker é
   * intervenção humana igual — e exigir texto aqui deixaria o bot atropelando o
   * dono justamente nos casos em que ele responde por áudio, que é o mais comum
   * no WhatsApp brasileiro. Não há o que interpretar: o efeito é pausar.
   */
  if (fromMe) return { origem: "dono", remoteJid, id };

  const conteudo = textoDaMensagem(dados);
  if (!conteudo) return null;

  return {
    origem: "cliente",
    mensagem: {
      id,
      remoteJid,
      texto: conteudo,
      pushName: texto(dados.pushName),
      telefone: telefoneDoJid(remoteJid),
    },
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
/**
 * JID do dono, pronto para receber mensagem — o canal de aviso do produto.
 *
 * Medido na Evolution 2.3.7 em 2026-08-10: `sendText` para o próprio número da
 * instância entrega no self-chat (`send.message` + `SERVER_ACK`, e confirmado
 * visualmente no aparelho). É o que permite avisar o dono sem coluna nova e sem
 * mexer na decisão de privacidade — `perfis` guarda só
 * `hmac_sha256(numero, TRIAL_HASH_PEPPER)`, e o número em claro nunca é
 * persistido: vive o tempo de uma requisição, vindo do payload que já chegou.
 *
 * O domínio é preservado quando veio no payload. Quando não veio, assume
 * `s.whatsapp.net`, que é de onde a Evolution tira o `wuid` (`client.user.id`).
 * Isso **não** é reconstruir número de telefone (o que o CLAUDE.md proíbe para
 * cliente final): não há DDI nem nono dígito inferido aqui, só o mesmo
 * identificador que chegou, sem o sufixo de dispositivo.
 */
export function jidDoDono(payload: unknown): string | null {
  const dono = extrairNumeroDono(payload);
  if (!dono) return null;

  return `${dono.numero}@${dono.dominio ?? "s.whatsapp.net"}`;
}

export function extrairNumeroDono(payload: unknown): NumeroDono | null {
  const corpo = objeto(payload);
  const bruto = texto(objeto(corpo?.data)?.wuid) ?? texto(corpo?.sender);
  if (!bruto) return null;

  const numero = normalizarIdentificadorJid(bruto);
  if (numero.length === 0) return null;

  return { numero, dominio: texto(bruto.split("@")[1]) };
}
