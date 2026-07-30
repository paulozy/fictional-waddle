import { describe, expect, it } from "vitest";
import { instanteNoFuso } from "@/lib/bot/disponibilidade";
import {
  ROTULO_STATUS,
  blocosVisiveisNaGrade,
  descricaoDoBloco,
  idsCancelaveis,
  inicioDaSemana,
  montarCalendario,
  motivoNaoCancelavel,
  rotuloDoStatus,
  type AgendamentoParaCalendario,
  type ParametrosCalendario,
} from "./calendario";

const FUSO = "America/Sao_Paulo";
/** 2026-08-10 é uma segunda-feira. */
const SEGUNDA = "2026-08-10";

function agendamento(
  sobrescritas: Partial<AgendamentoParaCalendario> & { hora?: string; data?: string } = {},
): AgendamentoParaCalendario {
  const { hora = "09:00", data = SEGUNDA, ...resto } = sobrescritas;

  return {
    id: `ag-${data}-${hora}`,
    data_hora: instanteNoFuso(data, hora, FUSO).toISOString(),
    duracao_minutos: 60,
    status: "confirmado",
    servicos: { nome: "Corte" },
    clientes_finais: { nome: "Joana" },
    ...resto,
  };
}

function parametros(
  sobrescritas: Partial<ParametrosCalendario> = {},
): ParametrosCalendario {
  return {
    dataInicial: SEGUNDA,
    dias: 7,
    fusoHorario: FUSO,
    agora: instanteNoFuso(SEGUNDA, "10:00", FUSO),
    agendamentos: [],
    ...sobrescritas,
  };
}

describe("inicioDaSemana", () => {
  it("recua para a segunda-feira da semana", () => {
    // 2026-08-10 seg, 11 ter, 15 sáb, 16 dom
    expect(inicioDaSemana("2026-08-10", FUSO)).toBe("2026-08-10");
    expect(inicioDaSemana("2026-08-11", FUSO)).toBe("2026-08-10");
    expect(inicioDaSemana("2026-08-15", FUSO)).toBe("2026-08-10");
    // Domingo pertence à semana que começou na segunda anterior.
    expect(inicioDaSemana("2026-08-16", FUSO)).toBe("2026-08-10");
    expect(inicioDaSemana("2026-08-17", FUSO)).toBe("2026-08-17");
  });
});

