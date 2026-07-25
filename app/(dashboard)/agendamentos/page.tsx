import Link from "next/link";
import { addDays, format } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { instanteNoFuso } from "@/lib/bot/disponibilidade";
import {
  MINUTOS_POR_LINHA,
  inicioDaSemana,
  montarCalendario,
  type AgendamentoParaCalendario,
} from "@/lib/calendario";
import { criarClienteServidor, exigirUsuario } from "@/lib/supabase/server";

export const metadata = { title: "Agendamentos — AgendaZap" };

/** Altura de cada faixa de 30 minutos. */
const ALTURA_LINHA = "2.25rem";

const CORES_STATUS: Record<string, string> = {
  confirmado:
    "bg-emerald-100 border-emerald-300 text-emerald-950 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-100",
  concluido:
    "bg-zinc-100 border-zinc-300 text-zinc-700 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300",
  cancelado:
    "bg-zinc-50 border-zinc-200 text-zinc-400 line-through dark:bg-zinc-900 dark:border-zinc-800",
  falta:
    "bg-red-50 border-red-200 text-red-700 dark:bg-red-950 dark:border-red-900 dark:text-red-200",
};

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
            className="rounded-lg px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            ← Anterior
          </Link>
          <Link
            href="/agendamentos"
            className="rounded-lg px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Hoje
          </Link>
          <Link
            href={`/agendamentos?semana=${semanaSeguinte}`}
            className="rounded-lg px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Próxima →
          </Link>
        </nav>
      </div>

      {calendario.blocos.length === 0 && (
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          Nenhum agendamento nesta semana.
        </p>
      )}

      {/* Rola horizontalmente em tela estreita, sem estourar o corpo da página. */}
      <div className="mt-6 overflow-x-auto">
        <div className="min-w-[44rem]">
          <div
            className="grid border-b border-zinc-200 dark:border-zinc-800"
            style={{ gridTemplateColumns: "4rem repeat(7, minmax(0, 1fr))" }}
          >
            <div />
            {calendario.dias.map((dia) => (
              <div
                key={dia.data}
                className={`px-2 pb-2 text-center text-sm ${
                  dia.ehHoje
                    ? "font-semibold text-emerald-700 dark:text-emerald-400"
                    : "text-zinc-600 dark:text-zinc-400"
                }`}
              >
                <div className="capitalize">{dia.rotuloDia}</div>
                <div className="text-xs">{dia.rotuloNumero}</div>
              </div>
            ))}
          </div>

          <div
            className="grid"
            style={{
              gridTemplateColumns: "4rem repeat(7, minmax(0, 1fr))",
              gridTemplateRows: `repeat(${calendario.faixasHorarias.length}, ${ALTURA_LINHA})`,
            }}
          >
            {/* Coluna de horas */}
            {calendario.faixasHorarias.map((faixa, i) => (
              <div
                key={faixa}
                style={{ gridColumn: 1, gridRow: i + 1 }}
                className="pr-2 text-right text-xs tabular-nums text-zinc-400"
              >
                {/* Só a hora cheia recebe rótulo, para não virar poluição. */}
                {faixa.endsWith(":00") ? faixa : ""}
              </div>
            ))}

            {/* Linhas de fundo */}
            {calendario.faixasHorarias.map((faixa, i) =>
              calendario.dias.map((dia, coluna) => (
                <div
                  key={`${dia.data}-${faixa}`}
                  style={{ gridColumn: coluna + 2, gridRow: i + 1 }}
                  className={`border-l border-zinc-200 dark:border-zinc-800 ${
                    faixa.endsWith(":00")
                      ? "border-t border-t-zinc-200 dark:border-t-zinc-800"
                      : ""
                  }`}
                />
              )),
            )}

            {/* Agendamentos */}
            {calendario.blocos.map((bloco) => (
              <div
                key={bloco.id}
                style={{
                  gridColumn: bloco.coluna + 1,
                  gridRow: `${bloco.linhaInicio} / span ${bloco.linhasOcupadas}`,
                }}
                className={`m-0.5 overflow-hidden rounded-md border px-1.5 py-1 text-xs leading-tight ${
                  CORES_STATUS[bloco.status] ?? CORES_STATUS.confirmado
                }`}
              >
                <div className="font-medium tabular-nums">
                  {bloco.horaInicio}
                </div>
                <div className="truncate">{bloco.cliente}</div>
                <div className="truncate opacity-80">{bloco.titulo}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs text-zinc-500">
        Cada faixa equivale a {MINUTOS_POR_LINHA} minutos. Horários no fuso{" "}
        {fusoHorario}.
      </p>
    </>
  );
}
