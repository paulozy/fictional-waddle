import { TZDate } from "@date-fns/tz";
import { addDays, format } from "date-fns";
import {
  datasNoHorizonte,
  instanteNoFuso,
  minutosDoDiaOuNulo,
} from "@/lib/bot/disponibilidade";
import { rotuloCurtoDoDia } from "@/lib/datas";

/**
 * Layout do calendário de agendamentos. Módulo **puro**.
 *
 * A visão é um grid CSS: cada agendamento vira uma coluna (o dia) e uma faixa de
 * linhas (o horário). Toda a conversão para hora de parede do estabelecimento
 * acontece aqui, para que a página seja só marcação.
 */

/** Uma linha do grid por intervalo de 30 minutos. */
export const MINUTOS_POR_LINHA = 30;

/**
 * Altura de cada faixa de 30 minutos, em `rem`. A página aplica este mesmo
 * valor no `grid-template-rows` — mora aqui porque é ele que decide se um bloco
 * comporta o texto completo (ver `ALTURA_MINIMA_COMPLETA_REM`).
 */
export const ALTURA_LINHA_REM = 2.5;

/**
 * Altura mínima para o bloco caber hora + cliente + serviço empilhados.
 *
 * Três linhas de `text-xs` com `leading-tight` são ~2,8rem, mais padding, borda
 * e margem. Abaixo disso o `overflow-hidden` cortava justamente a última linha
 * — o nome do serviço — e um corte de 30 min sumia com o próprio nome. Blocos
 * menores que isto entram no modo compacto, com tudo em uma linha só.
 */
const ALTURA_MINIMA_COMPLETA_REM = 3.6;

/**
 * Trio de classes por status: fundo, borda e tinta.
 *
 * Vive aqui, e não no componente, porque desde a visão em lista são **dois**
 * componentes desenhando o mesmo agendamento. Duplicar o mapa faria a semana e
 * o dia divergirem de cor no primeiro status novo — e cor é o que comunica
 * "cancelado" numa tela sem espaço para escrever.
 */
export const CORES_STATUS: Record<string, string> = {
  confirmado: "bg-confirmado border-confirmado-borda text-confirmado-tinta",
  concluido: "bg-concluido border-concluido-borda text-concluido-tinta",
  cancelado:
    "bg-cancelado border-cancelado-borda text-cancelado-tinta line-through",
  falta: "bg-falta border-falta-borda text-falta-tinta",
};

/** Status desconhecido cai em `confirmado`, que é o caso comum. */
export function coresDoStatus(status: string): string {
  return CORES_STATUS[status] ?? CORES_STATUS.confirmado;
}

/**
 * Status em palavra.
 *
 * Mora aqui pelo mesmo motivo que `CORES_STATUS`: agora são **três** superfícies
 * escrevendo status — a lista do dia, o detalhe do bloco na grade e o nome acessível do
 * botão. Duplicar o mapa faria as três divergirem no primeiro status novo. E a palavra
 * não é redundante com a cor: cor sozinha não é informação acessível (WCAG 1.4.1).
 */
export const ROTULO_STATUS: Record<string, string> = {
  confirmado: "Confirmado",
  concluido: "Concluído",
  cancelado: "Cancelado",
  falta: "Faltou",
};

export function rotuloDoStatus(status: string): string {
  return ROTULO_STATUS[status] ?? status;
}

/**
 * Ids que o dono ainda pode cancelar: confirmados que **não terminaram**.
 *
 * Compara instantes, e é por isso que existe em vez de reusar `ItemDaAgenda.passou`
 * — aquele campo só é verdadeiro quando o dia exibido é hoje (`minutoAgora` é nulo
 * nos outros), então num dia passado ele devolve `false` para tudo e a tela ofereceria
 * "Cancelar" em agendamento da semana anterior.
 *
 * O fim é `data_hora + duracao_minutos`, e não só o início: cancelar um atendimento
 * em curso é legítimo (o cliente foi embora) e libera o slot; cancelar um que já
 * acabou não é — aquilo é `concluido` ou `falta`, que são outra ação.
 *
 * Cancelado, concluído e falta ficam de fora porque a Server Action é condicional em
 * `status = 'confirmado'`: oferecer o botão só para receber "já não estava confirmado"
 * seria mentir na UI.
 */
export function idsCancelaveis(
  agendamentos: AgendamentoParaCalendario[],
  agora: Date,
): Set<string> {
  const limite = agora.getTime();

  return new Set(
    agendamentos
      .filter(
        (a) =>
          a.status === "confirmado" &&
          new Date(a.data_hora).getTime() + a.duracao_minutos * 60_000 > limite,
      )
      .map((a) => a.id),
  );
}

/**
 * Blocos que a **grade** desenha: tudo menos os cancelados.
 *
 * A grade comunica ocupação, e a constraint anti-sobreposição é parcial em
 * `status = 'confirmado'` — então o horário de um cancelado está de fato livre para
 * reserva. Deixar o bloco riscado ali faria o dono olhar a tela e achar que não pode
 * encaixar ninguém, que é informação errada num produto cujo nome é "onde se dá
 * encaixe".
 *
 * Na lista do dia o cancelado **continua aparecendo**, com o rótulo "Cancelado": lá
 * existe espaço para texto, e o histórico é útil ("o que aconteceu com as 14h?").
 */
export function blocosVisiveisNaGrade(
  blocos: BlocoCalendario[],
): BlocoCalendario[] {
  return blocos.filter((bloco) => bloco.status !== "cancelado");
}

