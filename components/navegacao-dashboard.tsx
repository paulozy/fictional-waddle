"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  CalendarDaysIcon,
  ClockIcon,
  MenuIcon,
  MessagesSquareIcon,
  ScissorsIcon,
  BanknoteIcon,
  SmartphoneIcon,
  type LucideIcon,
} from "lucide-react";
import { AlternarTema } from "@/components/alternar-tema";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/**
 * Navegação do dashboard, nas duas formas que a mesma lista de destinos precisa
 * assumir.
 *
 * **Por que existe um client component aqui.** O layout do dashboard é RSC e
 * precisa continuar sendo: é ele que lê a sessão e o perfil no servidor. Mas
 * marcar a página atual exige `usePathname`, que é client — antes disto o
 * projeto não tinha nenhum `usePathname` e nenhuma tela dizia onde você está.
 * A saída é esta ilha: só a barra hidrata, o layout segue no servidor.
 *
 * **Por que quatro abas e não cinco.** São cinco destinos, no limite superior
 * da faixa em que uma barra inferior funciona (3–5). Mas eles não têm a mesma
 * frequência: agenda é diária, serviços e horários são de manutenção, fluxo é
 * de configuração inicial e WhatsApp só importa quando a conexão cai. Quatro
 * abas dão ~82px cada num aparelho de 375px; cinco dariam ~65px e exigiriam
 * rótulo de 10px. O quinto destino, o tema e o Sair moram no "Mais".
 *
 * Acima de `md` a barra some por completo e o header volta a ser a navegação —
 * lá os cinco rótulos cabem numa linha, que é como sempre foi.
 */

export type ItemNavegacao = {
  href: string;
  rotulo: string;
  /** Rótulo curto da aba: "Agendamentos" não cabe em 82px. */
  rotuloCurto?: string;
  icone: keyof typeof ICONES;
};

/**
 * Ícones ficam num mapa em vez de vir prontos no item porque a lista nasce no
 * layout, que é Server Component: passar um componente React por prop
 * atravessaria a fronteira RSC → client, que só aceita dado serializável.
 */
const ICONES = {
  agenda: CalendarDaysIcon,
  servicos: ScissorsIcon,
  horarios: ClockIcon,
  fluxo: MessagesSquareIcon,
  whatsapp: SmartphoneIcon,
  pagamentos: BanknoteIcon,
} satisfies Record<string, LucideIcon>;

export function NavegacaoDashboard({
  abas,
  itensExtras,
  aoSair,
}: {
  abas: ItemNavegacao[];
  itensExtras: ItemNavegacao[];
  /** Server Action de logout, repassada pelo layout. */
  aoSair: () => void | Promise<void>;
}) {
  const caminho = usePathname();
  const [menuAberto, setMenuAberto] = useState(false);

  const extraAtivo = itensExtras.some((item) => ehAtivo(caminho, item.href));

  return (
    <>
      {/* ≥ md: a navegação de sempre, dentro do header. */}
      <nav className="hidden gap-x-5 text-sm md:flex">
        {[...abas, ...itensExtras].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={ehAtivo(caminho, item.href) ? "page" : undefined}
            className="rounded-md py-1 text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:font-medium aria-[current=page]:text-foreground"
          >
            {item.rotulo}
          </Link>
        ))}
      </nav>

      {/* < md: barra inferior fixa, ao alcance do polegar. */}
      <nav
        aria-label="Navegação principal"
        /**
         * O `pb` de safe-area só tem efeito por causa do `viewportFit: "cover"`
         * declarado em `app/layout.tsx`: sem ele o `env()` resolve para zero e
         * a barra fica embaixo da barra de gestos do iPhone.
         */
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="mx-auto flex max-w-md">
          {abas.map((item) => {
            const Icone = ICONES[item.icone];
            const ativo = ehAtivo(caminho, item.href);

            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={ativo ? "page" : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] leading-none transition-colors ${
                    ativo
                      ? "font-medium text-primary"
                      : "text-muted-foreground"
                  }`}
                >
                  <Icone className="size-5" aria-hidden />
                  {item.rotuloCurto ?? item.rotulo}
                </Link>
              </li>
            );
          })}

          <li className="flex-1">
            <Sheet open={menuAberto} onOpenChange={setMenuAberto}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  /**
                   * O "Mais" acende quando a página aberta está lá dentro. Sem
                   * isto, quem está em "Fluxo da conversa" vê a barra inteira
                   * apagada e perde a referência de onde está.
                   */
                  aria-current={extraAtivo ? "page" : undefined}
                  className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] leading-none transition-colors ${
                    extraAtivo
                      ? "font-medium text-primary"
                      : "text-muted-foreground"
                  }`}
                >
                  <MenuIcon className="size-5" aria-hidden />
                  Mais
                </button>
              </SheetTrigger>

              <SheetContent
                side="bottom"
                className="rounded-t-xl pb-[max(1rem,env(safe-area-inset-bottom))]"
              >
                <SheetHeader>
                  <SheetTitle>Mais</SheetTitle>
                </SheetHeader>

                <ul className="px-4">
                  {itensExtras.map((item) => {
                    const Icone = ICONES[item.icone];

                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setMenuAberto(false)}
                          aria-current={
                            ehAtivo(caminho, item.href) ? "page" : undefined
                          }
                          className="flex min-h-12 items-center gap-3 rounded-lg px-2 text-sm transition-colors hover:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-primary"
                        >
                          <Icone className="size-4 shrink-0" aria-hidden />
                          {item.rotulo}
                        </Link>
                      </li>
                    );
                  })}
                </ul>

                <div className="flex items-center justify-between gap-2 border-t border-border px-4 pt-4">
                  <AlternarTema />
                  <form action={aoSair}>
                    <Button type="submit" variant="outline">
                      Sair
                    </Button>
                  </form>
                </div>
              </SheetContent>
            </Sheet>
          </li>
        </ul>
      </nav>
    </>
  );
}

/**
 * Casa a rota atual com o destino.
 *
 * Prefixo e não igualdade: uma futura `/servicos/123` continua acendendo
 * "Serviços". O `/` extra evita que `/horarios-antigos` case com `/horarios`.
 */
function ehAtivo(caminho: string | null, href: string): boolean {
  if (!caminho) return false;
  return caminho === href || caminho.startsWith(`${href}/`);
}
