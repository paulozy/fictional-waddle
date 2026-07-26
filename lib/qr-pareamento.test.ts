import { describe, expect, it } from "vitest";
import {
  SEGUNDOS_RETENTATIVA,
  SEGUNDOS_VALIDADE_QR,
  classificarLeituraQr,
} from "./qr-pareamento";

describe("classificarLeituraQr", () => {
  it("trata contagem diferente como código novo", () => {
    expect(classificarLeituraQr(3, 4)).toEqual({ tipo: "novo" });
  });

  it("trata contagem igual como o mesmo código em cache", () => {
    // `GET /instance/connect` numa instância em `connecting` devolve o QR em
    // cache sem regerar. Reiniciar a contagem aqui é o que fazia a tela exibir
    // código morto dizendo que ainda valia.
    expect(classificarLeituraQr(4, 4)).toEqual({ tipo: "repetido" });
  });

  it("aceita a primeira leitura, sem linha de base para comparar", () => {
    expect(classificarLeituraQr(null, 0)).toEqual({ tipo: "novo" });
    expect(classificarLeituraQr(null, 7)).toEqual({ tipo: "novo" });
  });

  it("aceita o código quando o servidor não informa contagem", () => {
    // Fail-open deliberado: sem `count` não dá para detectar cache, e recusar
    // prenderia a tela num laço de retentativa sem nunca mostrar QR novo.
    expect(classificarLeituraQr(4, null)).toEqual({ tipo: "novo" });
    expect(classificarLeituraQr(null, null)).toEqual({ tipo: "novo" });
  });

  it("trata contagem que retrocede como código novo", () => {
    // Servidor reiniciado ou instância recriada: o que está na tela é velho.
    expect(classificarLeituraQr(9, 1)).toEqual({ tipo: "novo" });
    expect(classificarLeituraQr(9, 0)).toEqual({ tipo: "novo" });
  });

  it("não confunde zero com ausência de contagem", () => {
    // `count: 0` é "ainda não regerou", um valor legítimo. Tratado como nulo,
    // toda primeira leitura pareceria sem contagem.
    expect(classificarLeituraQr(0, 0)).toEqual({ tipo: "repetido" });
  });
});

describe("constantes de ritmo", () => {
  it("usa o qrTimeout real do Baileys, não um chute menor", () => {
    // Era 40, "pecando por baixo". Peca por baixo com fase errada só antecipa
    // a busca que volta em cache — quem corrige a fase é a contagem.
    expect(SEGUNDOS_VALIDADE_QR).toBe(45);
  });

  it("insiste em intervalo bem menor que a validade", () => {
    // A retentativa é a granularidade do erro de fase: se chegasse perto da
    // validade, o ganho sobre o comportamento antigo desapareceria.
    expect(SEGUNDOS_RETENTATIVA).toBeLessThan(SEGUNDOS_VALIDADE_QR / 10);
  });
});
