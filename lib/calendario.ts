import { TZDate } from "@date-fns/tz";
import { addDays, format } from "date-fns";
import {
  datasNoHorizonte,
  instanteNoFuso,
  minutosDoDiaOuNulo,
} from "@/lib/bot/disponibilidade";

/**
 * Layout do calendário de agendamentos. Módulo **puro**.
 *
 * A visão é um grid CSS: cada agendamento vira uma coluna (o dia) e uma faixa de
 * linhas (o horário). Toda a conversão para hora de parede do estabelecimento
 * acontece aqui, para que a página seja só marcação.
 */

/** Uma linha do grid por intervalo de 30 minutos. */
export const MINUTOS_POR_LINHA = 30;

export type AgendamentoParaCalendario = {
  id: string;
  data_hora: string;
  duracao_minutos: number;
  status: string;
  servicos: { nome: string } | null;
  clientes_finais: { nome: string | null } | null;
};

export type BlocoCalendario = {
  id: string;
  /** 1-based, para casar com `grid-column`. */
  coluna: number;
  /** 1-based dentro da faixa exibida, para casar com `grid-row`. */
  linhaInicio: number;
  linhasOcupadas: number;
  horaInicio: string;
  horaFim: string;
  titulo: string;
  cliente: string;
  status: string;
};

export type DiaDoCalendario = {
  /** `YYYY-MM-DD` no fuso do estabelecimento. */
  data: string;
  rotuloDia: string;
  rotuloNumero: string;
  ehHoje: boolean;
};

export type Calendario = {
  dias: DiaDoCalendario[];
  /** Rótulos das linhas: "08:00", "08:30", … */
  faixasHorarias: string[];
  primeiraLinhaMinutos: number;
  blocos: BlocoCalendario[];
};

export type ParametrosCalendario = {
  /** Primeiro dia exibido, `YYYY-MM-DD`. */
  dataInicial: string;
  dias: number;
  fusoHorario: string;
  agora: Date;
  agendamentos: AgendamentoParaCalendario[];
  /** Faixa exibida, em hora de parede. Ajustada para caber os agendamentos. */
  horaAbertura?: string;
  horaFechamento?: string;
};

function minutosDeParede(instante: Date, fusoHorario: string): number {
  const local = new TZDate(instante, fusoHorario);
  return local.getHours() * 60 + local.getMinutes();
}

function dataDeParede(instante: Date, fusoHorario: string): string {
  return format(new TZDate(instante, fusoHorario), "yyyy-MM-dd");
}

function rotularHora(minutos: number): string {
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return `${String(horas).padStart(2, "0")}:${String(resto).padStart(2, "0")}`;
}

/** Primeiro dia da semana (segunda) que contém a data. */
export function inicioDaSemana(data: string, fusoHorario: string): string {
  const meioDia = new TZDate(`${data}T12:00:00`, fusoHorario);
  // getDay: 0 = domingo. Segunda como início: domingo recua 6 dias.
  const recuo = (meioDia.getDay() + 6) % 7;
  return format(addDays(meioDia, -recuo), "yyyy-MM-dd");
}

export function montarCalendario(p: ParametrosCalendario): Calendario {
  const datas = datasNoHorizonte(
    instanteNoFuso(p.dataInicial, "12:00", p.fusoHorario),
    p.fusoHorario,
    p.dias,
  );
  const hoje = dataDeParede(p.agora, p.fusoHorario);

  const dias: DiaDoCalendario[] = datas.map((data) => {
    const meioDia = new TZDate(`${data}T12:00:00`, p.fusoHorario);
    return {
      data,
      rotuloDia: format(meioDia, "EEE"),
      rotuloNumero: format(meioDia, "dd/MM"),
      ehHoje: data === hoje,
    };
  });

  const indicePorData = new Map(datas.map((data, i) => [data, i]));

  // Apenas o que cai na faixa de dias exibida.
  const visiveis = p.agendamentos
    .map((agendamento) => {
      const inicio = new Date(agendamento.data_hora);
      const data = dataDeParede(inicio, p.fusoHorario);
      const coluna = indicePorData.get(data);
      if (coluna === undefined) return null;

      const minutoInicio = minutosDeParede(inicio, p.fusoHorario);
      return { agendamento, coluna, minutoInicio };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  // A faixa exibida abre onde a agenda começa e fecha onde ela termina — não
  // faz sentido mostrar 00:00–24:00 quando o salão atende das 9h às 18h.
  const aberturaPadrao = p.horaAbertura ? horaParaMinutos(p.horaAbertura) : 480;
  const fechamentoPadrao = p.horaFechamento
    ? horaParaMinutos(p.horaFechamento)
    : 1200;

  const inicios = visiveis.map((v) => v.minutoInicio);
  const fins = visiveis.map(
    (v) => v.minutoInicio + v.agendamento.duracao_minutos,
  );

  const abertura = arredondarParaBaixo(
    Math.min(aberturaPadrao, ...(inicios.length ? inicios : [aberturaPadrao])),
  );
  const fechamento = arredondarParaCima(
    Math.max(fechamentoPadrao, ...(fins.length ? fins : [fechamentoPadrao])),
  );

  const totalLinhas = Math.max(
    1,
    Math.ceil((fechamento - abertura) / MINUTOS_POR_LINHA),
  );

  const faixasHorarias = Array.from({ length: totalLinhas }, (_, i) =>
    rotularHora(abertura + i * MINUTOS_POR_LINHA),
  );

  const blocos: BlocoCalendario[] = visiveis
    .map(({ agendamento, coluna, minutoInicio }) => {
      const minutoFim = minutoInicio + agendamento.duracao_minutos;
      const linhaInicio =
        Math.floor((minutoInicio - abertura) / MINUTOS_POR_LINHA) + 1;
      const linhasOcupadas = Math.max(
        1,
        Math.ceil(agendamento.duracao_minutos / MINUTOS_POR_LINHA),
      );

      return {
        id: agendamento.id,
        coluna: coluna + 1,
        linhaInicio,
        linhasOcupadas,
        horaInicio: rotularHora(minutoInicio),
        horaFim: rotularHora(minutoFim),
        titulo: agendamento.servicos?.nome ?? "Agendamento",
        cliente: agendamento.clientes_finais?.nome ?? "Cliente",
        status: agendamento.status,
      };
    })
    .sort((a, b) =>
      a.coluna === b.coluna
        ? a.linhaInicio - b.linhaInicio
        : a.coluna - b.coluna,
    );

  return {
    dias,
    faixasHorarias,
    primeiraLinhaMinutos: abertura,
    blocos,
  };
}

function horaParaMinutos(hora: string): number {
  // Reusa a leitura de hora da disponibilidade em vez de duplicar com semântica
  // mais frouxa.
  return minutosDoDiaOuNulo(hora) ?? 0;
}

function arredondarParaBaixo(minutos: number): number {
  return Math.max(
    0,
    Math.floor(minutos / MINUTOS_POR_LINHA) * MINUTOS_POR_LINHA,
  );
}

function arredondarParaCima(minutos: number): number {
  return Math.min(
    1440,
    Math.ceil(minutos / MINUTOS_POR_LINHA) * MINUTOS_POR_LINHA,
  );
}
