import type { Metadata, Viewport } from "next";
import {
  Bricolage_Grotesque,
  Geist_Mono,
  Instrument_Sans,
} from "next/font/google";
import { ProvedorTema } from "@/components/provedor-tema";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

/**
 * Três papéis tipográficos, não um só.
 *
 * `latin-ext` é obrigatório nos três: sem ele, `ã õ ç á ê` caem para a fonte de
 * sistema e o texto fica com dois desenhos misturados na mesma palavra.
 */

/** Display — só título de página e hero, com restrição. */
const fonteDisplay = Bricolage_Grotesque({
  variable: "--fonte-display",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

/** Corpo — todo o resto da interface. */
const fonteCorpo = Instrument_Sans({
  variable: "--fonte-corpo",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

/** Numérico — calha de horas do calendário, horários, códigos. */
const fonteMono = Geist_Mono({
  variable: "--fonte-mono",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AgendaZap — agendamento pelo WhatsApp",
  description:
    "Seu cliente vê os horários livres e agenda pelo WhatsApp do seu estabelecimento, sem baixar app.",
};

/**
 * `width=device-width, initial-scale=1` **não** aparece aqui de propósito: o
 * Next já emite os dois por padrão (`createDefaultViewport`), e repetir só
 * criaria um segundo lugar para divergir.
 *
 * O que falta ao default e importa em celular são estes três:
 *
 * - `viewportFit: "cover"` deixa a página ir até a borda física da tela. Sem
 *   ele, `env(safe-area-inset-*)` **resolve para zero** — e a barra de abas
 *   inferior do dashboard depende desse inset para não ficar embaixo da barra
 *   de gestos do iPhone.
 * - `themeColor` pinta a barra do navegador com o fundo do tema. São os mesmos
 *   valores de `--background` em `app/globals.css`, um por esquema, para a
 *   emenda não aparecer quando o dono troca de tema.
 * - `colorScheme` informa o UA antes do primeiro paint, para que campo nativo,
 *   barra de rolagem e o `<select>` do editor de horários nasçam no tema certo.
 *
 * `maximum-scale` / `user-scalable=no` estão fora por decisão, não por
 * esquecimento: impedir zoom reprova a WCAG 1.4.4. O zoom de campo no iOS é
 * resolvido com fonte de 16px, não tirando o zoom de quem enxerga mal.
 */
export const viewport: Viewport = {
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FDFBF7" },
    { media: "(prefers-color-scheme: dark)", color: "#141917" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      // O `next-themes` põe a classe do tema no <html> antes da hidratação; sem
      // isto o React reclama de divergência entre servidor e cliente.
      suppressHydrationWarning
      className={`${fonteDisplay.variable} ${fonteCorpo.variable} ${fonteMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ProvedorTema>
          {children}
          <Toaster />
        </ProvedorTema>
      </body>
    </html>
  );
}
