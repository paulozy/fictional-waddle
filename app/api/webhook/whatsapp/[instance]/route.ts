import { addDays } from "date-fns";
import { assinaturaValida } from "@/lib/assinatura";
import { ErroEvolutionApi, enviarTexto, traduzirEstado } from "@/lib/evolution-api";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import {
  decidir,
  mensagemAgendamentoConfirmado,
  mensagemSlotIndisponivel,
  type ContextoConversa,
  type Decisao,
  type Efeito,
  type EstadoConversa,
  type EtapaSnapshot,
} from "@/lib/bot/engine-fluxo";
import {
  classificarEvento,
  extrairContagemQrCode,
  extrairEstadoConexao,
  extrairMensagem,
  extrairMotivoDesconexao,
  extrairNumeroDono,
  jidPermitido,
  lerListaPermitidos,
  type MensagemWebhook,
} from "@/lib/bot/webhook-payload";
import { hashNumeroWhatsapp } from "@/lib/trial-numero";

/**
 * Adaptador de I/O em volta da engine de fluxo.
 *
 * Toda a decisão de conversa é da engine pura (`lib/bot/engine-fluxo.ts`); aqui
 * só entra o que ela não pode fazer: autenticar a chamada, resolver o tenant,
 * ler e gravar estado, e falar com a Evolution API.
 *
 * Chega **sem sessão de usuário** (é a Evolution API chamando), então usa a
 * service role, que ignora RLS. Nesse contexto o `.eq("usuario_id", ...)` deixa
 * de ser otimização e passa a ser a única barreira entre tenants.
 */

/**
 * O processamento é inline (não `waitUntil`) para preservar o retry da Evolution
 * em caso de erro real. Com o timeout de 10s por chamada à Evolution API, 30s
 * cobre com folga o pior caso: 3 queries, uma RPC e duas mensagens.
 */
export const maxDuration = 30;

/** Horas de inatividade após as quais a conversa é considerada nova. */
const EXPIRACAO_HORAS = 6;

/**
 * Sempre 200, mesmo em caso ignorado.
 *
 * Devolver erro faria a Evolution API entrar em retry de algo que nunca vai dar
 * certo (instância desconhecida, mensagem de grupo, mídia sem texto).
 */
