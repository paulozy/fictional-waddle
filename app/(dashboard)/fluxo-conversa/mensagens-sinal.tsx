"use client";

import { useActionState, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  OBRIGATORIOS_POR_CHAVE,
  PLACEHOLDERS_POR_CHAVE,
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
 */
export function MensagensSinal({
  mensagens,
}: {
  mensagens: MensagemEditavel[];
}) {
  return (
    <div className="max-w-2xl">
      <p className="max-w-[60ch] text-base leading-relaxed text-muted-foreground md:text-sm">
        Estas são as mensagens sobre o sinal por Pix. O que estiver entre chaves é
        trocado pelo bot na hora do envio — escrever{" "}
        <code className="font-mono text-foreground">{"{valor}"}</code> faz chegar{" "}
        <span className="text-foreground">R$ 20,00</span> no WhatsApp do cliente.
        Deixe em branco para usar o texto sugerido.
      </p>

      <div className="mt-6 space-y-9">
        {mensagens.map((mensagem) => (
          <CampoMensagem key={mensagem.chave} mensagem={mensagem} />
        ))}
      </div>

      {/**
       * O copia-e-cola do Pix não está aqui, e o dono merece saber por quê: sem
       * essa frase, a ausência parece esquecimento e vira pedido de suporte.
       */}
      <p className="mt-8 max-w-[56ch] text-xs leading-relaxed text-muted-foreground">
        O código Pix continua indo numa mensagem separada, e essa não é editável:
        no WhatsApp o cliente segura a mensagem para copiar, e qualquer texto em
        volta entra na cópia — aí o banco recusa o código.
      </p>
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

function CampoMensagem({ mensagem }: { mensagem: MensagemEditavel }) {
  const [estado, acao, enviando] = useActionState<EstadoMensagem, FormData>(
    salvarMensagemSinal,
    undefined,
  );

  // Controlado porque o espelho do destaque tem de acompanhar cada tecla.
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
    <form action={acao}>
      {/* A chave vai no corpo, não no id do elemento: a action valida contra o
          vocabulário fechado e recusa o que não reconhece. */}
      <input type="hidden" name="chave" value={mensagem.chave} />

      <label htmlFor={campoId} className="text-sm font-medium">
        {mensagem.rotulo}
      </label>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {mensagem.contexto}
      </p>

      <div
        className={`mt-2.5 grid rounded-md border bg-transparent dark:bg-input/30 ${
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
          rows={6}
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
       * A legenda mostra o que cada chave VIRA, não só que ela existe. "{valor}"
       * sozinho não ensina nada a quem nunca viu um modelo de texto; "{valor} →
       * R$ 20,00" ensina numa olhada.
       */}
      <dl
        id={`${campoId}-ajuda`}
        className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
      >
        {permitidos.map((nome) => (
          <div key={nome} className="flex items-center gap-1.5">
            <dt>
              <code className="rounded bg-primary/10 px-1 font-mono text-primary">
                {`{${nome}}`}
              </code>
            </dt>
            <dd>
              vira {mensagem.exemplos[nome] ?? "—"}
              {obrigatorios.includes(nome) && (
                <span className="text-foreground"> · obrigatório</span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {/**
       * Aviso ao vivo do que falta, antes de clicar em Salvar. A action valida de
       * novo do lado do servidor — este é conforto, não a garantia: um POST direto
       * ou o formulário sem JavaScript não passam por aqui.
       */}
      {faltando.length > 0 && (
        <p role="status" className="mt-2 text-sm text-destructive">
          Falta citar{" "}
          <span className="font-mono">
            {faltando.map((n) => `{${n}}`).join(", ")}
          </span>{" "}
          — sem isso o cliente não recebe a informação que a mensagem existe para
          dar.
        </p>
      )}

      {erro && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {erro}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={enviando || faltando.length > 0}>
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
          size="sm"
          disabled={enviando || (!mensagem.atual && texto.trim() === "")}
          onClick={() => setTexto("")}
        >
          Usar o texto padrão
        </Button>

        {salvo && !enviando && (
          <span role="status" className="text-sm text-muted-foreground">
            Salvo.
          </span>
        )}
      </div>
    </form>
  );
}
