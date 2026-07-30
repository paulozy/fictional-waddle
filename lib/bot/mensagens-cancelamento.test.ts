import { describe, expect, it } from "vitest";
import { montarTextoCancelamentoPeloDono } from "./mensagens-cancelamento";

const FUSO = "America/Sao_Paulo";

function agendamento(sobrescritas: Partial<{
  data_hora: string;
  servicos: { nome: string } | null;
  clientes_finais: { nome: string | null } | null;
}> = {}) {
  return {
    // 13:00Z é 10:00 em São Paulo.
    data_hora: "2026-08-14T13:00:00.000Z",
    servicos: { nome: "Corte de cabelo" },
    clientes_finais: { nome: "Joana" },
    ...sobrescritas,
  };
}

describe("montarTextoCancelamentoPeloDono", () => {
  it("usa a hora de parede do estabelecimento, não a do processo", () => {
    const texto = montarTextoCancelamentoPeloDono(agendamento(), FUSO, "Salão Lia");

    // O runtime da Vercel roda em UTC: sem o fuso do perfil, sairia 13:00.
    expect(texto).toContain("10:00");
    expect(texto).not.toContain("13:00");
  });

  it("nomeia o cliente, o serviço e o estabelecimento", () => {
    const texto = montarTextoCancelamentoPeloDono(agendamento(), FUSO, "Salão Lia");

    expect(texto).toContain("Joana");
    expect(texto).toContain("Corte de cabelo");
    expect(texto).toContain("Salão Lia");
  });

  it("convida a remarcar, para o cancelamento não ser um beco", () => {
    const texto = montarTextoCancelamentoPeloDono(agendamento(), FUSO, null);

    expect(texto).toMatch(/horários livres/i);
  });

  /**
   * Regra, não detalhe: o motivo é vocabulário interno e a observação é nota livre
   * do dono. Mandar qualquer um dos dois abriria um canal de saída para o que ele
   * digitou. A função nem recebe esses campos — este teste trava a assinatura.
   */
  it("não recebe motivo nem observação", () => {
    expect(montarTextoCancelamentoPeloDono.length).toBe(3);
  });

  it("funciona sem nome de cliente", () => {
    const texto = montarTextoCancelamentoPeloDono(
      agendamento({ clientes_finais: { nome: null } }),
      FUSO,
      "Salão Lia",
    );

    expect(texto.startsWith("Oi!")).toBe(true);
  });

  it("funciona sem serviço e sem nome de estabelecimento", () => {
    const texto = montarTextoCancelamentoPeloDono(
      agendamento({ servicos: null }),
      FUSO,
      null,
    );

    expect(texto).toContain("Precisei cancelar");
    expect(texto).not.toContain("undefined");
    expect(texto).not.toContain("null");
  });
});
