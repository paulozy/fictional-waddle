import { describe, expect, it } from "vitest";

import {
  cobrancaSinalHabilitada,
  motivoSemCobranca,
  sinalEmCentavos,
  type PerfilCobranca,
} from "./capacidade";

const CONECTADO = "2026-08-01T10:00:00.000Z";

function perfil(over: Partial<PerfilCobranca> = {}): PerfilCobranca {
  return {
    plano: "sinal",
    pagamento_conectado_em: CONECTADO,
    politica_sinal: "Devolvo o sinal se você desmarcar com 24h de antecedência.",
    ...over,
  };
}

describe("motivoSemCobranca", () => {
  it("libera com plano 'sinal' e conta conectada", () => {
    expect(motivoSemCobranca(perfil())).toBeNull();
    expect(cobrancaSinalHabilitada(perfil())).toBe(true);
  });

  it("bloqueia por plano quando não é 'sinal'", () => {
    expect(motivoSemCobranca(perfil({ plano: "basico" }))).toBe("plano");
    expect(cobrancaSinalHabilitada(perfil({ plano: "basico" }))).toBe(false);
  });

  it("bloqueia por conta ausente quando o plano permite", () => {
    // Estado normal logo depois da contratação, não erro — mas cobrar aqui
    // prometeria um Pix que não temos como emitir.
    expect(motivoSemCobranca(perfil({ pagamento_conectado_em: null }))).toBe(
      "nao_conectado",
    );
  });

  it("o plano tem precedência sobre a conexão", () => {
    // Sem o plano, "conecte sua conta" seria conselho inútil.
    expect(
      motivoSemCobranca({
        plano: "basico",
        pagamento_conectado_em: null,
        politica_sinal: null,
      }),
    ).toBe("plano");
  });

  /*
    A terceira condição existe para o cliente FINAL, não para o dono: cobrar sem
    ter dito o que acontece com o dinheiro deixa quem pagou sem informação sobre o
    próprio dinheiro. Por isso é bloqueio duro, e não aviso no painel.
  */
  it.each([null, "", "   ", "\n"])(
    "bloqueia quando a política é %o, mesmo com plano e conta",
    (politica) => {
      expect(motivoSemCobranca(perfil({ politica_sinal: politica }))).toBe(
        "sem_politica",
      );
      expect(cobrancaSinalHabilitada(perfil({ politica_sinal: politica }))).toBe(
        false,
      );
    },
  );

  it("a conexão tem precedência sobre a política", () => {
    // "escreva sua política" antes de "conecte sua conta" seria a ordem errada
    // de onboarding: a política só importa se houver como cobrar.
    expect(
      motivoSemCobranca(
        perfil({ pagamento_conectado_em: null, politica_sinal: null }),
      ),
    ).toBe("nao_conectado");
  });

  describe("fail-safe", () => {
    it("bloqueia com perfil ausente", () => {
      // A falha aceitável é "não cobrou", nunca "cobrou sem poder".
      expect(motivoSemCobranca(null)).toBe("plano");
      expect(motivoSemCobranca(undefined)).toBe("plano");
      expect(cobrancaSinalHabilitada(null)).toBe(false);
    });

    it("bloqueia com plano desconhecido", () => {
      // O CHECK do banco impede, mas o gate não depende disso: um valor novo
      // adicionado ao vocabulário sem passar por aqui cai no lado seguro.
      expect(motivoSemCobranca(perfil({ plano: "premium" }))).toBe("plano");
      expect(motivoSemCobranca(perfil({ plano: "" }))).toBe("plano");
    });
  });
});

describe("sinalEmCentavos", () => {
  it("converte número e string", () => {
    // O supabase-js devolve `numeric` como string, para não perder precisão.
    expect(sinalEmCentavos(20)).toBe(2000);
    expect(sinalEmCentavos("20.00")).toBe(2000);
    expect(sinalEmCentavos("19.99")).toBe(1999);
  });

  it("arredonda sem erro de float", () => {
    expect(sinalEmCentavos(0.07)).toBe(7);
    expect(sinalEmCentavos(1.1)).toBe(110);
    expect(sinalEmCentavos("35.35")).toBe(3535);
  });

  it("trata ausência, zero e negativo como 'sem sinal'", () => {
    // Um Pix de R$ 0,00 seria recusado pelo provedor e travaria a conversa numa
    // cobrança impossível.
    for (const valor of [null, undefined, 0, "0", "0.00", -5, "-1"]) {
      expect(sinalEmCentavos(valor)).toBeNull();
    }
  });

  it("trata valor não numérico como 'sem sinal'", () => {
    expect(sinalEmCentavos("abc")).toBeNull();
    expect(sinalEmCentavos(Number.NaN)).toBeNull();
    expect(sinalEmCentavos(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
