"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor, exigirUsuario } from "@/lib/supabase/server";
import type { TipoEtapa } from "@/lib/bot/engine-fluxo";
import {
  etapaCustomizadaSchema,
  opcoesDeTextoLivre,
  perguntaTextoSchema,
  validarFluxo,
  type EtapaParaValidar,
} from "@/lib/validacao/fluxo";
import { primeiroErro, type EstadoFormulario } from "@/lib/validacao/agenda";

async function carregarEtapas(usuarioId: string) {
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("fluxo_etapas")
    .select("id, ordem, tipo, campo_destino, ativo")
    .eq("usuario_id", usuarioId)
    .order("ordem")
    .order("id");

  return data ?? [];
}

/**
 * Reordena o fluxo inteiro.
 *
 * Valida no servidor mesmo já validando na UI: a Server Action é a autoridade, e
 * o `proxy.ts` não cobre Server Actions.
 */
export async function reordenarEtapas(
  ids: string[],
): Promise<EstadoFormulario> {
  const usuarioId = await exigirUsuario();
  const etapas = await carregarEtapas(usuarioId);

  const porId = new Map(etapas.map((e) => [e.id, e]));
  const propostas = ids
    .map((id) => porId.get(id))
    .filter((e): e is NonNullable<typeof e> => e !== undefined);

  if (propostas.length !== etapas.length) {
    return { erro: "A lista de etapas não corresponde ao fluxo atual." };
  }

  const validacao = validarFluxo(propostas as EtapaParaValidar[]);
  if (!validacao.valido) return { erro: validacao.erro };

  const supabase = await criarClienteServidor();
  // RPC porque precisa regravar todas as linhas numa transação; o índice denso é
  // regravado em bloco, sem rank fracionário.
  const { error } = await supabase.rpc("reordenar_fluxo_etapas", {
    p_ids: ids,
  });

  if (error) return { erro: "Não foi possível salvar a nova ordem." };

  revalidatePath("/fluxo-conversa");
  return { ok: true };
}

export async function adicionarEtapa(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const usuarioId = await exigirUsuario();

  const tipo = String(formData.get("tipo") ?? "") as TipoEtapa;
  const opcoesTexto = String(formData.get("opcoes") ?? "");

  const parsed = etapaCustomizadaSchema.safeParse({
    tipo,
    pergunta_texto: formData.get("pergunta_texto") ?? "",
    campo_destino: formData.get("campo_destino") ?? "",
    obrigatorio: formData.get("obrigatorio") === "on",
    opcoes:
      tipo === "escolha_unica" ? opcoesDeTextoLivre(opcoesTexto) : undefined,
  });

  if (!parsed.success) return { erro: primeiroErro(parsed.error) };

  const etapas = await carregarEtapas(usuarioId);

  if (etapas.some((e) => e.campo_destino === parsed.data.campo_destino)) {
    return {
      erro: `Já existe uma pergunta gravando no campo "${parsed.data.campo_destino}".`,
    };
  }

  // Entra imediatamente antes da confirmação, que precisa ser a última.
  const confirmacao = etapas.find((e) => e.tipo === "confirmacao");
  const ordemNova = confirmacao ? confirmacao.ordem : etapas.length + 1;

  const supabase = await criarClienteServidor();

  if (confirmacao) {
    // Abre espaço empurrando a confirmação para o fim.
    await supabase
      .from("fluxo_etapas")
      .update({ ordem: ordemNova + 1 })
      .eq("id", confirmacao.id)
      .eq("usuario_id", usuarioId);
  }

  const { error } = await supabase.from("fluxo_etapas").insert({
    usuario_id: usuarioId,
    ordem: ordemNova,
    tipo: parsed.data.tipo,
    pergunta_texto: parsed.data.pergunta_texto,
    campo_destino: parsed.data.campo_destino,
    obrigatorio: parsed.data.obrigatorio,
    opcoes:
      parsed.data.tipo === "escolha_unica"
        ? (parsed.data.opcoes as never)
        : null,
  });

  if (error) {
    return {
      erro:
        error.code === "23505"
          ? "Já existe uma pergunta com esse nome de campo."
          : "Não foi possível adicionar a etapa.",
    };
  }

  revalidatePath("/fluxo-conversa");
  return { ok: true };
}

export async function editarPergunta(
  formData: FormData,
): Promise<EstadoFormulario> {
  const usuarioId = await exigirUsuario();

  const id = String(formData.get("id") ?? "");
  const parsed = perguntaTextoSchema.safeParse(
    formData.get("pergunta_texto") ?? "",
  );
  if (!id) return { erro: "Etapa não informada." };
  if (!parsed.success) return { erro: primeiroErro(parsed.error) };

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("fluxo_etapas")
    .update({ pergunta_texto: parsed.data })
    .eq("id", id)
    .eq("usuario_id", usuarioId);

  if (error) return { erro: "Não foi possível salvar o texto." };

  revalidatePath("/fluxo-conversa");
  return { ok: true };
}

/**
 * Remove uma etapa customizada. Etapas de sistema não podem ser removidas — a
 * engine depende delas para calcular disponibilidade e confirmar.
 */
export async function removerEtapa(formData: FormData) {
  const usuarioId = await exigirUsuario();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await criarClienteServidor();
  const { data: etapa } = await supabase
    .from("fluxo_etapas")
    .select("tipo")
    .eq("id", id)
    .eq("usuario_id", usuarioId)
    .maybeSingle();

  if (!etapa || etapa.tipo === "servico" || etapa.tipo === "horario" ||
      etapa.tipo === "confirmacao") {
    return;
  }

  await supabase
    .from("fluxo_etapas")
    .delete()
    .eq("id", id)
    .eq("usuario_id", usuarioId);

  // Renumera para manter a ordem densa.
  const restantes = await carregarEtapas(usuarioId);
  await supabase.rpc("reordenar_fluxo_etapas", {
    p_ids: restantes.map((e) => e.id),
  });

  revalidatePath("/fluxo-conversa");
}
