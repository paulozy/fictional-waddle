import { addDays, format } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { instanteNoFuso } from "@/lib/bot/disponibilidade";

/**
 * As contas de tempo do painel de WhatsApp, separadas das queries.
 *
 * Elas existem à parte por um motivo concreto: "hoje" e "ontem" só têm sentido
 * no **fuso do estabelecimento**, e o runtime da Vercel roda em UTC. Um lembrete
 * enviado às 23h de ontem em São Paulo é 02h de hoje em UTC — contado no fuso
 * errado, ele desaparece do número de ontem e aparece no de hoje. Como a página
 * é um Server Component, o erro seria invisível em desenvolvimento (a máquina
 * do dono já está no fuso certo) e só apareceria em produção.
 */

export type JanelasDoDia = {
  /** Meia-noite de hoje no fuso do negócio. */
  inicioHoje: Date;
  /** Meia-noite de ontem no fuso do negócio. */
  inicioOntem: Date;
};

export function janelasDoDia(agora: Date, fusoHorario: string): JanelasDoDia {
  const hoje = format(new TZDate(agora, fusoHorario), "yyyy-MM-dd");
  const inicioHoje = instanteNoFuso(hoje, "00:00", fusoHorario);

  /**
   * O dia anterior é calculado sobre a **data local** e reconvertido, e não
   * subtraindo 24h do instante: em fuso com horário de verão, o dia que muda o
   * relógio tem 23 ou 25 horas, e a subtração pegaria uma hora do dia errado.
   */
  const ontem = format(
    addDays(new TZDate(inicioHoje, fusoHorario), -1),
    "yyyy-MM-dd",
  );

  return {
    inicioHoje,
    inicioOntem: instanteNoFuso(ontem, "00:00", fusoHorario),
  };
}

const RELATIVO = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

/**
 * `"há 6 minutos"`, `"há 2 dias"`. `null` quando não houve o evento.
 *
 * Relativo e não absoluto porque a pergunta que a linha responde é "o bot está
 * vivo?", e "14:03" só responde isso depois de o dono olhar o relógio. A partir
 * de um mês vira data absoluta: "há 47 dias" deixa de informar.
 */
export function tempoRelativo(
  quando: Date | null | undefined,
  agora: Date,
  fusoHorario: string,
): string | null {
  if (!quando) return null;

  const segundos = Math.round((quando.getTime() - agora.getTime()) / 1000);
  const absoluto = Math.abs(segundos);

  if (absoluto < 60) return "agora há pouco";
  if (absoluto < 3600) return RELATIVO.format(Math.round(segundos / 60), "minute");
  if (absoluto < 86_400) return RELATIVO.format(Math.round(segundos / 3600), "hour");
  if (absoluto < 30 * 86_400) {
    return RELATIVO.format(Math.round(segundos / 86_400), "day");
  }

  return format(new TZDate(quando, fusoHorario), "dd/MM/yyyy");
}

/** `"02/08, 09:14"` — data e hora no fuso do negócio. */
export function dataHoraLocal(quando: Date, fusoHorario: string): string {
  return format(new TZDate(quando, fusoHorario), "dd/MM, HH:mm");
}
