import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifra simétrica autenticada, para segredo que precisa VOLTAR.
 *
 * O primeiro e único uso é o token OAuth do PSP do dono, que movimenta conta
 * bancária de terceiro. Hash não serve aqui — diferente de `lib/trial-numero.ts`,
 * onde só interessa comparar, este valor precisa ser recuperado para assinar a
 * chamada ao provedor.
 *
 * A chave entra por PARÂMETRO, e não é lida de `process.env` aqui dentro. É o
 * mesmo idioma de `hashNumeroWhatsapp`: mantém a função pura, deixa a decisão do
 * que fazer quando a chave falta com quem chama (que é quem tem contexto para
 * escolher entre falhar alto e degradar), e permite testar sem mexer no ambiente
 * do processo.
 *
 * **GCM e não CBC.** GCM é autenticado: adulterar o texto cifrado faz o
 * `decifrar` LANÇAR, em vez de devolver bytes diferentes. Com CBC, um atacante
 * com acesso de escrita ao banco poderia trocar o token por outro válido e a
 * aplicação usaria o dele sem perceber — que aqui significa emitir cobrança para
 * a conta errada.
 */

/** 32 bytes = AES-256. Em hex, 64 caracteres. */
const TAMANHO_CHAVE_BYTES = 32;

/**
 * 12 bytes é o nonce recomendado para GCM (NIST SP 800-38D, seção 8.2.1): é o
 * único tamanho que o modo usa sem passar por uma derivação extra.
 */
const TAMANHO_IV_BYTES = 12;

/**
 * Prefixo de versão do formato.
 *
 * Sem ele, trocar de algoritmo um dia exigiria adivinhar o formato pelo
 * comprimento — e a adivinhação erraria em silêncio, devolvendo lixo em vez de
 * erro. Com ele, `decifrar` recusa o que não reconhece.
 */
const VERSAO = "v1";

export class ErroCripto extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroCripto";
  }
}

/**
 * Valida e converte a chave hex em bytes.
 *
 * Chave curta é a falha silenciosa clássica: `createCipheriv` aceitaria um
 * Buffer de tamanho errado com erro genérico, e uma chave de 16 bytes passada
 * como se fosse de 32 reduziria a força sem ninguém notar.
 */
function chaveEmBytes(chaveHex: string): Buffer {
  if (!/^[0-9a-fA-F]+$/.test(chaveHex)) {
    throw new ErroCripto("A chave de criptografia precisa estar em hexadecimal");
  }

  const bytes = Buffer.from(chaveHex, "hex");

  if (bytes.length !== TAMANHO_CHAVE_BYTES) {
    throw new ErroCripto(
      `A chave de criptografia precisa ter ${TAMANHO_CHAVE_BYTES} bytes ` +
        `(${TAMANHO_CHAVE_BYTES * 2} caracteres hex), e tem ${bytes.length}`,
    );
  }

  return bytes;
}

/**
 * Devolve `v1.<iv>.<tag>.<cifrado>`, tudo em base64url.
 *
 * IV novo a cada chamada, sempre. Reusar IV em GCM é a falha catastrófica do
 * modo — dois textos cifrados com o mesmo par (chave, IV) permitem recuperar o
 * XOR dos claros e, pior, forjar a autenticação. Por isso ele é sorteado aqui
 * dentro e nunca entra por parâmetro.
 */
export function cifrar(textoClaro: string, chaveHex: string): string {
  const iv = randomBytes(TAMANHO_IV_BYTES);
  const cifrador = createCipheriv("aes-256-gcm", chaveEmBytes(chaveHex), iv);

  const cifrado = Buffer.concat([
    cifrador.update(textoClaro, "utf8"),
    cifrador.final(),
  ]);

  return [
    VERSAO,
    iv.toString("base64url"),
    cifrador.getAuthTag().toString("base64url"),
    cifrado.toString("base64url"),
  ].join(".");
}

/**
 * Recupera o texto claro. Lança se a chave estiver errada ou se o conteúdo tiver
 * sido adulterado — a autenticação do GCM não distingue os dois casos, e não
 * deve mesmo: os dois significam "não confie neste valor".
 */
export function decifrar(cifrado: string, chaveHex: string): string {
  const partes = cifrado.split(".");

  if (partes.length !== 4 || partes[0] !== VERSAO) {
    throw new ErroCripto("Formato de valor cifrado desconhecido");
  }

  const [, ivB64, tagB64, dadosB64] = partes;

  const decifrador = createDecipheriv(
    "aes-256-gcm",
    chaveEmBytes(chaveHex),
    Buffer.from(ivB64, "base64url"),
  );
  decifrador.setAuthTag(Buffer.from(tagB64, "base64url"));

  try {
    return Buffer.concat([
      decifrador.update(Buffer.from(dadosB64, "base64url")),
      decifrador.final(),
    ]).toString("utf8");
  } catch {
    // `final()` lança quando a tag não confere. A mensagem original do OpenSSL
    // ("Unsupported state or unable to authenticate data") não ajuda ninguém, e
    // repassá-la faria o log parecer bug de biblioteca em vez do que é.
    throw new ErroCripto(
      "Não foi possível decifrar: chave incorreta ou conteúdo adulterado",
    );
  }
}

/**
 * Gera uma chave nova, em hex. Serve ao `.env.example` e a testes.
 *
 * Equivale a `openssl rand -hex 32`, que é o comando documentado para
 * `TRIAL_HASH_PEPPER` — mesmo idioma, para quem for gerar as duas.
 */
export function gerarChave(): string {
  return randomBytes(TAMANHO_CHAVE_BYTES).toString("hex");
}
