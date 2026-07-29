import { afterEach, describe, expect, it } from "vitest";
import { metadataPagina, urlAbsoluta, urlSite } from "./site";

/**
 * O que se testa aqui é o que quebra em silêncio.
 *
 * Um canonical apontando para o domínio errado, ou uma página que herda o
 * canonical da home, não levanta erro nenhum: o build passa, a página abre, e o
 * Google só conta a história semanas depois.
 */

const VARS = ["SITE_URL", "VERCEL_PROJECT_PRODUCTION_URL"] as const;

afterEach(() => {
  for (const nome of VARS) delete process.env[nome];
});

describe("urlSite", () => {
  it("prefere SITE_URL", () => {
    process.env.SITE_URL = "https://encaixaria.com.br";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "encaixaria.vercel.app";

    expect(urlSite().origin).toBe("https://encaixaria.com.br");
  });

  it("cai no alias estável da Vercel, com https", () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "encaixaria.vercel.app";

    expect(urlSite().origin).toBe("https://encaixaria.vercel.app");
  });

  it("cai em localhost no desenvolvimento", () => {
    expect(urlSite().origin).toBe("http://localhost:3000");
  });

  /**
   * Sem isto, um `SITE_URL` ausente em produção viraria exceção em tempo de
   * módulo de `app/layout.tsx` e derrubaria o build inteiro — o motivo de este
   * helper não usar `envObrigatoria`.
   */
  it("nunca lança por variável ausente", () => {
    expect(() => urlSite()).not.toThrow();
  });
});

describe("urlAbsoluta", () => {
  it("absolutiza contra o domínio do site", () => {
    process.env.SITE_URL = "https://encaixaria.com.br";

    expect(urlAbsoluta("/sitemap.xml")).toBe(
      "https://encaixaria.com.br/sitemap.xml",
    );
  });
});

describe("metadataPagina", () => {
  it("usa o título padrão do site quando não recebe título", () => {
    const meta = metadataPagina({ caminho: "/" });

    expect(meta.title).toEqual({
      absolute: "Encaixaria — agendamento pelo WhatsApp",
    });
  });

  /**
   * `absolute` é obrigatório: o `title.template` do layout raiz já acrescenta
   * "— Encaixaria", e sem `absolute` a aba diria "Preços — Encaixaria —
   * Encaixaria".
   */
  it("monta o título com o sufixo uma única vez", () => {
    const meta = metadataPagina({ titulo: "Preços", caminho: "/precos" });

    expect(meta.title).toEqual({ absolute: "Preços — Encaixaria" });
  });

  it("declara o canonical da própria página, não o da home", () => {
    const meta = metadataPagina({ titulo: "Preços", caminho: "/precos" });

    expect(meta.alternates?.canonical).toBe("/precos");
  });

  /**
   * A mesclagem de metadata no App Router é superficial: uma página que
   * declarasse só `openGraph.url` apagaria `siteName` e `locale` do layout. O
   * helper existe para que o objeto saia sempre completo.
   */
  it("entrega o openGraph completo, não parcial", () => {
    const meta = metadataPagina({ titulo: "Preços", caminho: "/precos" });

    expect(meta.openGraph).toMatchObject({
      type: "website",
      locale: "pt_BR",
      siteName: "Encaixaria",
      url: "/precos",
      title: "Preços — Encaixaria",
    });
  });

  /**
   * Medido no HTML do build: o Next injeta o `og:image` do arquivo
   * `opengraph-image` **só** nas páginas que não declaram `openGraph`. Como toda
   * página pública passa por aqui, sem estas duas linhas nenhuma delas teria
   * prévia de link — e a prévia é o que aparece quando o dono cola a URL no
   * WhatsApp, que é o canal de distribuição deste produto.
   */
  it("declara a imagem social, que o convention não injeta mais", () => {
    const meta = metadataPagina({ caminho: "/" });
    const esperada = { url: "/opengraph-image", width: 1200, height: 630 };

    expect(meta.openGraph?.images).toMatchObject([esperada]);
    // O tipo de `twitter` é união e não expõe as chaves sem narrowing; o que
    // este teste protege é o valor emitido, não o tipo.
    expect(meta.twitter).toMatchObject({
      // Declarar `twitter` substitui o objeto do layout raiz: sem `card` aqui, a
      // prévia volta a ser o cartão pequeno.
      card: "summary_large_image",
      images: [esperada],
    });
  });
});