function ok(detalhe?: string) {
  return Response.json({ ok: true, detalhe: detalhe ?? null });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ instance: string }> },
) {
  // O `[instance]` da URL é um UUID, não um segredo: o header é a autenticação
  // real. Sem isso, qualquer um que descubra o id do usuário injeta mensagem.
  const segredoEsperado = process.env.WEBHOOK_SECRET;

  /**
   * Dois nomes de header aceitos, e o antigo é dívida com prazo.
   *
   * A configuração do webhook vive **do lado da Evolution**, gravada quando
   * `configurarWebhook` roda — e hoje isso só acontece dentro de `gerarQrCode`.
   * Uma instância já pareada continua mandando `x-agendazap-secret` (o nome
   * anterior ao rename) até o dono voltar à tela de QR code por algum outro
   * motivo. Trocar escritor e leitor no mesmo deploy derrubaria todo webhook
   * **em silêncio**: o bot pararia de responder e o painel continuaria dizendo
   * que a conexão está de pé.
   *
   * Remover o nome legado quando todas as instâncias tiverem reconectado — dá
   * para conferir chamando `configurarWebhook` em cada uma e vendo o header
   * atual em `fetchInstances`.
   */
  const segredoRecebido =
    request.headers.get("x-encaixaria-secret") ??
    request.headers.get("x-agendazap-secret");

  if (!segredoEsperado || segredoRecebido !== segredoEsperado) {
    return Response.json({ erro: "não autorizado" }, { status: 401 });
  }

  const { instance } = await params;
  const payload = await request.json().catch(() => null);

  const evento = classificarEvento(payload);
  if (evento === "ignorado") return ok("evento não tratado");

  const admin = criarClienteAdmin();

  const { data: perfil } = await admin
    .from("perfis")
    .select(
      "id, fuso_horario, passo_slot_minutos, antecedencia_minima_minutos, antecedencia_maxima_dias, status_conexao_whatsapp, status_assinatura, trial_expira_em, trial_bloqueado_em",
    )
    .eq("evolution_instance_name", instance)
    .maybeSingle();

  // Instância desconhecida ou forjada: 200 sem efeito nenhum.
  if (!perfil) return ok("instância desconhecida");

  /**
   * QR regerado. Não há o que persistir — guardar o código exigiria coluna nova
   * e migration, e a tela já busca o QR sob demanda. O valor aqui é observar que
   * o pareamento está vivo e que a contagem não está caminhando para o
   * `QRCODE_LIMIT`, quando o dono reclamar que "não conecta".
   */
  if (evento === "qrcode") {
    const regeracoes = extrairContagemQrCode(payload);
    console.info("qr code regerado", { usuario_id: perfil.id, regeracoes });
    return ok(`qrcode regerado (${regeracoes ?? "sem contagem"})`);
  }

  /**
   * Motivo da queda. **Só registra** — guardar exigiria coluna nova e
   * migration, e a tela ainda não usa a informação.
   *
   * O ganho é de suporte, e é imediato: quando o dono disser "não conecta", o
   * log responde se foi `401` (ele desvinculou o aparelho, precisa re-parear)
   * ou uma queda transitória que volta sozinha. Antes disto o app recebia o
   * `CONNECTION_UPDATE` de queda e nunca o porquê.
   *
   * Próximo passo natural, quando incomodar: persistir e diferenciar o texto
   * do box "WhatsApp desconectado" — hoje ele dá o mesmo conselho nos dois
   * casos, e num deles o conselho não resolve.
   */
  if (evento === "status") {
    const motivo = extrairMotivoDesconexao(payload);
    console.info("status da instância", {
      usuario_id: perfil.id,
      motivo_desconexao: motivo,
    });
    return ok(`status (${motivo ?? "sem motivo"})`);
  }

  if (evento === "conexao") {
    const estado = traduzirEstado(extrairEstadoConexao(payload) ?? undefined);
    await admin
      .from("perfis")
      .update({
        status_conexao_whatsapp:
          estado === "conectado" ? "conectado" : "desconectado",
      })
      .eq("id", perfil.id);

    // Pareou: é aqui, e só aqui, que o número do dono passa pelo nosso lado.
    if (estado === "conectado") {
      await reivindicarNumeroTrial(admin, perfil.id, payload);
    }

    return ok(`conexão: ${estado}`);
  }

  const mensagem = extrairMensagem(payload);
  if (!mensagem) return ok("mensagem ignorada");

  /**
   * Guarda de teste. Com `BOT_JIDS_PERMITIDOS` preenchida, o bot só atende
   * aqueles remetentes — permite parear um número pessoal sem despachar
   * "Qual serviço você gostaria de agendar?" para um contato de verdade.
   * Vazia (o default) atende todos, que é o comportamento de produção.
   */
  if (!jidPermitido(mensagem.remoteJid, lerListaPermitidos(process.env.BOT_JIDS_PERMITIDOS))) {
    return ok("remetente fora da lista de permissão");
  }

  // Recebemos mensagem, logo a instância está pareada — corrige status vencido
  // (webhook de conexão perdido deixaria o dashboard mentindo).
  if (perfil.status_conexao_whatsapp !== "conectado") {
    await admin
      .from("perfis")
      .update({ status_conexao_whatsapp: "conectado" })
      .eq("id", perfil.id);

    /**
     * E reivindica o número aqui também, pelo mesmo motivo que este bloco existe:
     * o `CONNECTION_UPDATE` **se perde** — é o que `verificarConexao` em
     * `lib/evolution-api.ts` diz por escrito, e é por isso que a tela de QR faz
     * polling. Se o evento de pareamento tiver caído (401 durante rotação do
     * `WEBHOOK_SECRET`, cold start, 500 no meio de um rollout), a Evolution não
     * reenvia, e sem este caminho o número nunca entraria no livro-caixa: a
     * conta atenderia clientes com o trial fora do registro, e o número
     * continuaria reivindicável pela próxima conta. Custa nada porque o `sender`
     * de topo, que `extrairNumeroDono` já lê, vem em todo webhook.
     */
    await reivindicarNumeroTrial(admin, perfil.id, payload);
  }

  /**
   * Gate de assinatura: trial expirado ou cancelada, o bot **silencia**.
   *
   * Silêncio e não mensagem de aviso: quem está do outro lado é o cliente do
   * salão, não o dono. Responder "o estabelecimento não pagou a assinatura"
   * exporia problema comercial nosso na frente do cliente dele e queimaria a
   * reputação de quem nos paga. Sem resposta, o comportamento volta a ser o de
   * antes do produto existir — o dono responde na mão — e quem vê o aviso é o
   * dono, no banner do dashboard.
   *
   * Depois da correção de `status_conexao_whatsapp` de propósito: os eventos de
   * conexão e QR code seguem sendo processados mesmo bloqueado, senão o painel
   * passaria a mentir sobre a conexão justamente para quem precisa resolver a
   * pendência.
   */
  if (!assinaturaValida(perfil, new Date())) {
    console.info("bot silenciado: assinatura inválida", {
      usuario_id: perfil.id,
      status_assinatura: perfil.status_assinatura,
    });
    return ok("assinatura inválida");
  }

  return processarMensagem(admin, perfil, instance, mensagem);
}

