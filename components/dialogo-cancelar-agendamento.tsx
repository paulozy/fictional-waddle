"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
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
import {
  MAX_OBSERVACAO_CANCELAMENTO,
  MOTIVOS_CANCELAMENTO,
  ROTULOS_MOTIVO_CANCELAMENTO,
  type EstadoFormulario,
} from "@/lib/validacao/agenda";
import { cancelarAgendamento } from "@/app/(dashboard)/agendamentos/actions";

/**
 * Cancelamento de um agendamento pelo dono.
 *
 * Único `"use client"` desta tela: a página e as duas visões seguem Server
 * Components. Recebe o gatilho por `children` porque as duas visões precisam de
 * afordâncias diferentes — na lista do dia é um botão "Cancelar" ao lado do item,
 * na grade é o próprio bloco (que pode ter 30 min de altura e não caberia um botão
 * dentro).
 *
 * A ação é chamada à mão, sem `useActionState`, pelo mesmo motivo documentado em
 * `app/(dashboard)/servicos/dialogo-editar.tsx`: fechar o diálogo no sucesso com
 * `useActionState` só daria para observar num efeito, que cai na regra
 * `react-hooks/set-state-in-effect`.
 */
export function DialogoCancelarAgendamento({
  id,
  descricao,
  children,
  aberto: abertoControlado,
  onAbertoChange,
  onSucesso,
}: {
  id: string;
  descricao: string;
  /** Gatilho. Omitido no modo controlado, onde quem abre é o componente de fora. */
  children?: React.ReactNode;
  /**
   * Modo controlado, para quando o diálogo é aberto **a partir de outro overlay** — na
   * grade, o botão vive dentro do popover de detalhe. O diálogo é renderizado irmão do
   * popover e não dentro dele: Dialog aninhado em Popover no Radix é família conhecida
   * de bug de focus scope. Com o controle fora, dá para fechar um antes de abrir o
   * outro, mantendo um focus scope ativo por vez.
   */
  aberto?: boolean;
  onAbertoChange?: (aberto: boolean) => void;
  /**
   * Chamado só quando o cancelamento **deu certo**.
   *
   * Existe para quem some da tela depois de cancelar: na grade o bloco é retirado
   * (`blocosVisiveisNaGrade`), então o elemento para onde o Radix devolveria o foco
   * deixa de existir e ele cai no `<body>` — perda de foco, SC 2.4.3, medida em
   * navegador. Na lista do celular a linha permanece com o rótulo "Cancelado", o foco
   * volta sozinho, e este callback não é passado.
   */
  onSucesso?: () => void;
}) {
  const [abertoInterno, setAbertoInterno] = useState(false);
  const [estado, setEstado] = useState<EstadoFormulario>(undefined);
  const [enviando, iniciar] = useTransition();

  const controlado = abertoControlado !== undefined;
  const aberto = controlado ? abertoControlado : abertoInterno;

  const setAberto = (proximo: boolean) => {
    if (!controlado) setAbertoInterno(proximo);
    onAbertoChange?.(proximo);
  };

  function enviar(formData: FormData) {
    iniciar(async () => {
      const resultado = await cancelarAgendamento(undefined, formData);
      setEstado(resultado);

      if (resultado && "ok" in resultado) {
        setAberto(false);

        /**
         * `aviso` é sucesso com ressalva: o horário foi liberado e o cliente não
         * foi avisado. Vai como `warning` e não como `success` porque a ação que
         * sobra é do dono — ele precisa falar com o cliente por outro caminho.
         */
        if (resultado.aviso) toast.warning(resultado.aviso);
        else toast.success("Agendamento cancelado e horário liberado");

        onSucesso?.();
      }
    });
  }

  const erros = estado && "erro" in estado ? estado.campos : undefined;

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}

      <DialogContent>
        <form action={enviar}>
          <DialogHeader>
            <DialogTitle>Cancelar agendamento</DialogTitle>
            <DialogDescription>
              {descricao}. O horário volta a ficar disponível, e o cliente é
              avisado pelo WhatsApp.
            </DialogDescription>
          </DialogHeader>

          <input type="hidden" name="id" value={id} />

          <div className="space-y-4 py-4">
            {/**
             * `<input type="radio">` nativo em vez de um primitivo novo: o
             * agrupamento por `name`, a navegação por setas e o anúncio de "1 de 5"
             * no leitor de tela vêm de graça e não dependem de JavaScript.
             *
             * `fieldset`/`legend` porque a pergunta vale para o grupo — sem eles o
             * leitor de tela anuncia cinco rótulos soltos sem dizer do que se trata.
             */}
            <fieldset>
              <legend className="mb-2 text-sm font-medium">
                Por que está cancelando?
              </legend>

              <div className="space-y-1">
                {MOTIVOS_CANCELAMENTO.map((motivo) => (
                  <label
                    key={motivo}
                    /* min-h-11: alvo de toque confortável no celular. */
                    className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm transition-colors hover:bg-muted"
                  >
                    <input
                      type="radio"
                      name="motivo"
                      value={motivo}
                      required
                      className="size-4 shrink-0 accent-primary"
                    />
                    {ROTULOS_MOTIVO_CANCELAMENTO[motivo]}
                  </label>
                ))}
              </div>

              {erros?.motivo && (
                <p role="alert" className="mt-1 text-sm text-destructive">
                  {erros.motivo[0]}
                </p>
              )}
            </fieldset>

            <div>
              <label
                htmlFor="observacao-cancelamento"
                className="mb-1 block text-sm font-medium"
              >
                Observação — só você vê
              </label>

              {/**
               * `text-base md:text-sm` como em `components/ui/input.tsx`: fonte
               * menor que 16px faz o iOS dar zoom ao focar, e o zoom não desfaz.
               */}
              <textarea
                id="observacao-cancelamento"
                name="observacao"
                rows={2}
                maxLength={MAX_OBSERVACAO_CANCELAMENTO}
                placeholder="Opcional. Não escreva informação de saúde."
                aria-describedby="ajuda-observacao"
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
              />

              <p id="ajuda-observacao" className="mt-1 text-xs text-muted-foreground">
                Fica só no seu painel: nunca é enviada ao cliente.
              </p>

              {erros?.observacao && (
                <p role="alert" className="mt-1 text-sm text-destructive">
                  {erros.observacao[0]}
                </p>
              )}
            </div>
          </div>

          {estado && "erro" in estado && !estado.campos && (
            <p role="alert" className="text-sm text-destructive">
              {estado.erro}
            </p>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Voltar
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={enviando}>
              {enviando ? "Cancelando…" : "Cancelar agendamento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
