import { describe, expect, it } from "vitest";
import { instanteNoFuso } from "./disponibilidade";
import { ID_ETAPA_CANCELAMENTO } from "./cancelamento";
import {
  decidir,
  type ContextoConversa,
  type Decisao,
  type EstadoConversa,
  type EtapaSnapshot,
} from "./engine-fluxo";

/**
 * Cancelamento pelo cliente, exercitado **através de `decidir`** e não chamando o
 * módulo direto.
 *
 * É de propósito: metade do risco desta feature está no enxerto na engine — em
 * especial na ordem do dispatch, que precisa vir antes do `find` no snapshot, senão a
 * conversa reinicia a cada mensagem e o cliente nunca sai do menu.
 */

const FUSO = "America/Sao_Paulo";
/** Sexta-feira, 08:00. */
const AGORA = instanteNoFuso("2026-08-07", "08:00", FUSO);

const ETAPA_SERVICO: EtapaSnapshot = {
  id: "etapa-servico",
  ordem: 1,
  tipo: "servico",
  pergunta_texto: "Qual serviço?",
  opcoes: null,
  campo_destino: null,
  obrigatorio: true,
};

const ETAPA_HORARIO: EtapaSnapshot = {
  id: "etapa-horario",
  ordem: 2,
  tipo: "horario",
  pergunta_texto: "Qual horário?",
  opcoes: null,
  campo_destino: null,
  obrigatorio: true,
};

const ETAPA_CONFIRMACAO: EtapaSnapshot = {
  id: "etapa-confirmacao",
  ordem: 3,
  tipo: "confirmacao",
  pergunta_texto: "Confere:",
  opcoes: null,
  campo_destino: null,
  obrigatorio: true,
};

const GRADE = [1, 2, 3, 4, 5].map((dia) => ({
  dia_semana: dia,
  hora_inicio: "09:00:00",
  hora_fim: "12:00:00",
}));

const ID_A = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";

function agendamento(id: string, data: string, hora: string, servico = "Corte") {
  return {
    id,
    dataHora: instanteNoFuso(data, hora, FUSO),
    servicoNome: servico,
  };
}

function contexto(
  sobrescritas: Partial<ContextoConversa> = {},
): ContextoConversa {
  return {
    agora: AGORA,
    fusoHorario: FUSO,
    passoSlotMinutos: 60,
    antecedenciaMinimaMinutos: 0,
    antecedenciaMaximaDias: 7,
    etapasAtivas: [ETAPA_SERVICO, ETAPA_HORARIO, ETAPA_CONFIRMACAO],
    servicos: [
      { id: "svc-corte", nome: "Corte", duracao_minutos: 60, preco: 50 },
    ],
    grade: GRADE,
    ocupados: [],
    agendamentosDoCliente: [],
    expiracaoHoras: 6,
    ...sobrescritas,
  };
}

function mensagem(texto: string) {
  return { id: `msg-${texto}`, texto, pushName: "Cliente" };
}

function conversar(
  ctx: ContextoConversa,
  textos: string[],
  estadoInicial: EstadoConversa | null = null,
) {
  let estado = estadoInicial;
  const passos: Decisao[] = [];

  for (const texto of textos) {
    const decisao = decidir(ctx, estado, mensagem(texto));
    passos.push(decisao);
    estado = decisao.estado;
  }

  return { passos, estado, ultima: passos.at(-1)! };
}

/** Um agendamento futuro. */
const UM = contexto({
  agendamentosDoCliente: [agendamento(ID_A, "2026-08-10", "09:00")],
});

/** Dois agendamentos futuros. */
const DOIS = contexto({
  agendamentosDoCliente: [
    agendamento(ID_A, "2026-08-10", "09:00"),
    agendamento(ID_B, "2026-08-11", "10:00", "Barba"),
  ],
});

describe("entrada da conversa", () => {
  /**
   * O caminho mais quente do produto. Se este teste quebrar, todo cliente novo passou
   * a receber uma pergunta que não existia.
   */
  it("quem não tem agendamento cai direto no roteiro, como antes", () => {
    const decisao = decidir(contexto(), null, mensagem("oi"));

    expect(decisao.mensagens[0]).toContain("Qual serviço?");
    expect(decisao.estado?.etapaAtualId).toBe("etapa-servico");
  });

  it("quem tem agendamento vê o menu de entrada", () => {
    const decisao = decidir(UM, null, mensagem("oi"));

    expect(decisao.mensagens[0]).toContain("Você já tem horário marcado");
    expect(decisao.mensagens[0]).toContain("1. Quero marcar um horário");
    expect(decisao.mensagens[0]).toMatch(/2\. Quero cancelar/);
    expect(decisao.estado?.etapaAtualId).toBe(ID_ETAPA_CANCELAMENTO);
  });

  it("nomeia o horário no fuso do estabelecimento", () => {
    const texto = decidir(UM, null, mensagem("oi")).mensagens[0];

    // 09:00 de parede, não 12:00 UTC.
    expect(texto).toContain("09:00");
    expect(texto).toContain("seg 10/08");
  });

  it("agendamento que já passou não abre o menu", () => {
    const ctx = contexto({
      agendamentosDoCliente: [agendamento(ID_A, "2026-08-06", "09:00")],
    });

    expect(decidir(ctx, null, mensagem("oi")).estado?.etapaAtualId).toBe(
      "etapa-servico",
    );
  });

  it("escolher marcar segue para o roteiro do dono", () => {
    const { estado, ultima } = conversar(UM, ["oi", "1"]);

    expect(ultima.mensagens[0]).toContain("Qual serviço?");
    expect(estado?.etapaAtualId).toBe("etapa-servico");
    expect(ultima.efeitos).toEqual([]);
  });
});

