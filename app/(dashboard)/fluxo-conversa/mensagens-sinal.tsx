"use client";

import { useActionState, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { comporCobranca } from "@/lib/bot/mensagens-pagamento";
import {
  OBRIGATORIOS_POR_CHAVE,
  PLACEHOLDERS_POR_CHAVE,
  aplicarModelo,
  dividirPlaceholders,
  type ChaveMensagem,
} from "@/lib/bot/modelo-mensagem";
import {
  salvarMensagemSinal,
  type EstadoMensagem,
} from "@/app/(dashboard)/pagamentos/actions";

export type MensagemEditavel = {
  chave: ChaveMensagem;
  rotulo: string;
  /** Quando o bot manda este texto — o dono precisa saber antes de reescrever. */
  contexto: string;
  /**
   * O texto de fábrica **na forma editável**, com as chaves à mostra.
   *
   * Vai para o `placeholder` do campo, não para o valor: é assim que o dono vê
   * como as chaves são usadas numa frase de verdade sem que a gente escreva no
   * lugar dele — e campo vazio volta a significar exatamente "uso o padrão".
   */
  padrao: string;
  /** O que cada chave vira no envio, para a legenda dizer isso em voz alta. */
  exemplos: Record<string, string>;
  /** O que o dono já salvou, ou vazio. */
  atual: string;
};

/**
 * Um copia-e-cola Pix de mentira, só para a prévia ter o tamanho e a cara certos.
 *
 * Truncado de propósito: o payload real passa de 200 caracteres e encheria o
 * cartão sem acrescentar informação nenhuma — o que a bolha precisa ensinar é
 * "vem sozinho, é ilegível, é para copiar", e isso um trecho já diz.
 */
const PIX_EXEMPLO =
  "00020126580014br.gov.bcb.pix0136f5c2a1e4-9d3b-42a7-8c61-0e7b5204000053039865802BR";

/**
 * Edição dos textos do bot sobre sinal.
 *
 * Vive na tela de fluxo da conversa, junto do resto do que o bot fala, e não na de
 * pagamentos: lá o assunto é a conta do Mercado Pago e o dinheiro; aqui é o que o
 * cliente lê. A tela de pagamentos leva para cá por um link.
 *
 * O campo nasce **vazio, com o texto de fábrica no `placeholder`** — e o
 * placeholder mostra as chaves cruas (`{valor}`, `{prazo}`), não o texto já
 * interpolado. As duas metades importam: campo vazio volta a significar
 * literalmente "uso o texto padrão", sem gesto extra; e o exemplo em forma
 * editável é o que ensina a mecânica, porque um exemplo com "R$ 20,00" escrito no
 * lugar de `{valor}` esconderia justamente a parte substituível.
 *
 * **A prévia ao lado é a peça que o design acrescentou, e ela ganha o argumento
 * que a legenda sozinha perdia.** Uma linha dizendo "{valor} vira R$ 20,00" foi
 * lida, em teste com o dono, como afirmação de que o sinal era fixo em R$ 20 —
 * enquanto a mesma informação dentro de uma bolha de WhatsApp, ao lado do campo,
 * se lê imediatamente como exemplo do formato. Ver `comporCobranca` em
 * `lib/bot/mensagens-pagamento.ts`: a ordem da mensagem mora lá, e não aqui, para
 * a prévia não poder divergir do que o bot manda de fato.
 */
export function MensagensSinal({
  mensagens,
  politica,
}: {
  mensagens: MensagemEditavel[];
  /**
   * A política de cancelamento do dono, que o bot cola antes do código Pix.
   *
   * Não é opcional: a aba inteira só existe quando `cobrancaSinalHabilitada` é
   * verdadeira, e ela já exige a política. Sem este texto a prévia mostraria uma
   * mensagem mais curta do que a que o cliente recebe.
   */
  politica: string;
}) {
  return (
    <div className="max-w-5xl">
      <p className="max-w-[62ch] text-base leading-relaxed text-muted-foreground md:text-sm">
        Estas são as mensagens sobre o sinal por Pix. O que estiver entre chaves é
        trocado pelo bot na hora do envio: escrever{" "}
        <code className="font-mono text-foreground">{"{valor}"}</code> faz chegar
        ao cliente o valor do sinal{" "}
        <strong className="font-medium">daquele serviço</strong>, como você
        cadastrou em Serviços. Em branco, o bot usa o texto sugerido.
      </p>

      {/* `space-y-12` e não uma segunda grade: as duas mensagens são blocos
          independentes empilhados, e cada uma abre a própria grade de duas
          colunas. */}
      <div className="mt-8 space-y-12">
        {mensagens.map((mensagem) => (
          <CampoMensagem
            key={mensagem.chave}
            mensagem={mensagem}
            politica={politica}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Classes que o campo e o espelho de destaque **precisam** compartilhar.
 *
 * O destaque é um `<pre>` atrás de um `<textarea>` de texto transparente. Só
 * funciona enquanto os dois quebram linha no mesmo lugar, então fonte, tamanho,
 * entrelinha, espaçamento e borda têm de ser idênticos — daí virem de uma
 * constante em vez de estarem escritos duas vezes. Qualquer ajuste tipográfico num
 * dos dois desalinha o destaque do texto real.
 */
const CAIXA_TEXTO =
  "w-full rounded-md border border-transparent p-3 text-base leading-relaxed whitespace-pre-wrap break-words";

/** Rótulo de seção do design: mono, caixa alta, bem espaçado. */
const ROTULO_SECAO =
  "font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground";

function CampoMensagem({
  mensagem,
  politica,
}: {
  mensagem: MensagemEditavel;
  politica: string;
}) {
  const [estado, acao, enviando] = useActionState<EstadoMensagem, FormData>(
    salvarMensagemSinal,
    undefined,
  );

  // Controlado porque o espelho do destaque e a prévia acompanham cada tecla.
  const [texto, setTexto] = useState(mensagem.atual);
  const espelho = useRef<HTMLPreElement>(null);

  const erro =
    estado && "erro" in estado && estado.chave === mensagem.chave
      ? estado.erro
      : null;
  const salvo = estado && "ok" in estado && estado.chave === mensagem.chave;
  const campoId = `mensagem-${mensagem.chave}`;

  const permitidos = PLACEHOLDERS_POR_CHAVE[mensagem.chave];
  const obrigatorios = OBRIGATORIOS_POR_CHAVE[mensagem.chave];
  const pedacos = dividirPlaceholders(texto, permitidos);

  /**
   * Faltando agora, para avisar antes de o dono clicar em Salvar.
   *
   * Só quando há texto: **campo vazio é válido** e significa "use o padrão", então
   * exigir obrigatórios num campo em branco bloquearia justamente o estado
   * inicial de quem nunca personalizou nada.
   */
  const faltando =
    texto.trim() === ""
      ? []
      : obrigatorios.filter(
          (nome) => !pedacos.some((p) => p.tipo === "campo" && p.nome === nome),
        );

  return (
    /*
      Duas colunas só a partir de `lg`, e o motivo é a largura útil: abaixo disso o
      painel ainda tem a lateral comendo 252px, e duas colunas dariam ~250px cada —
      estreito demais tanto para o campo quanto para a bolha da prévia. Empilhado, a
      prévia vem logo abaixo do campo, que é a ordem de leitura certa mesmo assim.
    */
    <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-x-11">
      <form action={acao}>
        {/* A chave vai no corpo, não no id do elemento: a action valida contra o
            vocabulário fechado e recusa o que não reconhece. */}
        <input type="hidden" name="chave" value={mensagem.chave} />

        <label
          htmlFor={campoId}
          className="font-heading text-lg font-semibold tracking-tight"
        >
          {mensagem.rotulo}
        </label>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {mensagem.contexto}
        </p>

        <div
          className={`mt-4 grid rounded-md border bg-transparent dark:bg-input/30 ${
            erro || faltando.length > 0 ? "border-destructive" : "border-input"
          } focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50`}
        >
          {/**
           * Espelho e campo ocupam a MESMA célula da grade (`col-start-1
           * row-start-1`), então a altura é a do maior — o campo cresce com o texto
           * sem `rows` fixo e sem medir nada em JavaScript.
           *
           * O `\n` no fim existe porque uma última linha vazia não gera altura no
           * `<pre>`: sem ele, apertar Enter no fim do texto move o cursor para fora
           * da área desenhada.
           */}
          <pre
            ref={espelho}
            aria-hidden
            className={`${CAIXA_TEXTO} pointer-events-none col-start-1 row-start-1 overflow-hidden font-sans`}
          >
            {pedacos.map((pedaco, i) =>
              pedaco.tipo === "texto" ? (
                <span key={i}>{pedaco.valor}</span>
              ) : (
                <mark
                  key={i}
                  className={
                    pedaco.conhecido
                      ? "rounded bg-primary/15 font-medium text-primary"
                      : "rounded bg-destructive/15 font-medium text-destructive"
                  }
                >
                  {pedaco.valor}
                </mark>
              ),
            )}
            {"\n"}
          </pre>

          <textarea
            id={campoId}
            name="texto"
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            onScroll={(evento) => {
              // O espelho não rola sozinho: acompanha o campo.
              if (espelho.current) {
                espelho.current.scrollTop = evento.currentTarget.scrollTop;
              }
            }}
            rows={5}
            spellCheck
            placeholder={mensagem.padrao}
            aria-invalid={erro ? true : undefined}
            aria-describedby={`${campoId}-ajuda`}
            /* Texto transparente com cursor visível: o que se lê é o espelho de
               baixo. `resize-none` porque redimensionar só o campo descolaria os
               dois. Sem `text-sm`: 16px é o que impede o zoom de foco do iOS.
               `placeholder:text-muted-foreground` é OBRIGATÓRIO aqui: o
               `text-transparent` que esconde o texto real esconderia o placeholder
               junto, e o exemplo — que é o que ensina as chaves — sumiria. */
            className={`${CAIXA_TEXTO} col-start-1 row-start-1 resize-none bg-transparent text-transparent caret-foreground outline-none placeholder:text-muted-foreground selection:bg-primary/25`}
          />
        </div>

        {/**
         * A legenda vira uma linha por chave, como no design — e não mais uma
         * fileira que embrulha. Com quatro chaves numa linha só, "obrigatória"
         * grudava na chave seguinte e a coluna de exemplos não alinhava.
         *
         * O "por exemplo" no rótulo não é preciosismo: sem ele, "{valor} → R$
         * 20,00" se lê como afirmação sobre o valor do sinal — e o sinal não é
         * fixo, sai de `servicos.valor_sinal` e muda de serviço para serviço. Um
         * dono que lesse aquilo como fato configuraria o valor errado em Serviços,
         * ou pior, não configuraria nenhum achando que R$ 20 já era o padrão.
         */}
        <p className={`mt-5 ${ROTULO_SECAO}`}>No envio, por exemplo</p>
        <dl id={`${campoId}-ajuda`} className="mt-2.5 flex flex-col">
          {permitidos.map((nome, i) => (
            <div
              key={nome}
              className={`flex items-baseline gap-3 border-t border-border py-2.5 text-sm ${
                i === permitidos.length - 1 ? "border-b" : ""
              }`}
            >
              <dt className="min-w-[4.75rem]">
                <code className="font-mono text-xs text-accent-foreground">
                  {`{${nome}}`}
                </code>
              </dt>
              <dd className="flex-1 text-muted-foreground">
                {mensagem.exemplos[nome] ?? "—"}
              </dd>
              {obrigatorios.includes(nome) && (
                <span className={ROTULO_SECAO}>obrigatória</span>
              )}
            </div>
          ))}
        </dl>

        {/**
         * Aviso ao vivo do que falta, antes de clicar em Salvar. A action valida de
         * novo do lado do servidor — este é conforto, não a garantia: um POST direto
         * ou o formulário sem JavaScript não passam por aqui.
         */}
        {faltando.length > 0 && (
          <p role="status" className="mt-3 text-sm text-destructive">
            Falta citar{" "}
            <span className="font-mono">
              {faltando.map((n) => `{${n}}`).join(", ")}
            </span>{" "}
            — sem isso o cliente não recebe a informação que a mensagem existe para
            dar.
          </p>
        )}

        {erro && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {erro}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={enviando || faltando.length > 0}>
            {enviando ? "Salvando…" : "Salvar"}
          </Button>

          {/**
           * Restaurar é submit com `name`/`value` próprios, e não um botão que só
           * mexe no estado local: assim o padrão volta **no banco** (a linha é
           * apagada), e não apenas na tela — onde o dono acharia que restaurou e o
           * bot seguiria mandando o texto antigo.
           */}
          <Button
            type="submit"
            name="acao"
            value="restaurar"
            variant="ghost"
            disabled={enviando || (!mensagem.atual && texto.trim() === "")}
            onClick={() => setTexto("")}
          >
            Usar o texto sugerido
          </Button>

          {salvo && !enviando && (
            <span role="status" className="text-sm text-muted-foreground">
              Salvo.
            </span>
          )}
        </div>
      </form>

      <Previa mensagem={mensagem} texto={texto} politica={politica} />
    </div>
  );
}

/**
 * "Como chega no WhatsApp": o texto atual do campo, já interpolado, dentro das
 * bolhas que o cliente vê.
 *
 * Duas decisões que a fazem valer a pena em vez de enfeitar:
 *
 * 1. **A ordem vem de `comporCobranca`**, a mesma função que o bot usa. A política
 *    de cancelamento e o fecho que aponta o código Pix aparecem aqui porque
 *    aparecem lá — se a prévia mostrasse só o corpo, ela estaria escondendo
 *    metade da mensagem justamente de quem precisa aprová-la.
 * 2. **Segue o campo enquanto ele é digitado**, inclusive quando está vazio (aí
 *    mostra o padrão, que é o que o bot mandaria). Uma prévia que só atualiza ao
 *    salvar chega tarde: o erro que ela precisa pegar é o de quem ainda está
 *    escrevendo.
 */
function Previa({
  mensagem,
  texto,
  politica,
}: {
  mensagem: MensagemEditavel;
  texto: string;
  politica: string;
}) {
  const ehCobranca = mensagem.chave === "sinal_cobranca";

  // Campo vazio significa "use o padrão", e a prévia obedece à mesma regra —
  // senão ela mostraria uma bolha em branco para o estado mais comum de todos.
  const corpo = aplicarModelo(texto.trim() || mensagem.padrao, mensagem.exemplos);
  const principal = ehCobranca ? comporCobranca(corpo, politica) : corpo;

  return (
    <div>
      <p className={ROTULO_SECAO}>Como chega no WhatsApp</p>

      <div
        className="mt-4 flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4"
        role="img"
        aria-label={
          ehCobranca
            ? "Prévia: a mensagem pedindo o sinal, seguida do código Pix em mensagem separada."
            : "Prévia: a mensagem de sinal recebido."
        }
      >
        <p
          aria-hidden
          className="max-w-[92%] self-start rounded-lg bg-muted px-3 py-2 text-sm leading-relaxed whitespace-pre-line text-foreground"
        >
          {principal}
        </p>

        {/* A segunda bolha não é editável e por isso não sai do padrão: ela existe
            na prévia para o dono ver que o código vem SOZINHO, que é o motivo de
            ele não poder escrever nada em volta. */}
        {ehCobranca && (
          <p
            aria-hidden
            className="max-w-[92%] self-start rounded-lg bg-muted px-3 py-2 font-mono text-xs leading-relaxed break-all text-muted-foreground"
          >
            {PIX_EXEMPLO}
          </p>
        )}
      </div>

      <p className="mt-3 max-w-[46ch] text-xs leading-relaxed text-muted-foreground">
        {ehCobranca
          ? "O código Pix vai sozinho numa mensagem separada e não é editável: o cliente segura a mensagem para copiar, e qualquer texto em volta entra na cópia — aí o banco recusa o código. A sua política de cancelamento entra logo antes dele, e vem da tela de Pagamentos."
          : "Se o Pix não cair no prazo, o horário volta a ser oferecido e o cliente recebe o aviso de cancelamento."}
      </p>
    </div>
  );
}
