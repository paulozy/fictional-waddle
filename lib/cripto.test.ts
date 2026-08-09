import { describe, expect, it } from "vitest";

import { ErroCripto, cifrar, decifrar, gerarChave } from "@/lib/cripto";

/** Chave fixa, para os casos que não dependem de sorteio. */
const CHAVE = "0".repeat(64);
const OUTRA_CHAVE = "f".repeat(64);

describe("cifrar/decifrar", () => {
  it("faz ida e volta", () => {
    const segredo = "APP_USR-1234567890-abcdef";
    expect(decifrar(cifrar(segredo, CHAVE), CHAVE)).toBe(segredo);
  });

  it("preserva acento e unicode", () => {
    const texto = "refresh—token ção 🔐";
    expect(decifrar(cifrar(texto, CHAVE), CHAVE)).toBe(texto);
  });

  it("produz saída diferente a cada chamada, com o mesmo claro e a mesma chave", () => {
    // IV sorteado por chamada. Reusar IV em GCM permite recuperar o XOR dos
    // claros e forjar a autenticação — é a falha catastrófica do modo.
    expect(cifrar("igual", CHAVE)).not.toBe(cifrar("igual", CHAVE));
  });

  it("recusa decifrar com a chave errada", () => {
    expect(() => decifrar(cifrar("segredo", CHAVE), OUTRA_CHAVE)).toThrow(
      ErroCripto,
    );
  });

  it("recusa conteúdo adulterado", () => {
    // O ponto de usar GCM em vez de CBC: adulteração LANÇA, em vez de devolver
    // bytes diferentes que a aplicação usaria achando que são o token.
    const cifrado = cifrar("APP_USR-token-real", CHAVE);
    const partes = cifrado.split(".");
    const dados = Buffer.from(partes[3], "base64url");
    dados[0] ^= 0xff;
    partes[3] = dados.toString("base64url");

    expect(() => decifrar(partes.join("."), CHAVE)).toThrow(ErroCripto);
  });

  it("recusa tag de autenticação trocada", () => {
    const cifrado = cifrar("token", CHAVE);
    const partes = cifrado.split(".");
    partes[2] = Buffer.from("0".repeat(32), "hex").toString("base64url");

    expect(() => decifrar(partes.join("."), CHAVE)).toThrow(ErroCripto);
  });

  it("recusa formato desconhecido", () => {
    expect(() => decifrar("v2.a.b.c", CHAVE)).toThrow(/formato/i);
    expect(() => decifrar("só-texto", CHAVE)).toThrow(/formato/i);
  });

  describe("validação da chave", () => {
    it("recusa chave curta", () => {
      // Falha silenciosa clássica: 16 bytes passados como se fossem 32
      // reduziriam a força sem ninguém notar.
      expect(() => cifrar("x", "0".repeat(32))).toThrow(/32 bytes/);
    });

    it("recusa chave que não é hexadecimal", () => {
      expect(() => cifrar("x", "z".repeat(64))).toThrow(/hexadecimal/i);
    });
  });

  describe("gerarChave", () => {
    it("gera chave utilizável de 64 caracteres hex", () => {
      const chave = gerarChave();
      expect(chave).toMatch(/^[0-9a-f]{64}$/);
      expect(decifrar(cifrar("ok", chave), chave)).toBe("ok");
    });

    it("não repete", () => {
      expect(gerarChave()).not.toBe(gerarChave());
    });
  });
});
