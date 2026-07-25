import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { describe, expect, it } from "vitest";
import { nomeDoDia, rotuloCurtoDoDia } from "./datas";

/** 2026-08-09 é um domingo, então +i dias cobre a semana inteira. */
const DOMINGO = new Date(2026, 7, 9, 12);

function diaDaSemana(indice: number): Date {
  const data = new Date(DOMINGO);
  data.setDate(DOMINGO.getDate() + indice);
  return data;
}

describe("nomeDoDia", () => {
  it("nomeia os sete dias em português", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(nomeDoDia)).toEqual([
      "domingo",
      "segunda",
      "terça",
      "quarta",
      "quinta",
      "sexta",
      "sábado",
    ]);
  });

  it("devolve '?' para índice fora da faixa", () => {
    expect(nomeDoDia(9)).toBe("?");
    expect(nomeDoDia(-1)).toBe("?");
  });
});

describe("rotuloCurtoDoDia", () => {
  it("abrevia em três letras, com acento em sáb", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(rotuloCurtoDoDia)).toEqual([
      "dom",
      "seg",
      "ter",
      "qua",
      "qui",
      "sex",
      "sáb",
    ]);
  });

  it("devolve '?' para índice fora da faixa", () => {
    expect(rotuloCurtoDoDia(9)).toBe("?");
  });

  it("cabe em cabeçalho de sete colunas", () => {
    // O bug original era `format(data, "EEE")` sem locale, que imprimia `Mon`.
    // Passar `{ locale: ptBR }` corrigiria o idioma e criaria outro problema:
    // em pt-BR o `EEE` do date-fns é o nome inteiro.
    for (let i = 0; i < 7; i++) {
      expect(rotuloCurtoDoDia(i)).toHaveLength(3);
      expect(format(diaDaSemana(i), "EEE", { locale: ptBR }).length).toBeGreaterThan(3);
    }
  });
});

describe("acordo com o locale do date-fns", () => {
  it("bate com EEEEEE em todos os dias, menos sábado", () => {
    for (const indice of [0, 1, 2, 3, 4, 5]) {
      expect(rotuloCurtoDoDia(indice)).toBe(
        format(diaDaSemana(indice), "EEEEEE", { locale: ptBR }),
      );
    }
  });

  /**
   * Divergência deliberada, fixada para não ser "corrigida" sem querer: o
   * date-fns abrevia sábado sem acento, e a forma corrente em português tem.
   */
  it("diverge de propósito em sábado: date-fns diz 'sab', usamos 'sáb'", () => {
    expect(format(diaDaSemana(6), "EEEEEE", { locale: ptBR })).toBe("sab");
    expect(rotuloCurtoDoDia(6)).toBe("sáb");
  });
});
