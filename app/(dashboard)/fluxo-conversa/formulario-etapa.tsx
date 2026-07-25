"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { EstadoFormulario } from "@/lib/validacao/agenda";
import { adicionarEtapa } from "./actions";

const CAMPO =
  "mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function FormularioEtapa() {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    adicionarEtapa,
    undefined,
  );
  const [tipo, setTipo] = useState<"escolha_unica" | "texto_livre">(
    "escolha_unica",
  );
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado && "ok" in estado) form.current?.reset();
  }, [estado]);

  return (
    <details className="mt-6 rounded-lg border border-border bg-card">
      <summary className="cursor-pointer px-4 py-3 font-medium">
        Adicionar pergunta ao fluxo
      </summary>

      <form ref={form} action={acao} className="border-t border-border p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium" htmlFor="tipo">
            Tipo de pergunta
            <select
              id="tipo"
              name="tipo"
              value={tipo}
              onChange={(e) =>
                setTipo(e.target.value as "escolha_unica" | "texto_livre")
              }
              className={CAMPO}
            >
              <option value="escolha_unica">Múltipla escolha</option>
              <option value="texto_livre">Resposta aberta</option>
            </select>
          </label>

          <label className="block text-sm font-medium" htmlFor="campo_destino">
            Nome do campo
            <input
              id="campo_destino"
              name="campo_destino"
              required
              placeholder="primeira_vez"
              pattern="[a-z][a-z0-9_]*"
              maxLength={40}
              className={`${CAMPO} font-mono`}
            />
            <span className="mt-1 block text-xs font-normal text-muted-foreground">
              Onde a resposta fica guardada. Minúsculas, sem espaço.
            </span>
          </label>
        </div>

        <label
          className="mt-4 block text-sm font-medium"
          htmlFor="pergunta_texto"
        >
          Pergunta que o bot envia
          <textarea
            id="pergunta_texto"
            name="pergunta_texto"
            required
            rows={2}
            maxLength={500}
            placeholder="Primeira vez aqui?"
            className={CAMPO}
          />
        </label>

        {tipo === "escolha_unica" && (
          <label className="mt-4 block text-sm font-medium" htmlFor="opcoes">
            Opções — uma por linha
            <textarea
              id="opcoes"
              name="opcoes"
              rows={3}
              placeholder={"Sim\nNão"}
              className={CAMPO}
            />
            <span className="mt-1 block text-xs font-normal text-muted-foreground">
              O bot numera as opções automaticamente. Mínimo de duas.
            </span>
          </label>
        )}

        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" name="obrigatorio" defaultChecked />
          Exigir resposta para continuar
        </label>

        <p className="mt-4 text-xs text-muted-foreground">
          A pergunta entra logo antes da confirmação. Depois é possível arrastar
          para outra posição.
        </p>

        {estado && "erro" in estado && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {estado.erro}
          </p>
        )}

        <button
          type="submit"
          disabled={enviando}
          className="mt-4 h-10 rounded-md bg-primary px-4 font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {enviando ? "Adicionando…" : "Adicionar pergunta"}
        </button>
      </form>
    </details>
  );
}
