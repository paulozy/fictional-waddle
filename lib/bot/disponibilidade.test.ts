import { describe, expect, it } from "vitest";
import {
  calcularSlotsLivres,
  diaDaSemanaNoFuso,
  diaSeguinte,
  diasComVaga,
  haSobreposicao,
  instanteNoFuso,
  janelasDoDia,
  mesclarIntervalos,
  minutosDoDia,
  minutosDoDiaOuNulo,
  slotsDoDia,
  type Intervalo,
  type ParametrosDiasComVaga,
  type ParametrosDisponibilidade,
} from "./disponibilidade";

const FUSO = "America/Sao_Paulo";
/** 2026-08-10 é uma segunda-feira. Brasil em UTC-3 (sem DST desde 2019). */
const SEGUNDA = "2026-08-10";

/** Instante a partir de hora de parede no fuso do estabelecimento. */
function emSP(data: string, hora: string): Date {
  return instanteNoFuso(data, hora, FUSO);
}

function ocupado(inicio: string, fim: string, data = SEGUNDA): Intervalo {
  return { inicio: emSP(data, inicio), fim: emSP(data, fim) };
}

/** Slots como hora de parede legível, para asserção sem ruído. */
function horas(slots: Intervalo[]): string[] {
  return slots.map((s) =>
    s.inicio.toLocaleTimeString("pt-BR", {
      timeZone: FUSO,
      hour: "2-digit",
      minute: "2-digit",
    }),
  );
}

function parametros(
  sobrescritas: Partial<ParametrosDisponibilidade> = {},
): ParametrosDisponibilidade {
  return {
    data: SEGUNDA,
    fusoHorario: FUSO,
    janelas: [{ horaInicio: "09:00", horaFim: "12:00" }],
    ocupados: [],
    duracaoMinutos: 60,
    passoMinutos: 30,
    // Bem antes do dia-alvo: por padrão a antecedência não corta nada.
    agora: emSP("2026-08-01", "09:00"),
    antecedenciaMinimaMinutos: 60,
    ...sobrescritas,
  };
}

describe("minutosDoDia", () => {
  it("aceita HH:MM e HH:MM:SS (formato que o Postgres devolve)", () => {
    expect(minutosDoDia("09:30")).toBe(570);
    expect(minutosDoDia("09:30:00")).toBe(570);
  });

  it("aceita 24:00:00, que é válido em time no Postgres", () => {
    expect(minutosDoDia("24:00:00")).toBe(1440);
  });

  it("rejeita hora fora de faixa e lixo", () => {
    for (const invalida of ["25:00", "09:75", "-1:00", "abc", "09", ""]) {
      expect(() => minutosDoDia(invalida), invalida).toThrowError(/inválida/);
    }
  });

  it("tem variante que devolve nulo em vez de lançar, para entrada de usuário", () => {
    expect(minutosDoDiaOuNulo("09:30")).toBe(570);
    expect(minutosDoDiaOuNulo("25:00")).toBeNull();
    expect(minutosDoDiaOuNulo("abc")).toBeNull();
  });
});

describe("instanteNoFuso", () => {
  it("interpreta a hora de parede no fuso do estabelecimento, não em UTC", () => {
    // 09:00 em São Paulo (UTC-3) é 12:00Z. Se o código usasse o fuso do
    // processo (UTC na Vercel), daria 09:00Z — três horas errado.
    expect(emSP(SEGUNDA, "09:00").toISOString()).toBe(
      "2026-08-10T12:00:00.000Z",
    );
  });

  it("trata 24:00 como fim do dia", () => {
    expect(emSP(SEGUNDA, "24:00:00").toISOString()).toBe(
      "2026-08-11T03:00:00.000Z",
    );
  });

  it("rejeita data malformada", () => {
    expect(() => instanteNoFuso("10/08/2026", "09:00", FUSO)).toThrowError(
      /Data inválida/,
    );
  });
});

