/**
 * Normalização do número que o dono digita para parear. Módulo **puro**.
 *
 * Existe por causa do celular. No desktop o pareamento por QR funciona: o
 * painel está numa tela e a câmera do aparelho está na mão. No celular o QR é
 * logicamente impossível — o código está no mesmo aparelho que precisaria
 * fotografá-lo. O caminho que sobra é o código de pareamento, e ele exige que
 * o número seja enviado à Evolution na requisição.
 *
 * Escopo deliberadamente pequeno: aceita o que um brasileiro digita (com
 * máscara, com ou sem DDI) e devolve dígitos com DDI. Não valida operadora,
 * não consulta portabilidade, não tenta adivinhar o nono dígito. Números de
 * outros países passam desde que venham com o DDI — a Evolution é quem julga.
 *
 * Cuidado ao mexer: este número **não** serve para responder mensagem. A
 * identidade do cliente final é o `remote_jid` (ver CLAUDE.md); aqui o número
 * é só o que a Evolution precisa para pedir o código de pareamento ao
 * WhatsApp.
 */

/** DDI do Brasil, assumido quando o dono digita só DDD + número. */
const DDI_BRASIL = "55";

/** Fixo com DDD = 10, celular com DDD = 11. */
const DIGITOS_NACIONAIS = [10, 11];

/**
 * Menor e maior comprimento plausível para um E.164 completo. O padrão limita
 * em 15; o piso de 10 descarta engano de digitação sem recusar país de
 * numeração curta.
 */
const MIN_COM_DDI = 10;
const MAX_COM_DDI = 15;

export type NumeroNormalizado =
  | { valido: true; numero: string }
  | { valido: false; erro: string };

/**
 * `"(11) 99323-5002"` → `"5511993235002"`.
 *
 * O DDI é acrescentado apenas quando o comprimento é exatamente o de um número
 * nacional (10 ou 11 dígitos). Fora disso o valor é tratado como já
 * internacional — o que evita transformar um número português de 12 dígitos em
 * um brasileiro impossível de 14.
 */
export function normalizarNumeroWhatsApp(entrada: string): NumeroNormalizado {
  const digitos = entrada.replace(/\D/g, "");

  if (digitos.length === 0) {
    return { valido: false, erro: "Digite o número do WhatsApp." };
  }

  // `+55 11 …` e `0055 11 …` chegam aqui como `5511…` e `005511…`. O zero de
  // discagem internacional não faz parte do número.
  const semZeros = digitos.replace(/^0+/, "");

  const comDdi = DIGITOS_NACIONAIS.includes(semZeros.length)
    ? `${DDI_BRASIL}${semZeros}`
    : semZeros;

  if (comDdi.length < MIN_COM_DDI) {
    return {
      valido: false,
      erro: "Número curto demais. Inclua o DDD, como (11) 99999-8888.",
    };
  }
  if (comDdi.length > MAX_COM_DDI) {
    return { valido: false, erro: "Número longo demais. Confira os dígitos." };
  }

  return { valido: true, numero: comDdi };
}
