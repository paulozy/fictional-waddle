import { intervaloDoDiaSeguinte } from "@/lib/bot/disponibilidade";
import { ErroEvolutionApi, enviarTexto } from "@/lib/evolution-api";
import { criarClienteAdmin } from "@/lib/supabase/admin";

/**
 * Lembrete um dia antes, disparado pelo Vercel Cron (ver `vercel.json`).
 *
 * Roda sem sessão de usuário, então usa a service role — e por isso todo query
 * filtra `usuario_id` explicitamente: sem RLS, esse filtro é a única barreira
 * entre tenants.
 */

/**
 * Teto de duração da função. O default da Vercel é curto demais para varrer
 * vários tenants, e ser morto no meio deixa reservas de lembrete penduradas
 * (recuperáveis, mas só na execução do dia seguinte).
 */
export const maxDuration = 300;

/** Evita que um tenant com agenda gigante estoure o tempo da função. */
const MAX_LEMBRETES_POR_EXECUCAO = 500;

type Resumo = {
  enviados: number;
  ignorados: number;
  erros: number;
  tenants: number;
};

export async function GET(request: Request) {
  // A Vercel envia este header automaticamente nas invocações de cron.
  const esperado = process.env.CRON_SECRET;
  if (
    !esperado ||
    request.headers.get("authorization") !== `Bearer ${esperado}`
  ) {
    return Response.json({ erro: "não autorizado" }, { status: 401 });
  }

  const admin = criarClienteAdmin();
  const agora = new Date();

  const { data: perfis, error } = await admin
    .from("perfis")
    .select("id, fuso_horario, status_conexao_whatsapp, nome_estabelecimento");

  if (error) {
    console.error("cron: falha ao listar perfis", { codigo: error.code });
    return Response.json({ erro: "falha ao listar perfis" }, { status: 500 });
  }

  const resumo: Resumo = {
    enviados: 0,
    ignorados: 0,
    erros: 0,
    tenants: perfis?.length ?? 0,
  };

  for (const perfil of perfis ?? []) {
    /**
     * Isolamento por tenant é obrigatório aqui.
     *
     * Sem o try/catch, um único perfil com `fuso_horario` inválido faz o
     * `TZDate` lançar e derruba o handler inteiro — os tenants seguintes na
     * lista não receberiam lembrete nenhum naquele dia, e o Vercel Cron não
     * reexecuta. Seria o mecanismo de redução de no-show morrendo em silêncio
     * por causa de um campo de um cliente.
     */
    try {
      await processarTenant(admin, perfil, agora, resumo);
    } catch (erro) {
      console.error("cron: tenant falhou, seguindo para os demais", {
        usuario_id: perfil.id,
        erro: erro instanceof Error ? erro.message : String(erro),
      });
      resumo.erros += 1;
    }
  }

  return Response.json({ ok: true, ...resumo });
}

type ClienteAdmin = ReturnType<typeof criarClienteAdmin>;
type Perfil = {
  id: string;
  fuso_horario: string;
  status_conexao_whatsapp: string;
  nome_estabelecimento: string | null;
};

async function processarTenant(
  admin: ClienteAdmin,
  perfil: Perfil,
  agora: Date,
  resumo: Resumo,
) {
  // Cada estabelecimento tem seu próprio "amanhã": a janela é calculada no fuso
  // do negócio, não no do runtime (que é UTC na Vercel).
  const janela = intervaloDoDiaSeguinte(agora, perfil.fuso_horario);

  const { data: agendamentos, error } = await admin
    .from("agendamentos")
    .select(
      "id, data_hora, servicos(nome), clientes_finais(nome, remote_jid)",
    )
    .eq("usuario_id", perfil.id)
    .eq("status", "confirmado")
    .gte("data_hora", janela.inicio.toISOString())
    .lt("data_hora", janela.fim.toISOString())
    .order("data_hora")
    .limit(MAX_LEMBRETES_POR_EXECUCAO);

  if (error) {
    console.error("cron: falha ao buscar agendamentos", {
      usuario_id: perfil.id,
      codigo: error.code,
    });
    resumo.erros += 1;
    return;
  }

  if ((agendamentos?.length ?? 0) === MAX_LEMBRETES_POR_EXECUCAO) {
    // Truncamento silencioso leria como "cobri tudo" quando não cobriu.
    console.warn("cron: limite de lembretes atingido, houve truncamento", {
      usuario_id: perfil.id,
      limite: MAX_LEMBRETES_POR_EXECUCAO,
    });
  }

  for (const agendamento of agendamentos ?? []) {
    await enviarLembrete(admin, perfil, agendamento, resumo);
  }
}

