import Link from "next/link";
import { Marca } from "@/components/marca";

/**
 * Moldura das telas de autenticação: login, cadastro (3 passos), recuperação e
 * redefinição de senha.
 *
 * O desenho vem de `Encaixaria Painel.dc.html` — duas colunas, formulário à
 * esquerda e um painel de expectativa à direita. O design é **desktop-only**
 * (grid fixo `1fr 0.85fr`, `padding:64px 48px`, sem uma media query), então
 * três coisas mudam aqui e não são liberdade estética:
 *
 * 1. **Uma coluna até `lg`.** A 375px o grid de duas colunas do design
 *    transborda; empilhar as duas empurraria o formulário para fora da primeira
 *    tela, e quem chega por link de WhatsApp abre no celular. O `<aside>` é
 *    reforço de decisão, não instrução — sai da árvore abaixo de `lg`.
 * 2. **`min-h-svh`, nunca `100vh` nem `dvh`.** Com o teclado virtual aberto,
 *    `vh` estoura a tela e `dvh` é remedido a cada retração da barra do Safari,
 *    fazendo a moldura mudar de altura durante o scroll.
 * 3. **Safe area no rodapé.** O `viewportFit: "cover"` de `app/layout.tsx` é o
 *    que faz `env(safe-area-inset-*)` resolver para algo diferente de zero; sem
 *    o `pb` aqui, o último link da tela fica embaixo da barra de gestos.
 */
export default function LayoutAutenticacao({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="grid min-h-svh flex-1 grid-cols-1 lg:grid-cols-[1fr_0.85fr]">
      <div className="flex items-center justify-center px-[max(1.25rem,env(safe-area-inset-left),env(safe-area-inset-right))] pt-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-8 lg:px-12 lg:pt-16">
        {/* `max-w`, nunca `w`: o design fixa 380px, que a 320px transbordaria. */}
        <div className="w-full max-w-[23.75rem]">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2.5 font-heading text-xl font-semibold tracking-tight text-foreground"
          >
            <Marca tamanho={30} prioritaria />
            Encaixaria
          </Link>

          {children}
        </div>
      </div>

      <aside className="hidden border-l border-border bg-secondary px-12 py-16 lg:flex lg:flex-col lg:justify-center">
        <p className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
          O que espera do outro lado
        </p>
        <ul className="mt-7 max-w-[26rem]">
          {[
            "A agenda da semana, com cada horário que o bot fechou",
            "Serviços, duração e grade de horários no seu controle",
            "O roteiro da conversa, escrito com as suas palavras",
            "O estado da conexão do WhatsApp, sempre visível",
          ].map((linha) => (
            <li
              key={linha}
              className="border-t border-border py-4.5 text-[0.97rem] leading-relaxed last:border-b"
            >
              {linha}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
