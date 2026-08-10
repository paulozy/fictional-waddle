import type { Metadata } from "next";
import { criarClienteServidor, exigirUsuario } from "@/lib/supabase/server";
import { normalizarSemana } from "@/lib/grade-semanal";
import { EditorSemana } from "./editor-semana";

export const metadata: Metadata = { title: "Horários" };

export default async function HorariosPage() {
  const usuarioId = await exigirUsuario();
  const supabase = await criarClienteServidor();

  const [{ data: horarios }, { data: perfil }] = await Promise.all([
    supabase
      .from("horarios_disponiveis")
      .select("dia_semana, hora_inicio, hora_fim")
      .eq("usuario_id", usuarioId)
      .order("dia_semana")
      .order("hora_inicio"),
    supabase
      .from("perfis")
      .select("fuso_horario")
      .eq("id", usuarioId)
      .single(),
  ]);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        Horário de funcionamento
      </h1>
      <p className="mt-2 max-w-[56ch] text-base leading-relaxed text-muted-foreground md:text-sm">
        O bot só oferece horários dentro dessas faixas. Duas faixas no mesmo dia
        é como se marca o intervalo do almoço.
      </p>

      <div className="mt-8">
        <EditorSemana
          inicial={normalizarSemana(horarios ?? [])}
          fusoHorario={perfil?.fuso_horario ?? "America/Sao_Paulo"}
        />
      </div>
    </>
  );
}