type AgendamentoComRelacoes = {
  id: string;
  data_hora: string;
  servicos: { nome: string } | null;
  clientes_finais: { nome: string | null; remote_jid: string } | null;
};

async function enviarLembrete(
  admin: ClienteAdmin,
  perfil: Perfil,
  agendamento: unknown,
  resumo: Resumo,
) {
  const dados = agendamento as AgendamentoComRelacoes;
  const destino = dados.clientes_finais?.remote_jid;

  if (!destino) {
    console.error("cron: agendamento sem JID de destino", {
      agendamento_id: dados.id,
    });
    resumo.erros += 1;
    return;
  }

  /**
   * Reserva ANTES de enviar. A RPC insere em `log_envio` com
   * `on conflict do nothing` sobre um índice único parcial: se devolver null,
   * outra execução (redeploy, retry da Vercel) já cuidou deste lembrete e o
   * cliente não pode receber duas vezes.
   */
  const { data: logId, error: erroReserva } = await admin.rpc(
    "registrar_lembrete_pendente",
    { p_agendamento_id: dados.id, p_usuario_id: perfil.id },
  );

  if (erroReserva) {
    console.error("cron: falha ao reservar lembrete", {
      agendamento_id: dados.id,
      codigo: erroReserva.code,
    });
    resumo.erros += 1;
    return;
  }

  if (!logId) {
    resumo.ignorados += 1;
    return;
  }

  // Nunca assumir que a instância está conectada.
  if (perfil.status_conexao_whatsapp !== "conectado") {
    await marcarErro(admin, perfil.id, logId, "whatsapp desconectado");
    resumo.erros += 1;
    return;
  }

  try {
    await enviarTexto(
      perfil.id,
      destino,
      montarTextoLembrete(dados, perfil.fuso_horario),
    );

    await admin
      .from("log_envio")
      .update({ status_entrega: "enviado" })
      .eq("id", logId)
      .eq("usuario_id", perfil.id);

    resumo.enviados += 1;
  } catch (erro) {
    const detalhe =
      erro instanceof ErroEvolutionApi
        ? `evolution ${erro.status}${erro.licencaAusente ? " (licença ausente)" : ""}`
        : "falha inesperada no envio";

    await marcarErro(admin, perfil.id, logId, detalhe);
    resumo.erros += 1;
  }
}

/**
 * O filtro por `usuario_id` é redundante com o `id` (que acabou de ser criado
 * para este tenant), mas a service role ignora RLS e a regra do projeto é que
 * todo query nesse contexto declare o tenant — uniformidade aqui vale mais que
 * economizar uma cláusula.
 */
async function marcarErro(
  admin: ClienteAdmin,
  usuarioId: string,
  logId: string,
  detalhe: string,
) {
  await admin
    .from("log_envio")
    .update({ status_entrega: "erro", erro_detalhe: detalhe })
    .eq("id", logId)
    .eq("usuario_id", usuarioId);
}

export function montarTextoLembrete(
  agendamento: {
    data_hora: string;
    servicos: { nome: string } | null;
    clientes_finais: { nome: string | null } | null;
  },
  fusoHorario: string,
): string {
  const quando = new Intl.DateTimeFormat("pt-BR", {
    timeZone: fusoHorario,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(agendamento.data_hora));

  const saudacao = agendamento.clientes_finais?.nome
    ? `Oi, ${agendamento.clientes_finais.nome}! `
    : "Oi! ";

  const servico = agendamento.servicos?.nome
    ? ` de ${agendamento.servicos.nome}`
    : "";

  return (
    `${saudacao}Passando para lembrar do seu agendamento${servico}.\n\n` +
    `${quando}\n\n` +
    "Até logo!"
  );
}