/**
 * Registra no livro-caixa que este número consumiu um trial, e bloqueia a conta
 * se o número pertence a outra (`supabase/migrations/20260725121600_*`).
 *
 * Fail-safe **permissivo**, ao contrário do gate de assinatura: pepper ausente,
 * `wuid` ausente ou RPC com erro apenas registram e seguem. O inverso é de
 * propósito — aqui a falha é nossa (env var não configurada, payload de uma
 * versão diferente da Evolution), e o custo de errar para o lado permissivo é um
 * trial reciclável, enquanto errar para o lado restritivo bloquearia todo mundo
 * que conecta, inclusive quem paga.
 *
 * Nunca loga o número nem o hash: identificar o tenant já basta para depurar.
 */
async function reivindicarNumeroTrial(
  admin: ClienteAdmin,
  usuarioId: string,
  payload: unknown,
) {
  const pepper = process.env.TRIAL_HASH_PEPPER;
  if (!pepper) {
    // Não usa `envObrigatoria`: a ausência aqui é decisão de não bloquear, e não
    // um erro que deva interromper a atualização de conexão.
    console.error("TRIAL_HASH_PEPPER ausente: número não reivindicado", {
      usuario_id: usuarioId,
    });
    return;
  }

  const dono = extrairNumeroDono(payload);
  if (!dono) {
    console.warn("conexão sem número do dono no payload", {
      usuario_id: usuarioId,
    });
    return;
  }

  /**
   * O dono deveria chegar sempre como telefone: o `wuid` da Evolution vem de
   * `client.user.id`, que é `@s.whatsapp.net`. Se um upgrade passar a reportar
   * `@lid`, a chave do livro-caixa muda de espaço sem mudar de forma (os dois
   * viram só dígitos) e a proteção entre contas dos números já reivindicados
   * cairia a zero — silenciosamente, se não fosse este aviso. Continuamos
   * reivindicando: desligar a proteção seria pior que protegê-la parcialmente.
   */
  if (dono.dominio && dono.dominio !== "s.whatsapp.net") {
    console.warn("número do dono em formato inesperado: livro-caixa em risco", {
      usuario_id: usuarioId,
      dominio: dono.dominio,
    });
  }

  const { data, error } = await admin.rpc("reivindicar_numero_trial", {
    p_usuario_id: usuarioId,
    p_numero_hash: hashNumeroWhatsapp(dono.numero, pepper),
  });

  if (error) {
    console.error("falha ao reivindicar número do trial", {
      usuario_id: usuarioId,
      codigo: error.code,
    });
    return;
  }

  if (data === "bloqueado") {
    console.warn("trial bloqueado: número já usado por outra conta", {
      usuario_id: usuarioId,
    });
  }
}

type ClienteAdmin = ReturnType<typeof criarClienteAdmin>;
type Perfil = {
  id: string;
  fuso_horario: string;
  passo_slot_minutos: number;
  antecedencia_minima_minutos: number;
  antecedencia_maxima_dias: number;
};

