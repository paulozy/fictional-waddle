/**
 * O produto funcionando, em vídeo: a conversa do cliente com o bot e o
 * agendamento aparecendo na agenda do dono.
 *
 * Gerado por `scripts/demo/` (`npm run demo:video`), gravado contra a stack local
 * com um tenant de demonstração. **Não** é montagem: o login é real e o
 * agendamento destacado na agenda é o mesmo que a conversa acabou de marcar.
 *
 * Server Component de propósito — é HTML e CSS puros, sem estado. Um
 * `"use client"` aqui hidrataria a landing inteira para tocar um vídeo que o
 * `<video>` nativo já toca.
 */

const VERTICAL = "/demo/encaixaria-vertical";
const DESKTOP = "/demo/encaixaria-desktop";

/**
 * O que o vídeo mostra, em texto.
 *
 * Não é redundância: as legendas do vídeo estão **queimadas no pixel** e não
 * existem para leitor de tela. Conteúdo pré-gravado só de vídeo precisa de
 * alternativa textual (WCAG 2.2, SC 1.2.1), e é esta — somada à transcrição da
 * conversa que `components/conversa-demo.tsx` já renderiza acima, com o
 * `aria-label` descrevendo o fluxo todo.
 */
const DESCRICAO =
  "O cliente pede um horário no WhatsApp, o bot lista os serviços numerados, " +
  "mostra os horários livres do dia, confirma o agendamento — e o horário " +
  "aparece na agenda do dono, já com nome, serviço e duração.";

export function VideoDemonstracao() {
  /**
   * Os atributos que fazem esta seção não custar caro:
   *
   * `preload="none"` é obrigatório, não otimização. A escolha entre os dois
   * formatos é por CSS (a regra da casa: nunca `matchMedia`, para a decisão ficar
   * na folha de estilo e a primeira pintura já vir certa), então os DOIS
   * elementos existem no DOM — e `display:none` **não** impede o browser de
   * baixar bytes de vídeo. Com o default `metadata`, todo visitante puxaria os
   * dois arquivos. Com `none`, só o pôster (13 KB e 35 KB) viaja até alguém
   * clicar em play.
   *
   * Sem `autoPlay` e sem `loop`: 1 MB rodando sozinho no 4G de quem só passou na
   * página é caro, e conteúdo em movimento por mais de 5s exigiria controle de
   * pausa (SC 2.2.2). Com `controls`, quem quer ver decide ver.
   *
   * `width`/`height` reservam a proporção antes de o pôster chegar, para a página
   * não pular quando ele carrega.
   */
  const comuns = {
    controls: true,
    preload: "none" as const,
    playsInline: true,
    className: "h-auto w-full rounded-xl border border-border bg-card shadow-sm",
  };

  return (
    <section className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
      <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
        Veja funcionando, dos dois lados
      </h2>
      <p className="mt-4 max-w-2xl text-muted-foreground">
        Um agendamento inteiro, do &ldquo;oi, queria marcar um horário&rdquo; até
        o horário na sua agenda. Sem narração e sem corte.
      </p>

      <figure className="mt-8">
        {/*
          A mesma decisão da agenda do dashboard: duas visões escolhidas por CSS,
          `md:hidden` / `hidden md:block`. O vertical é o layout de celular, que é
          como o dono usa o produto de verdade; o 16:9 mostra a grade da semana,
          que só existe a partir de `md`.
        */}
        <video
          {...comuns}
          width={720}
          height={1280}
          poster={`${VERTICAL}.webp`}
          aria-label={DESCRICAO}
          className={`${comuns.className} mx-auto max-w-sm md:hidden`}
        >
          <source src={`${VERTICAL}.mp4`} type="video/mp4" />
        </video>

        <video
          {...comuns}
          width={1280}
          height={720}
          poster={`${DESKTOP}.webp`}
          aria-label={DESCRICAO}
          className={`${comuns.className} hidden md:block`}
        >
          <source src={`${DESKTOP}.mp4`} type="video/mp4" />
        </video>

        {/*
          Uma legenda para os dois vídeos, e não uma por elemento: o texto é o
          mesmo, e duplicá-lo colocaria o parágrafo duas vezes no HTML indexável.
        */}
        <figcaption className="mt-4 text-sm leading-6 text-muted-foreground">
          {DESCRICAO}
        </figcaption>
      </figure>
    </section>
  );
}
