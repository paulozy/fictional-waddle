"use client";

import { useActionState, useEffect, useRef } from "react";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { EstadoFormulario } from "@/lib/validacao/agenda";
import { criarServico } from "./actions";
import { CamposServico } from "./campos-servico";

export function FormularioServico({
  cobraSinal = false,
}: {
  cobraSinal?: boolean;
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    criarServico,
    undefined,
  );
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!estado || !("ok" in estado)) return;

    form.current?.reset();
    // Antes o formulário só se limpava, sem dizer nada — num cadastro rápido
    // ficava a dúvida de ter salvo ou não.
    toast.success("Serviço adicionado");
  }, [estado]);

  const erros = estado && "erro" in estado ? estado.campos : undefined;

  return (
    <form
      ref={form}
      action={acao}
      className="rounded-lg border border-border bg-card p-4"
    >
      <CamposServico erros={erros} cobraSinal={cobraSinal} />

      {estado && "erro" in estado && !estado.campos && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {estado.erro}
        </p>
      )}

      <Button type="submit" disabled={enviando} className="mt-4">
        <PlusIcon className="size-4" />
        {enviando ? "Salvando…" : "Adicionar serviço"}
      </Button>
    </form>
  );
}
