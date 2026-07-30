import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  MAX_OBSERVACAO_CANCELAMENTO,
  MOTIVOS_CANCELAMENTO,
  ROTULOS_MOTIVO_CANCELAMENTO,
  cancelamentoSchema,
  conflitaComGrade,
  errosDoFormulario,
  faixaInvertida,
  faixasSobrepostas,
  gradeSemanalSchema,
  horarioSchema,
  primeiroErro,
  servicoSchema,
  type EntradaHorario,
  type Faixa,
} from "./agenda";

describe("servicoSchema", () => {
  it("aceita serviço completo", () => {
    const resultado = servicoSchema.parse({
      nome: "  Corte masculino ",
      duracaoMinutos: "45",
      preco: "60,00",
    });

    expect(resultado).toEqual({
      nome: "Corte masculino",
      duracaoMinutos: 45,
      preco: 60,
    });
  });

  it("aceita preço vazio como nulo", () => {
    // O dono pode não querer divulgar valor pelo WhatsApp.
    expect(servicoSchema.parse({ nome: "Corte", duracaoMinutos: "30", preco: "" }))
      .toMatchObject({ preco: null });
  });

  it("aceita ponto decimal além de vírgula", () => {
    expect(
      servicoSchema.parse({ nome: "Corte", duracaoMinutos: "30", preco: "59.90" }),
    ).toMatchObject({ preco: 59.9 });
  });

  it("rejeita nome vazio ou só espaços", () => {
    for (const nome of ["", "   "]) {
      const r = servicoSchema.safeParse({ nome, duracaoMinutos: "30", preco: "" });
      expect(r.success).toBe(false);
      expect(r.error!.issues[0].message).toMatch(/Informe o nome/);
    }
  });

  it("rejeita duração fora de faixa e não inteira", () => {
    const casos: [string, RegExp][] = [
      ["0", /mínima é de 5/],
      ["4", /mínima é de 5/],
      ["481", /máxima é de 8 horas/],
      // Vírgula é normalizada como no preço, então cai no .int() e não em NaN
      ["45,5", /inteiro/],
      ["45.5", /inteiro/],
      ["", /Informe a duração/],
      ["trinta", /Informe a duração/],
    ];

    for (const [duracaoMinutos, esperado] of casos) {
      const r = servicoSchema.safeParse({
        nome: "Corte",
        duracaoMinutos,
        preco: "",
      });
      expect(r.success, duracaoMinutos).toBe(false);
      expect(r.error!.issues[0].message).toMatch(esperado);
    }
  });

  it("rejeita preço negativo e preço não numérico", () => {
    for (const preco of ["-10", "abc"]) {
      const r = servicoSchema.safeParse({
        nome: "Corte",
        duracaoMinutos: "30",
        preco,
      });
      expect(r.success, preco).toBe(false);
      expect(r.error!.issues[0].message).toMatch(/Preço inválido/);
    }
  });
});

describe("horarioSchema", () => {
  it("aceita janela válida", () => {
    expect(
      horarioSchema.parse({
        diaSemana: "1",
        horaInicio: "09:00",
        horaFim: "18:00",
      }),
    ).toEqual({ diaSemana: 1, horaInicio: "09:00", horaFim: "18:00" });
  });

  it("aceita HH:MM:SS, formato que o Postgres devolve", () => {
    expect(
      horarioSchema.parse({
        diaSemana: "0",
        horaInicio: "09:00:00",
        horaFim: "12:00:00",
      }),
    ).toMatchObject({ horaInicio: "09:00:00" });
  });

  it("rejeita fim antes ou igual ao início", () => {
    for (const horaFim of ["09:00", "08:00"]) {
      const r = horarioSchema.safeParse({
        diaSemana: "1",
        horaInicio: "09:00",
        horaFim,
      });
      expect(r.success, horaFim).toBe(false);
      expect(r.error!.issues[0].message).toMatch(/depois do início/);
      expect(r.error!.issues[0].path).toEqual(["horaFim"]);
    }
  });

  it("rejeita formato de hora inválido", () => {
    for (const horaInicio of ["9:00", "25:00", "09:60", "manhã", ""]) {
      const r = horarioSchema.safeParse({
        diaSemana: "1",
        horaInicio,
        horaFim: "18:00",
      });
      expect(r.success, horaInicio).toBe(false);
    }
  });

  it("rejeita dia da semana fora de 0..6", () => {
    for (const diaSemana of ["-1", "7"]) {
      const r = horarioSchema.safeParse({
        diaSemana,
        horaInicio: "09:00",
        horaFim: "18:00",
      });
      expect(r.success, diaSemana).toBe(false);
      expect(r.error!.issues[0].message).toMatch(/Dia da semana inválido/);
    }
  });
});

