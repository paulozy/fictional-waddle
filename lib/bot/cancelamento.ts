import {
  CHAVE_OPCOES,
  lerIndice,
  listaNumerada,
  normalizar,
  type DadosTemporarios,
} from "./conversa-comum";
import type {
  ContextoConversa,
  Decisao,
  EstadoConversa,
  MensagemRecebida,
} from "./engine-fluxo";

/**
 * Cancelamento de agendamento pelo cliente, no WhatsApp.
 *
 * **Não é uma etapa do roteiro**, e por isso não vive em `fluxo_etapas` nem em
 * `TipoEtapa`. Cancelar é intenção fora de banda: não tem posição fixa na sequência,
 * o dono não deveria poder reordená-la ou desativá-la, e ela não coleta resposta para
 * `respostas_extras`. Modelar como etapa quebraria quatro coisas de uma vez — o índice
 * único de etapa de sistema, o seed do trigger de novo usuário, a regra de
 * `reordenar_fluxo_etapas` que exige a lista completa, e a semântica do builder.
 *
 * Puro e síncrono como a engine: recebe o mundo por parâmetro e devolve o que fazer.
 *
 * O import de `engine-fluxo` é **só de tipos** (`import type`), que o TypeScript apaga
 * na compilação — então não há ciclo em runtime, mesmo a engine chamando este módulo.
 * Os valores compartilhados vêm de `conversa-comum`.
 */

/**
 * Id reservado para marcar "esta conversa está no fluxo de cancelamento".
 *
 * `conversas_estado.etapa_atual_id` é `uuid`, então o idioma `"__acao:*"` das
 * sentinelas de opção **não serve aqui**: uma string não-UUID levanta `22P02` no
 * PostgREST, que sem tratamento vira 500 — e a Evolution reentrega o mesmo webhook
 * indefinidamente, com a conversa travada até expirar em 6h.
 *
 * A não-colisão com etapa real é **garantida, não probabilística**: o default de
 * `fluxo_etapas.id` é `gen_random_uuid()`, que sempre produz UUID versão 4, e o nibble
 * de versão deste literal é `0`. E a ausência de FK em `etapa_atual_id` — deliberada
 * na migration — é o que permite gravá-lo sem uma linha em `fluxo_etapas`.
 */
export const ID_ETAPA_CANCELAMENTO = "00000000-0000-0000-0000-0000000000c1";

/** Discriminador explícito do fluxo, legível num dump do estado. */
const CHAVE_FLUXO = "__fluxo";
const FLUXO_CANCELAMENTO = "cancelamento";

/**
 * Fase, **explícita**.
 *
 * Derivar a fase do formato das strings em `__opcoes_oferecidas` seria type-tag
 * implícita dentro de string — o erro que a etapa `horario` já pagou uma vez.
 */
const CHAVE_FASE = "__cancelamento_fase";
const CHAVE_CANCELAR_ID = "__cancelar_id";

type Fase = "entrada" | "escolher" | "confirmar";

const ACAO_AGENDAR = "__acao:agendar";
const ACAO_CANCELAR = "__acao:cancelar";
const ACAO_CONFIRMAR = "__acao:cancelar_confirma";
const ACAO_MANTER = "__acao:manter";

/**
 * Teto da lista de agendamentos do cliente.
 *
 * Um cliente final com mais de cinco horários marcados ao mesmo tempo é caso raro; o
 * teto existe para a mensagem não virar uma parede e para o menu caber junto com a
 * linha de escape.
 */
export const MAX_AGENDAMENTOS_LISTADOS = 5;

/**
 * Léxico da confirmação — **deliberadamente diferente** do `AFIRMATIVAS`/`NEGATIVAS`
 * da engine.
 *
 * Aquele conjunto tem `"cancelar"` e `"cancela"` em `NEGATIVAS`, com o sentido de
 * "aborte este agendamento". Aqui a pergunta já é "quer cancelar?", e nela a palavra
 * "cancelar" é genuinamente ambígua: pode significar "sim, cancele o horário" ou
 * "não, cancele esta operação". Reusar o léxico faria o bot decidir o destino de um
 * horário real com base numa leitura arbitrária. Palavra ambígua fica de fora dos
 * dois lados, e o cliente responde pelo número.
 */
const CONFIRMA_CANCELAMENTO = ["1", "sim", "s", "isso"];
const RECUSA_CANCELAMENTO = ["2", "nao", "n"];

/** Agendamento futuro do cliente, já resolvido pelo adaptador. */
export type AgendamentoDoCliente = {
  id: string;
  dataHora: Date;
  servicoNome: string | null;
};

