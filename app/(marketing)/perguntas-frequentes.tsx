import { ChevronDownIcon } from "lucide-react";
import { PERGUNTAS } from "./perguntas";

/**
 * FAQ em `<details>` nativo, e não no `Accordion` do Radix.
 *
 * O motivo não é preferência: **o Radix desmonta o conteúdo fechado**, e o
 * Google não clica em nada — *"Google Search does not interact with your page"*
 * (https://developers.google.com/search/docs/crawling-indexing/javascript/lazy-loading).
 * Medido no HTML pré-renderizado: as 9 perguntas apareciam, nenhuma das 9
 * respostas aparecia. Eram ~750 palavras do texto mais específico do produto
 * que não existiam para o buscador — a landing tinha 649 palavras indexáveis.
 *
 * O que `<details>` entrega além disso: funciona sem JavaScript, e o componente
 * deixou de ser `"use client"` (virou Server Component). O atributo `name` dá o
 * comportamento de "só um aberto por vez" que o `type="single"` do Radix dava
 * (https://developer.mozilla.org/en-US/docs/Web/HTML/Element/details#name); onde
 * o navegador ainda não suporta, todos podem abrir juntos — degradação
 * aceitável, porque o que importava era o conteúdo estar no DOM.
 *
 * Custo aceito: perde a animação de altura do Radix. `components/ui/accordion.tsx`
 * fica no lugar, como primitivo do design system, mas **não deve voltar para
 * cá** — nem para este FAQ, nem para qualquer conteúdo que precise ser indexado.
 */
export function PerguntasFrequentes() {
  return (
    <div className="w-full">
      {PERGUNTAS.map(({ pergunta, resposta }) => (
        <details
          key={pergunta}
          name="perguntas"
          className="group border-border not-last:border-b"
        >
          {/*
            `list-none` e `[&::-webkit-details-marker]:hidden` são os dois lados
            de matar o triângulo nativo — o primeiro resolve Chrome e Firefox, o
            segundo o Safari. `max-md:min-h-11` segue o piso de toque de
            `components/ui/button.tsx`, porque no celular isto é uma lista de
            nove alvos empilhados.
          */}
          <summary className="flex cursor-pointer list-none items-start justify-between gap-4 rounded-lg py-3 text-left text-base font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 max-md:min-h-11 [&::-webkit-details-marker]:hidden">
            {pergunta}
            <ChevronDownIcon
              aria-hidden
              className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-open:-rotate-180"
            />
          </summary>
          {/*
            `text-base` no celular e `max-w-[36rem]` sempre. São as respostas mais
            longas do site: a 14px num contêiner de 720px davam ~80 caracteres por
            linha, e no celular eram o menor corpo de uma lista de nove blocos de
            leitura.
          */}
          <p className="max-w-[36rem] pb-3 text-base leading-7 text-muted-foreground md:text-sm md:leading-6">
            {resposta}
          </p>
        </details>
      ))}
    </div>
  );
}