describe("diaDaSemanaNoFuso", () => {
  it("devolve o dia no calendário do estabelecimento", () => {
    expect(diaDaSemanaNoFuso("2026-08-10", FUSO)).toBe(1); // segunda
    expect(diaDaSemanaNoFuso("2026-08-09", FUSO)).toBe(0); // domingo
    expect(diaDaSemanaNoFuso("2026-08-15", FUSO)).toBe(6); // sábado
  });
});

describe("janelasDoDia", () => {
  const grade = [
    { dia_semana: 1, hora_inicio: "13:00:00", hora_fim: "18:00:00" },
    { dia_semana: 1, hora_inicio: "09:00:00", hora_fim: "12:00:00" },
    { dia_semana: 2, hora_inicio: "10:00:00", hora_fim: "16:00:00" },
  ];

  it("filtra pelo dia da data e ordena por hora de início", () => {
    expect(janelasDoDia(grade, SEGUNDA, FUSO)).toEqual([
      { horaInicio: "09:00:00", horaFim: "12:00:00" },
      { horaInicio: "13:00:00", horaFim: "18:00:00" },
    ]);
  });

  it("devolve vazio em dia sem grade (estabelecimento fechado)", () => {
    // 2026-08-12 é quarta (3), que não está na grade.
    expect(janelasDoDia(grade, "2026-08-12", FUSO)).toEqual([]);
  });
});

describe("haSobreposicao", () => {
  const base = ocupado("09:00", "10:00");

  it("intervalos que apenas se tocam não se sobrepõem", () => {
    // Semi-aberto: [09:00,10:00) e [10:00,11:00) são disjuntos.
    expect(haSobreposicao(base, ocupado("10:00", "11:00"))).toBe(false);
    expect(haSobreposicao(base, ocupado("08:00", "09:00"))).toBe(false);
  });

  it("detecta sobreposição parcial em qualquer direção", () => {
    expect(haSobreposicao(base, ocupado("09:30", "10:30"))).toBe(true);
    expect(haSobreposicao(base, ocupado("08:30", "09:30"))).toBe(true);
  });

  it("detecta contenção", () => {
    expect(haSobreposicao(base, ocupado("09:15", "09:45"))).toBe(true);
    expect(haSobreposicao(ocupado("09:15", "09:45"), base)).toBe(true);
  });
});

describe("mesclarIntervalos", () => {
  it("une sobrepostos mesmo fora de ordem", () => {
    const resultado = mesclarIntervalos([
      ocupado("10:00", "11:00"),
      ocupado("09:00", "10:30"),
    ]);

    expect(resultado).toHaveLength(1);
    expect(horas(resultado)).toEqual(["09:00"]);
    expect(resultado[0].fim).toEqual(emSP(SEGUNDA, "11:00"));
  });

  it("une adjacentes — é o caso que deixaria slot escapar entre dois agendamentos encadeados", () => {
    const resultado = mesclarIntervalos([
      ocupado("09:00", "10:00"),
      ocupado("10:00", "11:00"),
    ]);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].fim).toEqual(emSP(SEGUNDA, "11:00"));
  });

  it("preserva intervalos disjuntos", () => {
    const resultado = mesclarIntervalos([
      ocupado("14:00", "15:00"),
      ocupado("09:00", "10:00"),
    ]);

    expect(horas(resultado)).toEqual(["09:00", "14:00"]);
  });

  it("absorve intervalo contido em outro", () => {
    const resultado = mesclarIntervalos([
      ocupado("09:00", "12:00"),
      ocupado("10:00", "11:00"),
    ]);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].fim).toEqual(emSP(SEGUNDA, "12:00"));
  });

  it("descarta intervalo degenerado (fim <= início)", () => {
    expect(mesclarIntervalos([ocupado("09:00", "09:00")])).toEqual([]);
  });

  it("não muta a entrada", () => {
    const entrada = [ocupado("10:00", "11:00"), ocupado("09:00", "10:30")];
    const copia = [...entrada];
    mesclarIntervalos(entrada);
    expect(entrada).toEqual(copia);
  });
});

