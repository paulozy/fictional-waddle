import type { Metadata, Viewport } from "next";
import {
  Bricolage_Grotesque,
  Geist_Mono,
  Instrument_Sans,
} from "next/font/google";
import { ProvedorTema } from "@/components/provedor-tema";
import { Toaster } from "@/components/ui/sonner";
import {
  DESCRICAO_PADRAO,
  NOME_SITE,
  TITULO_PADRAO,
  urlSite,
} from "@/lib/site";
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

/**
 * Metadata raiz — o que vale para todo o site.
 *
 * `metadataBase` é pré-requisito e não enfeite: sem ele, todo campo de URL
 * relativa (`canonical`, `openGraph.url`, imagens) vira erro de build, e o Next
 * não emite `<link rel="canonical">` nenhum. Antes disto o HTML gerado saía com
 * zero canonical e zero tag `og:`.
 *
 * `title.template` acrescenta "— Encaixaria" ao título de cada página, no lugar
 * do sufixo que estava escrito à mão em seis arquivos. Páginas que montam o
 * título pelo helper de `lib/site.ts` usam `title.absolute` e escapam do
 * template de propósito, para o sufixo não entrar duas vezes.
 *
 * **`alternates.canonical` não mora aqui**, e a ausência é deliberada: um
 * `canonical: "/"` neste objeto seria herdado por toda página que não declarasse
 * o seu, e `/precos` passaria a se anunciar como cópia da home. Cada página
 * declara o próprio, via `metadataPagina`.
 *
 * O `openGraph` daqui é rede de segurança para páginas que não usam o helper
 * (dashboard e login, ambas `noindex`). A landing sobrescreve com o dela — e
 * sobrescreve o objeto **inteiro**, porque a mesclagem de metadata é superficial.
 */
export const metadata: Metadata = {
  metadataBase: urlSite(),
  title: {
    default: TITULO_PADRAO,
    template: `%s — ${NOME_SITE}`,
  },
  description: DESCRICAO_PADRAO,
  applicationName: NOME_SITE,
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: NOME_SITE,
    title: TITULO_PADRAO,
    description: DESCRICAO_PADRAO,
  },
  twitter: { card: "summary_large_image" },
  /**
   * Meta tag de verificação do Search Console. Sem a var, o Next simplesmente
   * não emite a tag — não há valor de placeholder que faça sentido, e verificar
   * a propriedade é ação humana (é assim que se descobre se o site indexou).
   */
  verification: { google: process.env.GOOGLE_SITE_VERIFICATION },
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