describe("conflitaComGrade", () => {
  const grade = [
    { dia_semana: 1, hora_inicio: "09:00:00", hora_fim: "12:00:00" },
    { dia_semana: 2, hora_inicio: "14:00:00", hora_fim: "18:00:00" },
  ];

  const nova = (
    diaSemana: number,
    horaInicio: string,
    horaFim: string,
  ): EntradaHorario => ({ diaSemana, horaInicio, horaFim });

  it("detecta sobreposição no mesmo dia", () => {
    expect(conflitaComGrade(nova(1, "11:00", "13:00"), grade)).toBe(true);
    expect(conflitaComGrade(nova(1, "08:00", "10:00"), grade)).toBe(true);
    expect(conflitaComGrade(nova(1, "10:00", "11:00"), grade)).toBe(true);
  });

  it("não acusa conflito em dia diferente", () => {
    expect(conflitaComGrade(nova(3, "09:00", "12:00"), grade)).toBe(false);
    expect(conflitaComGrade(nova(2, "09:00", "12:00"), grade)).toBe(false);
  });

  it("permite janelas encostadas — é como se modela o intervalo de almoço", () => {
    expect(conflitaComGrade(nova(1, "12:00", "18:00"), grade)).toBe(false);
    expect(conflitaComGrade(nova(1, "07:00", "09:00"), grade)).toBe(false);
  });

  it("não acusa conflito com grade vazia", () => {
    expect(conflitaComGrade(nova(1, "09:00", "12:00"), [])).toBe(false);
  });
});

function faixa(horaInicio: string, horaFim: string): Faixa {
  return { horaInicio, horaFim };
}

describe("faixasSobrepostas", () => {
  it("não acusa faixas que apenas se tocam", () => {
    // Intervalos semi-abertos: 09:00–12:00 e 12:00–18:00 é o intervalo de
    // almoço, o caso mais comum da tela — acusar aqui inviabilizaria o cadastro.
    expect(
      faixasSobrepostas([faixa("09:00", "12:00"), faixa("12:00", "18:00")]),
    ).toBe(false);
  });

  it("acusa faixas que invadem uma à outra", () => {
    expect(
      faixasSobrepostas([faixa("09:00", "13:00"), faixa("12:00", "18:00")]),
    ).toBe(true);
  });

  it("acusa sobreposição mesmo fora de ordem", () => {
    expect(
      faixasSobrepostas([faixa("14:00", "18:00"), faixa("09:00", "15:00")]),
    ).toBe(true);
  });

  it("acusa faixa contida em outra", () => {
    expect(
      faixasSobrepostas([faixa("09:00", "18:00"), faixa("10:00", "11:00")]),
    ).toBe(true);
  });

  it("aceita dia vazio ou com uma faixa só", () => {
    expect(faixasSobrepostas([])).toBe(false);
    expect(faixasSobrepostas([faixa("09:00", "18:00")])).toBe(false);
  });

  it("ignora hora malformada em vez de lançar", () => {
    // O schema já reporta formato; lançar aqui viraria 500 em vez de mensagem.
    expect(() => faixasSobrepostas([faixa("xx:yy", "18:00")])).not.toThrow();
  });
});

describe("faixaInvertida", () => {
  it("encontra a faixa cujo fim não é depois do início", () => {
    expect(
      faixaInvertida([faixa("09:00", "12:00"), faixa("18:00", "14:00")]),
    ).toEqual(faixa("18:00", "14:00"));
  });

  it("trata início igual ao fim como inválido", () => {
    expect(faixaInvertida([faixa("09:00", "09:00")])).toEqual(
      faixa("09:00", "09:00"),
    );
  });

  it("devolve null quando está tudo certo", () => {
    expect(faixaInvertida([faixa("09:00", "12:00")])).toBeNull();
  });
});