describe("calcularSlotsLivres", () => {
  it("gera slots de passo em passo dentro de uma janela livre", () => {
    // 09:00-12:00, serviço de 60min, passo 30 → último cabe começando 11:00.
    expect(horas(calcularSlotsLivres(parametros()))).toEqual([
      "09:00",
      "09:30",
      "10:00",
      "10:30",
      "11:00",
    ]);
  });

  it("respeita o intervalo de almoço modelado como duas janelas", () => {
    const slots = calcularSlotsLivres(
      parametros({
        janelas: [
          { horaInicio: "09:00", horaFim: "11:00" },
          { horaInicio: "13:00", horaFim: "15:00" },
        ],
      }),
    );

    // Nenhum slot começa dentro do almoço nem atravessa o fechamento das
    // janelas. 10:00 e 14:00 entram porque terminam exatamente no fechamento —
    // o slot precisa caber inteiro, e cabe.
    expect(horas(slots)).toEqual([
      "09:00",
      "09:30",
      "10:00",
      "13:00",
      "13:30",
      "14:00",
    ]);
    expect(slots.every((s) => s.fim <= emSP(SEGUNDA, "15:00"))).toBe(true);
  });

  it("descarta slot bloqueado por ocupado no início da janela", () => {
    const slots = calcularSlotsLivres(
      parametros({ ocupados: [ocupado("09:00", "10:00")] }),
    );

    expect(horas(slots)).toEqual(["10:00", "10:30", "11:00"]);
  });

  it("descarta slots bloqueados por ocupado no meio da janela", () => {
    const slots = calcularSlotsLivres(
      parametros({ ocupados: [ocupado("10:00", "11:00")] }),
    );

    // 09:30 e 10:30 sobrepõem o ocupado; 09:00 termina exatamente às 10:00.
    expect(horas(slots)).toEqual(["09:00", "11:00"]);
  });

  it("descarta slot bloqueado por ocupado no fim da janela", () => {
    const slots = calcularSlotsLivres(
      parametros({ ocupados: [ocupado("11:00", "12:00")] }),
    );

    expect(horas(slots)).toEqual(["09:00", "09:30", "10:00"]);
  });

  it("trata ocupados adjacentes como um bloco só", () => {
    const slots = calcularSlotsLivres(
      parametros({
        janelas: [{ horaInicio: "09:00", horaFim: "13:00" }],
        ocupados: [ocupado("10:00", "11:00"), ocupado("11:00", "12:00")],
      }),
    );

    expect(horas(slots)).toEqual(["09:00", "12:00"]);
  });

  it("ignora ocupado de outro dia", () => {
    const slots = calcularSlotsLivres(
      parametros({ ocupados: [ocupado("09:00", "12:00", "2026-08-11")] }),
    );

    expect(horas(slots)).toHaveLength(5);
  });

  it("não oferece nada quando o serviço é mais longo que a janela", () => {
    const slots = calcularSlotsLivres(
      parametros({
        janelas: [{ horaInicio: "09:00", horaFim: "10:00" }],
        duracaoMinutos: 90,
      }),
    );

    expect(slots).toEqual([]);
  });

  it("exige que o serviço caiba inteiro na janela", () => {
    // Serviço de 45min com passo 30 em janela de 09:00-11:00: 10:30 terminaria
    // 11:15, depois do fechamento.
    const slots = calcularSlotsLivres(
      parametros({
        janelas: [{ horaInicio: "09:00", horaFim: "11:00" }],
        duracaoMinutos: 45,
      }),
    );

    expect(horas(slots)).toEqual(["09:00", "09:30", "10:00"]);
  });

  it("corta slots que violam a antecedência mínima", () => {
    const slots = calcularSlotsLivres(
      parametros({
        // 09:15 do próprio dia + 60min de antecedência → nada antes de 10:15.
        agora: emSP(SEGUNDA, "09:15"),
        antecedenciaMinimaMinutos: 60,
      }),
    );

    expect(horas(slots)).toEqual(["10:30", "11:00"]);
  });

  it("com antecedência zero, oferece a partir do próprio instante", () => {
    const slots = calcularSlotsLivres(
      parametros({
        agora: emSP(SEGUNDA, "10:00"),
        antecedenciaMinimaMinutos: 0,
      }),
    );

    expect(horas(slots)).toEqual(["10:00", "10:30", "11:00"]);
  });

  it("devolve vazio quando o dia já passou", () => {
    const slots = calcularSlotsLivres(
      parametros({ agora: emSP("2026-08-11", "09:00") }),
    );

    expect(slots).toEqual([]);
  });

  it("devolve vazio sem janelas (estabelecimento fechado no dia)", () => {
    expect(calcularSlotsLivres(parametros({ janelas: [] }))).toEqual([]);
  });

  it("devolve vazio com duração ou passo inválidos em vez de laço infinito", () => {
    expect(calcularSlotsLivres(parametros({ duracaoMinutos: 0 }))).toEqual([]);
    expect(calcularSlotsLivres(parametros({ passoMinutos: 0 }))).toEqual([]);
    expect(calcularSlotsLivres(parametros({ passoMinutos: -30 }))).toEqual([]);
  });

  it("ignora janela degenerada (fim <= início)", () => {
    const slots = calcularSlotsLivres(
      parametros({
        janelas: [
          { horaInicio: "12:00", horaFim: "12:00" },
          { horaInicio: "09:00", horaFim: "11:00" },
        ],
      }),
    );

    expect(horas(slots)).toEqual(["09:00", "09:30", "10:00"]);
  });

  it("cobre janela que vai até a virada do dia", () => {
    const slots = calcularSlotsLivres(
      parametros({
        janelas: [{ horaInicio: "22:00", horaFim: "24:00" }],
        duracaoMinutos: 60,
        passoMinutos: 60,
      }),
    );

    expect(horas(slots)).toEqual(["22:00", "23:00"]);
    // O último slot fecha exatamente na meia-noite local do dia seguinte.
    expect(slots.at(-1)!.fim.toISOString()).toBe("2026-08-11T03:00:00.000Z");
  });

  it("devolve slots em ordem cronológica mesmo com janelas desordenadas", () => {
    const slots = calcularSlotsLivres(
      parametros({
        janelas: [
          { horaInicio: "14:00", horaFim: "15:00" },
          { horaInicio: "09:00", horaFim: "10:00" },
        ],
        duracaoMinutos: 60,
        passoMinutos: 60,
      }),
    );

    expect(horas(slots)).toEqual(["09:00", "14:00"]);
  });

  it("calcula igual independentemente do fuso do processo", () => {
    // O runtime da Vercel roda em UTC; a asserção fixa o instante absoluto para
    // provar que o resultado não depende do TZ do processo.
    const slots = calcularSlotsLivres(
      parametros({ duracaoMinutos: 60, passoMinutos: 60 }),
    );

    expect(slots.map((s) => s.inicio.toISOString())).toEqual([
      "2026-08-10T12:00:00.000Z",
      "2026-08-10T13:00:00.000Z",
      "2026-08-10T14:00:00.000Z",
    ]);
  });
});

