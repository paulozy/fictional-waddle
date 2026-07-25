import { TZDate } from "@date-fns/tz";
import { addDays, format } from "date-fns";

/**
 * Cálculo de horários livres. Módulo **puro**: nenhuma chamada a banco, rede ou
 * relógio do sistema — `agora` entra por parâmetro. É o núcleo de risco lógico
 * do produto e por isso 100% testável sem WhatsApp e sem Supabase.
 *
 * Não existe biblioteca viável para isto: `time-slots-finder` parou em 2022 e as
 * alternativas estão abandonadas desde 2018. O algoritmo é a composição de dois
 * clássicos — merge de intervalos e teste de sobreposição — em intervalos
 * semi-abertos `[início, fim)`.
 *
 * Regra de fuso que importa mais que qualquer detalhe de implementação:
 * `horarios_disponiveis.hora_inicio` é **hora de parede** (`time`) e
 * `agendamentos.data_hora` é **instante** (`timestamptz`). A grade é interpretada
 * na hora de parede do fuso do estabelecimento e convertida para instante nas
 * fronteiras. O runtime da Vercel roda em UTC e nunca serve como referência.
 */

/** Janela da grade semanal, em hora de parede: "09:00" ou "09:00:00". */
export type JanelaLocal = {
  horaInicio: string;
  horaFim: string;
};

/** Intervalo em instantes absolutos. */
export type Intervalo = {
  inicio: Date;
  fim: Date;
};

export type Slot = Intervalo;

/** Linha de `horarios_disponiveis` (só o que o cálculo usa). */
export type HorarioSemanal = {
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
};

export type ParametrosDisponibilidade = {
  /** Dia-alvo no calendário do estabelecimento, em `YYYY-MM-DD`. */
  data: string;
  /** IANA, ex: "America/Sao_Paulo". Vem de `perfis.fuso_horario`. */
  fusoHorario: string;
  /** Janelas já filtradas para o dia_semana da data. */
  janelas: JanelaLocal[];
  /** Agendamentos confirmados que colidem com o dia. */
  ocupados: Intervalo[];
  /** Duração do serviço escolhido. */
  duracaoMinutos: number;
  /** De quantos em quantos minutos um slot pode começar. */
  passoMinutos: number;
  /** Instante de referência — injetado, nunca `new Date()` aqui dentro. */
  agora: Date;
  antecedenciaMinimaMinutos: number;
};

const MS_POR_MINUTO = 60_000;

/**
 * Como `minutosDoDia`, mas devolve `null` em vez de lançar.
 *
 * Existe para validar entrada de usuário: um validador que lança transforma
 * digitação errada em erro 500. Use esta variante em qualquer caminho que toque
 * dado não confiável.
 */
export function minutosDoDiaOuNulo(hora: string): number | null {
  const partes = hora.split(":");
  if (partes.length < 2) return null;

  const horas = Number(partes[0]);
  const minutos = Number(partes[1]);

  if (!Number.isInteger(horas) || !Number.isInteger(minutos)) return null;
  if (horas < 0 || horas > 24) return null;
  if (minutos < 0 || minutos > 59) return null;

  return horas * 60 + minutos;
}

/**
 * Converte "HH:MM" ou "HH:MM:SS" em minutos desde a meia-noite.
 * Aceita "24:00:00", que o Postgres permite em `time` e representa o fim do dia.
 *
 * Lança em entrada inválida: os chamadores são o cálculo de disponibilidade e a
 * engine, que leem do banco — ali um valor malformado é bug, não digitação.
 */
export function minutosDoDia(hora: string): number {
  const minutos = minutosDoDiaOuNulo(hora);
  if (minutos === null) throw new Error(`Hora inválida: ${hora}`);
  return minutos;
}

