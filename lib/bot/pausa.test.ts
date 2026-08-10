import { describe, expect, it } from "vitest";
import { PAUSA_MINUTOS, fimDaPausa, pausaAtiva } from "./pausa";

const AGORA = new Date("2026-08-10T15:00:00.000Z");

describe("pausaAtiva", () => {
  it("nulo é o caso comum e significa bot ativo", () => {
    expect(pausaAtiva(null, AGORA)).toBe(false);
    expect(pausaAtiva(undefined, AGORA)).toBe(false);
  });

  it("instante no futuro pausa", () => {
    expect(pausaAtiva("2026-08-10T15:30:00.000Z", AGORA)).toBe(true);
  });

  it("instante no passado libera", () => {
    expect(pausaAtiva("2026-08-10T14:59:59.000Z", AGORA)).toBe(false);
  });

  it("o próprio instante do fim já libera", () => {
    // Limite exclusivo: a janela vale ATÉ `pausado_ate`, não incluindo.
    expect(pausaAtiva(AGORA.toISOString(), AGORA)).toBe(false);
  });

  it("aceita Date, não só ISO", () => {
    expect(pausaAtiva(new Date("2026-08-10T15:30:00.000Z"), AGORA)).toBe(true);
  });

  /**
   * Estado corrompido não pode silenciar o bot para sempre. O modo de falha
   * aceitável é "respondeu quando não devia", nunca "parou de atender e ninguém
   * viu" — é o inverso do fail-safe de `lib/assinatura.ts`, e de propósito: lá o
   * risco é receita, aqui é o cliente do dono esperando resposta.
   */
  it("data inválida libera em vez de pausar", () => {
    expect(pausaAtiva("nem-data", AGORA)).toBe(false);
    expect(pausaAtiva("", AGORA)).toBe(false);
    expect(pausaAtiva(new Date("x"), AGORA)).toBe(false);
  });
});

describe("fimDaPausa", () => {
  it("soma a janela padrão ao instante recebido", () => {
    expect(fimDaPausa(AGORA)).toBe("2026-08-10T16:00:00.000Z");
    expect(PAUSA_MINUTOS).toBe(60);
  });

  it("renova em vez de somar: duas chamadas seguidas não empilham janela", () => {
    const primeira = fimDaPausa(AGORA);
    const doisMinutosDepois = new Date(AGORA.getTime() + 2 * 60_000);
    const segunda = fimDaPausa(doisMinutosDepois);

    // A segunda janela termina 2 min depois da primeira, não 60.
    expect(Date.parse(segunda) - Date.parse(primeira)).toBe(2 * 60_000);
  });

  it("o resultado é sempre lido como pausa ativa por pausaAtiva", () => {
    expect(pausaAtiva(fimDaPausa(AGORA), AGORA)).toBe(true);
  });
});