describe("montarCalendario", () => {
  it("monta sete dias começando na data inicial", () => {
    const calendario = montarCalendario(parametros());

    expect(calendario.dias).toHaveLength(7);
    expect(calendario.dias[0].data).toBe(SEGUNDA);
    expect(calendario.dias[6].data).toBe("2026-08-16");
  });

  it("marca o dia de hoje", () => {
    const calendario = montarCalendario(parametros());

    expect(calendario.dias.filter((d) => d.ehHoje)).toHaveLength(1);
    expect(calendario.dias.find((d) => d.ehHoje)?.data).toBe(SEGUNDA);
  });

  it("não marca nenhum dia como hoje fora da semana exibida", () => {
    const calendario = montarCalendario(
      parametros({ agora: instanteNoFuso("2026-09-01", "10:00", FUSO) }),
    );

    expect(calendario.dias.some((d) => d.ehHoje)).toBe(false);
  });

  it("posiciona o agendamento na coluna do dia e na linha da hora", () => {
    const calendario = montarCalendario(
      parametros({
        agendamentos: [agendamento({ data: "2026-08-12", hora: "09:00" })],
      }),
    );

    const bloco = calendario.blocos[0];
    // Quarta é a terceira coluna; faixa começa 08:00, então 09:00 é a 3ª linha.
    expect(bloco.coluna).toBe(3);
    expect(calendario.primeiraLinhaMinutos).toBe(480);
    expect(bloco.linhaInicio).toBe(3);
    // 60 minutos = duas faixas de 30.
    expect(bloco.linhasOcupadas).toBe(2);
    expect(bloco.horaInicio).toBe("09:00");
    expect(bloco.horaFim).toBe("10:00");
  });

  it("converte para a hora de parede do estabelecimento, não UTC", () => {
    // 12:00Z é 09:00 em São Paulo. Se o cálculo usasse o fuso do processo (UTC
    // na Vercel), o bloco cairia às 12:00 e três horas fora de lugar.
    const calendario = montarCalendario(
      parametros({
        agendamentos: [
          {
            id: "ag-utc",
            data_hora: "2026-08-10T12:00:00.000Z",
            duracao_minutos: 30,
            status: "confirmado",
            servicos: { nome: "Corte" },
            clientes_finais: { nome: "Joana" },
          },
        ],
      }),
    );

    expect(calendario.blocos[0].horaInicio).toBe("09:00");
    expect(calendario.blocos[0].coluna).toBe(1);
  });

  it("arredonda duração que não fecha na faixa para cima", () => {
    const calendario = montarCalendario(
      parametros({
        agendamentos: [agendamento({ hora: "09:00", duracao_minutos: 45 })],
      }),
    );

    // 45 min ocupa duas faixas de 30 — melhor cobrir do que sobrepor.
    expect(calendario.blocos[0].linhasOcupadas).toBe(2);
    expect(calendario.blocos[0].horaFim).toBe("09:45");
  });

  it("garante ao menos uma faixa para agendamento muito curto", () => {
    const calendario = montarCalendario(
      parametros({
        agendamentos: [agendamento({ hora: "09:10", duracao_minutos: 10 })],
      }),
    );

    expect(calendario.blocos[0].linhasOcupadas).toBe(1);
  });

  it("expande a faixa exibida para caber agendamento fora do horário comum", () => {
    const calendario = montarCalendario(
      parametros({
        agendamentos: [
          agendamento({ hora: "06:30", duracao_minutos: 60 }),
          agendamento({ hora: "21:00", duracao_minutos: 90, id: "noite" }),
        ],
      }),
    );

    // Abre em 06:30 e fecha em 22:30, senão os blocos ficariam fora do grid.
    expect(calendario.faixasHorarias[0]).toBe("06:30");
    expect(calendario.faixasHorarias.at(-1)).toBe("22:00");
    expect(calendario.blocos[0].linhaInicio).toBe(1);
  });

  it("descarta agendamento fora da semana exibida", () => {
    const calendario = montarCalendario(
      parametros({
        agendamentos: [
          agendamento({ data: "2026-08-12" }),
          agendamento({ data: "2026-08-20", id: "fora" }),
        ],
      }),
    );

    expect(calendario.blocos).toHaveLength(1);
    expect(calendario.blocos[0].id).not.toBe("fora");
  });

  it("preserva o status para colorir cancelado e falta", () => {
    const calendario = montarCalendario(
      parametros({
        agendamentos: [
          agendamento({ hora: "09:00", status: "cancelado", id: "c" }),
          agendamento({ hora: "11:00", status: "falta", id: "f" }),
        ],
      }),
    );

    expect(calendario.blocos.map((b) => b.status)).toEqual([
      "cancelado",
      "falta",
    ]);
  });

  it("usa rótulos de fallback quando serviço ou cliente vêm nulos", () => {
    const calendario = montarCalendario(
      parametros({
        agendamentos: [
          agendamento({ servicos: null, clientes_finais: { nome: null } }),
        ],
      }),
    );

    expect(calendario.blocos[0]).toMatchObject({
      titulo: "Agendamento",
      cliente: "Cliente",
    });
  });

  it("ordena os blocos por coluna e depois por linha", () => {
    const calendario = montarCalendario(
      parametros({
        agendamentos: [
          agendamento({ data: "2026-08-12", hora: "15:00", id: "qua-tarde" }),
          agendamento({ data: "2026-08-10", hora: "11:00", id: "seg-manha" }),
          agendamento({ data: "2026-08-12", hora: "09:00", id: "qua-manha" }),
        ],
      }),
    );

    expect(calendario.blocos.map((b) => b.id)).toEqual([
      "seg-manha",
      "qua-manha",
      "qua-tarde",
    ]);
  });

  it("devolve grid válido sem nenhum agendamento", () => {
    const calendario = montarCalendario(parametros());

    expect(calendario.blocos).toEqual([]);
    expect(calendario.faixasHorarias.length).toBeGreaterThan(0);
    expect(calendario.faixasHorarias[0]).toBe("08:00");
  });

  it("rotula os dias em português, abreviados", () => {
    // O bug original: `format(data, "EEE")` sem locale imprimia `Mon`, `Tue`.
    const calendario = montarCalendario(parametros());

    expect(calendario.dias.map((d) => d.rotuloDia)).toEqual([
      "seg",
      "ter",
      "qua",
      "qui",
      "sex",
      "sáb",
      "dom",
    ]);
  });
});

