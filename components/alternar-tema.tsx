"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

/**
 * Alterna entre claro e escuro.
 *
 * Os dois ícones são renderizados sempre, e quem escolhe qual aparece é a
 * própria classe `.dark` do `<html>` via CSS. É de propósito: a alternativa
 * usual — guardar "já montei?" em estado e só então decidir o ícone — lê o tema
 * durante a renderização, o que no servidor é sempre `undefined` e provoca
 * divergência de hidratação (além de violar `react-hooks/set-state-in-effect`).
 *
 * `resolvedTheme` só é lido dentro do clique, que por definição roda depois da
 * hidratação, então ali não há ambiguidade.
 */
export function AlternarTema() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="Alternar entre tema claro e escuro"
    >
      <SunIcon className="hidden size-4 dark:block" />
      <MoonIcon className="size-4 dark:hidden" />
    </Button>
  );
}
