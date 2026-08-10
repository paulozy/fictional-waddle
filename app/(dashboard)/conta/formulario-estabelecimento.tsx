"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FUSOS } from "@/lib/fusos";
import type { EstadoFormulario } from "@/lib/validacao/agenda";
import { salvarEstabelecimento } from "./actions";

/**
 * Nome e fuso, em linhas `rótulo | campo`.
 *
 * `text-base md:text-sm` nos campos é o idioma do projeto: abaixo de 16px o
 * iOS dá zoom no foco e não desfaz. Aqui vale porque a coluna do painel é
 * larga o bastante para o campo continuar confortável a 14px no desktop —
 * diferente das telas de auth, que ficam a 16px em qualquer largura porque o
 * iPad em retrato reporta exatamente 768px.
 */
const CAMPO =
  "w-full rounded-lg border border-input bg-card px-3.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm h-11 dark:bg-input/30";

export function FormularioEstabelecimento({
  nomeInicial,
  fusoInicial,
}: {
  nomeInicial: string;
  fusoInicial: string;
}) {
  const [estado, acao, salvando] = useActionState<EstadoFormulario, FormData>(
    salvarEstabelecimento,
    undefined,
  );

  useEffect(() => {
    if (estado && "ok" in estado) toast.success("Dados do estabelecimento salvos");
  }, [estado]);

  return (
    <form action={acao} className="mt-5">
      <div className="flex flex-col gap-5">
        <Linha htmlFor="nome" rotulo="Nome">
          <input
            id="nome"
            name="nome"
            type="text"
            required
            maxLength={80}
            defaultValue={nomeInicial}
            autoComplete="organization"
            placeholder="Barbearia do Nino"
            className={CAMPO}
          />
        </Linha>

        <Linha htmlFor="fuso" rotulo="Fuso horário">
          <select
            id="fuso"
            name="fuso"
            defaultValue={fusoInicial}
            className={CAMPO}
          >
            {FUSOS.map((fuso) => (
              <option key={fuso.valor} value={fuso.valor}>
                {fuso.rotulo}
              </option>
            ))}
          </select>
        </Linha>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        O nome é o que o bot usa ao falar com seu cliente. O fuso vale para a
        grade de horários e para a hora do lembrete.
      </p>

      {estado && "erro" in estado && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {estado.erro}
        </p>
      )}

      <Button type="submit" size="lg" disabled={salvando} className="mt-5">
        {salvando ? "Salvando…" : "Salvar alterações"}
      </Button>
    </form>
  );
}

/**
 * Rótulo à esquerda e campo à direita a partir de `sm`; empilhado abaixo disso.
 *
 * Duas colunas num aparelho de 375px deixariam o campo com ~180px — perto do
 * limite em que um nome de estabelecimento deixa de caber na tela.
 */
function Linha({
  htmlFor,
  rotulo,
  children,
}: {
  htmlFor: string;
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[11.25rem_minmax(0,1fr)] sm:items-center sm:gap-5">
      <label htmlFor={htmlFor} className="text-sm text-muted-foreground">
        {rotulo}
      </label>
      {children}
    </div>
  );
}
