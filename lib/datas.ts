/**
 * Vocabulário de dias da semana em pt-BR. Módulo **puro** e única fonte.
 *
 * Antes existiam dois: um array em `lib/validacao/agenda.ts` para a tela de
 * horários e um `format(data, "EEE")` em `lib/calendario.ts` para o calendário.
 * O segundo estava sem `locale`, então caía no default `enUS` e o cabeçalho do
 * calendário saía `Mon`, `Tue`.
 *
 * A correção não foi só passar `{ locale: ptBR }`. Medido contra o date-fns
 * 4.4.0 instalado, nenhum token serve direto:
 *
 * | token    | saída em pt-BR                  |
 * |----------|---------------------------------|
 * | `EEE`    | `domingo`, `segunda`  (inteiro) |
 * | `EEEE`   | `segunda-feira`                 |
 * | `EEEEEE` | `dom`, `seg`, … , **`sab`**     |
 *
 * `EEE` e `EEEE` não cabem num cabeçalho de sete colunas, e `EEEE` ainda
 * mudaria os rótulos da tela de horários, que usa `segunda` e não
 * `segunda-feira`. O `EEEEEE` caberia, mas abrevia sábado como `sab`, sem
 * acento — a abreviação corrente em português é `sáb`.
 *
 * Daí a lista própria: uma fonte só, as duas formas derivadas dela, e o acento
 * certo. A divergência de `sáb` está fixada em `datas.test.ts` de propósito,
 * para ninguém "consertar" isso trocando pelo date-fns.
 */

const DIAS_SEMANA = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
] as const;

/** `1` → `"segunda"`. Índice fora da faixa devolve `"?"`. */
export function nomeDoDia(diaSemana: number): string {
  return DIAS_SEMANA[diaSemana] ?? "?";
}

/**
 * `1` → `"seg"`. Rótulo curto para o cabeçalho do calendário.
 *
 * `segunda` não serve num cabeçalho de sete colunas, e é exatamente o que
 * `format(data, "EEE", { locale: ptBR })` devolveria.
 */
export function rotuloCurtoDoDia(diaSemana: number): string {
  const nome = DIAS_SEMANA[diaSemana];
  return nome ? nome.slice(0, 3) : "?";
}
