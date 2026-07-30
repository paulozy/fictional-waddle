"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor, exigirUsuario } from "@/lib/supabase/server";
import { ErroEvolutionApi, enviarTexto } from "@/lib/evolution-api";
import { montarTextoCancelamentoPeloDono } from "@/lib/bot/mensagens-cancelamento";
import {
  cancelamentoSchema,
  errosDoFormulario,
  type EstadoFormulario,
} from "@/lib/validacao/agenda";

/**
 * Cancela um agendamento pelo painel, e avisa o cliente.
 *
 * Antes disto **nada no produto gravava `'cancelado'`**, e a consequência não era
 * cosmética: a constraint `agendamentos_sem_sobreposicao` é parcial em
 * `status = 'confirmado'` e a disponibilidade do bot filtra pelo mesmo valor, então
 * um agendamento morto bloqueava aquele horário para sempre — o cliente seguinte
 * ouvia "não tem vaga" e o dono não tinha como liberar.
 *
 * Por isso o cancelamento **nunca é revertido por falha de envio**: liberar o slot é
 * o efeito principal, e o aviso é o secundário.
 */
export async function cancelarAgendamento(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  // O proxy.ts não cobre Server Actions: cada uma revalida auth por si.
  const usuarioId = await exigirUsuario();

  const parsed = cancelamentoSchema.safeParse({
    id: formData.get("id") ?? "",
    motivo: formData.get("motivo") ?? "",
    observacao: formData.get("observacao") ?? "",
  });
  if (!parsed.success) return errosDoFormulario(parsed.error);

  const supabase = await criarClienteServidor();

  /**
   * Update **condicional** em `status = 'confirmado'`, com `select` na mesma
   * chamada.
   *
   * A cláusula de status é o que dá idempotência sem nenhuma infra: duplo clique,
   * duas abas ou reenvio do formulário afetam zero linhas na segunda vez, e o
   * cliente não recebe um segundo aviso de cancelamento. Sem ela, o `update` teria
   * sucesso de novo e mandaríamos a mensagem outra vez.
   *
   * O `.eq("usuario_id")` é redundante com a RLS e fica de propósito: é a mesma
   * defesa em profundidade que o resto do produto usa.
   */
  const { data: linhas, error } = await supabase
    .from("agendamentos")
    .update({
      status: "cancelado",
      cancelado_em: new Date().toISOString(),
      cancelado_por: "dono",
      cancelamento_motivo: parsed.data.motivo,
      cancelamento_observacao: parsed.data.observacao,
    })
    .eq("id", parsed.data.id)
    .eq("usuario_id", usuarioId)
    .eq("status", "confirmado")
    .select("data_hora, servicos(nome), clientes_finais(nome, remote_jid)");

  if (error) {
    console.error("falha ao cancelar agendamento", {
      usuario_id: usuarioId,
      codigo: error.code,
    });
    return { erro: "Não foi possível cancelar o agendamento." };
  }

  const agendamento = linhas?.[0];

  /**
   * Zero linhas não é erro do dono: é o agendamento já não estar cancelável — outra
   * aba cancelou, ou ele já foi concluído. Revalidar antes de sair faz a tela
   * refletir o estado real em vez de insistir que nada aconteceu.
   */
  if (!agendamento) {
    revalidatePath("/agendamentos");
    return { ok: true, aviso: "Este agendamento já não estava confirmado." };
  }

  const { data: perfil } = await supabase
    .from("perfis")
    .select("fuso_horario, nome_estabelecimento, status_conexao_whatsapp")
    .eq("id", usuarioId)
    .single();

  revalidatePath("/agendamentos");

  const destino = agendamento.clientes_finais?.remote_jid;

  if (!perfil || !destino) {
    return {
      ok: true,
      aviso: "Horário liberado na agenda. Não foi possível avisar o cliente.",
    };
  }

  // Nunca assumir que a instância está conectada.
  if (perfil.status_conexao_whatsapp !== "conectado") {
    return {
      ok: true,
      aviso:
        "Horário liberado na agenda. O WhatsApp está desconectado, então o " +
        "cliente não foi avisado — fale com ele por outro caminho.",
    };
  }

  try {
    await enviarTexto(
      // A instância é o próprio usuario_id, como no cron.
      usuarioId,
      destino,
      montarTextoCancelamentoPeloDono(
        agendamento,
        perfil.fuso_horario,
        perfil.nome_estabelecimento,
      ),
    );
  } catch (erro) {
    console.error("falha ao avisar cliente do cancelamento", {
      usuario_id: usuarioId,
      status: erro instanceof ErroEvolutionApi ? erro.status : null,
    });

    return {
      ok: true,
      aviso:
        "Horário liberado na agenda, mas o aviso ao cliente não saiu — " +
        "fale com ele por outro caminho.",
    };
  }

  return { ok: true };
}
