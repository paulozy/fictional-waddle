/**
 * Primitivos que os dois fluxos de conversa compartilham.
 *
 * Existe por uma razão estrutural, não estética: `engine-fluxo.ts` precisa
 * **chamar** o fluxo de cancelamento, então se `cancelamento.ts` importasse estes
 * valores de volta da engine haveria ciclo em tempo de execução — e const em ciclo
 * ESM cai em TDZ, que falha de forma obscura. Com os primitivos num terceiro
 * módulo, as duas pontas importam para baixo e não há ciclo.
 *
 * Só entra aqui o que é genérico a qualquer menu numerado. Nada específico de
 * etapa (`horario`, `servico`) e nada específico de cancelamento.
 */

export type DadosTemporarios = Record<string, unknown>;

/**
 * Opções que foram **apresentadas** ao cliente, na ordem.
 *
 * É a chave que sustenta a invariante central das duas conversas: a resposta é
 * interpretada contra esta lista, nunca contra uma recalculada na hora. Sem ela,
 * alguém agendando no meio da conversa faria o cliente escolher um item diferente
 * do que ele leu.
 */
export const CHAVE_OPCOES = "__opcoes_oferecidas";

/**
 * Minúsculas, sem acento e sem espaço nas pontas.
 *
 * `\p{Diacritic}` em vez da faixa `U+0300–U+036F` que estava escrita na engine: a
 * faixa literal põe caracteres **invisíveis** no código-fonte, que sobrevivem a
 * refactor sem ninguém ver e desaparecem em cópia e cola. A propriedade Unicode diz
 * o que faz e é ASCII. Verificado equivalente sobre texto NFD latino.
 */
export function normalizar(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function listaNumerada(itens: string[], deslocamento = 0): string {
  return itens.map((item, i) => `${i + 1 + deslocamento}. ${item}`).join("\n");
}

/** Índice 1-based válido dentro de `opcoes`, ou null. */
export function lerIndice(texto: string, quantidade: number): number | null {
  const limpo = normalizar(texto);
  if (!/^\d+$/.test(limpo)) return null;

  const indice = Number(limpo) - 1;
  if (indice < 0 || indice >= quantidade) return null;
  return indice;
}

export function opcoesOferecidas(dados: DadosTemporarios): string[] {
  const valor = dados[CHAVE_OPCOES];
  return Array.isArray(valor) ? (valor as string[]) : [];
}
