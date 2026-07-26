"use client";

import { useState } from "react";
import { MenuIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/**
 * Navegação de seção da landing em tela estreita.
 *
 * Antes o header tinha `hidden sm:flex`: abaixo de 640px as âncoras
 * simplesmente não existiam, e quem chegava pelo celular — que é a maioria de
 * quem clica em link de WhatsApp ou Instagram — não tinha como pular para
 * preço ou perguntas. Rolar a página inteira até achar é o que fazia.
 */
export function MenuSecoes({
  secoes,
}: {
  secoes: { href: string; rotulo: string }[];
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <Sheet open={aberto} onOpenChange={setAberto}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="sm:hidden"
          aria-label="Abrir menu de seções"
        >
          <MenuIcon />
        </Button>
      </SheetTrigger>

      <SheetContent
        side="bottom"
        className="rounded-t-xl pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <SheetHeader>
          <SheetTitle>Seções</SheetTitle>
        </SheetHeader>

        <ul className="px-4">
          {secoes.map(({ href, rotulo }) => (
            <li key={href}>
              {/**
               * Âncora crua e não `next/link`: o destino é a mesma página, não
               * há rota para pré-carregar. Fechar no clique é obrigatório —
               * sem isso a folha fica por cima da seção para onde o link
               * acabou de rolar.
               */}
              <a
                href={href}
                onClick={() => setAberto(false)}
                className="flex min-h-12 items-center rounded-lg px-2 text-sm transition-colors hover:bg-muted"
              >
                {rotulo}
              </a>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
