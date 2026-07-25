import {
  proximosSlots,
  type HorarioSemanal,
  type Intervalo,
  type Slot,
} from "./disponibilidade";

/**
 * Engine de execução do fluxo de conversa.
 *
 * **Pura e síncrona.** `decidir()` recebe todo o mundo exterior por parâmetro e
 * devolve o que fazer; nenhum acesso a banco, rede ou relógio. Todo o I/O vive
 * no adaptador do webhook. É isso que permite testar uma conversa inteira em
 * memória, sem WhatsApp e sem Supabase.
 *
 * **Dirigida por configuração.** Não há nada hardcoded sobre quantas etapas
 * existem nem em que ordem: a engine percorre a lista ordenada que recebe.
 * O ponto de extensão é o *tipo* de etapa, não o grafo — por isso um
 * interpretador de lista e não XState, que traria um formato de snapshot
 * persistido a migrar a cada mudança de máquina.
 */

export type TipoEtapa =
  | "servico"
  | "horario"
  | "escolha_unica"
  | "texto_livre"
  | "confirmacao";

export type OpcaoEscolha = { label: string; valor: string };

/** Etapa como fica gravada em `conversas_estado.fluxo_snapshot`. */
export type EtapaSnapshot = {
  id: string;
  ordem: number;
  tipo: TipoEtapa;
  pergunta_texto: string;
  opcoes: OpcaoEscolha[] | null;
  campo_destino: string | null;
  obrigatorio: boolean;
};

export type ServicoDisponivel = {
  id: string;
  nome: string;
  duracao_minutos: number;
  preco: number | null;
};

/**
 * Chaves internas da engine em `dados_temporarios`.
 *
 * Prefixo `__` reservado — o banco proíbe `campo_destino` começando com `__`,
 * então uma resposta do cliente nunca colide com estado interno.
 */
const CHAVE_SERVICO_ID = "__servico_id";
const CHAVE_SERVICO_NOME = "__servico_nome";
const CHAVE_DURACAO = "__duracao_minutos";
const CHAVE_DATA_HORA = "__data_hora";
/** Valores das opções apresentadas na etapa corrente, na ordem exibida. */
const CHAVE_OPCOES = "__opcoes_oferecidas";

export type DadosTemporarios = Record<string, unknown>;

export type EstadoConversa = {
  etapaAtualId: string | null;
  fluxoSnapshot: EtapaSnapshot[];
  dadosTemporarios: DadosTemporarios;
  atualizadoEm: Date;
};

export type MensagemRecebida = {
  /** `data.key.id` do webhook. */
  id: string;
  texto: string;
  /** `data.pushName` — nome do perfil WhatsApp, único nome disponível na V0. */
  pushName: string | null;
};

export type ContextoConversa = {
  agora: Date;
  fusoHorario: string;
  passoSlotMinutos: number;
  antecedenciaMinimaMinutos: number;
  antecedenciaMaximaDias: number;
  /** Etapas ativas, ordenadas — usadas só ao iniciar conversa nova. */
  etapasAtivas: EtapaSnapshot[];
  servicos: ServicoDisponivel[];
  grade: HorarioSemanal[];
  /** Agendamentos confirmados no horizonte, já como intervalos. */
  ocupados: Intervalo[];
  /** Horas de inatividade após as quais a conversa é considerada nova. */
  expiracaoHoras: number;
};

export type Efeito = {
  tipo: "criar_agendamento";
  servicoId: string;
  dataHora: Date;
  duracaoMinutos: number;
  nomeCliente: string | null;
  respostasExtras: Record<string, unknown>;
};

export type Decisao = {
  /** Mensagens a enviar, na ordem. */
  mensagens: string[];
  /** Estado a persistir, ou `null` para encerrar e limpar a conversa. */
  estado: EstadoConversa | null;
  efeitos: Efeito[];
};

/** Quantos horários oferecer no menu numerado. */
export const MAX_OPCOES_HORARIO = 8;

const AFIRMATIVAS = ["1", "sim", "s", "confirmar", "confirmo", "ok", "isso"];
const NEGATIVAS = ["2", "nao", "não", "n", "cancelar", "cancela"];

