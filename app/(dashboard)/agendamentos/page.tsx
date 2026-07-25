import Link from "next/link";
import { addDays, format } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { instanteNoFuso } from "@/lib/bot/disponibilidade";
import { CalendarioSemana } from "@/components/calendario-semana";
import {
  MINUTOS_POR_LINHA,
  inicioDaSemana,
  montarCalendario,
  type AgendamentoParaCalendario,
} from "@/lib/calendario";
import { criarClienteServidor, exigirUsuario } from "@/lib/supabase/server";

export const metadata = { title: "Agendamentos — AgendaZap" };

export default async function AgendamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string }>;
}) {
  const usuarioId = await exigirUsuario();
  const supabase = await criarClienteServidor();
  const { semana } = await searchParams;

  const { data: perfil } = await supabase
    .from("perfis")
    .select("fuso_horario")
    .eq("id", usuarioId)
    .single();

  const fusoHorario = perfil?.fuso_horario ?? "America/Sao_Paulo";
  const agora = new Date();
  const hoje = format(new TZDate(agora, fusoHorario), "yyyy-MM-dd");

  const dataInicial = inicioDaSemana(
    /^\d{4}-\d{2}-\d{2}$/.test(semana ?? "") ? semana! : hoje,
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

  const calendario = montarCalendario({
    dataInicial,
    dias: 7,
    fusoHorario,
    agora,
    agendamentos: (agendamentos ?? []) as AgendamentoParaCalendario[],
  });

  // `format` sobre Date comum usa o fuso do PROCESSO (UTC na Vercel). Em fuso a
  // leste de UTC isso devolveria a data errada e os botões de semana andariam
  // sozinhos — daí o TZDate.
  const janelaLocal = new TZDate(inicioJanela, fusoHorario);
  const semanaAnterior = format(addDays(janelaLocal, -7), "yyyy-MM-dd");
  const semanaSeguinte = format(addDays(janelaLocal, 7), "yyyy-MM-dd");

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Agendamentos</h1>

        <nav className="flex items-center gap-1 text-sm">
          <Link
            href={`/agendamentos?semana=${semanaAnterior}`}
            className="rounded-md px-3 py-1.5 transition-colors hover:bg-muted"
          >
            ← Anterior
          </Link>
          <Link
            href="/agendamentos"
            className="rounded-md px-3 py-1.5 transition-colors hover:bg-muted"
          >
            Hoje
          </Link>
          <Link
            href={`/agendamentos?semana=${semanaSeguinte}`}
            className="rounded-md px-3 py-1.5 transition-colors hover:bg-muted"
          >
            Próxima →
          </Link>
        </nav>
      </div>

      {calendario.blocos.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          Nenhum agendamento nesta semana.
        </p>
      )}

      <div className="mt-6">
        <CalendarioSemana calendario={calendario} />
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Cada faixa equivale a {MINUTOS_POR_LINHA} minutos. Horários no fuso{" "}
        {fusoHorario}.
      </p>
    </>
  );
}
