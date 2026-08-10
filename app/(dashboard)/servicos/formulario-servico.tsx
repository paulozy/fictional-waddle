"use client";

import { useActionState, useEffect, useRef } from "react";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { CartaoLateral } from "@/components/cartao-lateral";
import { Button } from "@/components/ui/button";
import type { EstadoFormulario } from "@/lib/validacao/agenda";
import { criarServico } from "./actions";
import { CamposServico } from "./campos-servico";

export function FormularioServico() {
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
    <CartaoLateral titulo="Novo serviço">
      <form ref={form} action={acao} className="mt-4">
        <CamposServico erros={erros} />

        {estado && "erro" in estado && !estado.campos && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {estado.erro}
          </p>
        )}

        {/* Largura cheia: numa coluna estreita, um botão do tamanho do texto
            deixa a âncora da ação flutuando no meio do cartão. */}
        <Button
          type="submit"
          size="lg"
          disabled={enviando}
          className="mt-5 w-full"
        >
          <PlusIcon className="size-4" />
          {enviando ? "Salvando…" : "Adicionar serviço"}
        </Button>
      </form>
    </CartaoLateral>
  );
}
