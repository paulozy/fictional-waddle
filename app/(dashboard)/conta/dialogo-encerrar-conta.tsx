"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { EstadoFormulario } from "@/lib/validacao/agenda";
import { encerrarConta } from "./actions";

/**
 * Confirmação de exclusão por digitação do nome, e não por um segundo "tem
 * certeza?".
 *
 * A ação não tem desfazer: o `on delete cascade` de `auth.users` leva agenda,
 * clientes e histórico junto. Um segundo clique é reflexo; digitar o nome exige
 * ler o que está escrito. É o mesmo padrão do GitHub ao apagar repositório, e
 * pela mesma razão.
 */
export function DialogoEncerrarConta({
  nomeEstabelecimento,
}: {
  nomeEstabelecimento: string;
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    encerrarConta,
    undefined,
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive" size="lg" className="mt-5">
          Encerrar minha conta
        </Button>
      </DialogTrigger>

      {/* `svh` e não `dvh`: `dvh` é remedido a cada retração da barra do Safari,
          e o diálogo mudaria de altura durante o scroll. */}
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto">
        <form action={acao}>
          <DialogHeader>
            <DialogTitle>Encerrar a conta</DialogTitle>
            <DialogDescription>
              O bot para de responder na hora e a agenda deixa de ficar
              acessível. Os agendamentos já marcados não são avisados
              automaticamente — avise seus clientes antes.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <label
              htmlFor="confirmacao"
              className="block text-sm leading-relaxed"
            >
              Para confirmar, digite{" "}
              <span className="font-medium">{nomeEstabelecimento}</span>:
            </label>
            <input
              id="confirmacao"
              name="confirmacao"
              type="text"
              required
              autoComplete="off"
              className="mt-2 h-11 w-full rounded-lg border border-input bg-card px-3.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
            />

            {estado && "erro" in estado && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {estado.erro}
              </p>
            )}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={enviando}>
              {enviando ? "Encerrando…" : "Encerrar conta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