/**
 * Instante correspondente a uma hora de parede num dia e fuso.
 *
 * Em fusos com horário de verão, uma hora de parede pode não existir (gap) ou
 * existir duas vezes (overlap); a TZDate resolve escolhendo uma. O Brasil não
 * tem DST desde 2019, mas datas históricas têm — por isso o fuso IANA em vez de
 * um offset fixo `-03:00`.
 */
export function instanteNoFuso(
  data: string,
  hora: string,
  fusoHorario: string,
): Date {
  const [ano, mes, dia] = data.split("-").map(Number);
  if (!ano || !mes || !dia) {
    throw new Error(`Data inválida: ${data} (esperado YYYY-MM-DD)`);
  }

  const total = minutosDoDia(hora);
  const horas = Math.floor(total / 60);
  const minutos = total % 60;

  return new Date(
    new TZDate(ano, mes - 1, dia, horas, minutos, 0, fusoHorario).getTime(),
  );
}

/** Dia da semana (0 = domingo) de uma data no fuso do estabelecimento. */
export function diaDaSemanaNoFuso(data: string, fusoHorario: string): number {
  return new TZDate(`${data}T12:00:00`, fusoHorario).getDay();
}

/** Janelas da grade semanal que valem para a data, já ordenadas. */
export function janelasDoDia(
  horarios: HorarioSemanal[],
  data: string,
  fusoHorario: string,
): JanelaLocal[] {
  const dia = diaDaSemanaNoFuso(data, fusoHorario);

  return horarios
    .filter((h) => h.dia_semana === dia)
    .map((h) => ({ horaInicio: h.hora_inicio, horaFim: h.hora_fim }))
    .sort((a, b) => minutosDoDia(a.horaInicio) - minutosDoDia(b.horaInicio));
}

/** Dois intervalos semi-abertos se sobrepõem. Teste canônico. */
export function haSobreposicao(a: Intervalo, b: Intervalo): boolean {
  return a.inicio.getTime() < b.fim.getTime() &&
    b.inicio.getTime() < a.fim.getTime();
}

/**
 * Une intervalos sobrepostos ou adjacentes num conjunto mínimo, ordenado.
 *
 * Sem isto, dois agendamentos encadeados (09:00-10:00 e 10:00-11:00) seriam
 * testados separadamente e um slot poderia escapar entre eles. O(n log n).
 */
export function mesclarIntervalos(intervalos: Intervalo[]): Intervalo[] {
  const ordenados = intervalos
    .filter((i) => i.fim.getTime() > i.inicio.getTime())
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());

  const resultado: Intervalo[] = [];

  for (const atual of ordenados) {
    const ultimo = resultado.at(-1);

    if (ultimo && atual.inicio.getTime() <= ultimo.fim.getTime()) {
      if (atual.fim.getTime() > ultimo.fim.getTime()) {
        resultado[resultado.length - 1] = {
          inicio: ultimo.inicio,
          fim: atual.fim,
        };
      }
      continue;
    }

    resultado.push({ inicio: atual.inicio, fim: atual.fim });
  }

  return resultado;
}

/**
 * Slots livres do dia, em ordem cronológica.
 *
 * Um slot entra se: cabe **inteiro** dentro de uma janela da grade, não
 * sobrepõe nenhum horário ocupado, e começa depois de
 * `agora + antecedenciaMinimaMinutos`.
 *
 * O passo é contado em tempo real (ms), não em hora de parede — irrelevante no
 * Brasil, que não tem DST, e mais simples de raciocinar.
 */
