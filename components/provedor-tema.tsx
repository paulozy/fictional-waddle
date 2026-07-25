"use client";

import { ThemeProvider } from "next-themes";

/**
 * Tema claro/escuro pela estratégia de **classe**.
 *
 * O `globals.css` declara `@custom-variant dark (&:is(.dark *))`, então toda
 * variante `dark:` depende da classe `.dark` estar no `<html>` — e não mais da
 * media query `prefers-color-scheme` que o projeto usava antes.
 *
 * O `next-themes` entrou como dependência obrigatória de `components/ui/sonner.tsx`
 * (que lê `useTheme()` para acertar o tema do toast). Já que ele está no bundle,
 * usá-lo de verdade sai mais barato que manter um script de tema próprio em
 * paralelo: ele injeta o script pré-pintura que evita o flash de tela clara,
 * persiste a escolha e acompanha o sistema quando o usuário não escolheu nada.
 *
 * `enableColorScheme` (default) mantém `color-scheme` em dia, para que barra de
 * rolagem e `input[type=time]` não fiquem claros dentro do tema escuro.
 */
export function ProvedorTema({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      // Sem isto, mudar de tema anima todas as cores da página de uma vez.
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}