async function processarMensagem(
  admin: ClienteAdmin,
  perfil: Perfil,
  instancia: string,
  mensagem: MensagemWebhook,
) {
  const { data: linha } = await admin
    .from("conversas_estado")
    .select(
      "id, etapa_atual_id, fluxo_snapshot, dados_temporarios, ultima_mensagem_id, versao, atualizado_em",
    )
    .eq("usuario_id", perfil.id)
    .eq("remote_jid", mensagem.remoteJid)
    .maybeSingle();

  // Idempotência: retry da Evolution ou reemissão do Baileys trazem o mesmo
  // `data.key.id`. Processar de novo repetiria a pergunta ou avançaria em falso.
  if (linha && linha.ultima_mensagem_id === mensagem.id) {
    return ok("mensagem duplicada");
  }

  const contexto = await montarContexto(admin, perfil, mensagem.remoteJid);

  const estado: EstadoConversa | null = linha?.etapa_atual_id
    ? {
        etapaAtualId: linha.etapa_atual_id,
        fluxoSnapshot: (linha.fluxo_snapshot ?? []) as EtapaSnapshot[],
        dadosTemporarios: (linha.dados_temporarios ?? {}) as Record<
          string,
          unknown
        >,
        atualizadoEm: new Date(linha.atualizado_em),
      }
    : null;

  const decisao = decidir(contexto, estado, {
    id: mensagem.id,
    texto: mensagem.texto,
    pushName: mensagem.pushName,
  });

  /**
   * O compare-and-set vem ANTES de qualquer efeito.
   *
   * Se o efeito rodasse primeiro, duas entregas simultâneas da mesma resposta
   * "confirmar" passariam as duas pela checagem de duplicata (ambas leem o
   * `ultima_mensagem_id` anterior) e as duas chamariam `confirmar_agendamento`:
   * uma gravaria e a outra levaria 23P01 — e se a vencedora do CAS fosse a que
   * levou 23P01, o cliente ouviria "esse horário acabou de ser reservado"
   * enquanto o agendamento dele existe confirmado na agenda do dono.
   */
  const persistiu = await persistir(admin, perfil.id, mensagem, linha, decisao);
  if (!persistiu) return ok("corrida perdida");

  const mensagens = [...decisao.mensagens];

  for (const efeito of decisao.efeitos) {
    const texto = await executarEfeito(admin, perfil, contexto, mensagem, efeito);

    /**
     * String vazia = o efeito deu certo e a mensagem já veio da engine, que é o caso
     * do cancelamento (só ela tem o horário formatado no fuso). Empurrar vazio faria
     * a Evolution receber um `text` em branco.
     */
    if (texto) mensagens.push(texto);
  }

  await enviarComTolerancia(instancia, mensagem.remoteJid, mensagens);

  return ok();
}

/**
 * Envia sem deixar a conversa muda.
 *
 * Falha de envio **não** pode virar 500: o estado já avançou e gravou o
 * `ultima_mensagem_id`, então a reentrega da Evolution cairia na checagem de
 * duplicata e a conversa ficaria sem resposta até expirar em 6h. Preferimos
 * registrar o erro e seguir — a próxima mensagem do cliente reapresenta a etapa.
 */
async function enviarComTolerancia(
  instancia: string,
  destino: string,
  mensagens: string[],
) {
  for (const texto of mensagens) {
    try {
      await enviarTexto(instancia, destino, texto);
    } catch (erro) {
      console.error("falha ao enviar mensagem do bot", {
        instancia,
        status: erro instanceof ErroEvolutionApi ? erro.status : null,
      });
    }
  }
}

/**
 * Monta o mundo exterior que a engine precisa, tudo em uma leitura.
 *
 * Inclui a matéria-prima da disponibilidade (grade e agendamentos do horizonte)
 * em vez dos horários já calculados — assim a engine compõe o cálculo de forma
 * pura, sem precisar de uma segunda ida ao banco depois de saber qual serviço o
 * cliente escolheu.
 */
