"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { PlusIcon } from "lucide-react";
import { CartaoLateral } from "@/components/cartao-lateral";
import { Button } from "@/components/ui/button";
import type { EstadoFormulario } from "@/lib/validacao/agenda";
import { adicionarEtapa } from "./actions";

/**
 * `text-base md:text-sm` não é detalhe: os rótulos são `text-sm`, e o reset do
 * Tailwind faz o campo herdar a fonte do pai — medido em Chromium, os cinco
 * campos saíam a 14px, e abaixo de 16px o iOS dá zoom no foco e **não desfaz**.
 * Declarar o tamanho aqui corta a herança.
 */
const CAMPO =
  "mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30 max-md:min-h-11";

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
    /**
     * Já foi um `<details>` fechado embaixo da lista. Com o formulário virando
     * coluna própria, a dobra deixou de fazer sentido: ela existia para o
     * formulário não empurrar a lista para fora da tela, e agora eles nem
     * disputam a mesma vertical.
     */
    <CartaoLateral titulo="Nova pergunta">
      <form ref={form} action={acao} className="mt-4">
        <div className="grid gap-4">
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

        {/* Medido em Chromium, a caixa nativa nasce **13×13** e reprova o
            mínimo AA de 24px da WCAG 2.2 SC 2.5.8. Quem de fato recebe o toque
            é o `<label>`, que embrulha caixa e texto — mas a caixa também
            precisa ser mirável sozinha, daí os 24px no celular. */}
        <label className="mt-4 flex items-center gap-2.5 py-2.5 text-sm">
          <input
            type="checkbox"
            name="obrigatorio"
            defaultChecked
            className="size-6 accent-primary md:size-5"
          />
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

        <Button
          type="submit"
          size="lg"
          disabled={enviando}
          className="mt-5 w-full"
        >
          <PlusIcon className="size-4" />
          {enviando ? "Adicionando…" : "Adicionar pergunta"}
        </Button>
      </form>
    </CartaoLateral>
  );
}
