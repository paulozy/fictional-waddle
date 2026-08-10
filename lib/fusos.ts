/**
 * Fusos horários oferecidos no cadastro. Módulo **puro**.
 *
 * `perfis.fuso_horario` não é preferência de exibição: `horarios_disponiveis`
 * guarda hora de parede (`time`), e é este fuso que converte "09:00" em
 * instante. O runtime da Vercel roda em UTC e nunca serve de referência (ver
 * CLAUDE.md). Errar aqui desloca a agenda inteira do estabelecimento.
 *
 * Lista fechada, e não campo de texto livre, por dois motivos: um IANA digitado
 * à mão com typo (`America/SaoPaulo`) faz o `TZDate` cair em UTC em silêncio, e
 * o `select` é validado pelo mesmo `z.enum` no servidor — o que impede um POST
 * forjado de gravar zona inexistente.
 *
 * Cobre os quatro deslocamentos do Brasil (UTC−2 a UTC−5). O rótulo cita a
 * cidade porque nenhum dono de barbearia procura "America/Araguaina" — ele
 * procura o estado dele.
 */

export type Fuso = { valor: string; rotulo: string };

export const FUSOS: readonly Fuso[] = [
  { valor: "America/Sao_Paulo", rotulo: "Brasília, São Paulo, Rio (UTC−3)" },
  { valor: "America/Bahia", rotulo: "Salvador (UTC−3)" },
  { valor: "America/Recife", rotulo: "Recife, João Pessoa (UTC−3)" },
  { valor: "America/Maceio", rotulo: "Maceió, Aracaju (UTC−3)" },
  { valor: "America/Fortaleza", rotulo: "Fortaleza, Natal, Teresina (UTC−3)" },
  { valor: "America/Belem", rotulo: "Belém, Macapá (UTC−3)" },
  { valor: "America/Araguaina", rotulo: "Palmas (UTC−3)" },
  { valor: "America/Santarem", rotulo: "Santarém (UTC−3)" },
  { valor: "America/Campo_Grande", rotulo: "Campo Grande (UTC−4)" },
  { valor: "America/Cuiaba", rotulo: "Cuiabá (UTC−4)" },
  { valor: "America/Manaus", rotulo: "Manaus (UTC−4)" },
  { valor: "America/Porto_Velho", rotulo: "Porto Velho (UTC−4)" },
  { valor: "America/Boa_Vista", rotulo: "Boa Vista (UTC−4)" },
  { valor: "America/Rio_Branco", rotulo: "Rio Branco (UTC−5)" },
  { valor: "America/Eirunepe", rotulo: "Eirunepé (UTC−5)" },
  { valor: "America/Noronha", rotulo: "Fernando de Noronha (UTC−2)" },
] as const;

/** O mesmo default de `perfis.fuso_horario` na migration. */
export const FUSO_PADRAO = "America/Sao_Paulo";

export function ehFusoConhecido(valor: string): boolean {
  return FUSOS.some((fuso) => fuso.valor === valor);
}