describe("montarCalendario · modo compacto do bloco", () => {
  it("marca como compacto todo agendamento de menos de 60 minutos", () => {
    // Uma faixa de 30 min não comporta hora + cliente + serviço empilhados: era
    // exatamente aí que o nome do serviço sumia atrás do overflow.
    for (const duracao of [10, 15, 30, 45]) {
      const calendario = montarCalendario(
        parametros({
          agendamentos: [agendamento({ duracao_minutos: duracao })],
        }),
      );

      expect(calendario.blocos[0].linhasOcupadas).toBeLessThanOrEqual(2);
      expect({ duracao, compacto: calendario.blocos[0].compacto }).toEqual({
        duracao,
        // 45 min arredonda para duas faixas e já cabe completo.
        compacto: duracao <= 30,
      });
    }
  });

  it("não marca como compacto agendamento de uma hora ou mais", () => {
    for (const duracao of [60, 90, 120]) {
      const calendario = montarCalendario(
        parametros({
          agendamentos: [agendamento({ duracao_minutos: duracao })],
        }),
      );

      expect(calendario.blocos[0].compacto).toBe(false);
    }
  });
});

describe("montarCalendario · marca de agora", () => {
  it("posiciona a marca na linha e coluna do momento atual", () => {
    const calendario = montarCalendario(
      parametros({ agora: instanteNoFuso(SEGUNDA, "10:00", FUSO) }),
    );

    // Faixa abre 08:00; 10:00 são 120 min depois, ou seja quatro faixas.
    expect(calendario.agora).toEqual({
      linha: 5,
      coluna: 1,
      percentual: 0,
      rotulo: "10:00",
    });
  });

  it("posiciona no meio da faixa quando a hora não é redonda", () => {
    const calendario = montarCalendario(
      parametros({ agora: instanteNoFuso("2026-08-12", "10:15", FUSO) }),
    );

    expect(calendario.agora).toMatchObject({
      linha: 5,
      // Quarta é a terceira coluna.
      coluna: 3,
      percentual: 50,
      rotulo: "10:15",
    });
  });

  it("não marca nada quando a semana exibida não contém hoje", () => {
    const calendario = montarCalendario(
      parametros({ agora: instanteNoFuso("2026-09-01", "10:00", FUSO) }),
    );

    expect(calendario.agora).toBeNull();
  });

  it("não marca nada fora do expediente exibido", () => {
    // 06:00 é antes da abertura padrão (08:00): a marca cairia fora do grid.
    const calendario = montarCalendario(
      parametros({ agora: instanteNoFuso(SEGUNDA, "06:00", FUSO) }),
    );

    expect(calendario.agora).toBeNull();
  });

  it("usa a hora de parede do estabelecimento, não a do processo", () => {
    // 13:00Z é 10:00 em São Paulo.
    const calendario = montarCalendario(
      parametros({ agora: new Date("2026-08-10T13:00:00.000Z") }),
    );

    expect(calendario.agora?.rotulo).toBe("10:00");
  });
});

