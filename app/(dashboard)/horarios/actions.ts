"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor, exigirUsuario } from "@/lib/supabase/server";
import {
  conflitaComGrade,
  horarioSchema,
  primeiroErro,
  type EstadoFormulario,
} from "@/lib/validacao/agenda";

export async function criarHorario(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const usuarioId = await exigirUsuario();

  const parsed = horarioSchema.safeParse({
    diaSemana: formData.get("diaSemana"),
    horaInicio: formData.get("horaInicio"),
    horaFim: formData.get("horaFim"),
  });
  if (!parsed.success) return { erro: primeiroErro(parsed.error) };

  const supabase = await criarClienteServidor();

  const { data: existentes } = await supabase
    .from("horarios_disponiveis")
    .select("dia_semana, hora_inicio, hora_fim")
    .eq("usuario_id", usuarioId)
    .eq("dia_semana", parsed.data.diaSemana);

  if (conflitaComGrade(parsed.data, existentes ?? [])) {
    return {
      erro: "Essa faixa se sobrepõe a outra já cadastrada nesse dia.",
    };
  }

  const { error } = await supabase.from("horarios_disponiveis").insert({
    usuario_id: usuarioId,
    dia_semana: parsed.data.diaSemana,
    hora_inicio: parsed.data.horaInicio,
    hora_fim: parsed.data.horaFim,
  });

  if (error) return { erro: "Não foi possível salvar o horário." };

  revalidatePath("/horarios");
  return { ok: true };
}

/**
 * Excluir faixa da grade é seguro: `horarios_disponiveis` é configuração de
 * disponibilidade futura, nada referencia essas linhas. Agendamentos já feitos
 * não são afetados.
 */
export async function excluirHorario(formData: FormData) {
  const usuarioId = await exigirUsuario();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await criarClienteServidor();
  await supabase
    .from("horarios_disponiveis")
    .delete()
    .eq("id", id)
    .eq("usuario_id", usuarioId);

  revalidatePath("/horarios");
}
