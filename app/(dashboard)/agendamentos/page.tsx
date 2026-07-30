import type { Metadata } from "next";
import Link from "next/link";
import { addDays, format } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { instanteNoFuso } from "@/lib/bot/disponibilidade";
import { AgendaLista } from "@/components/agenda-lista";
import { CalendarioSemana } from "@/components/calendario-semana";
import { diaSelecionado, montarAgendaDoDia } from "@/lib/agenda-lista";
import {
  MINUTOS_POR_LINHA,
  blocosVisiveisNaGrade,
  idsCancelaveis,
  inicioDaSemana,
  montarCalendario,
  type AgendamentoParaCalendario,
} from "@/lib/calendario";
import { criarClienteServidor, exigirUsuario } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Agendamentos" };

/** `YYYY-MM-DD`. Vem de query string, então é validado antes de virar data. */
const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;

export default async function AgendamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string; dia?: string }>;
}) {
  const usuarioId = await exigirUsuario();
  const supabase = await criarClienteServidor();
  const { semana, dia } = await searchParams;

  const { data: perfil } = await supabase
    .from("perfis")
    .select("fuso_horario")
    .eq("id", usuarioId)
    .single();

  const fusoHorario = perfil?.fuso_horario ?? "America/Sao_Paulo";
  const agora = new Date();
  const hoje = format(new TZDate(agora, fusoHorario), "yyyy-MM-dd");

  /**
   * A visão de celular navega por dia (`?dia=`) e a de desktop por semana
   * (`?semana=`), mas a query é uma só: um dia sempre implica a semana que o
   * contém. Assim trocar de dia no celular e girar para paisagem cai na semana
   * certa, sem segundo parâmetro para manter sincronizado.
   */
  const diaPedido = FORMATO_DATA.test(dia ?? "") ? dia : undefined;
  const semanaPedida = FORMATO_DATA.test(semana ?? "") ? semana : undefined;

  const dataInicial = inicioDaSemana(
    diaPedido ?? semanaPedida ?? hoje,
    fusoHorario,
  );

  // Busca pela janela exata da semana exibida, no fuso do estabelecimento.
  const inicioJanela = instanteNoFuso(dataInicial, "00:00", fusoHorario);
  const fimJanela = addDays(inicioJanela, 7);

  const { data: agendamentos } = await supabase
    .from("agendamentos")
    .select(
      "id, data_hora, duracao_minutos, status, servicos(nome), clientes_finais(nome)",
    )
    .eq("usuario_id", usuarioId)
    .gte("data_hora", inicioJanela.toISOString())
    .lt("data_hora", fimJanela.toISOString())
    .order("data_hora");

  const paraCalendario = (agendamentos ?? []) as AgendamentoParaCalendario[];

  const calendario = montarCalendario({
    dataInicial,
    dias: 7,
    fusoHorario,
    agora,
    agendamentos: paraCalendario,
  });

  /**
   * Calculado a partir do instante real, e não de `ItemDaAgenda.passou`: aquele
   * campo só é verdadeiro quando o dia exibido é hoje, então num dia passado
   * ofereceria "Cancelar" em agendamento da semana anterior.
   */
  const cancelaveis = idsCancelaveis(paraCalendario, agora);

  // `format` sobre Date comum usa o fuso do PROCESSO (UTC na Vercel). Em fuso a
  // leste de UTC isso devolveria a data errada e os botões de semana andariam
  // sozinhos — daí o TZDate.
  const janelaLocal = new TZDate(inicioJanela, fusoHorario);
  const semanaAnterior = format(addDays(janelaLocal, -7), "yyyy-MM-dd");
  const semanaSeguinte = format(addDays(janelaLocal, 7), "yyyy-MM-dd");

  const agenda = montarAgendaDoDia(
    calendario,
    diaSelecionado(calendario.dias, diaPedido),
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Agendamentos</h1>

        <nav aria-label="Trocar de semana" className="flex items-center gap-1 text-sm">
          <Link
            href={`/agendamentos?semana=${semanaAnterior}`}
            className="flex min-h-11 items-center rounded-md px-3 transition-colors hover:bg-muted"
          >
            ← Anterior
          </Link>
          <Link
            href="/agendamentos"
            className="flex min-h-11 items-center rounded-md px-3 transition-colors hover:bg-muted"
          >
            Hoje
          </Link>
          <Link
            href={`/agendamentos?semana=${semanaSeguinte}`}
            className="flex min-h-11 items-center rounded-md px-3 transition-colors hover:bg-muted"
          >
            Próxima →
          </Link>
        </nav>
      </div>

      {/**
       * Duas visões do mesmo `calendario`, escolhidas por CSS no servidor.
       *
       * `md:hidden` / `hidden md:block` em vez de `matchMedia`: a decisão
       * acontece na folha de estilo, então não há client component, não há
       * divergência de hidratação e a primeira pintura já vem certa. O preço é
       * mandar os dois markups — irrelevante para sete dias de agendamento, e
       * barato perto de hidratar a página inteira só para medir a tela.
       */}
      <div className="mt-6 md:hidden">
        <AgendaLista
          agenda={agenda}
          dias={calendario.dias}
          cancelaveis={cancelaveis}
        />
      </div>

      <div className="mt-6 hidden md:block">
        {/* Conta os blocos que a grade de fato desenha: uma semana só com
            cancelados mostraria grade vazia sem explicar por quê. */}
        {blocosVisiveisNaGrade(calendario.blocos).length === 0 && (
          <p className="mb-4 text-sm text-muted-foreground">
            Nenhum agendamento nesta semana.
          </p>
        )}

        <CalendarioSemana calendario={calendario} cancelaveis={cancelaveis} />

        <p className="mt-4 text-xs text-muted-foreground">
          Cada faixa equivale a {MINUTOS_POR_LINHA} minutos. Horários no fuso{" "}
          {fusoHorario}.
        </p>
      </div>
    </>
  );
}