describe("idsCancelaveis", () => {
  const AGORA = instanteNoFuso(SEGUNDA, "10:00", FUSO);

  it("inclui confirmado que ainda não começou", () => {
    const futuro = agendamento({ hora: "15:00" });

    expect(idsCancelaveis([futuro], AGORA)).toEqual(new Set([futuro.id]));
  });

  /**
   * Cancelar atendimento em curso é legítimo — o cliente foi embora — e libera o
   * slot. Por isso a comparação é com o FIM, não com o início.
   */
  it("inclui confirmado em curso", () => {
    const emCurso = agendamento({ hora: "09:30", duracao_minutos: 60 });

    expect(idsCancelaveis([emCurso], AGORA)).toEqual(new Set([emCurso.id]));
  });

  it("exclui confirmado que já terminou", () => {
    const terminado = agendamento({ hora: "08:00", duracao_minutos: 60 });

    expect(idsCancelaveis([terminado], AGORA)).toEqual(new Set());
  });

  /**
   * Num dia passado, `ItemDaAgenda.passou` é `false` para tudo (o "agora" só existe
   * no dia de hoje). Este caso é a razão de `idsCancelaveis` existir em vez de
   * reusar aquele campo: sem ele, a tela ofereceria "Cancelar" na semana anterior.
   */
  it("exclui agendamento de dia anterior", () => {
    const semanaPassada = agendamento({ data: "2026-08-03", hora: "15:00" });

    expect(idsCancelaveis([semanaPassada], AGORA)).toEqual(new Set());
  });

  /**
   * A Server Action é condicional em `status = 'confirmado'`, então oferecer o botão
   * nos outros status só renderia "já não estava confirmado" — mentira na UI.
   */
  it("exclui status que não é confirmado", () => {
    const outros = ["cancelado", "concluido", "falta"].map((status, i) =>
      agendamento({ hora: `1${i}:00`, status }),
    );

    expect(idsCancelaveis(outros, AGORA)).toEqual(new Set());
  });
});

describe("blocosVisiveisNaGrade", () => {
  it("tira o cancelado da grade e mantém o resto", () => {
    const { blocos } = montarCalendario(
      parametros({
        agendamentos: [
          agendamento({ hora: "09:00" }),
          agendamento({ hora: "11:00", status: "cancelado" }),
          agendamento({ hora: "13:00", status: "falta" }),
        ],
      }),
    );

    // Os três entram no calendário — a lista do dia ainda precisa do cancelado.
    expect(blocos).toHaveLength(3);

    const visiveis = blocosVisiveisNaGrade(blocos);
    expect(visiveis).toHaveLength(2);
    expect(visiveis.map((b) => b.status)).toEqual(["confirmado", "falta"]);
  });
});

describe("descricaoDoBloco", () => {
  /**
   * O teste que trava o bug: na grade o dia de um agendamento era só posição de
   * coluna, então a confirmação de uma ação irreversível não dizia de que dia era o
   * horário. Um clique na terça em vez da quarta não era detectável na leitura.
   */
  it("inclui o dia e a data", () => {
    const { blocos } = montarCalendario(
      parametros({
        agendamentos: [agendamento({ data: "2026-08-12", hora: "09:00" })],
      }),
    );

    const descricao = descricaoDoBloco(blocos[0]);

    expect(descricao).toContain("12");
    expect(descricao).toMatch(/qua/i);
  });

  it("inclui hora de início e fim, cliente, serviço e status em palavra", () => {
    const { blocos } = montarCalendario(
      parametros({ agendamentos: [agendamento({ hora: "09:00" })] }),
    );

    const descricao = descricaoDoBloco(blocos[0]);

    expect(descricao).toContain("09:00");
    expect(descricao).toContain("10:00");
    expect(descricao).toContain("Joana");
    expect(descricao).toContain("Corte");
    expect(descricao).toContain("Confirmado");
  });
});