async function montarContexto(
  admin: ClienteAdmin,
  perfil: Perfil,
  remoteJid: string,
): Promise<ContextoConversa> {
  const agora = new Date();
  const fimDoHorizonte = addDays(agora, perfil.antecedencia_maxima_dias + 1);

  const [etapas, servicos, grade, agendamentos] = await Promise.all([
    admin
      .from("fluxo_etapas")
      .select(
        "id, ordem, tipo, pergunta_texto, opcoes, campo_destino, obrigatorio",
      )
      .eq("usuario_id", perfil.id)
      .eq("ativo", true)
      .order("ordem")
      .order("id"),
    admin
      .from("servicos")
      .select("id, nome, duracao_minutos, preco")
      .eq("usuario_id", perfil.id)
      .eq("ativo", true)
      .order("nome"),
    admin
      .from("horarios_disponiveis")
      .select("dia_semana, hora_inicio, hora_fim")
      .eq("usuario_id", perfil.id),
    admin
      .from("agendamentos")
      /**
       * `id`, serviço e o JID do cliente entram para alimentar o fluxo de
       * cancelamento. É a **mesma** query da disponibilidade, com o select maior, em
       * vez de uma segunda ida ao banco: os agendamentos do interlocutor são um
       * subconjunto destes (o horizonte de reserva é o mesmo), então filtrar em
       * memória custa nada e economiza um round-trip em toda mensagem.
       */
      .select("id, data_hora, data_hora_fim, servicos(nome), clientes_finais(remote_jid)")
      .eq("usuario_id", perfil.id)
      .eq("status", "confirmado")
      // Filtra pelo FIM, não pelo início: um serviço de 2h que começou 10:00 e
      // termina 12:00 precisa continuar contando como ocupado às 10:30, senão o
      // bot oferece um horário que colide e o cliente cai em 23P01 sem saída.
      .gte("data_hora_fim", agora.toISOString())
      .lt("data_hora", fimDoHorizonte.toISOString()),
  ]);

  return {
    agora,
    fusoHorario: perfil.fuso_horario,
    passoSlotMinutos: perfil.passo_slot_minutos,
    antecedenciaMinimaMinutos: perfil.antecedencia_minima_minutos,
    antecedenciaMaximaDias: perfil.antecedencia_maxima_dias,
    etapasAtivas: (etapas.data ?? []) as EtapaSnapshot[],
    servicos: servicos.data ?? [],
    grade: grade.data ?? [],
    ocupados: (agendamentos.data ?? []).map((a) => ({
      inicio: new Date(a.data_hora),
      fim: new Date(a.data_hora_fim),
    })),
    /**
     * Só os deste interlocutor. A identidade é o `remote_jid` — nunca o telefone,
     * que pode não existir em JID `@lid`.
     */
    agendamentosDoCliente: (agendamentos.data ?? [])
      .filter((a) => a.clientes_finais?.remote_jid === remoteJid)
      .map((a) => ({
        id: a.id,
        dataHora: new Date(a.data_hora),
        servicoNome: a.servicos?.nome ?? null,
      })),
    expiracaoHoras: EXPIRACAO_HORAS,
  };
}

/** Aplica o efeito no banco e devolve a mensagem que o cliente deve receber. */
async function executarEfeito(
  admin: ClienteAdmin,
  perfil: Perfil,
  contexto: ContextoConversa,
  mensagem: MensagemWebhook,
  efeito: Efeito,
): Promise<string> {
  if (efeito.tipo === "cancelar_agendamento") {
    return cancelarPeloCliente(admin, perfil, efeito.agendamentoId);
  }

  const servico = contexto.servicos.find((s) => s.id === efeito.servicoId);

  const { error } = await admin.rpc("confirmar_agendamento", {
    p_usuario_id: perfil.id,
    p_remote_jid: mensagem.remoteJid,
    // O Postgres não expressa nulabilidade em parâmetro de função, então o
    // gerador de tipos do Supabase emite `string` para ambos. A RPC aceita null
    // de propósito: telefone não existe em JID `@lid`, e pushName pode faltar —
    // ela usa `coalesce` para não sobrescrever dado já conhecido.
    p_telefone: mensagem.telefone as unknown as string,
    p_nome_cliente: efeito.nomeCliente as unknown as string,
    p_servico_id: efeito.servicoId,
    p_data_hora: efeito.dataHora.toISOString(),
    p_duracao_minutos: efeito.duracaoMinutos,
    p_respostas_extras: efeito.respostasExtras as never,
  });

  if (!error) {
    return mensagemAgendamentoConfirmado(
      efeito,
      servico?.nome ?? "seu serviço",
      contexto.fusoHorario,
    );
  }

  // 23P01 = violação da constraint anti-sobreposição. Não é erro genérico: é o
  // caso real de outro cliente ter fechado o mesmo horário durante a conversa.
  if (error.code === "23P01") return mensagemSlotIndisponivel();

  console.error("falha ao confirmar agendamento", {
    usuario_id: perfil.id,
    codigo: error.code,
  });

  return (
    "Tive um problema para registrar seu agendamento. " +
    "Pode tentar de novo em instantes?"
  );
}