describe("escolha do agendamento", () => {
  /** Com um só, um menu de uma opção seria pedágio sem informação. */
  it("com um agendamento pula direto para a confirmação", () => {
    const { estado, ultima } = conversar(UM, ["oi", "2"]);

    expect(ultima.mensagens[0]).toMatch(/Confirma o cancelamento/);
    expect(estado?.dadosTemporarios.__cancelamento_fase).toBe("confirmar");
    expect(estado?.dadosTemporarios.__cancelar_id).toBe(ID_A);
  });

  it("com dois agendamentos lista os dois e a saída", () => {
    const { estado, ultima } = conversar(DOIS, ["oi", "2"]);

    expect(ultima.mensagens[0]).toContain("1. seg 10/08 09:00 — Corte");
    expect(ultima.mensagens[0]).toContain("2. ter 11/08 10:00 — Barba");
    expect(ultima.mensagens[0]).toMatch(/3\. Nenhum desses/);
    expect(estado?.dadosTemporarios.__cancelamento_fase).toBe("escolher");
  });

  it("a saída da lista leva ao roteiro de agendamento", () => {
    const { estado, ultima } = conversar(DOIS, ["oi", "2", "3"]);

    expect(ultima.mensagens[0]).toContain("Qual serviço?");
    expect(estado?.etapaAtualId).toBe("etapa-servico");
  });

  /**
   * A invariante central: a resposta é interpretada contra a lista **apresentada**,
   * nunca contra uma recalculada. Sem isso, um agendamento novo aparecendo no meio da
   * conversa faria o índice apontar para outro horário — o cliente cancelaria o que
   * não pediu.
   */
  it("interpreta o índice contra a lista apresentada, não a atual", () => {
    const primeira = decidir(DOIS, null, mensagem("oi"));
    const menu = decidir(DOIS, primeira.estado, mensagem("2"));

    // Entre apresentar e responder, entra um agendamento mais próximo que os dois.
    const ID_C = "cccccccc-3333-4333-8333-cccccccccccc";
    const depois = contexto({
      agendamentosDoCliente: [
        agendamento(ID_C, "2026-08-08", "09:00", "Sobrancelha"),
        ...DOIS.agendamentosDoCliente,
      ],
    });

    const escolha = decidir(depois, menu.estado, mensagem("1"));

    // "1" era o Corte de seg 10/08 quando a lista foi lida, e continua sendo.
    expect(escolha.estado?.dadosTemporarios.__cancelar_id).toBe(ID_A);
    expect(escolha.mensagens[0]).toContain("seg 10/08 09:00");
  });
});