describe("gradeSemanalSchema", () => {
  function semanaCompleta(faixasDaSegunda: Faixa[] = []) {
    return {
      dias: [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
        diaSemana,
        faixas: diaSemana === 1 ? faixasDaSegunda : [],
      })),
    };
  }

  it("aceita a semana inteira, inclusive dias fechados", () => {
    const r = gradeSemanalSchema.safeParse(
      semanaCompleta([faixa("09:00", "18:00")]),
    );
    expect(r.success).toBe(true);
  });

  it("exige os sete dias", () => {
    const r = gradeSemanalSchema.safeParse({
      dias: [{ diaSemana: 1, faixas: [] }],
    });
    expect(r.success).toBe(false);
  });

  it("recusa mais faixas do que o teto por dia", () => {
    const cinco = Array.from({ length: 5 }, () => faixa("09:00", "10:00"));
    expect(gradeSemanalSchema.safeParse(semanaCompleta(cinco)).success).toBe(
      false,
    );
  });

  it("recusa hora fora do formato HH:MM", () => {
    const r = gradeSemanalSchema.safeParse(
      semanaCompleta([faixa("25:00", "26:00")]),
    );
    expect(r.success).toBe(false);
  });
});

describe("errosDoFormulario", () => {
  it("devolve erro global e mapa por campo", () => {
    const schema = z.object({
      nome: z.string().min(1, "Informe o nome."),
      duracao: z.number({ error: "Informe a duração." }),
    });
    const r = schema.safeParse({ nome: "" });

    expect(r.success).toBe(false);
    if (r.success) return;

    const { erro, campos } = errosDoFormulario(r.error);
    expect(erro).toBeTruthy();
    expect(campos.nome).toEqual(["Informe o nome."]);
    expect(campos.duracao).toEqual(["Informe a duração."]);
  });
});

describe("cancelamentoSchema", () => {
  const valido = {
    id: "3f1c5b2e-0a9d-4c7e-8b1a-2d3e4f5a6b7c",
    motivo: "cliente_pediu",
    observacao: "",
  };

  it("aceita os cinco motivos do vocabulário", () => {
    for (const motivo of MOTIVOS_CANCELAMENTO) {
      const r = cancelamentoSchema.safeParse({ ...valido, motivo });
      expect(r.success, motivo).toBe(true);
    }
  });

  it("rejeita motivo fora do vocabulário", () => {
    const r = cancelamentoSchema.safeParse({
      ...valido,
      motivo: "porque_eu_quis",
    });

    expect(r.success).toBe(false);
  });

  /** Radio sem escolha manda string vazia — a mensagem tem de dizer o que falta. */
  it("exige o motivo", () => {
    const r = cancelamentoSchema.safeParse({ ...valido, motivo: "" });

    expect(r.success).toBe(false);
    if (r.success) return;
    expect(primeiroErro(r.error)).toMatch(/motivo/i);
  });

  it("rejeita id que não é uuid", () => {
    const r = cancelamentoSchema.safeParse({ ...valido, id: "42" });

    expect(r.success).toBe(false);
  });

  /**
   * Vazio vira `null` e não `""`: a coluna não deve guardar string vazia
   * indistinguível de "não escreveu nada".
   */
  it("converte observação vazia em null", () => {
    const r = cancelamentoSchema.safeParse({ ...valido, observacao: "   " });

    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.observacao).toBeNull();
  });

  it("apara a observação e mantém o texto", () => {
    const r = cancelamentoSchema.safeParse({
      ...valido,
      observacao: "  cliente avisou por telefone  ",
    });

    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.observacao).toBe("cliente avisou por telefone");
  });

  it("rejeita observação acima do teto", () => {
    const r = cancelamentoSchema.safeParse({
      ...valido,
      observacao: "x".repeat(MAX_OBSERVACAO_CANCELAMENTO + 1),
    });

    expect(r.success).toBe(false);
  });
});

describe("ROTULOS_MOTIVO_CANCELAMENTO", () => {
  it("tem rótulo para todo motivo", () => {
    for (const motivo of MOTIVOS_CANCELAMENTO) {
      expect(ROTULOS_MOTIVO_CANCELAMENTO[motivo]).toBeTruthy();
    }
  });
});