/**
 * Cancela a pedido do cliente.
 *
 * O `update` é **condicional em `status = 'confirmado'`**, e é isso que o torna
 * idempotente por si — independente do compare-and-set sobre `versao`. Zero linhas
 * significa que o horário já não estava cancelável (o dono cancelou antes, ou já foi
 * concluído), e aí o cliente ouve isso em vez de uma confirmação falsa.
 *
 * `.eq("usuario_id")` não é redundância: a service role **ignora RLS**, então este
 * filtro é a única barreira entre tenants neste caminho.
 *
 * Erro de banco vira mensagem, nunca throw: um 500 aqui faria a Evolution reentregar o
 * mesmo webhook indefinidamente, com a conversa travada por 6h.
 */
async function cancelarPeloCliente(
  admin: ClienteAdmin,
  perfil: Perfil,
  agendamentoId: string,
): Promise<string> {
  const { data, error } = await admin
    .from("agendamentos")
    .update({
      status: "cancelado",
      cancelado_em: new Date().toISOString(),
      cancelado_por: "cliente",
      // Motivo fica nulo de propósito: não perguntamos ao cliente. A CHECK do banco
      // só exige motivo quando quem cancela é o dono.
    })
    .eq("id", agendamentoId)
    .eq("usuario_id", perfil.id)
    .eq("status", "confirmado")
    .select("id");

  if (error) {
    console.error("falha ao cancelar agendamento pelo cliente", {
      usuario_id: perfil.id,
      codigo: error.code,
    });

    return (
      "Tive um problema para cancelar seu horário. " +
      "Pode tentar de novo em instantes?"
    );
  }

  if (!data || data.length === 0) {
    return (
      "Esse horário já não estava confirmado, então não há o que cancelar. " +
      "Se quiser marcar outro, é só mandar uma mensagem."
    );
  }

  // A mensagem de sucesso vem da engine, junto da decisão — aqui só confirmamos que
  // o efeito aconteceu. String vazia não é enviada.
  return "";
}

type LinhaConversa = {
  id: string;
  versao: number;
} | null;

/**
 * Persiste o novo estado da conversa, ou **zera** a conversa quando ela terminou.
 *
 * Zerar (`etapa_atual_id = null`, dados e snapshot vazios) em vez de apagar a
 * linha é deliberado: a linha é onde vive `ultima_mensagem_id`. Apagando-a, a
 * reentrega da última mensagem pela Evolution não encontraria a chave de
 * idempotência, a engine trataria como conversa nova e o cliente receberia um
 * "Qual serviço você gostaria de agendar?" logo depois de confirmar. A engine já
 * lê `etapa_atual_id` nulo como conversa nova, então o efeito prático é o mesmo.
 *
 * Devolve `false` quando o compare-and-set não afetou linha nenhuma — sinal de
 * que outra requisição do mesmo telefone avançou a conversa primeiro. Um único
 * UPDATE condicional resolve corrida e idempotência juntas, porque o
 * `supabase-js` não tem transação client-side nem `select ... for update`.
 */
async function persistir(
  admin: ClienteAdmin,
  usuarioId: string,
  mensagem: MensagemWebhook,
  linha: LinhaConversa,
  decisao: Decisao,
): Promise<boolean> {
  const alvo = decisao.estado;

  if (!linha) {
    // Conversa nova. O unique (usuario_id, remote_jid) faz a segunda requisição
    // simultânea falhar aqui — que é justamente o comportamento desejado.
    const { error } = await admin.from("conversas_estado").insert({
      usuario_id: usuarioId,
      remote_jid: mensagem.remoteJid,
      telefone_cliente: mensagem.telefone,
      etapa_atual_id: alvo?.etapaAtualId ?? null,
      fluxo_snapshot: (alvo?.fluxoSnapshot ?? []) as never,
      dados_temporarios: (alvo?.dadosTemporarios ?? {}) as never,
      ultima_mensagem_id: mensagem.id,
      versao: 1,
    });

    return !error;
  }

  const { data } = await admin
    .from("conversas_estado")
    .update({
      etapa_atual_id: alvo?.etapaAtualId ?? null,
      fluxo_snapshot: (alvo?.fluxoSnapshot ?? []) as never,
      dados_temporarios: (alvo?.dadosTemporarios ?? {}) as never,
      ultima_mensagem_id: mensagem.id,
      telefone_cliente: mensagem.telefone,
      versao: linha.versao + 1,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", linha.id)
    .eq("usuario_id", usuarioId)
    // A cláusula que faz o compare-and-set: zero linhas afetadas significa que
    // outra requisição do mesmo telefone já avançou a conversa.
    .eq("versao", linha.versao)
    .select("id");

  return (data?.length ?? 0) > 0;
}
