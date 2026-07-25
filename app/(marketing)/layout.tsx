import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Moldura da landing. Antes não existia: a página abria direto no `<h1>`, sem
 * cabeçalho, sem "Entrar" e sem rodapé — quem já era cliente não tinha por onde
 * voltar, e quem chegava não tinha onde procurar contato ou política.
 */

const SECOES = [
  { href: "#como-funciona", rotulo: "Como funciona" },
  { href: "#preco", rotulo: "Preço" },
  { href: "#perguntas", rotulo: "Perguntas" },
];

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-3">
          <Link
            href="/"
            className="font-heading text-lg font-semibold tracking-tight text-primary"
          >
            AgendaZap
          </Link>

          <nav className="hidden gap-5 text-sm sm:flex">
            {SECOES.map(({ href, rotulo }) => (
              <a
                key={href}
                href={href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {rotulo}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Entrar
            </Link>
            <Button asChild size="sm">
              <Link href="/login">Começar grátis</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-8 text-sm text-muted-foreground">
          <span className="font-heading font-semibold text-foreground">
            AgendaZap
          </span>
          <span>Agendamento pelo WhatsApp do seu estabelecimento.</span>
          <span className="ml-auto">
            © {new Date().getFullYear()} AgendaZap
          </span>
        </div>
      </footer>
    </div>
  );
}
