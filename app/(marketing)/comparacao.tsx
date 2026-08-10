import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Peças compartilhadas das páginas de comparação.
 *
 * Comparação com concorrente nomeado tem duas regras que não são de estilo:
 *
 * 1. **Todo número precisa de data e fonte.** Preço de concorrente muda sem
 *    avisar, e uma tabela desatualizada deixa de ser comparação e passa a ser
 *    informação falsa sobre outra empresa. Daí `NotaDeApuracao` ser obrigatória
 *    em toda página que use `TabelaComparacao`.
 * 2. **Dizer onde o outro ganha.** Não é generosidade: uma comparação em que o
 *    autor ganha em todas as linhas é lida como propaganda e descartada. E
 *    qualifica o lead — quem precisa do que o outro faz melhor não deveria
 *    assinar aqui e cancelar em duas semanas.
 */

export type LinhaComparacao = {
  aspecto: string;
  encaixaria: string;
  concorrente: string;
};

export function TabelaComparacao({
  concorrente,
  linhas,
}: {
  concorrente: string;
  linhas: LinhaComparacao[];
}) {
  return (
    /*
      `overflow-x-auto` com `min-w` na tabela: três colunas de texto não cabem em
      375px, e a alternativa (encolher a fonte) reprova acessibilidade. O scroll
      fica preso a este contêiner, então a página em si nunca rola na horizontal.

      `tabIndex={0}` + `role="region"` não são enfeite: a 375px a coluna do
      concorrente só existe atrás de um arrasto, e Chrome e Safari **não** dão
      foco a contêiner rolável por conta própria — sem isto, quem navega por
      teclado não alcança aquela coluna (2.1.1). O nome acessível vem do
      `aria-label`, com o mesmo texto do `<caption>`.
    */
    <div
      role="region"
      aria-label={`Comparação entre Encaixaria e ${concorrente}`}
      tabIndex={0}
      className="overflow-x-auto rounded-lg border border-border focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <table className="w-full min-w-[38rem] border-collapse text-sm">
        <caption className="sr-only">
          Comparação entre Encaixaria e {concorrente}
        </caption>
        <thead>
          <tr className="border-b border-border bg-card text-left">
            <th scope="col" className="p-4 font-medium text-muted-foreground">
              <span className="font-mono text-sm uppercase tracking-widest sm:text-xs">
                Aspecto
              </span>
            </th>
            <th scope="col" className="p-4 font-heading font-semibold">
              Encaixaria
            </th>
            <th scope="col" className="p-4 font-medium text-muted-foreground">
              {concorrente}
            </th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(({ aspecto, encaixaria, concorrente: outro }) => (
            <tr key={aspecto} className="border-b border-border last:border-0">
              <th
                scope="row"
                className="p-4 text-left align-top font-medium text-foreground"
              >
                {aspecto}
              </th>
              <td className="p-4 align-top leading-6">{encaixaria}</td>
              <td className="p-4 align-top leading-6 text-muted-foreground">
                {outro}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function NotaDeApuracao({
  concorrente,
  urlPrecos,
  consultadoEm,
}: {
  concorrente: string;
  urlPrecos: string;
  consultadoEm: string;
}) {
  return (
    <p className="mt-4 text-xs leading-5 text-muted-foreground">
      Informações sobre {concorrente} consultadas na página pública de planos em{" "}
      {consultadoEm} (
      <a
        href={urlPrecos}
        rel="nofollow noopener"
        target="_blank"
        className="underline underline-offset-2"
      >
        {urlPrecos.replace(/^https?:\/\//, "")}
      </a>
      ). Preço e recurso de outra empresa mudam sem aviso — confira lá antes de
      decidir. Se algo aqui estiver desatualizado, avise que a gente corrige.
    </p>
  );
}

export function ChamadaComparacao() {
  return (
    <section className="border-t border-border bg-card">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16 text-center">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          Teste duas semanas antes de decidir
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Sem cartão. Se não servir para o seu caso, você não perdeu nada além de
          um QR code lido.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Button asChild size="lg">
            <Link href="/registro">Começar teste grátis</Link>
          </Button>
          {/*
            Alvo **isolado** ao lado de um botão de 44px, então a isenção de
            "link dentro de uma frase" da SC 2.5.8 não vale: sem `min-h` isto
            ficava com ~20px de altura no celular.
          */}
          <Link
            href="/precos"
            className="flex min-h-11 items-center px-2 text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
          >
            Ver o preço
          </Link>
        </div>
      </div>
    </section>
  );
}
