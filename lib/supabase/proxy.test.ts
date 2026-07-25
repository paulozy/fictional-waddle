import { describe, expect, it } from "vitest";
import { ROTAS_PROTEGIDAS, exigeSessao } from "./proxy";

describe("exigeSessao", () => {
  it.each(ROTAS_PROTEGIDAS)("protege %s", (rota) => {
    expect(exigeSessao(rota)).toBe(true);
  });

  it("protege subrotas das rotas protegidas", () => {
    expect(exigeSessao("/servicos/novo")).toBe(true);
    expect(exigeSessao("/agendamentos/2026-07-25")).toBe(true);
  });

  it("libera rotas públicas", () => {
    expect(exigeSessao("/")).toBe(false);
    expect(exigeSessao("/login")).toBe(false);
  });

  it("não protege por prefixo parcial de nome", () => {
    // `/servicos-publicos` não é subrota de `/servicos`
    expect(exigeSessao("/servicos-publicos")).toBe(false);
  });
});
