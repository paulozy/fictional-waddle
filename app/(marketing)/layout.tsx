import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MenuSecoes } from "./menu-secoes";

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
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 sm:px-6 py-3">
          <Link
            href="/"
            className="font-heading text-lg font-semibold tracking-tight text-primary"
          >
            AgendaZap
          </Link>

          <nav aria-label="Seções" className="hidden gap-5 text-sm sm:flex">
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

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <MenuSecoes secoes={SECOES} />
            <Link
              href="/login"
              className="flex min-h-11 items-center rounded-md px-3 text-sm text-muted-foreground transition-colors hover:text-foreground sm:min-h-8"
            >
              Entrar
            </Link>
            {/* `size="sm"` era 28px de altura — o CTA principal da landing, e
                o menor alvo dela. O tamanho padrão já ganha piso de toque em
                `components/ui/button.tsx`. */}
            <Button asChild>
              <Link href="/login">Começar grátis</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 sm:px-6 py-8 text-sm text-muted-foreground">
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
