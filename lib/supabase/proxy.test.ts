import { describe, expect, it } from "vitest";
import {
  ROTAS_PROTEGIDAS,
  ROTAS_SOMENTE_ANONIMAS,
  exigeSessao,
  somenteAnonimo,
} from "./proxy";

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

  /**
   * Os passos 2 e 3 do cadastro escrevem em `perfis` e criam instância na
   * Evolution: os dois exigem sessão. O passo 1 é justamente onde a conta ainda
   * não existe.
   */
  it("separa os passos do cadastro pela sessão que cada um precisa", () => {
    expect(exigeSessao("/registro")).toBe(false);
    expect(exigeSessao("/registro/confirmar-email")).toBe(false);
    expect(exigeSessao("/registro/estabelecimento")).toBe(true);
    expect(exigeSessao("/registro/whatsapp")).toBe(true);
  });

  /**
   * Pedir o link é anônimo — quem esqueceu a senha não consegue entrar. Trocar a
   * senha exige a sessão de recuperação que `/auth/confirmar` acabou de criar:
   * sem ela, `updateUser` não teria em quem gravar.
   */
  it("pede sessão para trocar a senha, e não para pedir o link", () => {
    expect(exigeSessao("/recuperar-senha")).toBe(false);
    expect(exigeSessao("/redefinir-senha")).toBe(true);
  });
});

describe("somenteAnonimo", () => {
  it.each(ROTAS_SOMENTE_ANONIMAS)("manda quem já tem sessão para fora de %s", (rota) => {
    expect(somenteAnonimo(rota)).toBe(true);
  });

  /**
   * A invariante que as duas listas precisam manter juntas: nenhuma rota pode
   * estar nas duas. Como o cadastro tem passos anônimos e passos com sessão sob o
   * mesmo prefixo, um `startsWith` aqui jogaria o passo 2 de volta ao painel
   * exatamente quando ele fosse aberto — e o cadastro nunca terminaria.
   */
  it("não sobrepõe as rotas protegidas", () => {
    for (const rota of ROTAS_SOMENTE_ANONIMAS) {
      expect(exigeSessao(rota)).toBe(false);
    }
    for (const rota of ROTAS_PROTEGIDAS) {
      expect(somenteAnonimo(rota)).toBe(false);
    }
  });

  it("compara caminho exato, não prefixo", () => {
    expect(somenteAnonimo("/registro/estabelecimento")).toBe(false);
    expect(somenteAnonimo("/registro/whatsapp")).toBe(false);
    expect(somenteAnonimo("/login/qualquer-coisa")).toBe(false);
  });

  it("não interfere no resto do site", () => {
    expect(somenteAnonimo("/")).toBe(false);
    expect(somenteAnonimo("/precos")).toBe(false);
    expect(somenteAnonimo("/auth/confirmar")).toBe(false);
  });
});
