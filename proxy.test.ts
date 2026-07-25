import { beforeEach, describe, expect, it, vi } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

const getClaims = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getClaims } }),
}));

const { config, proxy } = await import("./proxy");
const { NextRequest } = await import("next/server");

function requisicao(pathname: string) {
  return new NextRequest(new URL(`https://agendazap.test${pathname}`));
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
        url: `https://agendazap.test${url}`,
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
  ])("NÃO executa em %s", (url) => {
    expect(
      unstable_doesMiddlewareMatch({
        config,
        url: `https://agendazap.test${url}`,
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
