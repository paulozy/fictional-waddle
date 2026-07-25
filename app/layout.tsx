import type { Metadata } from "next";
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
