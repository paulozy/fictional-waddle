"use client";

import { useState, useTransition } from "react";
import { PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { EstadoFormulario } from "@/lib/validacao/agenda";
import { editarServico } from "./actions";
import { CamposServico } from "./campos-servico";

/**
 * Edição de serviço.
 *
 * Antes só dava para criar e ativar/desativar: corrigir um preço ou um nome
 * errado obrigava a desativar o serviço e cadastrar outro, o que suja a lista e
 * separa o histórico em dois.
 */
export function DialogoEditar({
  servico,
}: {
  servico: {
    id: string;
    nome: string;
    duracao_minutos: number;
    preco: number | null;
  };
}) {
  const [aberto, setAberto] = useState(false);
  const [estado, setEstado] = useState<EstadoFormulario>(undefined);
  const [enviando, iniciar] = useTransition();

  /**
   * A ação é chamada à mão, sem `useActionState`.
   *
   * O diálogo precisa se fechar quando o salvamento dá certo, e com
   * `useActionState` isso só dá para observar num efeito — o que cai na regra
   * `react-hooks/set-state-in-effect`. Aqui o fechamento acontece no próprio
   * fluxo do envio, que é onde ele conceitualmente pertence.
   */
  function enviar(formData: FormData) {
    iniciar(async () => {
      const resultado = await editarServico(undefined, formData);
      setEstado(resultado);

      if (resultado && "ok" in resultado) {
        setAberto(false);
        toast.success("Serviço atualizado");
      }
    });
  }

  const erros = estado && "erro" in estado ? estado.campos : undefined;

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <PencilIcon className="size-4" />
          Editar
        </Button>
      </DialogTrigger>

      <DialogContent>
        <form action={enviar}>
          <DialogHeader>
            <DialogTitle>Editar serviço</DialogTitle>
          </DialogHeader>

          <input type="hidden" name="id" value={servico.id} />

          <div className="py-4">
            <CamposServico
              erros={erros}
              inicial={{
                nome: servico.nome,
                duracaoMinutos: servico.duracao_minutos,
                // Vírgula é o separador que se digita em teclado brasileiro, e
                // é o que o schema aceita de volta.
                preco:
                  servico.preco === null
                    ? ""
                    : String(servico.preco).replace(".", ","),
              }}
            />
          </div>

          {estado && "erro" in estado && !estado.campos && (
            <p role="alert" className="text-sm text-destructive">
              {estado.erro}
            </p>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={enviando}>
              {enviando ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
