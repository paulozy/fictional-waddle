"use client";

import { useState, useTransition } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDownIcon, ChevronUpIcon, GripVerticalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TipoEtapa } from "@/lib/bot/engine-fluxo";
import {
  ehEtapaDeSistema,
  moverEtapa,
  podeMover,
  rotuloDoTipo,
  validarFluxo,
  type Direcao,
  type EtapaParaValidar,
} from "@/lib/validacao/fluxo";
import { editarPergunta, removerEtapa, reordenarEtapas } from "./actions";

export type EtapaDaLista = EtapaParaValidar & {
  ordem: number;
  pergunta_texto: string;
  opcoes: { label: string; valor: string }[] | null;
  obrigatorio: boolean;
};

export function ListaEtapas({ etapas }: { etapas: EtapaDaLista[] }) {
  const [itens, setItens] = useState(etapas);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciarSalvamento] = useTransition();

  const sensores = useSensors(
    useSensor(PointerSensor, {
      /**
       * `delay` + `tolerance` no lugar do `distance: 6` que estava aqui.
       *
       * Em toque, `distance` perdia o gesto: o navegador reivindica o
       * movimento para o scroll da página antes dos 6px, a captura implícita
       * de ponteiro é liberada e os `pointermove` param de chegar — o arraste
       * simplesmente não começava no celular. A doc do dnd-kit recomenda
       * pressionar-e-segurar justamente por isso, com uma tolerância de
       * movimento que distingue "quis arrastar" de "quis rolar".
       *
       * O `touch-action: none` da alça (ver `CartaoEtapa`) é a outra metade:
       * sem ele nem o delay salva, porque listener de pointer event não
       * consegue `preventDefault()` no scroll.
       */
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  /** Persiste a nova ordem, desfazendo na tela se o servidor recusar. */
  function salvarOrdem(proposta: EtapaDaLista[]) {
    const anterior = itens;

    setErro(null);
    setItens(proposta);

    iniciarSalvamento(async () => {
      const resultado = await reordenarEtapas(proposta.map((e) => e.id));
      if (resultado && "erro" in resultado) {
        setErro(resultado.erro);
        setItens(anterior); // desfaz a ordem otimista
      }
    });
  }

  function aoSoltar(evento: DragEndEvent) {
    const { active, over } = evento;
    if (!over || active.id === over.id) return;

    const de = itens.findIndex((e) => e.id === active.id);
    const para = itens.findIndex((e) => e.id === over.id);
    const proposta = arrayMove(itens, de, para);

    // Mesma função que a Server Action usa: a UI nunca permite o que o servidor
    // recusaria. O arraste pode pular várias posições, então valida o conjunto
    // em vez de usar `moverEtapa`, que é de um passo.
    const validacao = validarFluxo(proposta);
    if (!validacao.valido) {
      setErro(validacao.erro);
      return;
    }

    salvarOrdem(proposta);
  }

  function aoMover(indice: number, direcao: Direcao) {
    const resultado = moverEtapa(itens, indice, direcao);

    if (!resultado.movido) {
      // `erro: null` é movimento inexistente (topo/fim) — a seta já está
      // desabilitada, e não há o que dizer.
      if (resultado.erro) setErro(resultado.erro);
      return;
    }

    salvarOrdem(resultado.etapas);
  }

  return (
    <>
      {erro && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {erro}
        </p>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Use as setas para mudar a ordem das etapas. No computador também dá para
        arrastar pela alça, ou focá-la e usar as setas do teclado.
        {salvando && " Salvando…"}
      </p>

      <DndContext
        sensors={sensores}
        collisionDetection={closestCenter}
        onDragEnd={aoSoltar}
      >
        <SortableContext
          items={itens.map((e) => e.id)}
          strategy={verticalListSortingStrategy}
        >
          <ol className="mt-3 space-y-2">
            {itens.map((etapa, indice) => (
              <CartaoEtapa
                key={etapa.id}
                etapa={etapa}
                numero={indice + 1}
                podeSubir={podeMover(itens, indice, "cima")}
                podeDescer={podeMover(itens, indice, "baixo")}
                onMover={(direcao) => aoMover(indice, direcao)}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </>
  );
}

function CartaoEtapa({
  etapa,
  numero,
  podeSubir,
  podeDescer,
  onMover,
}: {
  etapa: EtapaDaLista;
  numero: number;
  podeSubir: boolean;
  podeDescer: boolean;
  onMover: (direcao: Direcao) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: etapa.id });
  const [editando, setEditando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const deSistema = ehEtapaDeSistema(etapa.tipo);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-lg border bg-card p-3 ${
        isDragging
          ? "border-primary shadow-lg"
          : "border-border"
      }`}
    >
      <div className="flex items-start gap-2 sm:gap-3">
        {/**
         * Setas como controle **primário** de ordenação.
         *
         * A alça de arraste sozinha excluía três públicos de uma vez: quem usa
         * o celular (o gesto brigava com o scroll), quem usa teclado e quem usa
         * leitor de tela. Um botão de uma posição resolve os três sem gesto
         * nenhum, e numa lista de ~7 etapas é mais rápido do que mirar um alvo
         * de soltura em 300px de largura.
         */}
        <div className="flex shrink-0 flex-col">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={!podeSubir}
            onClick={() => onMover("cima")}
            aria-label={`Mover para cima: etapa ${numero}, ${etapa.pergunta_texto}`}
          >
            <ChevronUpIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={!podeDescer}
            onClick={() => onMover("baixo")}
            aria-label={`Mover para baixo: etapa ${numero}, ${etapa.pergunta_texto}`}
          >
            <ChevronDownIcon />
          </Button>
        </div>

        {/**
         * A alça continua, como atalho de mouse — mas só a partir de `sm`. No
         * celular ela ocupava largura para oferecer um gesto que compete com o
         * scroll da lista, e as setas ao lado já fazem o mesmo trabalho.
         *
         * `touch-none` é o que torna o arraste confiável onde ele aparece: a
         * doc do dnd-kit é explícita em que `touch-action: none` é a única
         * forma de impedir o scroll em pointer events, e em que ele deve ficar
         * **só na alça** — no cartão inteiro, a lista pararia de rolar.
         */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Arrastar para reordenar: etapa ${numero}, ${etapa.pergunta_texto}`}
          className="mt-1 hidden size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground active:cursor-grabbing sm:flex"
        >
          <GripVerticalIcon className="size-4" />
        </button>

        <span className="mt-1.5 w-5 shrink-0 text-sm tabular-nums text-muted-foreground">
          {numero}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                deSistema
                  ? "bg-muted text-muted-foreground"
                  : "bg-accent text-accent-foreground"
              }`}
            >
              {rotuloDoTipo(etapa.tipo)}
            </span>
            {etapa.campo_destino && (
              <code className="font-mono text-xs text-muted-foreground">
                {etapa.campo_destino}
              </code>
            )}
            {!etapa.obrigatorio && (
              <span className="text-xs text-muted-foreground">opcional</span>
            )}
          </div>

          {editando ? (
            <FormularioTexto
              etapa={etapa}
              onErro={setErro}
              onFim={() => setEditando(false)}
            />
          ) : (
            <p className="mt-2 whitespace-pre-wrap text-sm">
              {etapa.pergunta_texto}
            </p>
          )}

          {etapa.opcoes && etapa.opcoes.length > 0 && !editando && (
            <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              {etapa.opcoes.map((opcao, i) => (
                <li key={opcao.valor}>
                  {i + 1}. {opcao.label}
                </li>
              ))}
            </ul>
          )}

          {erro && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {erro}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-start">
          {!editando && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditando(true)}
              className="text-muted-foreground"
            >
              Editar
            </Button>
          )}

          {/* Etapas de sistema podem ter o texto editado, mas não ser removidas:
              a engine depende delas para calcular disponibilidade e confirmar. */}
          {!deSistema && (
            <form action={removerEtapa}>
              <input type="hidden" name="id" value={etapa.id} />
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
              >
                Remover
              </Button>
            </form>
          )}
        </div>
      </div>
    </li>
  );
}

function FormularioTexto({
  etapa,
  onErro,
  onFim,
}: {
  etapa: EtapaDaLista;
  onErro: (erro: string | null) => void;
  onFim: () => void;
}) {
  const [salvando, iniciar] = useTransition();

  return (
    <form
      className="mt-2"
      action={(formData) =>
        iniciar(async () => {
          const resultado = await editarPergunta(formData);
          if (resultado && "erro" in resultado) {
            onErro(resultado.erro);
            return;
          }
          onErro(null);
          onFim();
        })
      }
    >
      <input type="hidden" name="id" value={etapa.id} />
      {/* `text-base` abaixo de `md`: com menos de 16px o Safari do iPhone dá
          zoom ao focar o campo e não volta sozinho. Mesmo padrão de
          `components/ui/input.tsx`. */}
      <textarea
        name="pergunta_texto"
        defaultValue={etapa.pergunta_texto}
        rows={2}
        maxLength={500}
        enterKeyHint="done"
        className="w-full rounded-md border border-input bg-transparent p-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
      />
      <div className="mt-2 flex gap-2">
        <Button type="submit" disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onFim}
          className="text-muted-foreground"
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export type { TipoEtapa };
