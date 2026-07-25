"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor, exigirUsuario } from "@/lib/supabase/server";
import {
  errosDoFormulario,
  servicoSchema,
  type EstadoFormulario,
} from "@/lib/validacao/agenda";

function lerCampos(formData: FormData) {
  return {
    nome: formData.get("nome"),
    duracaoMinutos: formData.get("duracaoMinutos") ?? "",
    preco: formData.get("preco") ?? "",
  };
}

export async function criarServico(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  // O proxy.ts não cobre Server Actions: cada uma revalida auth por si.
  const usuarioId = await exigirUsuario();

  const parsed = servicoSchema.safeParse(lerCampos(formData));
  if (!parsed.success) return errosDoFormulario(parsed.error);

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("servicos").insert({
    usuario_id: usuarioId,
    nome: parsed.data.nome,
    duracao_minutos: parsed.data.duracaoMinutos,
    preco: parsed.data.preco,
  });

  if (error) return { erro: "Não foi possível salvar o serviço." };

  revalidatePath("/servicos");
  return { ok: true };
}

/**
 * Edita nome, duração e preço.
 *
 * Mexer na duração aqui **não** reescreve o passado: `agendamentos` guarda
 * `duracao_minutos` como snapshot justamente para que o histórico e o cálculo de
 * disponibilidade dos agendamentos já feitos continuem corretos. A duração nova
 * vale para os próximos.
 */
export async function editarServico(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const usuarioId = await exigirUsuario();

  const id = String(formData.get("id") ?? "");
  if (!id) return { erro: "Serviço não encontrado." };

  const parsed = servicoSchema.safeParse(lerCampos(formData));
  if (!parsed.success) return errosDoFormulario(parsed.error);

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("servicos")
    .update({
      nome: parsed.data.nome,
      duracao_minutos: parsed.data.duracaoMinutos,
      preco: parsed.data.preco,
    })
    .eq("id", id)
    // Redundante com a RLS, mas é o filtro que deixa o planner usar o índice.
    .eq("usuario_id", usuarioId);

  if (error) return { erro: "Não foi possível salvar as alterações." };

  revalidatePath("/servicos");
  return { ok: true };
}

/**
 * Ativa/desativa. Não existe exclusão de serviço de propósito: a FK
 * `agendamentos.servico_id` é cascade, então excluir apagaria silenciosamente o
 * histórico de agendamentos daquele serviço. Desativar tira da lista do bot e
 * preserva o passado.
 */
export async function alternarServico(formData: FormData) {
  const usuarioId = await exigirUsuario();

  const id = String(formData.get("id") ?? "");
  const ativar = formData.get("ativar") === "true";
  if (!id) return;

  const supabase = await criarClienteServidor();
  await supabase
    .from("servicos")
    .update({ ativo: ativar })
    .eq("id", id)
    .eq("usuario_id", usuarioId);

  revalidatePath("/servicos");
}
