import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROBOTS_PRIVADO, identificacaoPendente, metadataPagina } from "@/lib/site";
import robots from "./robots";
import sitemap from "./sitemap";

/**
 * Duas rotas que ninguém abre no navegador e que, quando erram, erram calado.
 *
 * O caso que estes testes existem para impedir é o `Disallow` no dashboard: é a
 * "correção" mais intuitiva do mundo, aparece em todo tutorial, e cancela o
 * `noindex` — o Google precisa poder buscar a página para ler a diretiva.
 */

/**
 * As telas de autenticação, cada uma com o módulo que declara a metadata dela.
 *
 * Sete formulários que não têm nada a oferecer a quem chega da busca, e que
 * concorreriam com a landing pelas mesmas consultas de marca. Todas precisam de
 * `noindex` **e** de ausência no `robots.txt`: com só metade, a página fica
 * indexável e nada falha.
 */
const ROTAS_DE_AUTENTICACAO = [
  "/login",
  "/registro",
  "/registro/confirmar-email",
  "/registro/estabelecimento",
  "/registro/whatsapp",
  "/recuperar-senha",
  "/redefinir-senha",
] as const;

const MODULOS_DE_AUTENTICACAO = [
  ["/login", () => import("./(auth)/login/page")],
  ["/registro", () => import("./(auth)/registro/page")],
  [
    "/registro/confirmar-email",
    () => import("./(auth)/registro/confirmar-email/page"),
  ],
  [
    "/registro/estabelecimento",
    () => import("./(auth)/registro/estabelecimento/page"),
  ],
  ["/registro/whatsapp", () => import("./(auth)/registro/whatsapp/page")],
  ["/recuperar-senha", () => import("./(auth)/recuperar-senha/page")],
  ["/redefinir-senha", () => import("./(auth)/redefinir-senha/page")],
] as const;

beforeEach(() => {
  process.env.SITE_URL = "https://encaixaria.com.br";
});

afterEach(() => {
  delete process.env.SITE_URL;
});

describe("robots.txt", () => {
  it("libera o site e aponta o sitemap no domínio configurado", () => {
    const resultado = robots();

    expect(resultado.rules).toMatchObject({ userAgent: "*", allow: "/" });
    expect(resultado.sitemap).toBe("https://encaixaria.com.br/sitemap.xml");
  });

  it("não bloqueia as rotas que dependem de noindex", () => {
    const regras = robots().rules;
    const disallow = Array.isArray(regras) ? [] : [regras.disallow].flat();

    for (const rota of [
      "/login",
      "/agendamentos",
      "/servicos",
      "/horarios",
      ...ROTAS_DE_AUTENTICACAO,
    ]) {
      expect(disallow).not.toContain(rota);
    }
  });

  it("bloqueia /api/, que não tem nada para indexar", () => {
    const regras = robots().rules;
    const disallow = Array.isArray(regras) ? [] : [regras.disallow].flat();

    expect(disallow).toContain("/api/");
  });
});

/**
 * O `robots.txt` era testado só pela negativa — "não bloqueia o dashboard". Isso
 * deixava passar o caso pior: `noindex` que não é emitido. A dupla é
 * `Disallow` ausente **e** `noindex` presente; com só metade, a página fica
 * indexável e nada falha.
 */
describe("noindex das páginas privadas", () => {
  it("é uma diretiva que o Next reconhece", () => {
    expect(ROBOTS_PRIVADO).toEqual({ index: false, follow: false });
  });

  it("as páginas de rascunho não são indexáveis", () => {
    const meta = metadataPagina({
      caminho: "/alternativa-ao-booksy",
      naoIndexar: true,
    });

    expect(meta.robots).toEqual(ROBOTS_PRIVADO);
  });

  it("página pública normal não ganha noindex por acidente", () => {
    expect(metadataPagina({ caminho: "/precos" }).robots).toBeUndefined();
  });

  /**
   * Asserção sobre a metadata **exportada por cada página**, não sobre a
   * constante: o defeito que isto pega é o typo que compila e não emite tag
   * nenhuma (`robot`, `noindex: true`), que é por que aqueles arquivos anotam
   * `metadata: Metadata`.
   */
  it.each(MODULOS_DE_AUTENTICACAO)(
    "%s se declara noindex",
    async (_rota, importar) => {
      const modulo = await importar();
      expect(modulo.metadata.robots).toEqual(ROBOTS_PRIVADO);
    },
  );
});

describe("sitemap.xml", () => {
  it("lista as páginas públicas com URL absoluta", () => {
    const urls = sitemap().map((entrada) => entrada.url);

    expect(urls).toContain("https://encaixaria.com.br/");
    expect(urls).toContain("https://encaixaria.com.br/precos");
    expect(urls).toContain("https://encaixaria.com.br/como-funciona");
  });

  /**
   * Asserção **absoluta**, não derivada de `identificacaoPendente()`.
   *
   * A primeira versão deste teste era `toHaveLength(identificacaoPendente() ? 0
   * : 3)` — e um teste cuja expectativa vem da função que ele exercita não pode
   * falhar: passava com 0 e com 3. Se a identificação regredisse para marcador,
   * as três páginas sairiam do sitemap e ficariam `noindex` sem que nenhum teste
   * reprovasse.
   */
  it("anuncia as páginas com identificação, que hoje é real", () => {
    const urls = sitemap().map((entrada) => entrada.url);
    const comIdentificacao = urls.filter((url) =>
      /\/(sobre|privacidade|termos)$/.test(url),
    );

    expect(identificacaoPendente()).toBe(false);
    expect(comIdentificacao).toHaveLength(3);
  });

  /** O caminho pendente, com marcador injetado — o inverso do teste acima. */
  it("omite essas páginas se a identificação voltar a ser marcador", async () => {
    vi.resetModules();
    vi.doMock("@/lib/site", async () => {
      const real = await vi.importActual<typeof import("@/lib/site")>(
        "@/lib/site",
      );
      return { ...real, identificacaoPendente: () => true };
    });

    const { default: comMarcador } = await import("./sitemap");
    const urls = comMarcador().map((entrada) => entrada.url);

    expect(urls.some((url) => /\/(sobre|privacidade|termos)$/.test(url))).toBe(
      false,
    );

    vi.doUnmock("@/lib/site");
    vi.resetModules();
  });

  /** Rascunho aguardando revisão humana: fora do sitemap e `noindex`. */
  it("nunca anuncia as páginas de comparação", () => {
    const urls = sitemap().map((entrada) => entrada.url);

    expect(urls.some((url) => url.includes("booksy"))).toBe(false);
    expect(urls.some((url) => url.includes("trinks"))).toBe(false);
  });

  it("não lista rota marcada com noindex", () => {
    const urls = sitemap().map((entrada) => entrada.url);

    for (const rota of [
      "/agendamentos",
      "/conexao-whatsapp",
      ...ROTAS_DE_AUTENTICACAO,
    ]) {
      expect(urls.some((url) => url.endsWith(rota))).toBe(false);
    }
  });
});
