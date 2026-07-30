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
        {/*
          "Menu" e não "Seções": a folha passou a carregar também o "Entrar", que
          não é seção da página. O título nomeia o que está dentro — e é ele que o
          leitor de tela anuncia ao abrir.
        */}
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>

        <ul className="px-4">
          {secoes.map(({ href, rotulo }) => (
            <li key={href}>
              {/**
               * Âncora crua e não `next/link`, mesmo agora que a maior parte
               * dos destinos é rota de verdade: a lista mistura rota e âncora
               * (`/#perguntas`), e `<a>` trata as duas igual. Navegar de página
               * cheia também evita a corrida entre fechar a folha e trocar de
               * rota. Fechar no clique é obrigatório — sem isso a folha fica
               * por cima do destino.
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

          {/*
            O "Entrar" do cabeçalho não existe abaixo de `sm` — ele e o botão
            "Começar grátis" apontavam para o mesmo `/login` e juntos estouravam a
            largura da tela. Aqui ele volta, separado por regra porque não é seção
            da página, e nomeado do jeito que quem já é cliente procura.
          */}
          <li className="mt-2 border-t border-border pt-2">
            <a
              href="/login"
              onClick={() => setAberto(false)}
              className="flex min-h-12 items-center rounded-lg px-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              Entrar na minha conta
            </a>
          </li>
        </ul>
      </SheetContent>
    </Sheet>
  );
}