/**
 * `proximosSlots` só alcança os horários cronologicamente mais próximos — numa
 * grade cheia, um dia só. `diasComVaga` é o que dá ao cliente um caminho até uma
 * data específica dentro do horizonte.
 */
describe("diasComVaga", () => {
  /** Sexta 07/08/2026, 08:00. */
  const AGORA = emSP("2026-08-07", "08:00");

  /** Seg-sex 09:00-12:00. Fim de semana fechado. */
  const GRADE_SEMANA = [1, 2, 3, 4, 5].map((dia) => ({
    dia_semana: dia,
    hora_inicio: "09:00:00",
    hora_fim: "12:00:00",
  }));

  function varrer(sobrescritas: Partial<ParametrosDiasComVaga> = {}) {
    return diasComVaga({
      agora: AGORA,
      fusoHorario: FUSO,
      grade: GRADE_SEMANA,
      ocupados: [],
      duracaoMinutos: 60,
      passoMinutos: 60,
      antecedenciaMinimaMinutos: 0,
      horizonteDias: 7,
      limite: 7,
      ...sobrescritas,
    });
  }

  /**
   * Listar dia fechado marcado como "sem vaga" gastaria posição do menu numerado
   * e levaria o cliente a uma parede. É a razão de esta função existir em vez de
   * a engine usar `datasNoHorizonte` direto.
   */
  it("exclui dia sem nenhum horário livre", () => {
    expect(varrer().datas).toEqual([
      "2026-08-07",
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
    ]);
  });

  it("exclui dia que está inteiramente ocupado", () => {
    const { datas } = varrer({
      ocupados: [
        { inicio: emSP("2026-08-10", "09:00"), fim: emSP("2026-08-10", "12:00") },
      ],
    });

    expect(datas).not.toContain("2026-08-10");
    expect(datas).toContain("2026-08-11");
  });

  /**
   * `temMais` é o que decide se "Ver mais dias" aparece. Sem ele o cliente pagina
   * para dentro de semanas vazias e conclui que o produto travou.
   */
  it("marca temMais só quando existe dia além da página", () => {
    expect(varrer({ limite: 2 }).temMais).toBe(true);
    expect(varrer({ limite: 7 }).temMais).toBe(false);
  });

  it("respeita o cursor de data, e o cursor é exclusivo do que passou", () => {
    const { datas } = varrer({ desde: "2026-08-11" });

    expect(datas).toEqual(["2026-08-11", "2026-08-12", "2026-08-13"]);
  });

  it("informa o último dia do horizonte, para dizer o teto ao cliente", () => {
    expect(varrer().ultimoDiaDoHorizonte).toBe("2026-08-13");
  });

  it("devolve vazio quando a agenda inteira está fechada", () => {
    const { datas, temMais } = varrer({ grade: [] });

    expect(datas).toEqual([]);
    expect(temMais).toBe(false);
  });

  it("devolve vazio com limite zero, sem varrer", () => {
    expect(varrer({ limite: 0 }).datas).toEqual([]);
  });

  /** Serviço que não cabe em nenhuma faixa: todo dia fica sem vaga. */
  it("exclui todos os dias quando o serviço não cabe na grade", () => {
    expect(varrer({ duracaoMinutos: 240 }).datas).toEqual([]);
  });
});

