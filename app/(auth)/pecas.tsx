import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Peças repetidas pelas sete telas de autenticação.
 *
 * Existem como componentes, e não como classes copiadas por página, porque cada
 * uma carrega uma regra de acessibilidade que já foi esquecida em algum lugar do
 * projeto antes: 16px em campo (senão o iOS dá zoom e não desfaz), 44px de alvo
 * de toque, `role="alert"` na caixa de erro. Espalhadas, a próxima tela nasce
 * errada; aqui, nasce certa.
 *
 * Nenhuma cor em hex. Os valores do design importado (`#1E7266`, `#55635F`,
 * `#A8301F`…) **são** os tokens de `app/globals.css`, hex por hex — usar o token
 * dá o tema escuro de graça, que o design (claro-só) não previa.
 */

/** Título + subtítulo de cada tela. */
export function Cabecalho({
  titulo,
  children,
  className,
}: {
  titulo: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mt-8 lg:mt-11", className)}>
      {/**
       * Os 34px do design são o **topo** da escala, não o valor único: a 320px
       * um título de 34px em duas palavras longas ("estabelecimento") estoura a
       * linha.
       */}
      <h1 className="font-heading text-[1.75rem] leading-[1.1] font-semibold tracking-tight sm:text-3xl lg:text-[2.125rem]">
        {titulo}
      </h1>
      {children && (
        <p className="mt-3 text-base leading-relaxed text-muted-foreground md:text-[0.94rem]">
          {children}
        </p>
      )}
    </div>
  );
}

/**
 * Campo rotulado.
 *
 * `rotuloExtra` é o slot do "Esqueci a senha" que o design põe à direita do
 * rótulo "Senha" — dentro do `<label>` seria clique que foca o campo, então ele
 * fica num `<span>` irmão, fora do alcance do rótulo.
 */
export function Campo({
  id,
  rotulo,
  rotuloExtra,
  className,
  ...props
}: React.ComponentProps<typeof Input> & {
  id: string;
  rotulo: string;
  rotuloExtra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {rotulo}
        </label>
        {rotuloExtra}
      </div>
      {/**
       * Duas alturas e duas fontes, e as quatro classes são necessárias.
       *
       * `max-md:h-[2.875rem]` além de `h-[2.875rem]`: o `Input` traz
       * `max-md:h-11` embutido, e numa media query ele vence a altura base. Os
       * dois juntos dão 46px em qualquer largura.
       *
       * `md:text-base` desfaz o `md:text-sm` do `Input`. O idioma do projeto é
       * 16px no celular e 14px no desktop, e ali está certo — mas ele resolve o
       * zoom do iOS por **largura**, e o iPad em retrato reporta exatamente
       * 768px, o começo do `md`. Medido em Chromium: os campos caíam para 14px a
       * partir daí. Numa tela de login isso não se paga em densidade — são dois
       * campos numa coluna de 380px —, então aqui a fonte é 16px em qualquer
       * aparelho.
       */}
      <Input
        id={id}
        className={cn(
          "h-[2.875rem] max-md:h-[2.875rem] px-3.5 md:text-base",
          className,
        )}
        {...props}
      />
    </div>
  );
}

/**
 * Campo de escolha, com `<select>` nativo.
 *
 * Nativo e não o `components/ui/select.tsx` do Radix, pelo mesmo motivo do editor
 * de horários: em iOS o nativo abre o seletor de roda, que com uma lista de 16
 * fusos é muito melhor com o dedo do que qualquer dropdown customizado.
 *
 * `text-base` sem contraparte em `md`, igual ao `Campo`: 16px em qualquer largura,
 * porque é a fonte do campo que decide se o iOS dá zoom ao focar, e o iPad em
 * retrato já está dentro do `md`.
 */
export function CampoSelecao({
  id,
  rotulo,
  className,
  children,
  ...props
}: React.ComponentProps<"select"> & { id: string; rotulo: string }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {rotulo}
      </label>
      <select
        id={id}
        className={cn(
          "h-[2.875rem] w-full rounded-lg border border-input bg-transparent px-3 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

/** Botão principal da tela: largura total, 48px, como no design. */
export function BotaoPrincipal({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      className={cn("h-12 max-md:h-12 w-full text-[0.97rem]", className)}
      {...props}
    />
  );
}

/**
 * Caixa de recado acima do formulário.
 *
 * `role="alert"` só no tom de erro: em recado neutro ("link enviado") o alerta
 * interromperia o leitor de tela sem haver problema nenhum a resolver.
 */
export function Recado({
  tom,
  children,
}: {
  tom: "erro" | "neutro";
  children: React.ReactNode;
}) {
  const erro = tom === "erro";
  return (
    <div
      role={erro ? "alert" : "status"}
      className={cn(
        "mt-6 rounded-lg border px-4 py-3.5 text-sm leading-relaxed",
        erro
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-border bg-accent text-accent-foreground",
      )}
    >
      {children}
    </div>
  );
}

/** Link discreto no pé da tela ("Já tem conta? Entrar"). */
export function LinhaDeApoio({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-6 text-base text-muted-foreground md:text-[0.9rem]">
      {children}
    </p>
  );
}
