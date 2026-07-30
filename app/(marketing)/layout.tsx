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
        {/*
          `gap-2` abaixo de `sm` e `min-w-0`, e os dois são medidos.
          Com `gap-6` fixo, o cabeçalho somava 409px numa tela de 375 — o botão
          "Começar grátis" ficava 34px fora e **a página inteira ganhava rolagem
          horizontal**, em toda página pública, não só na landing. `min-w-0`
          porque um filho flex tem `min-width: auto` por padrão e se recusa a
          encolher abaixo do conteúdo, o que empurra o irmão para fora em vez de
          quebrar.
        */}
        <div className="mx-auto flex max-w-5xl min-w-0 items-center gap-2 px-4 sm:gap-6 sm:px-6 py-3">
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
          {/*
            `flex min-h-11 items-center` em cada link, não só no `nav`: medidos a
            768px, estes alvos tinham 20px de altura (101×20, 40×20, 67×20) e
            reprovavam o mínimo AA de 24px da WCAG 2.2 SC 2.5.8. A altura do
            cabeçalho não muda — quem já a definia é o link da marca, também com
            `min-h-11` —, então o piso sai de graça.
          */}
          <nav aria-label="Seções" className="hidden gap-5 text-sm sm:flex">
            {SECOES.map(({ href, rotulo }) => (
              <Link
                key={href}
                href={href}
                className="flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground"
              >
                {rotulo}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <MenuSecoes secoes={SECOES} />
            {/*
              Escondido abaixo de `sm`, e o custo é zero em alcance: este link e o
              botão ao lado apontam para o **mesmo** `/login`. Eram dois rótulos
              do mesmo destino ocupando 69px numa tela de 375, e foi o que
              estourou o cabeçalho. Continua na folha de `MenuSecoes` porque
              "Começar grátis" não se lê como "entrar na minha conta" para quem já
              é cliente.

              `sm:min-h-10` e não `sm:min-h-8`: a 768px o alvo media 64×32.
            */}
            <Link
              href="/login"
              className="hidden min-h-11 items-center rounded-md px-3 text-sm text-muted-foreground transition-colors hover:text-foreground sm:flex sm:min-h-10"
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

          {/*
            `min-h-11` porque no celular estes são quatro alvos numa linha.

            `sm:min-h-10` e **não** `sm:min-h-0`: com zero, medidos a 768px, os
            quatro caíam para 20px de altura (41×20, 40×20, 78×20, 50×20) e
            reprovavam o mínimo AA de 24px da WCAG 2.2 SC 2.5.8. Era o defeito de
            alvo mais numeroso do site — quatro links × toda página pública — e
            invisível para a suíte do Vitest, que não mede pixel.
          */}
          <nav aria-label="Institucional" className="mt-6 flex flex-wrap gap-x-6">
            {LINKS_RODAPE.map(({ href, rotulo }) => (
              <Link
                key={href}
                href={href}
                className="flex min-h-11 items-center transition-colors hover:text-foreground sm:min-h-10"
              >
                {rotulo}
              </Link>
            ))}
          </nav>

          {/*
            `max-w-[28rem]` e não os 36rem da prosa: este texto é de 12px, e a
            medida de conforto escala com o corpo. A 36rem ele ainda dava ~96
            caracteres por linha — a largura em px é a mesma, o número de
            caracteres que cabe nela não.
          */}
          <p className="mt-6 max-w-[28rem] text-sm leading-6 sm:text-xs sm:leading-5">
            © {new Date().getFullYear()} Encaixaria. Sem vínculo de afiliação com
            o WhatsApp, a WhatsApp Inc. ou a Meta Platforms.
          </p>
        </div>
      </footer>
    </div>
  );
}
