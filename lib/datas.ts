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

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

/**
 * `"2026-08-03"`, `"2026-08-09"` → `"3 a 9 de agosto"`.
 *
 * O mês (e o ano, quando muda) só aparece uma vez quando os dois extremos
 * caem no mesmo: "3 de agosto a 9 de agosto de 2026" é ruído numa linha que
 * serve para orientar de relance.
 *
 * Recebe `YYYY-MM-DD` — data de calendário, **nunca instante**. Com `Date` a
 * função precisaria saber o fuso do negócio: `new Date("2026-08-03")` é meia-
 * noite UTC, que em São Paulo é 21:00 do dia 2, e a semana apareceria
 * deslocada um dia. Quem chama já tem a data no fuso certo.
 */
export function rotuloDoPeriodo(inicio: string, fim: string): string {
  const [anoA, mesA, diaA] = inicio.split("-").map(Number);
  const [anoB, mesB, diaB] = fim.split("-").map(Number);

  const nomeA = MESES[mesA - 1] ?? "?";
  const nomeB = MESES[mesB - 1] ?? "?";

  if (anoA !== anoB) {
    return `${diaA} de ${nomeA} de ${anoA} a ${diaB} de ${nomeB} de ${anoB}`;
  }
  if (mesA !== mesB) {
    return `${diaA} de ${nomeA} a ${diaB} de ${nomeB}`;
  }
  return `${diaA} a ${diaB} de ${nomeA}`;
}