describe("data e rótulos no bloco", () => {
  it("propaga a data da coluna correspondente", () => {
    const { blocos } = montarCalendario(
      parametros({
        agendamentos: [
          agendamento({ data: "2026-08-10", hora: "09:00", id: "seg" }),
          agendamento({ data: "2026-08-12", hora: "09:00", id: "qua" }),
        ],
      }),
    );

    expect(blocos.map((b) => [b.coluna, b.data])).toEqual([
      [1, "2026-08-10"],
      [3, "2026-08-12"],
    ]);
  });

  /**
   * `data` é a data de parede do estabelecimento, não a UTC. 2026-08-10T02:00Z é
   * 23:00 do dia 9 em São Paulo — se a propagação usasse o instante cru, o bloco
   * diria dia 10 e a confirmação mentiria a data.
   */
  it("usa a data de parede do estabelecimento, não a UTC", () => {
    const { blocos } = montarCalendario(
      parametros({
        dataInicial: "2026-08-03",
        agendamentos: [
          {
            id: "vira-o-dia",
            data_hora: "2026-08-10T02:00:00.000Z",
            duracao_minutos: 30,
            status: "confirmado",
            servicos: { nome: "Corte" },
            clientes_finais: { nome: "Joana" },
          },
        ],
      }),
    );

    expect(blocos[0].data).toBe("2026-08-09");
  });
});

describe("motivoNaoCancelavel", () => {
  const bloco = (status: string) =>
    montarCalendario(
      parametros({ agendamentos: [agendamento({ hora: "09:00", status })] }),
    ).blocos[0];

  it("devolve null quando é cancelável", () => {
    expect(motivoNaoCancelavel(bloco("confirmado"), true)).toBeNull();
  });

  it("explica cada status que não dá para cancelar", () => {
    expect(motivoNaoCancelavel(bloco("cancelado"), false)).toMatch(/cancelado/i);
    expect(motivoNaoCancelavel(bloco("concluido"), false)).toMatch(/conclu/i);
    expect(motivoNaoCancelavel(bloco("falta"), false)).toMatch(/compareceu/i);
  });

  /** Confirmado e não cancelável só acontece por um motivo: a hora passou. */
  it("confirmado e não cancelável é horário que passou", () => {
    expect(motivoNaoCancelavel(bloco("confirmado"), false)).toMatch(/passou/i);
  });

  /**
   * Coerência com `idsCancelaveis`: nenhum bloco pode ser ao mesmo tempo cancelável e
   * ter motivo de não sê-lo. Se as duas funções divergirem, a UI mostra o botão e a
   * frase juntos, ou nenhum dos dois.
   */
  it("é coerente com idsCancelaveis", () => {
    const agora = instanteNoFuso(SEGUNDA, "10:00", FUSO);
    const lista = [
      agendamento({ hora: "15:00", id: "futuro" }),
      agendamento({ hora: "08:00", id: "passado" }),
      agendamento({ hora: "15:00", id: "cancelado", status: "cancelado" }),
    ];

    const { blocos } = montarCalendario(parametros({ agendamentos: lista, agora }));
    const podemCancelar = idsCancelaveis(lista, agora);

    for (const b of blocos) {
      const podeCancelar = podemCancelar.has(b.id);
      expect(motivoNaoCancelavel(b, podeCancelar) === null, b.id).toBe(
        podeCancelar,
      );
    }
  });
});

describe("ROTULO_STATUS", () => {
  it("tem rótulo para os quatro status do CHECK do banco", () => {
    for (const status of ["confirmado", "cancelado", "concluido", "falta"]) {
      expect(ROTULO_STATUS[status], status).toBeTruthy();
    }
  });

  it("status desconhecido volta como veio, em vez de sumir", () => {
    expect(rotuloDoStatus("bizarro")).toBe("bizarro");
  });
});
