import { criarClienteServidor, exigirUsuario } from "@/lib/supabase/server";
import { nomeDoDia } from "@/lib/validacao/agenda";
import { FormularioHorario } from "./formulario-horario";
import { excluirHorario } from "./actions";

export const metadata = { title: "Horários — AgendaZap" };

/** Segunda primeiro, domingo por último — ordem de leitura de quem atende. */
const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0];

function semSegundos(hora: string): string {
  return hora.slice(0, 5);
}

export default async function HorariosPage() {
  const usuarioId = await exigirUsuario();
  const supabase = await criarClienteServidor();

  const { data: horarios } = await supabase
    .from("horarios_disponiveis")
    .select("id, dia_semana, hora_inicio, hora_fim")
    .eq("usuario_id", usuarioId)
    .order("dia_semana")
    .order("hora_inicio");

  const porDia = new Map<number, NonNullable<typeof horarios>>();
  for (const horario of horarios ?? []) {
    const doDia = porDia.get(horario.dia_semana) ?? [];
    doDia.push(horario);
    porDia.set(horario.dia_semana, doDia);
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        Horário de funcionamento
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Para marcar o intervalo do almoço, cadastre duas faixas no mesmo dia —
        por exemplo 09:00–12:00 e 13:00–18:00. O bot não oferece horário fora
        dessas faixas.
      </p>

      <div className="mt-6">
        <FormularioHorario />
      </div>

      <dl className="mt-6 divide-y divide-zinc-200 dark:divide-zinc-800">
        {ORDEM_SEMANA.map((dia) => {
          const faixas = porDia.get(dia) ?? [];

          return (
            <div
              key={dia}
              className="flex flex-wrap items-baseline gap-x-4 gap-y-2 py-3"
            >
              <dt className="w-24 font-medium capitalize">{nomeDoDia(dia)}</dt>
              <dd className="flex flex-wrap items-center gap-x-3 gap-y-2">
                {faixas.length === 0 ? (
                  <span className="text-sm text-zinc-400">fechado</span>
                ) : (
                  faixas.map((faixa) => (
                    <span
                      key={faixa.id}
                      className="inline-flex items-center gap-2 rounded-full bg-zinc-100 py-1 pl-3 pr-2 text-sm dark:bg-zinc-800"
                    >
                      {semSegundos(faixa.hora_inicio)}–
                      {semSegundos(faixa.hora_fim)}
                      <form action={excluirHorario}>
                        <input type="hidden" name="id" value={faixa.id} />
                        <button
                          type="submit"
                          aria-label={`Remover faixa ${semSegundos(faixa.hora_inicio)} às ${semSegundos(faixa.hora_fim)} de ${nomeDoDia(dia)}`}
                          className="text-zinc-500 hover:text-red-600 dark:hover:text-red-400"
                        >
                          ×
                        </button>
                      </form>
                    </span>
                  ))
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </>
  );
}
