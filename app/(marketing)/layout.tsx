import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Marca } from "@/components/marca";
import { MenuSecoes } from "./menu-secoes";

/**
 * Moldura da landing. Antes não existia: a página abria direto no `<h1>`, sem
 * cabeçalho, sem "Entrar" e sem rodapé — quem já era cliente não tinha por onde
 * voltar, e quem chegava não tinha onde procurar contato ou política.
 */

/**
 * Duas destas eram âncoras (`#como-funciona`, `#preco`) e agora são páginas
 * próprias. Os caminhos são **absolutos**, inclusive a âncora: `#perguntas`
 * relativo levaria a `/precos#perguntas`, que não existe — o visitante clicaria
 * e nada aconteceria.
 */
const SECOES = [
  { href: "/como-funciona", rotulo: "Como funciona" },
  { href: "/precos", rotulo: "Preço" },
  { href: "/#perguntas", rotulo: "Perguntas" },
];

/** Rodapé: o que sustenta confiança, não navegação de produto. */
const LINKS_RODAPE = [
  { href: "/sobre", rotulo: "Sobre" },
  { href: "/precos", rotulo: "Preço" },
  { href: "/privacidade", rotulo: "Privacidade" },
  { href: "/termos", rotulo: "Termos" },
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
          {/* `prioritaria` porque este header é `sticky top-0`: lazy-load num
              elemento fixo no topo produz um pop visível no primeiro paint. */}
          <Link
            href="/"
            className="flex min-h-11 items-center gap-2 font-heading text-lg font-semibold tracking-tight text-foreground"
          >
            <Marca tamanho={28} prioritaria />
            Encaixaria
          </Link>

          {/*
            `next/link` e não `<a>`: duas destas são rotas de verdade agora, e são
            os dois links mais clicados do site — com âncora crua cada clique é
            reload completo e sem prefetch. O `Link` também trata `/#perguntas`
            corretamente. (A âncora crua continua justificada em
            `menu-secoes.tsx`, por outro motivo, explicado lá.)
          */}
          <nav aria-label="Seções" className="hidden gap-5 text-sm sm:flex">
            {SECOES.map(({ href, rotulo }) => (
              <Link
                key={href}
                href={href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {rotulo}
              </Link>
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
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10 text-sm text-muted-foreground">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <span className="flex items-center gap-2 font-heading font-semibold text-foreground">
              <Marca tamanho={24} />
              Encaixaria
            </span>
            <span>Agendamento pelo WhatsApp do seu estabelecimento.</span>
          </div>

          {/* `min-h-11` porque no celular estes são quatro alvos numa linha. */}
          <nav aria-label="Institucional" className="mt-6 flex flex-wrap gap-x-6">
            {LINKS_RODAPE.map(({ href, rotulo }) => (
              <Link
                key={href}
                href={href}
                className="flex min-h-11 items-center transition-colors hover:text-foreground sm:min-h-0"
              >
                {rotulo}
              </Link>
            ))}
          </nav>

          <p className="mt-6 text-xs">
            © {new Date().getFullYear()} Encaixaria. Sem vínculo de afiliação com
            o WhatsApp, a WhatsApp Inc. ou a Meta Platforms.
          </p>
        </div>
      </footer>
    </div>
  );
}
