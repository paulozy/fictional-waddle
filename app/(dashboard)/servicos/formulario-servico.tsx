"use client";

import { useActionState, useEffect, useRef } from "react";
import type { EstadoFormulario } from "@/lib/validacao/agenda";
import { criarServico } from "./actions";

const CAMPO =
  "mt-1 h-10 w-full rounded-lg border border-zinc-300 px-3 dark:border-zinc-700 dark:bg-zinc-900";

export function FormularioServico() {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    criarServico,
    undefined,
  );
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado && "ok" in estado) form.current?.reset();
  }, [estado]);

  return (
    <form
      ref={form}
      action={acao}
      className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
        <label className="block text-sm font-medium" htmlFor="nome">
          Serviço
          <input id="nome" name="nome" required maxLength={80} className={CAMPO} />
        </label>

        <label className="block text-sm font-medium" htmlFor="duracaoMinutos">
          Duração (min)
          <input
            id="duracaoMinutos"
            name="duracaoMinutos"
            type="number"
            required
            min={5}
            max={480}
            step={5}
            defaultValue={30}
            className={CAMPO}
          />
        </label>

        <label className="block text-sm font-medium" htmlFor="preco">
          Preço (opcional)
          <input
            id="preco"
            name="preco"
            inputMode="decimal"
            placeholder="60,00"
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
