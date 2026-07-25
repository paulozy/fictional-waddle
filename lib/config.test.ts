import { afterEach, describe, expect, it } from "vitest";
import { envObrigatoria } from "./config";

const NOME = "AGENDAZAP_VAR_DE_TESTE";

afterEach(() => {
  delete process.env[NOME];
});

describe("envObrigatoria", () => {
  it("devolve o valor quando a variável está definida", () => {
    process.env[NOME] = "valor";
    expect(envObrigatoria(NOME)).toBe("valor");
  });

  it("lança nomeando a variável quando está ausente", () => {
    expect(() => envObrigatoria(NOME)).toThrowError(
      `Variável de ambiente obrigatória ausente: ${NOME}`,
    );
  });

  it("trata string vazia como ausente", () => {
    process.env[NOME] = "";
    expect(() => envObrigatoria(NOME)).toThrowError(/ausente/);
  });
});