describe("slotsDoDia", () => {
  it("resolve a grade semanal por dentro, para a data pedida", () => {
    const slots = slotsDoDia(SEGUNDA, {
      agora: emSP("2026-08-07", "08:00"),
      fusoHorario: FUSO,
      grade: [
        { dia_semana: 1, hora_inicio: "09:00:00", hora_fim: "11:00:00" },
        // Terça não deve influenciar o resultado de uma segunda.
        { dia_semana: 2, hora_inicio: "15:00:00", hora_fim: "18:00:00" },
      ],
      ocupados: [],
      duracaoMinutos: 60,
      passoMinutos: 60,
      antecedenciaMinimaMinutos: 0,
    });

    expect(horas(slots)).toEqual(["09:00", "10:00"]);
  });
});

describe("diaSeguinte", () => {
  it("avança um dia de calendário", () => {
    expect(diaSeguinte("2026-08-07", FUSO)).toBe("2026-08-08");
  });

  it("atravessa virada de mês e de ano", () => {
    expect(diaSeguinte("2026-08-31", FUSO)).toBe("2026-09-01");
    expect(diaSeguinte("2026-12-31", FUSO)).toBe("2027-01-01");
  });

  /**
   * O motivo de passar por `datasNoHorizonte` em vez de somar 86.400.000 ms: em
   * fuso com horário de verão, somar milissegundos pula ou repete uma data.
   * Lisboa entrou no horário de verão em 29/03/2026.
   */
  it("não escorrega na virada de horário de verão", () => {
    expect(diaSeguinte("2026-03-28", "Europe/Lisbon")).toBe("2026-03-29");
    expect(diaSeguinte("2026-03-29", "Europe/Lisbon")).toBe("2026-03-30");
  });
});
