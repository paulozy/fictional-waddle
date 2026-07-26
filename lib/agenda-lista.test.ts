import { describe, expect, it } from "vitest";
import { instanteNoFuso } from "@/lib/bot/disponibilidade";
import {
  diaSelecionado,
  montarAgendaDoDia,
  rotuloDuracao,
} from "./agenda-lista";
import {
  montarCalendario,
  type AgendamentoParaCalendario,
  type ParametrosCalendario,
} from "./calendario";

const FUSO = "America/Sao_Paulo";
/** 2026-08-10 é uma segunda-feira. */
const SEGUNDA = "2026-08-10";
const TERCA = "2026-08-11";

function agendamento(
  sobrescritas: Partial<AgendamentoParaCalendario> & {
    hora?: string;
    data?: string;
  } = {},
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

function calendario(sobrescritas: Partial<ParametrosCalendario> = {}) {
  return montarCalendario({
    dataInicial: SEGUNDA,
    dias: 7,
    fusoHorario: FUSO,
    agora: instanteNoFuso(SEGUNDA, "10:00", FUSO),
    agendamentos: [],
    ...sobrescritas,
  });
}

describe("rotuloDuracao", () => {
  it("usa minutos abaixo de uma hora", () => {
    expect(rotuloDuracao(40)).toBe("40min");
    expect(rotuloDuracao(59)).toBe("59min");
  });

  it("omite o resto quando a duração é hora cheia", () => {
    // "1h", não "1h00": é como o dono fala, e é o que cabe ao lado da hora.
    expect(rotuloDuracao(60)).toBe("1h");
    expect(rotuloDuracao(120)).toBe("2h");
  });

  it("zera à esquerda o resto de minutos", () => {
    // "1h05" e não "1h5", que se lê como uma hora e cinquenta.
    expect(rotuloDuracao(90)).toBe("1h30");
    expect(rotuloDuracao(65)).toBe("1h05");
  });
});

describe("montarAgendaDoDia", () => {
  it("traz só os agendamentos do dia pedido", () => {
    const cal = calendario({
      agendamentos: [
        agendamento({ data: SEGUNDA, hora: "09:00" }),
        agendamento({ data: TERCA, hora: "11:00" }),
      ],
    });

    const agenda = montarAgendaDoDia(cal, TERCA);

    expect(agenda?.itens).toHaveLength(1);
    expect(agenda?.itens[0].horaInicio).toBe("11:00");
    expect(agenda?.dia.data).toBe(TERCA);
  });

  it("ordena por horário mesmo se o calendário devolver fora de ordem", () => {
    const cal = calendario({
      agendamentos: [
        agendamento({ hora: "15:00", id: "tarde" }),
        agendamento({ hora: "08:00", id: "cedo" }),
        agendamento({ hora: "11:30", id: "meio" }),
      ],
    });

    const agenda = montarAgendaDoDia(cal, SEGUNDA);

    expect(agenda?.itens.map((i) => i.horaInicio)).toEqual([
      "08:00",
      "11:30",
      "15:00",
    ]);
  });

  it("deriva a duração do intervalo do bloco", () => {
    const cal = calendario({
      agendamentos: [agendamento({ hora: "09:00", duracao_minutos: 90 })],
    });

    const item = montarAgendaDoDia(cal, SEGUNDA)?.itens[0];

    expect(item?.horaFim).toBe("10:30");
    expect(item?.duracao).toBe("1h30");
  });

  it("devolve dia vazio sem agendamento, em vez de nulo", () => {
    const agenda = montarAgendaDoDia(calendario(), SEGUNDA);

    // Nulo aqui obrigaria a tela a distinguir "dia vazio" de "data inválida",
    // que são estados diferentes com telas diferentes.
    expect(agenda).not.toBeNull();
    expect(agenda?.itens).toEqual([]);
  });

  it("devolve nulo para data fora da janela exibida", () => {
    // Vem de `?dia=` na URL: alguém digitando não pode derrubar a página.
    expect(montarAgendaDoDia(calendario(), "2027-01-01")).toBeNull();
  });

  describe("linha do agora", () => {
    it("aponta para o primeiro item que ainda não começou", () => {
      const cal = calendario({
        agora: instanteNoFuso(SEGUNDA, "10:00", FUSO),
        agendamentos: [
          agendamento({ hora: "08:00", id: "passado" }),
          agendamento({ hora: "14:00", id: "futuro" }),
        ],
      });

      const agenda = montarAgendaDoDia(cal, SEGUNDA);

      expect(agenda?.indiceDaLinhaDeAgora).toBe(1);
      expect(agenda?.itens[0].passou).toBe(true);
      expect(agenda?.itens[1].passou).toBe(false);
    });

    it("fecha a lista quando o expediente já acabou", () => {
      const cal = calendario({
        agora: instanteNoFuso(SEGUNDA, "19:00", FUSO),
        agendamentos: [agendamento({ hora: "08:00" })],
      });

      // A linha vai para o fim em vez de sumir: "acabou por hoje" é
      // informação, e some-la deixaria a lista igual à de um dia futuro.
      expect(montarAgendaDoDia(cal, SEGUNDA)?.indiceDaLinhaDeAgora).toBe(1);
    });

    it("não desenha a linha em outro dia da mesma semana", () => {
      const cal = calendario({
        agora: instanteNoFuso(SEGUNDA, "10:00", FUSO),
        agendamentos: [agendamento({ data: TERCA, hora: "11:00" })],
      });

      const agenda = montarAgendaDoDia(cal, TERCA);

      // O "agora" existe no calendário (hoje está na janela), mas pertence à
      // segunda. Sem a checagem de coluna a terça ganharia uma linha mentindo.
      expect(agenda?.indiceDaLinhaDeAgora).toBeNull();
      expect(agenda?.itens[0].passou).toBe(false);
    });

    it("não desenha a linha em semana que não contém hoje", () => {
      const cal = calendario({
        dataInicial: "2026-08-17",
        agora: instanteNoFuso(SEGUNDA, "10:00", FUSO),
      });

      expect(cal.agora).toBeNull();
      expect(montarAgendaDoDia(cal, "2026-08-17")?.indiceDaLinhaDeAgora).toBeNull();
    });

    it("trata como passado só o que já terminou", () => {
      const cal = calendario({
        agora: instanteNoFuso(SEGUNDA, "10:30", FUSO),
        // Começou 10:00, termina 11:00: está acontecendo agora.
        agendamentos: [agendamento({ hora: "10:00", duracao_minutos: 60 })],
      });

      const agenda = montarAgendaDoDia(cal, SEGUNDA);

      expect(agenda?.itens[0].passou).toBe(false);
      // O item em curso fica abaixo da linha — ainda é "o que está rolando".
      expect(agenda?.indiceDaLinhaDeAgora).toBe(1);
    });
  });
});

describe("diaSelecionado", () => {
  const dias = calendario().dias;

  it("respeita a data pedida na URL", () => {
    expect(diaSelecionado(dias, TERCA)).toBe(TERCA);
  });

  it("cai em hoje quando a data pedida está fora da janela", () => {
    expect(diaSelecionado(dias, "2027-01-01")).toBe(SEGUNDA);
    expect(diaSelecionado(dias, undefined)).toBe(SEGUNDA);
  });

  it("abre no primeiro dia quando a semana não contém hoje", () => {
    // Navegou para outra semana: "hoje" não existe ali, e abrir na
    // segunda-feira é o que se espera de um seletor de semana.
    const outraSemana = calendario({ dataInicial: "2026-08-17" }).dias;

    expect(outraSemana.some((d) => d.ehHoje)).toBe(false);
    expect(diaSelecionado(outraSemana, undefined)).toBe("2026-08-17");
  });
});
