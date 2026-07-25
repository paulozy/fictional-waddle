import type { Faixa } from "@/lib/validacao/agenda";

/**
 * Forma da grade semanal usada pelo editor. Módulo **puro**, sem `'use client'`.
 *
 * Mora aqui, e não junto do editor, porque a página de horários é Server
 * Component e precisa chamar `normalizarSemana` para montar as props. Exportar
 * uma função de um arquivo `'use client'` e invocá-la no servidor levanta
 * "Attempted to call normalizarSemana() from the server" em runtime — e nem
 * `tsc` nem o build acusam.
 */

/** Faixas por dia da semana, `0` = domingo. Dia sem faixa está fechado. */
export type Semana = Record<number, Faixa[]>;

/** Segunda primeiro, domingo por último — ordem de leitura de quem atende. */
export const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0];

/** `"09:00:00"` do Postgres vira `"09:00"`, que é o que `input[type=time]` usa. */
function semSegundos(hora: string): string {
  return hora.slice(0, 5);
}

export function normalizarSemana(
  horarios: { dia_semana: number; hora_inicio: string; hora_fim: string }[],
): Semana {
  const semana: Semana = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };

  for (const horario of horarios) {
    semana[horario.dia_semana]?.push({
      horaInicio: semSegundos(horario.hora_inicio),
      horaFim: semSegundos(horario.hora_fim),
    });
  }

  return semana;
}
