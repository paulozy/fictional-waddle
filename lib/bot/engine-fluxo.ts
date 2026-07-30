import {
  datasNoHorizonte,
  diaSeguinte,
  diasComVaga,
  instanteNoFuso,
  proximosSlots,
  slotsDoDia,
  type HorarioSemanal,
  type Intervalo,
  type ParametrosDiasComVaga,
  type Slot,
} from "./disponibilidade";
import {
  CHAVE_OPCOES,
  lerIndice,
  listaNumerada,
  normalizar,
  opcoesOferecidas,
  type DadosTemporarios,
} from "./conversa-comum";
import {
  ID_ETAPA_CANCELAMENTO,
  apresentarEntrada,
  decidirCancelamento,
  temAgendamentoParaCancelar,
  type AgendamentoDoCliente,
  type EfeitoCancelar,
} from "./cancelamento";

/** Reexportado: era declarado aqui antes de o cancelamento passar a compartilhá-lo. */
export type { DadosTemporarios };

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

/**
 * Estado das três fases internas da etapa `horario`.
 *
 * A etapa oferecia apenas os 8 horários cronologicamente mais próximos — na
 * prática um dia só, porque numa grade cheia o limite se esgota antes de amanhã.
 * Quem só podia na semana seguinte não tinha caminho nenhum até lá: resposta
 * fora da lista caía em `reapresentar`, que devolvia **a mesma lista**. Era um
 * laço fechado cujas únicas saídas eram abandonar ou o dono atender à mão.
 *
 * As fases são estado **explícito**, e não derivado do formato das strings em
 * `__opcoes_oferecidas`: aquilo seria uma type-tag implícita dentro de string,
 * exatamente o que o resto desta base evita.
 */
const CHAVE_HORARIO_FASE = "__horario_fase";
/** `YYYY-MM-DD` no calendário do estabelecimento. **Data, nunca instante.** */
const CHAVE_DIA_ESCOLHIDO = "__dia_escolhido";
/** Cursor da paginação de dias. Cursor de data, não offset — ver `diasComVaga`. */
const CHAVE_DIAS_DESDE = "__dias_desde";
/**
 * Última hora **já mostrada** num dia com mais horários que o teto do menu.
 * A página seguinte começa depois dela — limite exclusivo, não inclusivo.
 */
const CHAVE_HORAS_DESDE = "__horas_desde";

/**
 * Marcador de formato de `dados_temporarios` para esta etapa.
 *
 * Ausente significa "estado gravado pela engine anterior às fases". `fluxo_snapshot`
 * **não** cobre isso: ele protege reordenação de etapas, não o comportamento
 * interno de uma etapa, que é código. Sem o marcador, um cliente parado na etapa
 * no instante do deploy responderia "9" achando que escolhia um horário e cairia
 * em "quero escolher outro dia".
 *
 * O shim de leitura pode sair no deploy seguinte: toda conversa anterior já
 * expirou pelas 6h de `conversaExpirou`.
 */
const CHAVE_HORARIO_V = "__horario_v";
const VERSAO_HORARIO = 2;

/**
 * Ações de navegação, que ocupam posição no menu numerado ao lado dos horários.
 *
 * O prefixo `__` é o que garante que nunca colidem com id de serviço, ISO de slot
 * ou `valor` de `escolha_unica` — é a mesma reserva que o banco impõe a
 * `campo_destino`.
 */
const ACAO_OUTRO_DIA = "__acao:outro_dia";
const ACAO_MAIS_DIAS = "__acao:mais_dias";
/**
 * Volta à primeira página de dias.
 *
 * Sem ela a última página era porta de mão única: sem "Ver mais dias" e sem
 * caminho de volta, o cliente que paginou longe demais só saía abandonando — o
 * mesmo defeito que esta etapa inteira existe para consertar, em miniatura.
 */
const ACAO_PRIMEIROS_DIAS = "__acao:primeiros_dias";
const ACAO_VOLTAR_DIAS = "__acao:voltar_dias";
const ACAO_MAIS_HORAS = "__acao:mais_horas";

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
  /**
   * Agendamentos futuros **deste** interlocutor, para o fluxo de cancelamento.
   *
   * Separado de `ocupados` porque o papel é outro: `ocupados` é do tenant inteiro e
   * serve ao cálculo de disponibilidade, sem identidade; aqui a identidade é o ponto,
   * e ela é o `remote_jid` — nunca o telefone.
   */
  agendamentosDoCliente: AgendamentoDoCliente[];
  /** Horas de inatividade após as quais a conversa é considerada nova. */
  expiracaoHoras: number;
};