/**
 * Descrição completa de um bloco, em uma linha.
 *
 * Fonte única para três consumidores: o texto `sr-only` que compõe o nome acessível do
 * botão, o detalhe do bloco e a confirmação do cancelamento. **Inclui a data**, e é
 * exatamente essa a correção: sem ela, a confirmação de uma ação irreversível na grade
 * não dizia de que dia era o agendamento.
 */
export function descricaoDoBloco(bloco: BlocoCalendario): string {
  return [
    `${bloco.rotuloDia} ${bloco.rotuloNumero}`,
    `${bloco.horaInicio}–${bloco.horaFim}`,
    bloco.cliente,
    bloco.titulo,
    rotuloDoStatus(bloco.status),
  ].join(" · ");
}

/**
 * Por que este agendamento **não** pode ser cancelado, ou `null` se pode.
 *
 * Espelha `idsCancelaveis` de propósito: a UI precisava de uma frase, e não da ausência
 * de um botão. O comentário de `idsCancelaveis` registra que oferecer o botão só para
 * receber "já não estava confirmado" seria mentir na UI — mas a alternativa que estava no
 * ar era pior, porque o produto simplesmente se calava.
 *
 * Recebe o fim já calculado pelo chamador (o bloco não carrega instante, só hora de
 * parede), então o cálculo de "já terminou" fica com quem tem os dados.
 */
export function motivoNaoCancelavel(
  bloco: BlocoCalendario,
  cancelavel: boolean,
): string | null {
  if (cancelavel) return null;

  if (bloco.status === "cancelado") return "Este horário foi cancelado.";
  if (bloco.status === "concluido") return "Este atendimento foi concluído.";
  if (bloco.status === "falta") return "O cliente não compareceu.";

  // Confirmado e não cancelável só acontece por um motivo: a hora já passou.
  return "Este horário já passou.";
}

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
  /**
   * `YYYY-MM-DD` no fuso do estabelecimento, e os rótulos do dia.
   *
   * Existiam dentro de `montarCalendario` e não eram propagados, e a falta custou um
   * defeito real: na grade o dia de um agendamento era **só posição de coluna**, então
   * a confirmação de uma ação irreversível não tinha como dizer de que dia era o
   * horário. Um clique na terça em vez da quarta não era detectável na leitura.
   */
  data: string;
  rotuloDia: string;
  rotuloNumero: string;
  /** 1-based dentro da faixa exibida, para casar com `grid-row`. */
  linhaInicio: number;
  linhasOcupadas: number;
  horaInicio: string;
  horaFim: string;
  titulo: string;
  cliente: string;
  status: string;
  /**
   * O bloco é baixo demais para as três linhas de texto e deve ser renderizado
   * em linha única. Mesma ideia do `fc-timegrid-event-short` do FullCalendar e
   * do que o Google Agenda faz com compromisso curto.
   */
  compacto: boolean;
};

/**
 * Onde desenhar a marca de "agora". `null` quando o dia corrente não está na
 * semana exibida, ou quando a hora atual cai fora da faixa mostrada.
 *
 * Calculado aqui, no servidor, porque é aqui que já existem `agora` e
 * `fusoHorario` — a página segue sem `'use client'`. O efeito colateral é que a
 * marca só anda quando a página é recarregada; para a V0 isso basta.
 */
export type MarcaDeAgora = {
  /** 1-based, casa com `grid-row`. */
  linha: number;
  /** 1-based, casa com `grid-column`. */
  coluna: number;
  /** Posição dentro da faixa de 30 min, de 0 a 100. */
  percentual: number;
  /** `"14:23"` — a hora corrente, para a calha. */
  rotulo: string;
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
  agora: MarcaDeAgora | null;
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
      // `format(meioDia, "EEE")` sem locale imprimia `Mon`, `Tue`. Ver
      // `lib/datas.ts` para por que não é o `EEEEEE` do date-fns.
      rotuloDia: rotuloCurtoDoDia(meioDia.getDay()),
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

      const dia = dias[coluna];

      return {
        id: agendamento.id,
        coluna: coluna + 1,
        data: dia.data,
        rotuloDia: dia.rotuloDia,
        rotuloNumero: dia.rotuloNumero,
        linhaInicio,
        linhasOcupadas,
        horaInicio: rotularHora(minutoInicio),
        horaFim: rotularHora(minutoFim),
        titulo: agendamento.servicos?.nome ?? "Agendamento",
        cliente: agendamento.clientes_finais?.nome ?? "Cliente",
        status: agendamento.status,
        compacto:
          linhasOcupadas * ALTURA_LINHA_REM < ALTURA_MINIMA_COMPLETA_REM,
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
    agora: marcarAgora(p, indicePorData, hoje, abertura, fechamento),
  };
}

function marcarAgora(
  p: ParametrosCalendario,
  indicePorData: Map<string, number>,
  hoje: string,
  abertura: number,
  fechamento: number,
): MarcaDeAgora | null {
  const coluna = indicePorData.get(hoje);
  // Semana passada ou futura: não existe "agora" para marcar.
  if (coluna === undefined) return null;

  const minutoAgora = minutosDeParede(p.agora, p.fusoHorario);
  // Fora do expediente exibido a marca cairia fora do grid.
  if (minutoAgora < abertura || minutoAgora > fechamento) return null;

  const deslocamento = minutoAgora - abertura;

  return {
    linha: Math.floor(deslocamento / MINUTOS_POR_LINHA) + 1,
    coluna: coluna + 1,
    percentual: ((deslocamento % MINUTOS_POR_LINHA) / MINUTOS_POR_LINHA) * 100,
    rotulo: rotularHora(minutoAgora),
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
