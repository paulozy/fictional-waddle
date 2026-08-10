import { beforeEach, describe, expect, it, vi } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

const getClaims = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getClaims } }),
}));

const { config, proxy } = await import("./proxy");
const { NextRequest } = await import("next/server");

function requisicao(pathname: string) {
  return new NextRequest(new URL(`https://encaixaria.test${pathname}`));
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://projeto.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-de-teste";
  getClaims.mockReset();
});

describe("matcher do proxy", () => {
  it.each([
    "/",
    "/login",
    "/servicos",
    "/agendamentos",
    "/api/outra-coisa",
  ])("executa em %s", (url) => {
    expect(
      unstable_doesMiddlewareMatch({
        config,
        url: `https://encaixaria.test${url}`,
      }),
    ).toBe(true);
  });

  it.each([
    // Chegam sem sessão de usuário: refresh de token aqui seria inútil.
    "/api/webhook/whatsapp/11111111-1111-1111-1111-111111111111",
    "/api/cron/enviar-lembretes",
    "/_next/static/chunk.js",
    "/favicon.ico",
    "/next.svg",
    // Rotas de metadata, geradas em build. O caso que importa é o pedido COM
    // cookie: rotacionar o refresh token (uso único) num subrecurso em paralelo
    // com a navegação é a receita de logout aleatório.
    "/robots.txt",
    "/sitemap.xml",
    "/opengraph-image",
    "/icon/32",
    "/icon/512",
    "/apple-icon",
    "/icone-mascara",
    "/manifest.webmanifest",
  ])("NÃO executa em %s", (url) => {
    expect(
      unstable_doesMiddlewareMatch({
        config,
        url: `https://encaixaria.test${url}`,
      }),
    ).toBe(false);
  });
});

describe("proxy", () => {
  it("redireciona visitante anônimo de rota protegida para /login", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });

    const resposta = await proxy(requisicao("/servicos"));

    expect(resposta.status).toBe(307);
    expect(new URL(resposta.headers.get("location")!).pathname).toBe("/login");
  });

  it("deixa passar visitante anônimo em rota pública", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });

    const resposta = await proxy(requisicao("/"));

    expect(resposta.headers.get("location")).toBeNull();
  });

  it("redireciona usuário logado que abre /login para o dashboard", async () => {
    getClaims.mockResolvedValue({
      data: { claims: { sub: "11111111-1111-1111-1111-111111111111" } },
      error: null,
    });

    const resposta = await proxy(requisicao("/login"));

    expect(new URL(resposta.headers.get("location")!).pathname).toBe(
      "/agendamentos",
    );
  });

  it("deixa passar usuário logado em rota protegida", async () => {
    getClaims.mockResolvedValue({
      data: { claims: { sub: "11111111-1111-1111-1111-111111111111" } },
      error: null,
    });

    const resposta = await proxy(requisicao("/agendamentos"));

    expect(resposta.headers.get("location")).toBeNull();
  });

  /**
   * O Site URL do projeto Supabase é o destino padrão quando o `redirectTo` não
   * vale, e foi o que aconteceu em produção: o dono confirmava o e-mail e caía em
   * `/?code=…`, na landing, com o cadastro pela metade. A allowlist de Redirect
   * URLs é o conserto de verdade, mas um link já enviado não se corrige.
   */
  describe("resgate de link de e-mail que caiu na raiz", () => {
    it("encaminha `?code=` para /auth/confirmar preservando a query", async () => {
      getClaims.mockResolvedValue({ data: null, error: null });

      const resposta = await proxy(requisicao("/?code=abc-123"));
      const destino = new URL(resposta.headers.get("location")!);

      expect(destino.pathname).toBe("/auth/confirmar");
      expect(destino.searchParams.get("code")).toBe("abc-123");
    });

    it("encaminha `token_hash` + `type` do mesmo jeito", async () => {
      getClaims.mockResolvedValue({ data: null, error: null });

      const resposta = await proxy(requisicao("/?token_hash=abc&type=recovery"));
      const destino = new URL(resposta.headers.get("location")!);

      expect(destino.pathname).toBe("/auth/confirmar");
      expect(destino.searchParams.get("type")).toBe("recovery");
    });

    it("`token_hash` sem `type` não é resgate: não há o que verificar", async () => {
      getClaims.mockResolvedValue({ data: null, error: null });

      const resposta = await proxy(requisicao("/?token_hash=abc"));

      expect(resposta.headers.get("location")).toBeNull();
    });

    /**
     * `?code=` é parâmetro de OAuth em geral — um callback de gateway de pagamento
     * usa o mesmo nome. Capturar fora da raiz sequestraria aquele fluxo, e a raiz
     * é o único destino que o fallback do Supabase usa.
     */
    it("não captura `?code=` fora da raiz", async () => {
      getClaims.mockResolvedValue({ data: null, error: null });

      const resposta = await proxy(
        requisicao("/api/pagamentos/callback?code=abc-123"),
      );

      expect(resposta.headers.get("location")).toBeNull();
    });

    it("a raiz sem credencial nenhuma continua sendo a landing", async () => {
      getClaims.mockResolvedValue({ data: null, error: null });

      const resposta = await proxy(requisicao("/?utm_source=instagram"));

      expect(resposta.headers.get("location")).toBeNull();
    });

    /**
     * O link é clicado no e-mail, então costuma chegar numa aba onde o dono já
     * está logado (o `signUp` deixa sessão quando a confirmação está desligada, e
     * um link antigo é clicado depois). O resgate tem de vir **antes** do redirect
     * de "já tem sessão", senão o `code` é descartado e o cadastro não avança.
     */
    it("resgata mesmo com sessão ativa", async () => {
      getClaims.mockResolvedValue({
        data: { claims: { sub: "11111111-1111-1111-1111-111111111111" } },
        error: null,
      });

      const resposta = await proxy(requisicao("/?code=abc-123"));
      const destino = new URL(resposta.headers.get("location")!);

      expect(destino.pathname).toBe("/auth/confirmar");
      expect(destino.searchParams.get("code")).toBe("abc-123");
    });
  });

  it("trata erro de getClaims como ausência de sessão", async () => {
    // Um JWT inválido não pode virar acesso liberado.
    getClaims.mockResolvedValue({
      data: { claims: { sub: "invasor" } },
      error: new Error("jwt malformado"),
    });

    const resposta = await proxy(requisicao("/servicos"));

    expect(new URL(resposta.headers.get("location")!).pathname).toBe("/login");
  });
});