export type EfeitoCriarAgendamento = {
  tipo: "criar_agendamento";
  servicoId: string;
  dataHora: Date;
  duracaoMinutos: number;
  nomeCliente: string | null;
  respostasExtras: Record<string, unknown>;
};

/** União discriminada por `tipo`: o adaptador estreita antes de executar. */
export type Efeito = EfeitoCriarAgendamento | EfeitoCancelar;

export type Decisao = {
  /** Mensagens a enviar, na ordem. */
  mensagens: string[];
  /** Estado a persistir, ou `null` para encerrar e limpar a conversa. */
  estado: EstadoConversa | null;
  efeitos: Efeito[];
};

/** Quantos horários oferecer no menu numerado. */
export const MAX_OPCOES_HORARIO = 8;

/**
 * Tetos dos sub-menus da etapa `horario`.
 *
 * O 7±2 de Miller **não** justifica estes números: ele é sobre span de memória
 * para recall, e um menu no WhatsApp é reconhecimento — a lista fica no
 * histórico, rolável e re-lível (a NN/g é explícita sobre esse mau uso). O teto
 * emprestado que faz sentido é o da própria Meta, que limita a interactive list
 * dela a 10 linhas somando todas as seções.
 *
 * `MAX_OPCOES_HORARIO_DO_DIA` **ainda precisa ser medido em aparelho**: se o
 * WhatsApp truncar a mensagem com "Ler mais" acima de N linhas em texto livre de
 * sessão, é esse N que manda. Não achei fonte para o limiar fora de template da
 * Cloud API.
 */
export const MAX_OPCOES_DIA = 7;
export const MAX_OPCOES_HORARIO_DO_DIA = 10;

const AFIRMATIVAS = ["1", "sim", "s", "confirmar", "confirmo", "ok", "isso"];
const NEGATIVAS = ["2", "nao", "não", "n", "cancelar", "cancela"];

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
  /**
   * `.replace(",", "")` removia **só a primeira** vírgula, e o pt-BR emite duas:
   * `"sex., 14/08, 09:00"` saía como `"sex. 14/08, 09:00"`, com vírgula sobrando
   * antes da hora. O ponto da abreviação do dia da semana também some — o
   * formato pretendido, e o que `components/conversa-demo.tsx` mostra ao
   * visitante como transcrição, é `"sex 14/08 09:00"`.
   *
   * O texto do slot é rótulo: o cliente responde pelo **índice** da lista, então
   * mudar isto não afeta conversa em andamento.
   */
  return formatador.format(slot.inicio).replace(/[.,]/g, "");
}

/**
 * `deslocamento` continua a numeração de um bloco anterior. É obrigatório
 * quando as ações de navegação vêm depois de uma lista agrupada por turno: o
 * número indexa `__opcoes_oferecidas`, e reiniciar em 1 tornaria a resposta
 * ambígua.
 */
/**
 * A string é um instante gerado por esta engine?
 *
 * A ida e volta exata por `toISOString()` é mais estrita que `Number.isFinite`, e
 * a diferença é um agendamento errado: `"2026-08-11"` é data **válida** para o
 * `Date`, então `Number.isFinite` a aceitava — e ela vira meia-noite UTC, que no
 * fuso de São Paulo é 21:00 do dia anterior. Toda opção de horário que a engine
 * oferece nasce de `slot.inicio.toISOString()`, então o round-trip é exato e
 * qualquer outra coisa — data sem hora, sentinela, estado corrompido — cai fora.
 */
function ehInstanteDaEngine(valor: string): boolean {
  const instante = new Date(valor);
  return (
    Number.isFinite(instante.getTime()) && instante.toISOString() === valor
  );
}

/** Só a hora de parede: "09:00". Usado dentro da lista de um dia só. */
function formatarHora(slot: Slot, fusoHorario: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fusoHorario,
    hour: "2-digit",
    minute: "2-digit",
  }).format(slot.inicio);
}

/**
 * Rótulo de um dia do menu: "sex 14/08", e "hoje (sex 07/08)" para a data de
 * hoje no fuso do estabelecimento.
 *
 * "hoje" é explicitado porque a primeira linha do menu de dias é a data corrente
 * e, sem o rótulo, o cliente não tem como saber se `07/08` é hoje ou já passou.
 * O mesmo `replace(/[.,]/g, "")` de `formatarSlot`: o pt-BR emite ponto na
 * abreviação do dia da semana e vírgula entre os campos.
 */
