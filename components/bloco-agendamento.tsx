"use client";

import { useState } from "react";
import { EllipsisVerticalIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { DialogoCancelarAgendamento } from "@/components/dialogo-cancelar-agendamento";
import {
  descricaoDoBloco,
  motivoNaoCancelavel,
  rotuloDoStatus,
  type BlocoCalendario,
} from "@/lib/calendario";

/**
 * Um bloco da grade semanal: gatilho de **detalhe**, não de cancelamento.
 *
 * A versão anterior fazia o bloco inteiro abrir direto o diálogo de cancelamento, com
 * `aria-label="Cancelar agendamento: …"`. Três problemas, e o primeiro é o que importa:
 *
 * 1. **Nomear o bloco pela ação** fazia o leitor de tela varrer a semana ouvindo uma
 *    fileira de "Cancelar agendamento", sem forma de *ler* um item sem mirar numa ação
 *    destrutiva. E não havia onde pôr a segunda ação — `concluido` e `falta` já existem
 *    no CHECK do banco e ainda não têm quem os grave.
 * 2. **Nenhuma afordância.** Só `cursor-pointer`, que a NN/g classifica como sinal
 *    fraco. E hover não resolveria: no Tailwind v4 a variante compila para
 *    `@media (hover: hover)`, e esta grade é `hidden md:block` com `md` = 768px, que é
 *    exatamente o iPad em retrato — a grade **é** a experiência de tablet, onde
 *    afordância de hover é código que nunca roda. Daí o glifo persistente.
 * 3. **`title` era o único portador do nome do cliente** em bloco compacto, e `title`
 *    não aparece em toque nem é anunciado com confiança.
 *
 * O padrão adotado é o documentado no nicho: clicar no evento abre detalhe, e a ação
 * destrutiva é um botão nomeado lá dentro (é o que o Google Calendar e o Trinks fazem).
 */

/**
 * Padding do conteúdo.
 *
 * No filho e não no contêiner posicionado, porque o filho é um `<button>` que precisa
 * cobrir o bloco inteiro — com o padding no pai, a borda não seria clicável.
 */
const CLASSES_CONTEUDO =
  // `relative` ancora o glifo, que é posicionado no canto.
  "relative block size-full px-1.5 py-0.5 text-left cursor-pointer outline-none " +
  // Hover só existe com mouse; o anel de "aberto" é o que dá confirmação em toque.
  "hover:ring-1 hover:ring-inset hover:ring-current " +
  "aria-expanded:ring-1 aria-expanded:ring-inset aria-expanded:ring-current " +
  "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

export function BlocoAgendamento({
  bloco,
  cancelavel,
}: {
  bloco: BlocoCalendario;
  cancelavel: boolean;
}) {
  const [detalheAberto, setDetalheAberto] = useState(false);
  const [dialogoAberto, setDialogoAberto] = useState(false);

  const descricao = descricaoDoBloco(bloco);
  const motivo = motivoNaoCancelavel(bloco, cancelavel);
  const tituloId = `bloco-${bloco.id}-titulo`;

  return (
    <>
      <Popover open={detalheAberto} onOpenChange={setDetalheAberto}>
        <PopoverTrigger className={CLASSES_CONTEUDO}>
          {/**
           * O nome acessível é composto por **texto**, não por `aria-label`: assim ele
           * sempre contém o rótulo visível (WCAG 2.5.3 Label in Name), que um
           * `aria-label` reescrito quebraria. O `sr-only` carrega o conjunto completo —
           * dia, data, hora fim, cliente e status.
           *
           * O conteúdo visual abaixo é `aria-hidden` de propósito: sem isso o nome sairia
           * duplicado ("09:00 Corte … qua 12/08 · 09:00–10:00 · … · Corte …"). O texto
           * visível continua **contido** no `sr-only`, então a regra do 2.5.3 se mantém —
           * quem fala "Corte de cabelo" para um comando de voz acerta o botão.
           */}
          <span className="sr-only">{descricao}</span>

          {/* Glifo decorativo: a afordância que um tablet vê, porque hover não roda lá. */}
          <EllipsisVerticalIcon
            aria-hidden
            className="pointer-events-none absolute top-0.5 right-0 size-3 opacity-60"
          />

          {bloco.compacto ? (
            /**
             * Bloco compacto mostra **só o nome do serviço**, sem a hora.
             *
             * Medido a 768px (o pior caso: a grade tem `min-w-[44rem]` e sete colunas,
             * dando ~88px por bloco): com a hora ao lado, o nome ficava com **23px de
             * 211px — 11%**, ou seja "Esc…", que não distingue uma escova de uma
             * esmaltação. Sem a hora sobram ~64px, o suficiente para identificar.
             *
             * A hora não se perde: a linha do grid já a codifica, o `sr-only` acima a
             * anuncia por extenso e o detalhe a mostra exata. Trocar 11% do nome por
             * uma hora redundante era o pior dos dois mundos.
             */
            <span aria-hidden className="block truncate pr-3 font-medium">
              {bloco.titulo}
            </span>
          ) : (
            <span aria-hidden className="block pr-3">
              <span className="block font-mono tabular-nums">
                {bloco.horaInicio}
              </span>
              <span
                className={`block font-medium ${
                  bloco.linhasOcupadas >= 3 ? "line-clamp-2" : "truncate"
                }`}
              >
                {bloco.titulo}
              </span>
              <span className="block truncate opacity-80">{bloco.cliente}</span>
            </span>
          )}
        </PopoverTrigger>

        <PopoverContent aria-labelledby={tituloId}>
          <p id={tituloId} className="font-medium">
            {bloco.titulo}
          </p>

          <dl className="mt-2 space-y-1 text-muted-foreground">
            <div className="flex gap-2">
              <dt className="sr-only">Dia</dt>
              <dd className="capitalize">
                {bloco.rotuloDia} {bloco.rotuloNumero}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="sr-only">Horário</dt>
              <dd className="font-mono tabular-nums">
                {bloco.horaInicio}–{bloco.horaFim}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="sr-only">Cliente</dt>
              <dd>{bloco.cliente}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="sr-only">Status</dt>
              {/* Em palavra, não só cor: cor sozinha não é acessível (WCAG 1.4.1). */}
              <dd>{rotuloDoStatus(bloco.status)}</dd>
            </div>
          </dl>

          {/**
           * Faixa de ações, com uma ação hoje. Nasce como faixa de propósito: `concluido`
           * e `falta` são a próxima coisa a chegar, e um rodapé de botão único teria de
           * ser refeito.
           */}
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
            {motivo ? (
              // O produto se calava aqui. Dizer o motivo é melhor que esconder o botão
              // sem explicação — o dono ficava colecionando cliques sem resposta.
              <p className="text-muted-foreground">{motivo}</p>
            ) : (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => {
                  // Fecha o detalhe ANTES de abrir o diálogo: um focus scope por vez.
                  setDetalheAberto(false);
                  setDialogoAberto(true);
                }}
              >
                <XIcon className="size-4" />
                Cancelar agendamento
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/**
       * Irmão do popover, nunca dentro do `PopoverContent`: Dialog aninhado em Popover no
       * Radix tem bug conhecido de focus scope, e um popover fecha em clique-fora — o
       * dono perderia a observação digitada numa ação irreversível.
       */}
      <DialogoCancelarAgendamento
        id={bloco.id}
        descricao={descricao}
        aberto={dialogoAberto}
        onAbertoChange={setDialogoAberto}
        /**
         * Devolve o foco para a região da grade.
         *
         * Medido em navegador: no sucesso este bloco é retirado da grade, então o
         * gatilho para onde o Radix restauraria o foco deixa de existir e o foco cai no
         * `<body>` — quem navega por teclado perde o lugar (SC 2.4.3).
         *
         * A busca é por DOM porque o contêiner é renderizado por um Server Component
         * acima; passar ref atravessaria a fronteira RSC. O `requestAnimationFrame`
         * espera o Radix terminar a própria restauração, senão ele sobrescreve isto.
         */
        onSucesso={() => {
          requestAnimationFrame(() => {
            document
              .querySelector<HTMLElement>('[data-slot="grade-semana"]')
              ?.focus();
          });
        }}
      />
    </>
  );
}
