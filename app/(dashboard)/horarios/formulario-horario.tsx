"use client";

import { useActionState } from "react";
import { nomeDoDia, type EstadoFormulario } from "@/lib/validacao/agenda";
import { criarHorario } from "./actions";

const CAMPO =
  "mt-1 h-10 w-full rounded-lg border border-zinc-300 px-3 dark:border-zinc-700 dark:bg-zinc-900";

const DIAS = [1, 2, 3, 4, 5, 6, 0];

export function FormularioHorario() {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    criarHorario,
    undefined,
  );

  return (
    <form
      action={acao}
      className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <div className="grid gap-4 sm:grid-cols-[1.5fr_1fr_1fr_auto] sm:items-end">
        <label className="block text-sm font-medium" htmlFor="diaSemana">
          Dia
          <select
            id="diaSemana"
            name="diaSemana"
            defaultValue={1}
            className={CAMPO}
          >
            {DIAS.map((dia) => (
              <option key={dia} value={dia}>
                {nomeDoDia(dia)}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium" htmlFor="horaInicio">
          Abre
          <input
            id="horaInicio"
            name="horaInicio"
            type="time"
            required
            defaultValue="09:00"
            className={CAMPO}
          />
        </label>

        <label className="block text-sm font-medium" htmlFor="horaFim">
          Fecha
          <input
            id="horaFim"
            name="horaFim"
            type="time"
            required
            defaultValue="18:00"
            className={CAMPO}
          />
        </label>

        <button
          type="submit"
          disabled={enviando}
          className="h-10 rounded-lg bg-emerald-700 px-4 font-medium text-white transition-colors hover:bg-emerald-800 disabled:opacity-60"
        >
          {enviando ? "Salvando…" : "Adicionar"}
        </button>
      </div>

      {estado && "erro" in estado && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {estado.erro}
        </p>
      )}
    </form>
  );
}
