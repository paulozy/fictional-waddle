import { describe, expect, it } from "vitest";
import { normalizarNumeroWhatsApp } from "./telefone";

function numero(entrada: string): string | null {
  const resultado = normalizarNumeroWhatsApp(entrada);
  return resultado.valido ? resultado.numero : null;
}

describe("normalizarNumeroWhatsApp", () => {
  it("acrescenta o DDI a número nacional com DDD", () => {
    expect(numero("11993235002")).toBe("5511993235002"); // celular, 11 dígitos
    expect(numero("1133334444")).toBe("551133334444"); // fixo, 10 dígitos
  });

  it("aceita a máscara que o dono digita", () => {
    for (const escrito of [
      "(11) 99323-5002",
      "11 99323 5002",
      "11.99323.5002",
      " 11-99323-5002 ",
    ]) {
      expect(numero(escrito), escrito).toBe("5511993235002");
    }
  });

  it("não duplica o DDI de quem já digitou completo", () => {
    expect(numero("5511993235002")).toBe("5511993235002");
    expect(numero("+55 11 99323-5002")).toBe("5511993235002");
  });

  it("descarta o zero de discagem internacional", () => {
    // `0055…` é como muita gente salva contato internacional na agenda.
    expect(numero("005511993235002")).toBe("5511993235002");
  });

  it("preserva número estrangeiro em vez de brasileirizar", () => {
    // Portugal: 351 + 9 dígitos = 12. Se a regra fosse "sempre prefixar 55",
    // isto viraria um brasileiro de 14 dígitos que não existe.
    expect(numero("351912345678")).toBe("351912345678");
  });

  it("recusa vazio com mensagem própria", () => {
    const resultado = normalizarNumeroWhatsApp("   ");
    expect(resultado).toEqual({
      valido: false,
      erro: "Digite o número do WhatsApp.",
    });
  });

  it("recusa número sem DDD", () => {
    // 9 dígitos: é o celular sem o DDD, erro comum de quem digita de cabeça.
    const resultado = normalizarNumeroWhatsApp("993235002");
    expect(resultado.valido).toBe(false);
    expect(resultado.valido === false && resultado.erro).toMatch(/DDD/);
  });

  it("recusa número longo demais", () => {
    // O E.164 termina em 15 dígitos; 16 é dedo escorregando.
    const resultado = normalizarNumeroWhatsApp("1234567890123456");
    expect(resultado.valido).toBe(false);
    expect(resultado.valido === false && resultado.erro).toMatch(/longo/);
  });

  it("devolve só dígitos, que é o que a Evolution aceita em ?number=", () => {
    const resultado = normalizarNumeroWhatsApp("+55 (11) 99323-5002");
    expect(resultado.valido && /^\d+$/.test(resultado.numero)).toBe(true);
  });
});