function normalizar(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatarPreco(preco: number | null): string {
  if (preco === null) return "";
  return ` — ${new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(preco)}`;
}

function formatarSlot(slot: Slot, fusoHorario: string): string {
  const formatador = new Intl.DateTimeFormat("pt-BR", {
    timeZone: fusoHorario,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return formatador.format(slot.inicio).replace(",", "");
}

function listaNumerada(itens: string[]): string {
  return itens.map((item, i) => `${i + 1}. ${item}`).join("\n");
}

/** Índice 1-based válido dentro de `opcoes`, ou null. */
function lerIndice(texto: string, quantidade: number): number | null {
  const limpo = normalizar(texto);
  if (!/^\d+$/.test(limpo)) return null;

  const indice = Number(limpo) - 1;
  if (indice < 0 || indice >= quantidade) return null;
  return indice;
}

function opcoesOferecidas(dados: DadosTemporarios): string[] {
  const valor = dados[CHAVE_OPCOES];
  return Array.isArray(valor) ? (valor as string[]) : [];
}

/** Respostas do cliente, sem as chaves internas da engine. */
export function respostasCustomizadas(
  dados: DadosTemporarios,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(dados).filter(([chave]) => !chave.startsWith("__")),
  );
}

type Apresentacao =
  | { ok: true; texto: string; opcoes: string[] }
  /** A etapa não pode ser apresentada: encerra a conversa com um aviso. */
  | { ok: false; motivo: string };

/**
 * Monta o texto de uma etapa e as opções que ela oferece.
 *
 * As opções apresentadas são gravadas no estado (`__opcoes_oferecidas`) e é
 * contra essa lista que a próxima mensagem é interpretada — nunca contra uma
 * lista recalculada. Recalcular deixaria os índices escorregarem se outro
 * cliente agendasse no meio da conversa, e o cliente escolheria "2" achando que
 * é 10:00 quando já virou 10:30.
 */
function apresentar(
  etapa: EtapaSnapshot,
  snapshot: EtapaSnapshot[],
  contexto: ContextoConversa,
  dados: DadosTemporarios,
): Apresentacao {
  switch (etapa.tipo) {
    case "servico": {
      if (contexto.servicos.length === 0) {
        return {
          ok: false,
          motivo:
            "Não há serviços disponíveis para agendamento no momento. " +
            "Por favor, entre em contato mais tarde.",
        };
      }

      const itens = contexto.servicos.map(
        (s) => `${s.nome} (${s.duracao_minutos} min)${formatarPreco(s.preco)}`,
      );

      return {
        ok: true,
        texto: `${etapa.pergunta_texto}\n\n${listaNumerada(itens)}\n\nResponda com o número da opção.`,
        opcoes: contexto.servicos.map((s) => s.id),
      };
    }

    case "horario": {
      const duracao = dados[CHAVE_DURACAO];
      if (typeof duracao !== "number") {
        // A etapa `servico` obrigatoriamente vem antes — o builder impõe isso.
        return {
          ok: false,
          motivo:
            "Não consegui identificar o serviço escolhido. Vamos começar de novo?",
        };
      }

      const slots = proximosSlots({
        agora: contexto.agora,
        fusoHorario: contexto.fusoHorario,
        grade: contexto.grade,
        ocupados: contexto.ocupados,
        duracaoMinutos: duracao,
        passoMinutos: contexto.passoSlotMinutos,
        antecedenciaMinimaMinutos: contexto.antecedenciaMinimaMinutos,
        horizonteDias: contexto.antecedenciaMaximaDias,
        limite: MAX_OPCOES_HORARIO,
      });

      if (slots.length === 0) {
        return {
          ok: false,
          motivo:
            "Não encontrei horário livre nos próximos dias. " +
            "Por favor, entre em contato para verificarmos outra data.",
        };
      }

      const itens = slots.map((slot) =>
        formatarSlot(slot, contexto.fusoHorario),
      );

      return {
        ok: true,
        texto: `${etapa.pergunta_texto}\n\n${listaNumerada(itens)}\n\nResponda com o número da opção.`,
        opcoes: slots.map((slot) => slot.inicio.toISOString()),
      };
    }

    case "escolha_unica": {
      const opcoes = etapa.opcoes ?? [];
      if (opcoes.length === 0) {
        // Etapa mal configurada não pode travar a conversa: trata como texto.
        return { ok: true, texto: etapa.pergunta_texto, opcoes: [] };
      }

      return {
        ok: true,
        texto: `${etapa.pergunta_texto}\n\n${listaNumerada(opcoes.map((o) => o.label))}\n\nResponda com o número da opção.`,
        opcoes: opcoes.map((o) => o.valor),
      };
    }

    case "texto_livre":
      return { ok: true, texto: etapa.pergunta_texto, opcoes: [] };

    case "confirmacao": {
      const linhas: string[] = [];

      const servicoNome = dados[CHAVE_SERVICO_NOME];
      if (typeof servicoNome === "string") {
        linhas.push(`Serviço: ${servicoNome}`);
      }

      const dataHora = dados[CHAVE_DATA_HORA];
      if (typeof dataHora === "string") {
        linhas.push(
          `Quando: ${formatarSlot(
            { inicio: new Date(dataHora), fim: new Date(dataHora) },
            contexto.fusoHorario,
          )}`,
        );
      }

      // Rotula cada resposta customizada com a pergunta que a originou.
      for (const etapaAnterior of etapaDeCadaResposta(dados, snapshot)) {
        linhas.push(
          `${etapaAnterior.pergunta}: ${etapaAnterior.resposta}`,
        );
      }

      return {
        ok: true,
        texto:
          `${etapa.pergunta_texto}\n\n${linhas.join("\n")}\n\n` +
          "1. Confirmar\n2. Cancelar",
        opcoes: ["sim", "nao"],
      };
    }
  }
}

/**
 * Pareia respostas customizadas com o texto da pergunta que as gerou.
 *
 * Lê do **snapshot**, não de `contexto.etapasAtivas`: a conversa em andamento
 * pertence à versão do fluxo em que começou, e o dono pode ter editado o texto
 * da pergunta (ou removido a etapa) desde então.
 */
function etapaDeCadaResposta(
  dados: DadosTemporarios,
  snapshot: EtapaSnapshot[],
): { pergunta: string; resposta: string }[] {
  const respostas = respostasCustomizadas(dados);

  return Object.entries(respostas).map(([campo, valor]) => {
    const etapa = snapshot.find((e) => e.campo_destino === campo);
    const opcao = etapa?.opcoes?.find((o) => o.valor === valor);

    return {
      pergunta: etapa?.pergunta_texto ?? campo,
      resposta: opcao?.label ?? String(valor),
    };
  });
}

/** Próxima etapa depois da atual, na ordem do snapshot já ordenado. */
function proximaEtapa(
  snapshot: EtapaSnapshot[],
  atual: EtapaSnapshot,
): EtapaSnapshot | null {
  const indice = snapshot.findIndex((e) => e.id === atual.id);
  if (indice < 0) return null;
  return snapshot[indice + 1] ?? null;
}

function ordenar(etapas: EtapaSnapshot[]): EtapaSnapshot[] {
  // Desempate por id para que a ordem seja determinística — a coluna `ordem`
  // não tem unique, justamente porque a reordenação regrava em bloco.
  return [...etapas].sort((a, b) =>
    a.ordem === b.ordem ? a.id.localeCompare(b.id) : a.ordem - b.ordem,
  );
}

export function conversaExpirou(
  estado: EstadoConversa,
  contexto: ContextoConversa,
): boolean {
  const limite =
    contexto.agora.getTime() - contexto.expiracaoHoras * 3_600_000;
  return estado.atualizadoEm.getTime() < limite;
}

/** Inicia conversa nova: tira o snapshot e apresenta a primeira etapa. */
function iniciar(contexto: ContextoConversa): Decisao {
  const snapshot = ordenar(contexto.etapasAtivas);
  const primeira = snapshot[0];

  if (!primeira) {
    // Fluxo vazio não deveria acontecer: o trigger de novo usuário semeia as
    // três etapas de sistema. Se acontecer, não travar em silêncio.
    return {
      mensagens: [
        "O atendimento automático ainda não está configurado. " +
          "Por favor, entre em contato diretamente.",
      ],
      estado: null,
      efeitos: [],
    };
  }

  return avancarPara(primeira, snapshot, {}, contexto);
}

/** Apresenta uma etapa e devolve o estado correspondente. */
function avancarPara(
  etapa: EtapaSnapshot,
  snapshot: EtapaSnapshot[],
  dados: DadosTemporarios,
  contexto: ContextoConversa,
): Decisao {
  const apresentacao = apresentar(etapa, snapshot, contexto, dados);

  if (!apresentacao.ok) {
    return { mensagens: [apresentacao.motivo], estado: null, efeitos: [] };
  }

  return {
    mensagens: [apresentacao.texto],
    estado: {
      etapaAtualId: etapa.id,
      fluxoSnapshot: snapshot,
      dadosTemporarios: { ...dados, [CHAVE_OPCOES]: apresentacao.opcoes },
      atualizadoEm: contexto.agora,
    },
    efeitos: [],
  };
}

/** Reapresenta a etapa atual sem avançar. Nunca deixa a conversa sem resposta. */
function reapresentar(
  etapa: EtapaSnapshot,
  snapshot: EtapaSnapshot[],
  dados: DadosTemporarios,
  contexto: ContextoConversa,
  aviso: string,
): Decisao {
  const decisao = avancarPara(etapa, snapshot, dados, contexto);
  return { ...decisao, mensagens: [aviso, ...decisao.mensagens] };
}

/**
 * Decide o que fazer com uma mensagem recebida.
 *
 * `estado` é `null` quando não há conversa em curso. Idempotência e corrida são
 * tratadas no adaptador (compare-and-set sobre `versao` e `ultima_mensagem_id`),
 * não aqui: a engine assume que a mensagem que chegou é nova.
 */
export function decidir(
  contexto: ContextoConversa,
  estado: EstadoConversa | null,
  mensagem: MensagemRecebida,
): Decisao {
  if (!estado || !estado.etapaAtualId || conversaExpirou(estado, contexto)) {
    return iniciar(contexto);
  }

  const snapshot = ordenar(estado.fluxoSnapshot);
  const etapaAtual = snapshot.find((e) => e.id === estado.etapaAtualId);

  // A etapa saiu do snapshot (estado corrompido): recomeçar é melhor que travar.
  if (!etapaAtual) return iniciar(contexto);

  const dados = { ...estado.dadosTemporarios };
  const opcoes = opcoesOferecidas(dados);
  const texto = mensagem.texto.trim();

  switch (etapaAtual.tipo) {
    case "servico": {
      const indice = lerIndice(texto, opcoes.length);
      if (indice === null) {
        return reapresentar(
          etapaAtual,
          snapshot,
          dados,
          contexto,
          "Não entendi. Responda com o número de uma das opções.",
        );
      }

      const servicoId = opcoes[indice];
      const servico = contexto.servicos.find((s) => s.id === servicoId);

      // O serviço foi desativado entre a apresentação e a resposta.
      if (!servico) {
        return reapresentar(
          etapaAtual,
          snapshot,
          dados,
          contexto,
          "Esse serviço não está mais disponível. Escolha outro:",
        );
      }

      dados[CHAVE_SERVICO_ID] = servico.id;
      dados[CHAVE_SERVICO_NOME] = servico.nome;
      dados[CHAVE_DURACAO] = servico.duracao_minutos;
      break;
    }

    case "horario": {
      const indice = lerIndice(texto, opcoes.length);
      if (indice === null) {
        return reapresentar(
          etapaAtual,
          snapshot,
          dados,
          contexto,
          "Não entendi. Responda com o número de um dos horários.",
        );
      }

      dados[CHAVE_DATA_HORA] = opcoes[indice];
      break;
    }

    case "escolha_unica": {
      if (opcoes.length === 0) {
        // Etapa sem opções configuradas foi apresentada como texto livre.
        if (etapaAtual.campo_destino) dados[etapaAtual.campo_destino] = texto;
        break;
      }

      const indice = lerIndice(texto, opcoes.length);
      if (indice === null) {
        return reapresentar(
          etapaAtual,
          snapshot,
          dados,
          contexto,
          "Não entendi. Responda com o número de uma das opções.",
        );
      }

      if (etapaAtual.campo_destino) {
        dados[etapaAtual.campo_destino] = opcoes[indice];
      }
      break;
    }

    case "texto_livre": {
      if (texto.length === 0 && etapaAtual.obrigatorio) {
        return reapresentar(
          etapaAtual,
          snapshot,
          dados,
          contexto,
          "Preciso de uma resposta para continuar.",
        );
      }

      if (etapaAtual.campo_destino) dados[etapaAtual.campo_destino] = texto;
      break;
    }

    case "confirmacao": {
      const resposta = normalizar(texto);

      if (NEGATIVAS.includes(resposta)) {
        return {
          mensagens: [
            "Tudo bem, agendamento cancelado. " +
              "Se quiser começar de novo, é só mandar uma mensagem.",
          ],
          estado: null,
          efeitos: [],
        };
      }

      if (!AFIRMATIVAS.includes(resposta)) {
        return reapresentar(
          etapaAtual,
          snapshot,
          dados,
          contexto,
          "Não entendi. Responda 1 para confirmar ou 2 para cancelar.",
        );
      }

      const servicoId = dados[CHAVE_SERVICO_ID];
      const dataHora = dados[CHAVE_DATA_HORA];
      const duracao = dados[CHAVE_DURACAO];

      if (
        typeof servicoId !== "string" ||
        typeof dataHora !== "string" ||
        typeof duracao !== "number"
      ) {
        return {
          mensagens: [
            "Faltou alguma informação para fechar o agendamento. " +
              "Vamos começar de novo: mande uma mensagem quando quiser.",
          ],
          estado: null,
          efeitos: [],
        };
      }

      /**
       * O horário escolhido precisa continuar sendo futuro.
       *
       * A conversa só expira depois de 6h, então o cliente podia escolher 13:00
       * às 09:00, responder as etapas customizadas devagar e confirmar às 13:40:
       * a EXCLUDE só barra sobreposição, não passado, e o agendamento nasceria
       * já vencido — com o bot prometendo um lembrete que nunca sairia.
       */
      const limiteMinimo =
        contexto.agora.getTime() +
        contexto.antecedenciaMinimaMinutos * 60_000;

      if (new Date(dataHora).getTime() < limiteMinimo) {
        const etapaHorario = snapshot.find((e) => e.tipo === "horario");

        if (etapaHorario) {
          const dadosSemHorario = { ...dados };
          delete dadosSemHorario[CHAVE_DATA_HORA];

          return reapresentar(
            etapaHorario,
            snapshot,
            dadosSemHorario,
            contexto,
            "Esse horário já passou. Escolha um novo:",
          );
        }

        return {
          mensagens: [
            "Esse horário já passou. Mande uma mensagem para escolhermos outro.",
          ],
          estado: null,
          efeitos: [],
        };
      }

      // O efeito é descrito, não executado: quem grava é o adaptador, que
      // também trata o 23P01 de slot tomado no meio da conversa.
      return {
        mensagens: [],
        estado: null,
        efeitos: [
          {
            tipo: "criar_agendamento",
            servicoId,
            dataHora: new Date(dataHora),
            duracaoMinutos: duracao,
            nomeCliente: mensagem.pushName,
            respostasExtras: respostasCustomizadas(dados),
          },
        ],
      };
    }
  }

  const proxima = proximaEtapa(snapshot, etapaAtual);

  if (!proxima) {
    // Fluxo sem etapa de confirmação ao final: encerra sem gravar nada, porque
    // gravar sem confirmação seria pior que não gravar.
    return {
      mensagens: [
        "Obrigado! Suas respostas foram registradas e já vamos te retornar.",
      ],
      estado: null,
      efeitos: [],
    };
  }

  return avancarPara(proxima, snapshot, dados, contexto);
}

/**
 * Mensagem de sucesso, montada pelo adaptador depois de o agendamento gravar.
 * Fica aqui para que o texto do bot viva todo num só lugar.
 */
export function mensagemAgendamentoConfirmado(
  efeito: Efeito,
  servicoNome: string,
  fusoHorario: string,
): string {
  const quando = formatarSlot(
    { inicio: efeito.dataHora, fim: efeito.dataHora },
    fusoHorario,
  );
  return (
    `Agendamento confirmado! ✅\n\n${servicoNome}\n${quando}\n\n` +
    "Um dia antes eu te mando um lembrete. Até lá!"
  );
}

/** Aviso de slot tomado entre a escolha e a gravação (SQLSTATE 23P01). */
export function mensagemSlotIndisponivel(): string {
  return (
    "Esse horário acabou de ser reservado por outra pessoa. " +
    "Mande uma mensagem para escolhermos outro."
  );
}