describe("confirmação", () => {
  it("emite o efeito de cancelar e encerra a conversa", () => {
    const { estado, ultima } = conversar(UM, ["oi", "2", "1"]);

    expect(ultima.efeitos).toEqual([
      { tipo: "cancelar_agendamento", agendamentoId: ID_A },
    ]);
    expect(ultima.mensagens[0]).toMatch(/foi cancelado/);
    expect(estado).toBeNull();
  });

  it("recusar mantém o horário, sem efeito", () => {
    const { estado, ultima } = conversar(UM, ["oi", "2", "2"]);

    expect(ultima.efeitos).toEqual([]);
    expect(ultima.mensagens[0]).toMatch(/está mantido/);
    expect(estado).toBeNull();
  });

  /**
   * `NEGATIVAS` da engine contém "cancelar" com o sentido de "aborte este
   * agendamento". Aqui a pergunta já é "quer cancelar?", e a palavra é ambígua:
   * poderia significar "sim, cancele o horário" ou "não, cancele a operação".
   * Aceitá-la faria o bot decidir o destino de um horário real por leitura arbitrária.
   */
  it("não aceita a palavra 'cancelar' como resposta", () => {
    for (const ambigua of ["cancelar", "cancela", "confirmar"]) {
      const { estado, ultima } = conversar(UM, ["oi", "2", ambigua]);

      expect(ultima.efeitos, ambigua).toEqual([]);
      expect(ultima.mensagens[0], ambigua).toMatch(/Não entendi/);
      expect(estado?.dadosTemporarios.__cancelamento_fase, ambigua).toBe(
        "confirmar",
      );
    }
  });

  it("aceita sim e não por extenso, com e sem acento", () => {
    expect(conversar(UM, ["oi", "2", "sim"]).ultima.efeitos).toHaveLength(1);
    expect(conversar(UM, ["oi", "2", "não"]).ultima.efeitos).toEqual([]);
    expect(conversar(UM, ["oi", "2", "nao"]).ultima.efeitos).toEqual([]);
  });

  /**
   * Guarda de sentinela, o análogo de `ehInstanteDaEngine`. Sem ela, um estado
   * corrompido mandaria `"__acao:manter"` ao `update` como id, o `22P02` viraria 500 e
   * a Evolution reentregaria o mesmo webhook indefinidamente.
   */
  it("estado com id que não é uuid volta ao menu em vez de emitir efeito", () => {
    const corrompido: EstadoConversa = {
      etapaAtualId: ID_ETAPA_CANCELAMENTO,
      fluxoSnapshot: [],
      dadosTemporarios: {
        __fluxo: "cancelamento",
        __cancelamento_fase: "confirmar",
        __cancelar_id: "__acao:manter",
        __opcoes_oferecidas: ["__acao:cancelar_confirma", "__acao:manter"],
      },
      atualizadoEm: AGORA,
    };

    const decisao = decidir(DOIS, corrompido, mensagem("1"));

    expect(decisao.efeitos).toEqual([]);
    expect(decisao.mensagens[0]).toMatch(/Qual horário você quer cancelar/);
  });

  it("agendamento que desapareceu durante a conversa volta ao menu", () => {
    const menu = conversar(DOIS, ["oi", "2"]);
    const escolha = decidir(DOIS, menu.estado, mensagem("1"));

    // O dono cancelou o ID_A pelo painel nesse meio-tempo.
    const semA = contexto({
      agendamentosDoCliente: [agendamento(ID_B, "2026-08-11", "10:00", "Barba")],
    });

    const decisao = decidir(semA, escolha.estado, mensagem("1"));

    expect(decisao.efeitos).toEqual([]);
    expect(decisao.mensagens.length).toBeGreaterThan(0);
  });

  it("último agendamento cancelado por fora leva ao roteiro", () => {
    const menu = conversar(UM, ["oi", "2"]);

    const decisao = decidir(contexto(), menu.estado, mensagem("1"));

    expect(decisao.efeitos).toEqual([]);
    expect(decisao.mensagens[0]).toContain("Qual serviço?");
  });
});

describe("robustez do fluxo", () => {
  it("nunca fica mudo, em nenhuma fase", () => {
    const entradas = ["", "   ", "abc", "0", "-1", "99", "1.5", "🙂"];

    for (const entrada of entradas) {
      for (const prefixo of [[], ["oi"], ["oi", "2"]]) {
        const { ultima } = conversar(DOIS, [...prefixo, entrada]);
        expect(ultima.mensagens.length, `${prefixo}|${entrada}`).toBeGreaterThan(0);
      }
    }
  });

  it("resposta inválida no menu de entrada reapresenta sem avançar", () => {
    const { estado, ultima } = conversar(UM, ["oi", "9"]);

    expect(ultima.mensagens[0]).toMatch(/Não entendi/);
    expect(estado?.dadosTemporarios.__cancelamento_fase).toBe("entrada");
  });

  /** A expiração de 6h vale para este fluxo sem nenhum código novo. */
  it("conversa de cancelamento expirada recomeça", () => {
    const menu = conversar(DOIS, ["oi", "2"]);
    const velho: EstadoConversa = {
      ...menu.estado!,
      atualizadoEm: new Date(AGORA.getTime() - 7 * 3_600_000),
    };

    const decisao = decidir(DOIS, velho, mensagem("1"));

    // Recomeça pelo menu de entrada, não segue na escolha antiga.
    expect(decisao.mensagens[0]).toContain("Você já tem horário marcado");
  });

  it("lista no máximo cinco agendamentos", () => {
    const muitos = Array.from({ length: 8 }, (_, i) =>
      agendamento(
        `${"d".repeat(8)}-${String(i).padStart(4, "0")}-4000-8000-${"e".repeat(12)}`,
        "2026-08-10",
        `0${i + 1}:00`.slice(-5),
      ),
    );

    const { estado } = conversar(
      contexto({ agendamentosDoCliente: muitos }),
      ["oi", "2"],
    );

    const opcoes = estado?.dadosTemporarios.__opcoes_oferecidas as string[];
    // Cinco agendamentos + a linha de escape.
    expect(opcoes).toHaveLength(6);
  });
});
