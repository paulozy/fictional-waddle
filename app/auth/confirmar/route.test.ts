import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * O que este arquivo protege: o destino depois de um link de e-mail.
 *
 * Dois defeitos possíveis aqui são silenciosos e caros. O primeiro é a
 * recuperação de senha cair no passo 2 do cadastro — o dono clica em "esqueci a
 * senha", confirma o link e recebe um formulário pedindo o nome do
 * estabelecimento, sem nunca chegar à tela de senha nova. O segundo é redirect
 * aberto: se o destino viesse da query, um link para `/auth/confirmar` poderia
 * pousar um dono recém-logado em site de terceiro.
 */

const verifyOtp = vi.fn();
const exchangeCodeForSession = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  criarClienteServidor: () =>
    Promise.resolve({ auth: { verifyOtp, exchangeCodeForSession } }),
}));

const { GET, destinoDoLink } = await import("./route");

const BASE = "https://encaixaria.com.br/auth/confirmar";

beforeEach(() => {
  vi.clearAllMocks();
  verifyOtp.mockResolvedValue({ error: null });
  exchangeCodeForSession.mockResolvedValue({ error: null });
});

async function chamar(query: string) {
  const resposta = await GET(new NextRequest(`${BASE}?${query}`));
  return new URL(resposta.headers.get("location") ?? "");
}

describe("formato token_hash (templates personalizados)", () => {
  it("recuperação vai para a tela de senha nova", async () => {
    const destino = await chamar("token_hash=abc&type=recovery");

    expect(verifyOtp).toHaveBeenCalledWith({
      type: "recovery",
      token_hash: "abc",
    });
    expect(destino.pathname).toBe("/redefinir-senha");
  });

  it("confirmação de cadastro vai para o passo 2", async () => {
    const destino = await chamar("token_hash=abc&type=signup");
    expect(destino.pathname).toBe("/registro/estabelecimento");
  });

  /** Tipo fora da lista nossa não deve nem chegar ao Supabase. */
  it("ignora um `type` que não emitimos", async () => {
    const destino = await chamar("token_hash=abc&type=phone_change");

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(destino.pathname).toBe("/login");
    expect(destino.searchParams.get("erro")).toBe("link_invalido");
  });
});

describe("formato code (templates padrão do Supabase)", () => {
  it("usa o `fluxo` que nós mesmos escrevemos para achar o destino", async () => {
    const destino = await chamar("code=xyz&fluxo=recuperacao");

    expect(exchangeCodeForSession).toHaveBeenCalledWith("xyz");
    expect(destino.pathname).toBe("/redefinir-senha");
  });

  it("cadastro por código cai no passo 2", async () => {
    const destino = await chamar("code=xyz&fluxo=cadastro");
    expect(destino.pathname).toBe("/registro/estabelecimento");
  });

  it("sem `fluxo` nenhum, leva ao painel em vez de adivinhar", async () => {
    const destino = await chamar("code=xyz");
    expect(destino.pathname).toBe("/agendamentos");
  });
});

describe("link que não vale", () => {
  it("token recusado manda para o login com recado", async () => {
    verifyOtp.mockResolvedValue({ error: { code: "otp_expired" } });

    const destino = await chamar("token_hash=abc&type=recovery");

    expect(destino.pathname).toBe("/login");
    expect(destino.searchParams.get("erro")).toBe("link_invalido");
  });

  it("código recusado idem", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { code: "bad_code" } });

    const destino = await chamar("code=xyz&fluxo=cadastro");
    expect(destino.pathname).toBe("/login");
  });

  it("link sem token e sem código não cria sessão nenhuma", async () => {
    const destino = await chamar("fluxo=cadastro");

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(destino.pathname).toBe("/login");
  });
});

describe("o destino nunca vem da query", () => {
  it("um `next` externo é ignorado, não seguido", async () => {
    const destino = await chamar(
      "token_hash=abc&type=recovery&next=https://exemplo-malicioso.test/painel",
    );

    expect(destino.host).toBe("encaixaria.com.br");
    expect(destino.pathname).toBe("/redefinir-senha");
    expect(destino.search).toBe("");
  });

  it("um `next` interno também é ignorado", async () => {
    const destino = await chamar("code=xyz&fluxo=cadastro&next=/servicos");
    expect(destino.pathname).toBe("/registro/estabelecimento");
  });

  /**
   * A função de destino é pura, e é a única fonte da decisão. Só três saídas
   * existem; qualquer quarta significaria caminho novo, e é aqui que apareceria.
   */
  it("só devolve caminho nosso, para qualquer entrada", () => {
    const saidas = new Set(
      [
        ["recovery", null],
        ["signup", null],
        ["email", null],
        ["invite", null],
        [null, "recuperacao"],
        [null, "cadastro"],
        [null, "https://exemplo-malicioso.test"],
        ["//exemplo-malicioso.test", null],
        [null, null],
      ].map(([tipo, fluxo]) => destinoDoLink(tipo, fluxo)),
    );

    expect([...saidas].every((caminho) => caminho.startsWith("/"))).toBe(true);
    expect(saidas).toEqual(
      new Set(["/redefinir-senha", "/registro/estabelecimento", "/agendamentos"]),
    );
  });
});