function formatarDia(data: string, contexto: ContextoConversa): string {
  const rotulo = new Intl.DateTimeFormat("pt-BR", {
    timeZone: contexto.fusoHorario,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  })
    .format(instanteNoFuso(data, "12:00", contexto.fusoHorario))
    .replace(/[.,]/g, "");

  const hoje = datasNoHorizonte(contexto.agora, contexto.fusoHorario, 1)[0];
  return data === hoje ? `hoje (${rotulo})` : rotulo;
}

/**
 * Agrupa os horários de um dia em manhã e tarde.
 *
 * Não é enfeite: uma lista corrida de dez horários é lida como um bloco, e o
 * cliente que só pode à tarde precisa varrer tudo. O agrupamento dá o benefício
 * de "escolher o turno" **sem** custar uma ida e volta a mais para todo mundo,
 * que é o motivo de o turno não ser uma pergunta separada.
 *
 * A numeração é contínua entre os grupos: ela indexa `__opcoes_oferecidas`, e
 * reiniciar por turno tornaria a resposta ambígua.
 */
function listaPorTurno(rotulos: string[]): string {
  const manha: string[] = [];
  const tarde: string[] = [];

  rotulos.forEach((rotulo, i) => {
    const linha = `${i + 1}. ${rotulo}`;
    if (Number(rotulo.slice(0, 2)) < 12) manha.push(linha);
    else tarde.push(linha);
  });

  const blocos: string[] = [];
  if (manha.length > 0) blocos.push(`Manhã\n${manha.join("\n")}`);
  if (tarde.length > 0) blocos.push(`Tarde\n${tarde.join("\n")}`);

  return blocos.join("\n\n");
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
  | {
      ok: true;
      texto: string;
      opcoes: string[];
      /**
       * Ajustes de estado que a própria apresentação exige, mesclados por
       * `avancarPara`. Valor `undefined` **apaga** a chave.
       *
       * Existe porque uma apresentação pode descobrir, no meio do caminho, que o
       * estado que a levou até ali não vale mais — o caso concreto é a fase `dia`
       * achar o dia sem vaga e cair no menu de dias. Sem isto o estado gravado
       * dizia `fase: "dia"` enquanto as opções já eram datas, e a escolha seguinte
       * gravava `"2026-08-11"` em `__data_hora`: uma data sem hora, que vira
       * meia-noite UTC e agenda 21:00 do dia anterior no fuso de São Paulo.
       */
      dados?: DadosTemporarios;
    }
  /** A etapa não pode ser apresentada: encerra a conversa com um aviso. */
  | { ok: false; motivo: string };

/** Parâmetros de varredura do horizonte, montados uma vez pelo ramo `horario`. */
type Varredura = Omit<ParametrosDiasComVaga, "desde" | "limite">;

/**
 * Menu de dias que têm vaga.
 *
 * Fica fora de `apresentar` porque dois caminhos chegam nele: o cliente pediu
 * outro dia, e o dia que ele havia escolhido ficou sem horário. O segundo precisa
 * de um aviso na frente e do cursor zerado — daí os dois parâmetros opcionais.
 */
function apresentarMenuDeDias(
  contexto: ContextoConversa,
  varredura: Varredura,
  desde?: string,
  opts: { aviso?: string } = {},
): Apresentacao {
  const pagina = diasComVaga({ ...varredura, desde, limite: MAX_OPCOES_DIA });

  if (pagina.datas.length === 0) {
    return {
      ok: false,
      motivo:
        "Não encontrei horário livre nos próximos dias. " +
        "Por favor, entre em contato para verificarmos outra data.",
    };
  }

  const itens = pagina.datas.map((data) => formatarDia(data, contexto));
  const opcoes = [...pagina.datas];

  if (pagina.temMais) {
    itens.push("Ver mais dias");
    opcoes.push(ACAO_MAIS_DIAS);
  }

  // Só a partir da segunda página: na primeira, "voltar" não teria destino.
  if (desde) {
    itens.push("Voltar aos primeiros dias");
    opcoes.push(ACAO_PRIMEIROS_DIAS);
  }

  const cabecalho =
    opts.aviso ?? "Estes são os próximos dias com horário livre:";

  /**
   * No fim do horizonte, dizer o teto em voz alta.
   *
   * `antecedencia_maxima_dias` existia sem nenhuma forma de o cliente descobrir:
   * ele pediria "mais dias" até a opção sumir e concluiria que o bot travou.
   */
  const rodape =
    !pagina.temMais && pagina.ultimoDiaDoHorizonte
      ? `\n\nA agenda vai até ${formatarDia(pagina.ultimoDiaDoHorizonte, contexto)}. ` +
        "Se você precisa de uma data depois disso, me manda uma mensagem."
      : "";

  return {
    ok: true,
    texto:
      `${cabecalho}\n\n${listaNumerada(itens)}\n\n` +
      `Responda com o número do dia.${rodape}`,
    opcoes,
    /**
     * Invariante: **mostrar o menu de dias implica o estado dizer `dias`.**
     *
     * O patch é incondicional de propósito. Para quem já estava na fase `dias` é
     * quase um no-op; para quem caiu aqui pelo dia sem vaga, é o que impede o
     * estado de ficar dizendo `"dia"` com opções que são datas — situação em que a
     * escolha seguinte gravava uma data sem hora em `__data_hora` e agendava
     * 21:00 do dia anterior.
     *
     * `__dias_desde` recebe exatamente o `desde` usado nesta página (ou é apagado),
     * para que uma reapresentação mostre a mesma página que o cliente acabou de
     * ver, e não uma calculada com um cursor velho.
     */
    dados: {
      [CHAVE_HORARIO_FASE]: "dias",
      [CHAVE_DIAS_DESDE]: desde,
      [CHAVE_DIA_ESCOLHIDO]: undefined,
      [CHAVE_HORAS_DESDE]: undefined,
    },
  };
}

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

      const varredura = {
        agora: contexto.agora,
        fusoHorario: contexto.fusoHorario,
        grade: contexto.grade,
        ocupados: contexto.ocupados,
        duracaoMinutos: duracao,
        passoMinutos: contexto.passoSlotMinutos,
        antecedenciaMinimaMinutos: contexto.antecedenciaMinimaMinutos,
        horizonteDias: contexto.antecedenciaMaximaDias,
      };

      const fase = dados[CHAVE_HORARIO_FASE];
      const diaEscolhido = dados[CHAVE_DIA_ESCOLHIDO];

      // ── Fase `dia`: horários de uma data específica ────────────────────────
      if (fase === "dia" && typeof diaEscolhido === "string") {
        const doDia = slotsDoDia(diaEscolhido, varredura);
        const desde = dados[CHAVE_HORAS_DESDE];
        // `__horas_desde` guarda a última hora **já mostrada**, então o filtro é
        // estritamente maior: a página seguinte começa depois dela.
        const restantes =
          typeof desde === "string"
            ? doDia.filter(
                (slot) => formatarHora(slot, contexto.fusoHorario) > desde,
              )
            : doDia;

        /**
         * Dia vazio **nunca encerra a conversa** — volta ao menu de dias. Uma
         * regra cobre três casos que chegariam aqui: o cliente demorou e virou a
         * meia-noite, o dia lotou durante a conversa, ou os horários daquele dia
         * já passaram.
         */
        if (restantes.length === 0) {
          return apresentarMenuDeDias(contexto, varredura, undefined, {
            aviso: "Esse dia não tem mais horário livre. Escolha outro:",
          });
        }

        const pagina = restantes.slice(0, MAX_OPCOES_HORARIO_DO_DIA);
        const rotulos = pagina.map((slot) =>
          formatarHora(slot, contexto.fusoHorario),
        );

        const acoes: string[] = [];
        const opcoes = pagina.map((slot) => slot.inicio.toISOString());

        if (restantes.length > pagina.length) {
          acoes.push("Ver mais horários deste dia");
          opcoes.push(ACAO_MAIS_HORAS);
        }
        acoes.push("Escolher outro dia");
        opcoes.push(ACAO_VOLTAR_DIAS);

        const cabecalho = `Horários livres em ${formatarDia(diaEscolhido, contexto)}:`;

        return {
          ok: true,
          texto:
            `${cabecalho}\n\n${listaPorTurno(rotulos)}\n\n` +
            `${listaNumerada(acoes, rotulos.length)}\n\n` +
            "Responda com o número do horário.",
          opcoes,
        };
      }

      // ── Fase `dias`: quais dias têm vaga ──────────────────────────────────
      if (fase === "dias") {
        const desde = dados[CHAVE_DIAS_DESDE];
        return apresentarMenuDeDias(
          contexto,
          varredura,
          typeof desde === "string" ? desde : undefined,
        );
      }

      // ── Fase `proximos`: o caminho de entrada, e o de sempre ──────────────
      const slots = proximosSlots({ ...varredura, limite: MAX_OPCOES_HORARIO });

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
      const opcoes = slots.map((slot) => slot.inicio.toISOString());

      /**
       * A linha de escape só faz sentido se existir dia além dos que já estão na
       * lista. Numa agenda que só tem vaga hoje, oferecê-la levaria o cliente a
       * um menu com uma opção só.
       */
      const outrosDias = diasComVaga({
        ...varredura,
        desde: datasNoHorizonte(contexto.agora, contexto.fusoHorario, 2)[1],
        limite: 1,
      });

      if (outrosDias.datas.length > 0) {
        itens.push("Quero escolher outro dia");
        opcoes.push(ACAO_OUTRO_DIA);
      }

      return {
        ok: true,
        texto: `${etapa.pergunta_texto}\n\n${listaNumerada(itens)}\n\nResponda com o número da opção.`,
        opcoes,
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

  /**
   * A marca de versão é gravada aqui, e não em `apresentar`, porque é aqui que o
   * estado nasce. Toda apresentação da etapa `horario` sai marcada — inclusive a
   * reapresentação de uma conversa que começou na engine antiga, que assim passa
   * a ver a lista nova e a ser interpretada pelas regras novas na mesma mensagem.
   */
  const dadosTemporarios: DadosTemporarios = {
    ...dados,
    [CHAVE_OPCOES]: apresentacao.opcoes,
  };

  // `undefined` no patch apaga a chave — um spread deixaria a chave presente com
  // valor `undefined`, e `typeof x === "string"` passaria a ser a única defesa.
  for (const [chave, valor] of Object.entries(apresentacao.dados ?? {})) {
    if (valor === undefined) delete dadosTemporarios[chave];
    else dadosTemporarios[chave] = valor;
  }

  if (etapa.tipo === "horario") dadosTemporarios[CHAVE_HORARIO_V] = VERSAO_HORARIO;

  return {
    mensagens: [apresentacao.texto],
    estado: {
      etapaAtualId: etapa.id,
      fluxoSnapshot: snapshot,
      dadosTemporarios,
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
    /**
     * Conversa nova (ou expirada): quem já tem horário marcado escolhe entre marcar
     * e cancelar; quem não tem cai em `iniciar` exatamente como antes. O custo de
     * +1 mensagem não é pago por quem só quer agendar.
     */
    return temAgendamentoParaCancelar(contexto)
      ? apresentarEntrada(contexto)
      : iniciar(contexto);
  }

  /**
   * O dispatch do fluxo de cancelamento vem **antes** do `find` no snapshot, e a
   * ordem não é estilo: o id reservado nunca está no snapshot (que é `[]` neste
   * fluxo), então a guarda `if (!etapaAtual) return iniciar(contexto)` logo abaixo
   * engoliria o id e a conversa reiniciaria a cada mensagem — o cliente nunca sairia
   * do menu de entrada.
   */
  if (estado.etapaAtualId === ID_ETAPA_CANCELAMENTO) {
    return decidirCancelamento(contexto, estado, mensagem, () =>
      iniciar(contexto),
    );
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
      const fase = dados[CHAVE_HORARIO_FASE];
      const indice = lerIndice(texto, opcoes.length);

      if (indice === null) {
        return reapresentar(
          etapaAtual,
          snapshot,
          dados,
          contexto,
          fase === "dias"
            ? "Não entendi. Responda com o número de um dos dias."
            : "Não entendi. Responda com o número de um dos horários.",
        );
      }

      const escolha = opcoes[indice];

      /**
       * Estado gravado pela engine anterior às fases.
       *
       * Uma conversa parada nesta etapa no instante do deploy tem
       * `__opcoes_oferecidas` só com ISOs e nenhuma chave nova. Interpretar como
       * hoje é o que torna o deploy sem perda: qualquer outro default faria o
       * cliente que digitasse "9" cair numa ação que ele não viu na tela.
       *
       * Pode sair no deploy seguinte — toda conversa antiga já expirou pelas 6h.
       */
      if (dados[CHAVE_HORARIO_V] !== VERSAO_HORARIO) {
        dados[CHAVE_DATA_HORA] = escolha;
        break;
      }

      // ── Navegação: reapresenta a MESMA etapa, sem avançar ──────────────────
      if (escolha === ACAO_OUTRO_DIA) {
        dados[CHAVE_HORARIO_FASE] = "dias";
        delete dados[CHAVE_DIAS_DESDE];
        return avancarPara(etapaAtual, snapshot, dados, contexto);
      }

      if (escolha === ACAO_VOLTAR_DIAS) {
        dados[CHAVE_HORARIO_FASE] = "dias";
        delete dados[CHAVE_DIA_ESCOLHIDO];
        delete dados[CHAVE_HORAS_DESDE];
        return avancarPara(etapaAtual, snapshot, dados, contexto);
      }

      if (escolha === ACAO_PRIMEIROS_DIAS) {
        delete dados[CHAVE_DIAS_DESDE];
        return avancarPara(etapaAtual, snapshot, dados, contexto);
      }

      if (escolha === ACAO_MAIS_DIAS) {
        // O cursor sai da última data desta página, não de um contador: entre a
        // mensagem e a resposta pode virar a meia-noite.
        const ultimaData = opcoes
          .filter((o) => !o.startsWith("__acao:"))
          .at(-1);

        if (typeof ultimaData === "string") {
          dados[CHAVE_DIAS_DESDE] = diaSeguinte(
            ultimaData,
            contexto.fusoHorario,
          );
        }
        return avancarPara(etapaAtual, snapshot, dados, contexto);
      }

      if (escolha === ACAO_MAIS_HORAS) {
        const ultimoIso = opcoes
          .filter((o) => !o.startsWith("__acao:"))
          .at(-1);

        if (typeof ultimoIso === "string") {
          dados[CHAVE_HORAS_DESDE] = formatarHora(
            { inicio: new Date(ultimoIso), fim: new Date(ultimoIso) },
            contexto.fusoHorario,
          );
        }
        return avancarPara(etapaAtual, snapshot, dados, contexto);
      }

      // ── Escolha de dia: avança para a fase `dia`, ainda sem sair da etapa ──
      if (fase === "dias") {
        dados[CHAVE_HORARIO_FASE] = "dia";
        dados[CHAVE_DIA_ESCOLHIDO] = escolha;
        delete dados[CHAVE_HORAS_DESDE];
        return avancarPara(etapaAtual, snapshot, dados, contexto);
      }

      /**
       * Escolha de horário — o único caminho que sai da etapa.
       *
       * A validação de data finita não é paranoia: sem ela, um sentinela ou
       * estado corrompido chegaria a `formatarSlot(new Date(lixo))`, que lança
       * `RangeError` dentro de `decidir` e antes de `persistir` — a Evolution
       * receberia 500 e entraria em retry do mesmo webhook indefinidamente.
       */
      if (!ehInstanteDaEngine(escolha)) {
        return reapresentar(
          etapaAtual,
          snapshot,
          dados,
          contexto,
          "Não entendi. Responda com o número de um dos horários.",
        );
      }

      dados[CHAVE_DATA_HORA] = escolha;
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

      /**
       * `typeof dataHora === "string"` não basta, e a diferença é um webhook em
       * loop.
       *
       * Qualquer string que não parseie como data — sentinela de navegação,
       * estado corrompido, formato antigo — passava por aqui. Duas consequências,
       * as duas silenciosas:
       *
       * - `formatarSlot(new Date(lixo))` lança `RangeError` (ECMA-402: `format`
       *   com valor não finito lança). O throw acontece dentro de `decidir`,
       *   antes de `persistir`, então a Evolution recebe 500 e **entra em retry
       *   do mesmo webhook indefinidamente**, com a conversa travada por 6h.
       * - A checagem de passado logo abaixo compara `NaN < limiteMinimo`, que é
       *   `false`: a data inválida **atravessa** e chega a criar agendamento.
       *
       * `Number.isFinite` fecha os dois de uma vez e troca o loop pela mensagem
       * de "faltou alguma informação" que já existe.
       */
      if (
        typeof servicoId !== "string" ||
        typeof dataHora !== "string" ||
        !Number.isFinite(new Date(dataHora).getTime()) ||
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
  efeito: EfeitoCriarAgendamento,
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