export function calcularSlotsLivres(p: ParametrosDisponibilidade): Slot[] {
  if (p.duracaoMinutos <= 0 || p.passoMinutos <= 0) return [];

  const duracaoMs = p.duracaoMinutos * MS_POR_MINUTO;
  const passoMs = p.passoMinutos * MS_POR_MINUTO;
  const ocupados = mesclarIntervalos(p.ocupados);
  const limiteMinimo =
    p.agora.getTime() + p.antecedenciaMinimaMinutos * MS_POR_MINUTO;

  const slots: Slot[] = [];

  for (const janela of p.janelas) {
    const abertura = instanteNoFuso(
      p.data,
      janela.horaInicio,
      p.fusoHorario,
    ).getTime();
    const fechamento = instanteNoFuso(
      p.data,
      janela.horaFim,
      p.fusoHorario,
    ).getTime();

    if (fechamento <= abertura) continue;

    for (let t = abertura; t + duracaoMs <= fechamento; t += passoMs) {
      if (t < limiteMinimo) continue;

      const candidato = { inicio: new Date(t), fim: new Date(t + duracaoMs) };
      if (ocupados.some((o) => haSobreposicao(candidato, o))) continue;

      slots.push(candidato);
    }
  }

  // Deduplica por instante de início: janelas sobrepostas na grade produziriam o
  // mesmo horário duas vezes e ele apareceria repetido no menu numerado,
  // gastando posições do limite de opções.
  const vistos = new Set<number>();

  return slots
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime())
    .filter((slot) => {
      const chave = slot.inicio.getTime();
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });
}

/**
 * Datas `YYYY-MM-DD` a partir de hoje, no calendário do estabelecimento.
 *
 * Usa aritmética de calendário (`addDays` sobre TZDate) e não soma de 86.400.000
 * ms: em fuso com horário de verão, somar milissegundos pula ou repete uma data.
 */
export function datasNoHorizonte(
  agora: Date,
  fusoHorario: string,
  dias: number,
): string[] {
  const hoje = new TZDate(agora, fusoHorario);

  return Array.from({ length: Math.max(0, dias) }, (_, i) =>
    format(addDays(hoje, i), "yyyy-MM-dd"),
  );
}

/**
 * Intervalo de instantes que cobre o dia seguinte no calendário do
 * estabelecimento.
 *
 * O cron de lembretes precisa disto e **não** de "próximas 24 horas": a Vercel
 * pode invocar o cron em qualquer minuto da hora agendada, então uma janela
 * relativa incluiria ou excluiria agendamentos dependendo do minuto do disparo.
 */
export function intervaloDoDiaSeguinte(
  agora: Date,
  fusoHorario: string,
): Intervalo {
  const amanha = datasNoHorizonte(agora, fusoHorario, 2)[1];

  return {
    inicio: instanteNoFuso(amanha, "00:00", fusoHorario),
    fim: instanteNoFuso(amanha, "24:00", fusoHorario),
  };
}

export type ParametrosProximosSlots = {
  agora: Date;
  fusoHorario: string;
  grade: HorarioSemanal[];
  ocupados: Intervalo[];
  duracaoMinutos: number;
  passoMinutos: number;
  antecedenciaMinimaMinutos: number;
  horizonteDias: number;
  /** Quantos horários oferecer. Menu numerado no WhatsApp não escala. */
  limite: number;
};

/**
 * Os próximos `limite` horários livres, varrendo o horizonte dia a dia.
 *
 * Para o cliente final o menu precisa ser curto — oferecer 30 dias de slots num
 * menu numerado é inutilizável. Para de varrer assim que enche o limite.
 */
export function proximosSlots(p: ParametrosProximosSlots): Slot[] {
  if (p.limite <= 0) return [];

  const encontrados: Slot[] = [];

  for (const data of datasNoHorizonte(p.agora, p.fusoHorario, p.horizonteDias)) {
    if (encontrados.length >= p.limite) break;

    encontrados.push(
      ...calcularSlotsLivres({
        data,
        fusoHorario: p.fusoHorario,
        janelas: janelasDoDia(p.grade, data, p.fusoHorario),
        ocupados: p.ocupados,
        duracaoMinutos: p.duracaoMinutos,
        passoMinutos: p.passoMinutos,
        agora: p.agora,
        antecedenciaMinimaMinutos: p.antecedenciaMinimaMinutos,
      }),
    );
  }

  return encontrados.slice(0, p.limite);
}