export type EfeitoCancelar = {
  tipo: "cancelar_agendamento";
  agendamentoId: string;
};

/**
 * UUID canônico. É o análogo de `ehInstanteDaEngine` da engine, e existe pelo mesmo
 * motivo: sentinela de navegação e estado corrompido não podem virar valor. Sem esta
 * guarda, `"__acao:manter"` chegaria ao `update` como id e o `22P02` viraria 500 com
 * retry infinito.
 */
function ehUuid(valor: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    valor,
  );
}

/** "sex 14/08 às 09:00" no fuso do estabelecimento. */
function formatarAgendamento(
  agendamento: AgendamentoDoCliente,
  fusoHorario: string,
): string {
  const quando = new Intl.DateTimeFormat("pt-BR", {
    timeZone: fusoHorario,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(agendamento.dataHora)
    // O pt-BR emite ponto na abreviação do dia e vírgula entre os campos.
    .replace(/[.,]/g, "");

  return agendamento.servicoNome
    ? `${quando} — ${agendamento.servicoNome}`
    : quando;
}

/** Só os que ainda não começaram, do mais próximo para o mais distante. */
function cancelaveis(contexto: ContextoConversa): AgendamentoDoCliente[] {
  return [...contexto.agendamentosDoCliente]
    .filter((a) => a.dataHora.getTime() > contexto.agora.getTime())
    .sort((a, b) => a.dataHora.getTime() - b.dataHora.getTime())
    .slice(0, MAX_AGENDAMENTOS_LISTADOS);
}

/**
 * Este cliente tem algo a cancelar?
 *
 * É o que decide se o menu de entrada aparece. Quem não tem agendamento futuro segue
 * recebendo a primeira etapa do roteiro do dono, byte por byte como antes — o custo de
 * +1 mensagem não é pago por quem só quer marcar.
 */
export function temAgendamentoParaCancelar(contexto: ContextoConversa): boolean {
  return cancelaveis(contexto).length > 0;
}

function estado(
  contexto: ContextoConversa,
  fase: Fase,
  opcoes: string[],
  extra: DadosTemporarios = {},
): EstadoConversa {
  return {
    etapaAtualId: ID_ETAPA_CANCELAMENTO,
    /**
     * Vazio de propósito: `fluxo_snapshot` protege conversa em voo de reordenação do
     * roteiro, e aqui não há roteiro autoral a proteger — o fluxo é código.
     */
    fluxoSnapshot: [],
    dadosTemporarios: {
      [CHAVE_FLUXO]: FLUXO_CANCELAMENTO,
      [CHAVE_FASE]: fase,
      [CHAVE_OPCOES]: opcoes,
      ...extra,
    },
    atualizadoEm: contexto.agora,
  };
}

/**
 * Menu de entrada, para quem já tem horário marcado.
 *
 * Resolve de graça um problema que ninguém tinha pedido: hoje o cliente que já tem
 * horário e manda mensagem é levado direto a marcar um **segundo**, sem nenhum aviso
 * de que o primeiro existe.
 */
export function apresentarEntrada(contexto: ContextoConversa): Decisao {
  const lista = cancelaveis(contexto);
  const proximo = formatarAgendamento(lista[0], contexto.fusoHorario);

  const rotulos = [
    "Quero marcar um horário",
    lista.length === 1
      ? `Quero cancelar meu horário (${proximo})`
      : "Quero cancelar um horário",
  ];

  return {
    mensagens: [
      `Você já tem horário marcado: ${proximo}.\n\n` +
        `Como posso ajudar?\n${listaNumerada(rotulos)}`,
    ],
    estado: estado(contexto, "entrada", [ACAO_AGENDAR, ACAO_CANCELAR]),
    efeitos: [],
  };
}

function apresentarEscolha(contexto: ContextoConversa): Decisao {
  const lista = cancelaveis(contexto);

  const rotulos = [
    ...lista.map((a) => formatarAgendamento(a, contexto.fusoHorario)),
    "Nenhum desses, quero marcar um horário",
  ];

  return {
    mensagens: [`Qual horário você quer cancelar?\n${listaNumerada(rotulos)}`],
    estado: estado(contexto, "escolher", [
      ...lista.map((a) => a.id),
      ACAO_AGENDAR,
    ]),
    efeitos: [],
  };
}

function apresentarConfirmacao(
  contexto: ContextoConversa,
  agendamento: AgendamentoDoCliente,
): Decisao {
  const rotulos = ["Sim, cancelar", "Não, manter meu horário"];

  return {
    mensagens: [
      `Confirma o cancelamento de ${formatarAgendamento(
        agendamento,
        contexto.fusoHorario,
      )}?\n${listaNumerada(rotulos)}`,
    ],
    estado: estado(
      contexto,
      "confirmar",
      [ACAO_CONFIRMAR, ACAO_MANTER],
      { [CHAVE_CANCELAR_ID]: agendamento.id },
    ),
    efeitos: [],
  };
}

/** Reapresenta a fase corrente com um aviso, sem nunca deixar a conversa muda. */
function reapresentar(decisao: Decisao, aviso: string): Decisao {
  return { ...decisao, mensagens: [aviso, ...decisao.mensagens] };
}

const NAO_ENTENDI = "Não entendi. Responda com o número da opção.";

/**
 * Avança o fluxo de cancelamento.
 *
 * `iniciarAgendamento` é injetado em vez de importado para não criar ciclo de módulo:
 * a engine é quem sabe montar o snapshot e apresentar a primeira etapa do roteiro.
 */
export function decidirCancelamento(
  contexto: ContextoConversa,
  estadoAtual: EstadoConversa,
  mensagem: MensagemRecebida,
  iniciarAgendamento: () => Decisao,
): Decisao {
  const dados = estadoAtual.dadosTemporarios;
  const fase = dados[CHAVE_FASE];
  const opcoes = Array.isArray(dados[CHAVE_OPCOES])
    ? (dados[CHAVE_OPCOES] as string[])
    : [];

  const lista = cancelaveis(contexto);

  /**
   * O último agendamento pode ter sido cancelado ou atendido enquanto a conversa
   * estava aberta. Sem isto, `apresentarEntrada` leria `lista[0]` inexistente.
   */
  if (lista.length === 0) return iniciarAgendamento();

  if (fase === "confirmar") {
    const resposta = normalizar(mensagem.texto);
    const id = dados[CHAVE_CANCELAR_ID];

    // Guarda de sentinela: só UUID vira efeito.
    if (typeof id !== "string" || !ehUuid(id)) {
      return apresentarEscolha(contexto);
    }

    const alvo = lista.find((a) => a.id === id);
    // Sumiu durante a conversa: volta ao menu em vez de encerrar sem resposta.
    if (!alvo) return apresentarEscolha(contexto);

    if (RECUSA_CANCELAMENTO.includes(resposta)) {
      return {
        mensagens: [
          `Tudo bem, seu horário de ${formatarAgendamento(
            alvo,
            contexto.fusoHorario,
          )} está mantido. Até logo!`,
        ],
        estado: null,
        efeitos: [],
      };
    }

    if (!CONFIRMA_CANCELAMENTO.includes(resposta)) {
      return reapresentar(apresentarConfirmacao(contexto, alvo), NAO_ENTENDI);
    }

    return {
      mensagens: [
        `Pronto, seu horário de ${formatarAgendamento(
          alvo,
          contexto.fusoHorario,
        )} foi cancelado.\n\n` +
          "Se quiser marcar outro, é só mandar uma mensagem.",
      ],
      estado: null,
      efeitos: [{ tipo: "cancelar_agendamento", agendamentoId: alvo.id }],
    };
  }

  /**
   * `entrada` e `escolher` leem a resposta contra `__opcoes_oferecidas` — a lista que
   * foi **apresentada**, nunca uma recalculada. É o que impede o cliente de cancelar
   * um horário que não foi o que ele leu, quando algo muda no meio da conversa.
   */
  const indice = lerIndice(mensagem.texto, opcoes.length);

  if (indice === null) {
    return reapresentar(
      fase === "escolher" ? apresentarEscolha(contexto) : apresentarEntrada(contexto),
      NAO_ENTENDI,
    );
  }

  const escolha = opcoes[indice];

  if (escolha === ACAO_AGENDAR) return iniciarAgendamento();

  if (escolha === ACAO_CANCELAR) {
    // Com um só agendamento, não faz sentido um menu de uma opção.
    return lista.length === 1
      ? apresentarConfirmacao(contexto, lista[0])
      : apresentarEscolha(contexto);
  }

  if (ehUuid(escolha)) {
    const alvo = lista.find((a) => a.id === escolha);
    if (alvo) return apresentarConfirmacao(contexto, alvo);
  }

  // Opção conhecida que não é mais válida (o horário saiu da lista).
  return reapresentar(
    apresentarEscolha(contexto),
    "Esse horário não está mais disponível para cancelar.",
  );
}
