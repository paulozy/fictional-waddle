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
import type { TipoEtapa } from "@/lib/bot/engine-fluxo";
import {
  ehEtapaDeSistema,
  rotuloDoTipo,
  validarFluxo,
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
      // Evita iniciar arraste ao clicar em botão dentro do cartão.
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function aoSoltar(evento: DragEndEvent) {
    const { active, over } = evento;
    if (!over || active.id === over.id) return;

    const de = itens.findIndex((e) => e.id === active.id);
    const para = itens.findIndex((e) => e.id === over.id);
    const proposta = arrayMove(itens, de, para);

    // Mesma função que a Server Action usa: a UI nunca permite o que o servidor
    // recusaria.
    const validacao = validarFluxo(proposta);
    if (!validacao.valido) {
      setErro(validacao.erro);
      return;
    }

    setErro(null);
    setItens(proposta);

    iniciarSalvamento(async () => {
      const resultado = await reordenarEtapas(proposta.map((e) => e.id));
      if (resultado && "erro" in resultado) {
        setErro(resultado.erro);
        setItens(itens); // desfaz a ordem otimista
      }
    });
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
        Arraste para reordenar. Também funciona pelo teclado: foque a alça e use
        as setas.
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
              <CartaoEtapa key={etapa.id} etapa={etapa} numero={indice + 1} />
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
}: {
  etapa: EtapaDaLista;
  numero: number;
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
      <div className="flex items-start gap-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Mover etapa ${numero}: ${etapa.pergunta_texto}`}
          className="mt-0.5 cursor-grab rounded px-1 text-muted-foreground transition-colors hover:text-foreground active:cursor-grabbing"
        >
          ⠿
        </button>

        <span className="mt-0.5 w-5 text-sm tabular-nums text-muted-foreground">
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

        <div className="flex shrink-0 gap-3 text-sm">
          {!editando && (
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              Editar
            </button>
          )}

          {/* Etapas de sistema podem ter o texto editado, mas não ser removidas:
              a engine depende delas para calcular disponibilidade e confirmar. */}
          {!deSistema && (
            <form action={removerEtapa}>
              <input type="hidden" name="id" value={etapa.id} />
              <button
                type="submit"
                className="text-muted-foreground transition-colors hover:text-destructive"
              >
                Remover
              </button>
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
      <textarea
        name="pergunta_texto"
        defaultValue={etapa.pergunta_texto}
        rows={2}
        maxLength={500}
        className="w-full rounded-md border border-input bg-transparent p-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
      />
      <div className="mt-2 flex gap-3 text-sm">
        <button
          type="submit"
          disabled={salvando}
          className="rounded-md bg-primary px-3 py-1 font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {salvando ? "Salvando…" : "Salvar"}
        </button>
        <button
          type="button"
          onClick={onFim}
          className="text-muted-foreground"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

export type { TipoEtapa };
