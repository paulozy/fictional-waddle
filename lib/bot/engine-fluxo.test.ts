import { describe, expect, it } from "vitest";
import { instanteNoFuso } from "./disponibilidade";
import {
  conversaExpirou,
  decidir,
  mensagemAgendamentoConfirmado,
  respostasCustomizadas,
  type ContextoConversa,
  type Decisao,
  type EstadoConversa,
  type EtapaSnapshot,
} from "./engine-fluxo";

const FUSO = "America/Sao_Paulo";
/** Sexta-feira. Usada como "agora" em todos os testes. */
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

const ETAPA_PRIMEIRA_VEZ: EtapaSnapshot = {
  id: "etapa-primeira-vez",
  ordem: 2,
  tipo: "escolha_unica",
  pergunta_texto: "Primeira vez aqui?",
  opcoes: [
    { label: "Sim", valor: "sim" },
    { label: "Não", valor: "nao" },
  ],
  campo_destino: "primeira_vez",
  obrigatorio: true,
};

const ETAPA_OBSERVACAO: EtapaSnapshot = {
  id: "etapa-observacao",
  ordem: 4,
  tipo: "texto_livre",
  pergunta_texto: "Alguma observação?",
  opcoes: null,
  campo_destino: "observacao",
  obrigatorio: false,
};

/** Grade: seg-sex, 09:00-12:00. Sábado e domingo fechado. */
const GRADE = [1, 2, 3, 4, 5].map((dia) => ({
  dia_semana: dia,
  hora_inicio: "09:00:00",
  hora_fim: "12:00:00",
}));

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
      { id: "svc-barba", nome: "Barba", duracao_minutos: 30, preco: null },
    ],
    grade: GRADE,
    ocupados: [],
    expiracaoHoras: 6,
    ...sobrescritas,
  };
}

function mensagem(texto: string, pushName: string | null = "Cliente") {
  return { id: `msg-${texto}`, texto, pushName };
}

/** Encadeia mensagens a partir de um estado, como o webhook faria. */
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

describe("início de conversa", () => {
  it("apresenta a primeira etapa e tira o snapshot do fluxo", () => {
    const decisao = decidir(contexto(), null, mensagem("oi"));

    expect(decisao.mensagens).toHaveLength(1);
    expect(decisao.mensagens[0]).toContain("Qual serviço?");
    expect(decisao.mensagens[0]).toContain("1. Corte (60 min)");
    expect(decisao.estado?.etapaAtualId).toBe("etapa-servico");
    expect(decisao.estado?.fluxoSnapshot).toHaveLength(3);
  });

  it("mostra preço quando existe e omite quando é nulo", () => {
    const texto = decidir(contexto(), null, mensagem("oi")).mensagens[0];

    expect(texto).toMatch(/1\. Corte \(60 min\) — R\$\s?50,00/);
    expect(texto).toContain("2. Barba (30 min)\n");
  });

  it("ordena o snapshot por ordem, respeitando a configuração do dono", () => {
    const decisao = decidir(
      contexto({
        // Entregue fora de ordem de propósito.
        etapasAtivas: [ETAPA_CONFIRMACAO, ETAPA_SERVICO, ETAPA_HORARIO],
      }),
      null,
      mensagem("oi"),
    );

    expect(decisao.estado?.fluxoSnapshot.map((e) => e.tipo)).toEqual([
      "servico",
      "horario",
      "confirmacao",
    ]);
    expect(decisao.estado?.etapaAtualId).toBe("etapa-servico");
  });

  it("encerra com aviso quando o fluxo está vazio, em vez de ficar mudo", () => {
    const decisao = decidir(
      contexto({ etapasAtivas: [] }),
      null,
      mensagem("oi"),
    );

    expect(decisao.mensagens[0]).toMatch(/não está configurado/i);
    expect(decisao.estado).toBeNull();
  });

  it("encerra com aviso quando não há serviço ativo", () => {
    const decisao = decidir(
      contexto({ servicos: [] }),
      null,
      mensagem("oi"),
    );

    expect(decisao.mensagens[0]).toMatch(/Não há serviços disponíveis/);
    expect(decisao.estado).toBeNull();
  });
});

describe("entrada inválida", () => {
  it("reapresenta a etapa sem avançar", () => {
    const { passos, estado } = conversar(contexto(), ["oi", "banana"]);

    expect(passos[1].mensagens[0]).toMatch(/Não entendi/);
    // A pergunta é repetida junto com o aviso: a conversa nunca fica sem saída.
    expect(passos[1].mensagens[1]).toContain("Qual serviço?");
    expect(estado?.etapaAtualId).toBe("etapa-servico");
  });

  it("rejeita índice fora da lista", () => {
    const { passos, estado } = conversar(contexto(), ["oi", "9"]);

    expect(passos[1].mensagens[0]).toMatch(/Não entendi/);
    expect(estado?.etapaAtualId).toBe("etapa-servico");
  });

  it("rejeita zero (a lista é 1-based)", () => {
    const { estado } = conversar(contexto(), ["oi", "0"]);
    expect(estado?.etapaAtualId).toBe("etapa-servico");
  });

  it("nunca devolve zero mensagens numa etapa de pergunta", () => {
    for (const entrada of ["", "   ", "abc", "-1", "1.5", "999"]) {
      const { ultima } = conversar(contexto(), ["oi", entrada]);
      expect(ultima.mensagens.length, entrada).toBeGreaterThan(0);
    }
  });
});

describe("etapa de serviço", () => {
  it("guarda o serviço escolhido e avança para o horário", () => {
    const { passos, estado } = conversar(contexto(), ["oi", "1"]);

    expect(estado?.etapaAtualId).toBe("etapa-horario");
    expect(estado?.dadosTemporarios.__servico_id).toBe("svc-corte");
    expect(estado?.dadosTemporarios.__duracao_minutos).toBe(60);
    expect(passos[1].mensagens[0]).toContain("Qual horário?");
  });

  it("pede para escolher de novo se o serviço foi desativado no meio da conversa", () => {
    const ctx = contexto();
    const primeira = decidir(ctx, null, mensagem("oi"));

    // O dono desativou "Corte" entre a apresentação e a resposta.
    const semCorte = contexto({
      servicos: [
        { id: "svc-barba", nome: "Barba", duracao_minutos: 30, preco: null },
      ],
    });
    const segunda = decidir(semCorte, primeira.estado, mensagem("1"));

    expect(segunda.mensagens[0]).toMatch(/não está mais disponível/);
    expect(segunda.estado?.etapaAtualId).toBe("etapa-servico");
  });
});

describe("etapa de horário", () => {
  it("oferece horários do serviço escolhido, respeitando a duração", () => {
    const { passos } = conversar(contexto(), ["oi", "2"]); // Barba, 30 min

    // Passo de 60min na janela 09:00-12:00 → 09:00, 10:00, 11:00 por dia.
    expect(passos[1].mensagens[0]).toMatch(/09:00/);
    expect(passos[1].mensagens[0]).toMatch(/1\./);
  });

  it("não oferece horário já ocupado", () => {
    const ocupado = {
      inicio: instanteNoFuso("2026-08-07", "09:00", FUSO),
      fim: instanteNoFuso("2026-08-07", "12:00", FUSO),
    };
    const { passos } = conversar(
      contexto({ ocupados: [ocupado], antecedenciaMaximaDias: 1 }),
      ["oi", "1"],
    );

    // O dia inteiro está tomado e o horizonte é de 1 dia.
    expect(passos[1].mensagens[0]).toMatch(/Não encontrei horário livre/);
    expect(passos[1].estado).toBeNull();
  });

  it("guarda o instante escolhido, não o índice", () => {
    const { estado } = conversar(contexto(), ["oi", "1", "1"]);

    expect(estado?.dadosTemporarios.__data_hora).toBe(
      instanteNoFuso("2026-08-07", "09:00", FUSO).toISOString(),
    );
  });

  it("interpreta a resposta contra a lista que foi apresentada, não uma recalculada", () => {
    const ctx = contexto();
    const passo1 = decidir(ctx, null, mensagem("oi"));
    const passo2 = decidir(ctx, passo1.estado, mensagem("1"));

    const oferecidos = passo2.estado!.dadosTemporarios
      .__opcoes_oferecidas as string[];
    expect(oferecidos[0]).toBe(
      instanteNoFuso("2026-08-07", "09:00", FUSO).toISOString(),
    );

    // Outro cliente agendou 09:00 antes desta resposta chegar. A escolha "1"
    // precisa continuar significando 09:00 — se a engine recalculasse a lista,
    // "1" passaria a ser 10:00 e o cliente agendaria um horário que não pediu.
    const comOcupado = contexto({
      ocupados: [
        {
          inicio: instanteNoFuso("2026-08-07", "09:00", FUSO),
          fim: instanteNoFuso("2026-08-07", "10:00", FUSO),
        },
      ],
    });
    const passo3 = decidir(comOcupado, passo2.estado, mensagem("1"));

    expect(passo3.estado?.dadosTemporarios.__data_hora).toBe(
      instanteNoFuso("2026-08-07", "09:00", FUSO).toISOString(),
    );
  });
});

/**
 * A etapa oferecia só os 8 horários cronologicamente mais próximos — na prática
 * um dia — e qualquer resposta fora da lista voltava **a mesma lista**. Era um
 * laço fechado: quem só podia na semana seguinte não tinha caminho nenhum até lá,
 * e as únicas saídas eram abandonar ou o dono atender à mão.
 *
 * Grade dos fixtures: seg-sex 09:00-12:00, passo 60, serviço de 60 min = 3 slots
 * por dia. `AGORA` é sexta 07/08 08:00 e o horizonte default são 7 dias, então os
 * dias com vaga são 07, 10, 11, 12 e 13 — sábado e domingo ficam fora.
 */
describe("etapa horario: escolher o dia", () => {
  /** Índice da opção de escape na fase `proximos` (8 slots + a linha nova). */
  const OPCAO_OUTRO_DIA = "9";

  describe("fase proximos", () => {
    it("oferece o escape depois dos horários próximos", () => {
      const { ultima } = conversar(contexto(), ["oi", "1"]);

      expect(ultima.mensagens[0]).toContain("9. Quero escolher outro dia");
    });

    /**
     * Numa agenda que só tem vaga hoje, o escape levaria a um menu com uma opção
     * só — pior que não oferecer.
     */
    it("omite o escape quando não existe outro dia com vaga", () => {
      const { ultima } = conversar(
        contexto({ antecedenciaMaximaDias: 1 }),
        ["oi", "1"],
      );

      expect(ultima.mensagens[0]).not.toContain("outro dia");
    });

    it("não muda o caminho de quem aceita um horário próximo", () => {
      const { estado } = conversar(contexto(), ["oi", "1", "1"]);

      expect(estado?.dadosTemporarios.__data_hora).toBe(
        instanteNoFuso("2026-08-07", "09:00", FUSO).toISOString(),
      );
      expect(estado?.etapaAtualId).toBe("etapa-confirmacao");
    });
  });

  describe("fase dias", () => {
    it("lista só dias com vaga, pulando o fim de semana", () => {
      const { ultima } = conversar(contexto(), ["oi", "1", OPCAO_OUTRO_DIA]);
      const texto = ultima.mensagens[0];

      expect(texto).toContain("1. hoje (sex 07/08)");
      expect(texto).toContain("2. seg 10/08");
      expect(texto).toContain("5. qui 13/08");
      // Sábado 08/08 e domingo 09/08 estão fechados na grade.
      expect(texto).not.toContain("08/08");
      expect(texto).not.toContain("09/08");
    });

    it("continua na mesma etapa, sem avançar o fluxo", () => {
      const { ultima } = conversar(contexto(), ["oi", "1", OPCAO_OUTRO_DIA]);

      expect(ultima.estado?.etapaAtualId).toBe("etapa-horario");
      expect(ultima.estado?.dadosTemporarios.__horario_fase).toBe("dias");
    });

    /**
     * `antecedencia_maxima_dias` existia sem nenhuma forma de o cliente
     * descobrir: ele pediria "mais dias" até a opção sumir e concluiria que o bot
     * travou.
     */
    it("diz o teto da agenda quando não há mais dias", () => {
      const { ultima } = conversar(contexto(), ["oi", "1", OPCAO_OUTRO_DIA]);

      expect(ultima.mensagens[0]).not.toContain("Ver mais dias");
      expect(ultima.mensagens[0]).toContain("A agenda vai até qui 13/08");
    });

    it("pagina com Ver mais dias quando o horizonte é longo", () => {
      const ctx = contexto({ antecedenciaMaximaDias: 30 });
      const { ultima } = conversar(ctx, ["oi", "1", OPCAO_OUTRO_DIA]);

      expect(ultima.mensagens[0]).toContain("8. Ver mais dias");
      expect(ultima.mensagens[0]).not.toContain("A agenda vai até");

      // A página seguinte começa depois da última data mostrada, não num
      // contador: entre a mensagem e a resposta pode virar a meia-noite.
      const proxima = decidir(ctx, ultima.estado, mensagem("8"));
      expect(proxima.mensagens[0]).toContain("18/08");
      expect(proxima.mensagens[0]).not.toContain("hoje");
      // O cursor gravado espelha a página exibida, para que uma reapresentação
      // não mostre uma página diferente da que o cliente acabou de ver.
      expect(proxima.estado?.dadosTemporarios.__dias_desde).toBe("2026-08-18");
    });

    /**
     * Sem isto a última página era porta de mão única: sem "Ver mais dias" e sem
     * volta, quem paginou longe demais só saía abandonando — o mesmo defeito que
     * esta etapa existe para consertar.
     */
    it("oferece volta aos primeiros dias a partir da segunda página", () => {
      const ctx = contexto({ antecedenciaMaximaDias: 30 });
      const { ultima } = conversar(ctx, ["oi", "1", OPCAO_OUTRO_DIA]);

      expect(ultima.mensagens[0]).not.toContain("Voltar aos primeiros dias");

      const pagina2 = decidir(ctx, ultima.estado, mensagem("8"));
      expect(pagina2.mensagens[0]).toContain("9. Voltar aos primeiros dias");

      const voltou = decidir(ctx, pagina2.estado, mensagem("9"));
      expect(voltou.mensagens[0]).toContain("1. hoje (sex 07/08)");
      expect(voltou.estado?.dadosTemporarios.__dias_desde).toBeUndefined();
    });

    it("avisa com o vocabulário do dia quando o número é inválido", () => {
      const ctx = contexto();
      const { ultima } = conversar(ctx, ["oi", "1", OPCAO_OUTRO_DIA]);
      const erro = decidir(ctx, ultima.estado, mensagem("99"));

      expect(erro.mensagens[0]).toBe(
        "Não entendi. Responda com o número de um dos dias.",
      );
      expect(erro.estado?.dadosTemporarios.__horario_fase).toBe("dias");
    });
  });

  describe("fase dia", () => {
    /** Escape → escolher `2. seg 10/08`. */
    const ATE_SEGUNDA = ["oi", "1", OPCAO_OUTRO_DIA, "2"];

    it("mostra os horários do dia escolhido, agrupados por turno", () => {
      const { ultima } = conversar(
        contexto({
          grade: [1, 2, 3, 4, 5].flatMap((dia) => [
            { dia_semana: dia, hora_inicio: "09:00:00", hora_fim: "12:00:00" },
            { dia_semana: dia, hora_inicio: "14:00:00", hora_fim: "17:00:00" },
          ]),
        }),
        ATE_SEGUNDA,
      );
      const texto = ultima.mensagens[0];

      expect(texto).toContain("Horários livres em seg 10/08:");
      expect(texto).toContain("Manhã\n1. 09:00");
      expect(texto).toContain("Tarde\n4. 14:00");
      expect(texto).toContain("Escolher outro dia");
    });

    it("guarda a data escolhida como data de calendário, não instante", () => {
      const { ultima } = conversar(contexto(), ATE_SEGUNDA);

      expect(ultima.estado?.dadosTemporarios.__dia_escolhido).toBe("2026-08-10");
      expect(ultima.estado?.dadosTemporarios.__horario_fase).toBe("dia");
    });

    it("fecha o agendamento no dia pedido, não no primeiro disponível", () => {
      const { estado } = conversar(contexto(), [...ATE_SEGUNDA, "1"]);

      expect(estado?.dadosTemporarios.__data_hora).toBe(
        instanteNoFuso("2026-08-10", "09:00", FUSO).toISOString(),
      );
      expect(estado?.etapaAtualId).toBe("etapa-confirmacao");
    });

    it("volta ao menu de dias por Escolher outro dia", () => {
      const ctx = contexto();
      const { ultima } = conversar(ctx, ATE_SEGUNDA);
      // 3 horários do dia + a volta = posição 4.
      const volta = decidir(ctx, ultima.estado, mensagem("4"));

      expect(volta.mensagens[0]).toContain("dias com horário livre");
      expect(volta.estado?.dadosTemporarios.__horario_fase).toBe("dias");
      expect(volta.estado?.dadosTemporarios.__dia_escolhido).toBeUndefined();
    });

    /**
     * Uma regra cobre três casos que chegam aqui: o cliente demorou e virou a
     * meia-noite, o dia lotou durante a conversa, e os horários já passaram. Em
     * nenhum deles a conversa pode encerrar.
     */
    it("volta ao menu de dias, sem encerrar, se o dia esvaziou", () => {
      const ctx = contexto();
      const { ultima } = conversar(ctx, ATE_SEGUNDA);

      const segundaTomada = contexto({
        ocupados: [
          {
            inicio: instanteNoFuso("2026-08-10", "09:00", FUSO),
            fim: instanteNoFuso("2026-08-10", "12:00", FUSO),
          },
        ],
      });
      const erro = decidir(segundaTomada, ultima.estado, mensagem("99"));

      expect(erro.mensagens.join("\n")).toContain(
        "Esse dia não tem mais horário livre",
      );
      expect(erro.estado).not.toBeNull();

      /**
       * A fase **tem** de acompanhar a mensagem. A primeira versão disto gravava
       * `"dia"` enquanto as opções já eram datas: o cliente escolhia
       * "2. ter 11/08" e o bot respondia "Quando: seg 10/08 21:00", porque
       * `"2026-08-11"` vira meia-noite UTC. Criava agendamento no dia errado e
       * fora do horário de funcionamento.
       */
      expect(erro.estado?.dadosTemporarios.__horario_fase).toBe("dias");
      expect(erro.estado?.dadosTemporarios.__dia_escolhido).toBeUndefined();
    });

    it("uma data escolhida no menu de dias nunca vira horário agendado", () => {
      const ctx = contexto();
      const { ultima } = conversar(ctx, ATE_SEGUNDA);

      const segundaTomada = contexto({
        ocupados: [
          {
            inicio: instanteNoFuso("2026-08-10", "09:00", FUSO),
            fim: instanteNoFuso("2026-08-10", "12:00", FUSO),
          },
        ],
      });
      const voltou = decidir(segundaTomada, ultima.estado, mensagem("99"));
      // "2" no menu de dias que ele acabou de receber.
      const escolha = decidir(segundaTomada, voltou.estado, mensagem("2"));

      // Precisa ter avançado para a fase `dia`, não para a confirmação.
      expect(escolha.estado?.etapaAtualId).toBe("etapa-horario");
      expect(escolha.estado?.dadosTemporarios.__data_hora).toBeUndefined();
      expect(escolha.estado?.dadosTemporarios.__horario_fase).toBe("dia");
    });

    it("interpreta a resposta contra a lista apresentada, também nesta fase", () => {
      const ctx = contexto();
      const { ultima } = conversar(ctx, ATE_SEGUNDA);

      // Alguém tomou 09:00 de segunda antes desta resposta chegar.
      const comOcupado = contexto({
        ocupados: [
          {
            inicio: instanteNoFuso("2026-08-10", "09:00", FUSO),
            fim: instanteNoFuso("2026-08-10", "10:00", FUSO),
          },
        ],
      });
      const escolha = decidir(comOcupado, ultima.estado, mensagem("1"));

      expect(escolha.estado?.dadosTemporarios.__data_hora).toBe(
        instanteNoFuso("2026-08-10", "09:00", FUSO).toISOString(),
      );
    });

    it("pagina dentro do dia quando há mais horários que o teto", () => {
      const ctx = contexto({
        passoSlotMinutos: 30,
        grade: [1, 2, 3, 4, 5].map((dia) => ({
          dia_semana: dia,
          hora_inicio: "09:00:00",
          hora_fim: "19:00:00",
        })),
      });
      const { ultima } = conversar(ctx, ATE_SEGUNDA);

      expect(ultima.mensagens[0]).toContain("Ver mais horários deste dia");

      const pagina2 = decidir(ctx, ultima.estado, mensagem("11"));
      // A primeira página vai de 09:00 a 13:30; a seguinte começa depois dela.
      expect(pagina2.mensagens[0]).not.toContain("1. 09:00");
      expect(pagina2.mensagens[0]).toContain("14:00");
    });
  });

  describe("compatibilidade e estado corrompido", () => {
    /**
     * Uma conversa parada nesta etapa no instante do deploy tem
     * `__opcoes_oferecidas` só com ISOs e nenhuma chave nova. Qualquer default
     * diferente de "interpreta como antes" faria o cliente que digitasse "9" cair
     * numa ação que ele nunca viu na tela.
     */
    it("interpreta estado da engine antiga como índice puro", () => {
      const iso = instanteNoFuso("2026-08-10", "10:00", FUSO).toISOString();
      const estadoLegado: EstadoConversa = {
        etapaAtualId: "etapa-horario",
        fluxoSnapshot: [ETAPA_SERVICO, ETAPA_HORARIO, ETAPA_CONFIRMACAO],
        dadosTemporarios: {
          __servico_id: "svc-corte",
          __servico_nome: "Corte",
          __duracao_minutos: 60,
          // Sem `__horario_v`, e sem nenhum sentinela na lista.
          __opcoes_oferecidas: [
            instanteNoFuso("2026-08-10", "09:00", FUSO).toISOString(),
            iso,
          ],
        },
        atualizadoEm: AGORA,
      };

      const decisao = decidir(contexto(), estadoLegado, mensagem("2"));

      expect(decisao.estado?.dadosTemporarios.__data_hora).toBe(iso);
      expect(decisao.estado?.etapaAtualId).toBe("etapa-confirmacao");
    });

    it("marca a versão do formato em toda apresentação da etapa", () => {
      const { ultima } = conversar(contexto(), ["oi", "1"]);

      expect(ultima.estado?.dadosTemporarios.__horario_v).toBe(2);
    });

    /**
     * Sem esta guarda, um sentinela em `__data_hora` chegaria a
     * `formatarSlot(new Date(lixo))`, que lança `RangeError` dentro de `decidir` e
     * antes de `persistir`: a Evolution receberia 500 e entraria em retry do
     * mesmo webhook indefinidamente, com a conversa travada por 6h.
     */
    it("não aceita valor que não é data como horário escolhido", () => {
      const estadoEnvenenado: EstadoConversa = {
        etapaAtualId: "etapa-horario",
        fluxoSnapshot: [ETAPA_SERVICO, ETAPA_HORARIO, ETAPA_CONFIRMACAO],
        dadosTemporarios: {
          __servico_id: "svc-corte",
          __servico_nome: "Corte",
          __duracao_minutos: 60,
          __horario_v: 2,
          __opcoes_oferecidas: ["isto-nao-e-data"],
        },
        atualizadoEm: AGORA,
      };

      const decisao = decidir(contexto(), estadoEnvenenado, mensagem("1"));

      expect(decisao.estado?.dadosTemporarios.__data_hora).toBeUndefined();
      expect(decisao.mensagens[0]).toContain("Não entendi");
    });

    it("a confirmação rejeita data inválida em vez de lançar", () => {
      const estadoEnvenenado: EstadoConversa = {
        etapaAtualId: "etapa-confirmacao",
        fluxoSnapshot: [ETAPA_SERVICO, ETAPA_HORARIO, ETAPA_CONFIRMACAO],
        dadosTemporarios: {
          __servico_id: "svc-corte",
          __servico_nome: "Corte",
          __duracao_minutos: 60,
          __data_hora: "__acao:voltar_dias",
        },
        atualizadoEm: AGORA,
      };

      // O que se testa é a ausência de throw: um RangeError aqui viraria 500 e
      // retry infinito da Evolution.
      const decisao = decidir(contexto(), estadoEnvenenado, mensagem("1"));

      expect(decisao.mensagens[0]).toMatch(/Faltou alguma informação/);
      expect(decisao.estado).toBeNull();
      expect(decisao.efeitos).toEqual([]);
    });
  });
});

describe("etapas customizadas", () => {
  const ctx = contexto({
    etapasAtivas: [
      ETAPA_SERVICO,
      ETAPA_PRIMEIRA_VEZ,
      { ...ETAPA_HORARIO, ordem: 3 },
      ETAPA_OBSERVACAO,
      { ...ETAPA_CONFIRMACAO, ordem: 5 },
    ],
  });

  it("grava escolha_unica pelo valor, sob a chave de campo_destino", () => {
    const { estado } = conversar(ctx, ["oi", "1", "2"]);

    expect(estado?.dadosTemporarios.primeira_vez).toBe("nao");
    expect(estado?.etapaAtualId).toBe("etapa-horario");
  });

  it("grava texto_livre literalmente", () => {
    const { estado } = conversar(ctx, [
      "oi",
      "1",
      "1",
      "1",
      "Sou alérgica a amônia",
    ]);

    expect(estado?.dadosTemporarios.observacao).toBe("Sou alérgica a amônia");
    expect(estado?.etapaAtualId).toBe("etapa-confirmacao");
  });

  it("aceita resposta vazia em texto_livre não obrigatório", () => {
    const { estado } = conversar(ctx, ["oi", "1", "1", "1", ""]);

    expect(estado?.dadosTemporarios.observacao).toBe("");
    expect(estado?.etapaAtualId).toBe("etapa-confirmacao");
  });

  it("exige resposta em texto_livre obrigatório", () => {
    const obrigatorio = contexto({
      etapasAtivas: [
        ETAPA_SERVICO,
        { ...ETAPA_HORARIO, ordem: 2 },
        { ...ETAPA_OBSERVACAO, ordem: 3, obrigatorio: true },
        { ...ETAPA_CONFIRMACAO, ordem: 4 },
      ],
    });

    const { ultima, estado } = conversar(obrigatorio, ["oi", "1", "1", ""]);

    expect(ultima.mensagens[0]).toMatch(/Preciso de uma resposta/);
    expect(estado?.etapaAtualId).toBe("etapa-observacao");
  });

  it("trata escolha_unica sem opções configuradas como texto livre, sem travar", () => {
    const malConfigurada = contexto({
      etapasAtivas: [
        ETAPA_SERVICO,
        { ...ETAPA_PRIMEIRA_VEZ, opcoes: [] },
        { ...ETAPA_HORARIO, ordem: 3 },
        { ...ETAPA_CONFIRMACAO, ordem: 4 },
      ],
    });

    const { estado } = conversar(malConfigurada, ["oi", "1", "qualquer coisa"]);

    expect(estado?.dadosTemporarios.primeira_vez).toBe("qualquer coisa");
    expect(estado?.etapaAtualId).toBe("etapa-horario");
  });

  it("mostra as respostas customizadas rotuladas no resumo de confirmação", () => {
    const { ultima } = conversar(ctx, ["oi", "1", "1", "1", "sem química"]);

    expect(ultima.mensagens[0]).toContain("Serviço: Corte");
    // Rotulado com o texto da pergunta e o label da opção, não o valor cru.
    expect(ultima.mensagens[0]).toContain("Primeira vez aqui?: Sim");
    expect(ultima.mensagens[0]).toContain("Alguma observação?: sem química");
    expect(ultima.mensagens[0]).toContain("1. Confirmar");
  });
});

describe("confirmação", () => {
  const passosAteConfirmar = ["oi", "1", "1"];

  it("grava o agendamento e encerra a conversa", () => {
    const { ultima } = conversar(contexto(), [...passosAteConfirmar, "1"]);

    expect(ultima.efeitos).toHaveLength(1);
    expect(ultima.efeitos[0]).toMatchObject({
      tipo: "criar_agendamento",
      servicoId: "svc-corte",
      duracaoMinutos: 60,
      nomeCliente: "Cliente",
    });
    expect(ultima.efeitos[0].dataHora.toISOString()).toBe(
      instanteNoFuso("2026-08-07", "09:00", FUSO).toISOString(),
    );
    // Estado limpo: a conversa terminou.
    expect(ultima.estado).toBeNull();
  });

  it("não inclui chaves internas em respostas_extras", () => {
    const ctx = contexto({
      etapasAtivas: [
        ETAPA_SERVICO,
        { ...ETAPA_HORARIO, ordem: 2 },
        { ...ETAPA_OBSERVACAO, ordem: 3 },
        { ...ETAPA_CONFIRMACAO, ordem: 4 },
      ],
    });

    const { ultima } = conversar(ctx, ["oi", "1", "1", "trazer alguém", "1"]);

    expect(ultima.efeitos[0].respostasExtras).toEqual({
      observacao: "trazer alguém",
    });
  });

  it("aceita variações de resposta afirmativa", () => {
    for (const sim of ["1", "sim", "SIM", "Confirmar", "ok", "confirmo"]) {
      const { ultima } = conversar(contexto(), [...passosAteConfirmar, sim]);
      expect(ultima.efeitos, sim).toHaveLength(1);
    }
  });

  it("cancela sem gravar nada em resposta negativa", () => {
    for (const nao of ["2", "nao", "não", "cancelar", "N"]) {
      const { ultima } = conversar(contexto(), [...passosAteConfirmar, nao]);
      expect(ultima.efeitos, nao).toEqual([]);
      expect(ultima.estado, nao).toBeNull();
      expect(ultima.mensagens[0]).toMatch(/cancelado/i);
    }
  });

  it("reapresenta o resumo quando a resposta é ambígua", () => {
    const { ultima, estado } = conversar(contexto(), [
      ...passosAteConfirmar,
      "talvez",
    ]);

    expect(ultima.efeitos).toEqual([]);
    expect(ultima.mensagens[0]).toMatch(/1 para confirmar ou 2 para cancelar/);
    expect(estado?.etapaAtualId).toBe("etapa-confirmacao");
  });

  it("recusa confirmar horário que já passou e pede outro", () => {
    /**
     * A conversa só expira em 6h, então o cliente pode escolher 13:00 às 09:00 e
     * confirmar às 13:40. A EXCLUDE do banco barra sobreposição, não passado.
     */
    const escolhido = instanteNoFuso("2026-08-07", "09:00", FUSO);
    const estado: EstadoConversa = {
      etapaAtualId: "etapa-confirmacao",
      fluxoSnapshot: [ETAPA_SERVICO, ETAPA_HORARIO, ETAPA_CONFIRMACAO],
      dadosTemporarios: {
        __servico_id: "svc-corte",
        __servico_nome: "Corte",
        __duracao_minutos: 60,
        __data_hora: escolhido.toISOString(),
        __opcoes_oferecidas: ["sim", "nao"],
      },
      atualizadoEm: AGORA,
    };

    const decisao = decidir(
      // Duas horas depois do horário escolhido.
      contexto({ agora: instanteNoFuso("2026-08-07", "11:00", FUSO) }),
      estado,
      mensagem("1"),
    );

    expect(decisao.efeitos).toEqual([]);
    expect(decisao.mensagens[0]).toMatch(/já passou/);
    // Volta para a escolha de horário, sem o horário vencido no estado.
    expect(decisao.estado?.etapaAtualId).toBe("etapa-horario");
    expect(decisao.estado?.dadosTemporarios.__data_hora).toBeUndefined();
    // E o serviço escolhido é preservado: não faz o cliente recomeçar do zero.
    expect(decisao.estado?.dadosTemporarios.__servico_id).toBe("svc-corte");
  });

  it("respeita a antecedência mínima na confirmação", () => {
    const escolhido = instanteNoFuso("2026-08-07", "10:00", FUSO);
    const estado: EstadoConversa = {
      etapaAtualId: "etapa-confirmacao",
      fluxoSnapshot: [ETAPA_SERVICO, ETAPA_HORARIO, ETAPA_CONFIRMACAO],
      dadosTemporarios: {
        __servico_id: "svc-corte",
        __duracao_minutos: 60,
        __data_hora: escolhido.toISOString(),
        __opcoes_oferecidas: ["sim", "nao"],
      },
      atualizadoEm: AGORA,
    };

    // 09:30 + 60min de antecedência = nada antes de 10:30, então 10:00 não vale.
    const decisao = decidir(
      contexto({
        agora: instanteNoFuso("2026-08-07", "09:30", FUSO),
        antecedenciaMinimaMinutos: 60,
      }),
      estado,
      mensagem("1"),
    );

    expect(decisao.efeitos).toEqual([]);
    expect(decisao.estado?.etapaAtualId).toBe("etapa-horario");
  });

  it("encerra sem gravar se faltar dado essencial no estado", () => {
    // Estado corrompido: chegou na confirmação sem data_hora.
    const estado: EstadoConversa = {
      etapaAtualId: "etapa-confirmacao",
      fluxoSnapshot: [ETAPA_SERVICO, ETAPA_HORARIO, ETAPA_CONFIRMACAO],
      dadosTemporarios: {
        __servico_id: "svc-corte",
        __duracao_minutos: 60,
        __opcoes_oferecidas: ["sim", "nao"],
      },
      atualizadoEm: AGORA,
    };

    const decisao = decidir(contexto(), estado, mensagem("1"));

    expect(decisao.efeitos).toEqual([]);
    expect(decisao.estado).toBeNull();
    expect(decisao.mensagens[0]).toMatch(/Faltou alguma informação/);
  });

  it("encerra sem gravar quando o fluxo não tem etapa de confirmação", () => {
    // Gravar sem confirmação seria pior que não gravar.
    const semConfirmacao = contexto({
      etapasAtivas: [ETAPA_SERVICO, ETAPA_HORARIO],
    });

    const { ultima } = conversar(semConfirmacao, ["oi", "1", "1"]);

    expect(ultima.efeitos).toEqual([]);
    expect(ultima.estado).toBeNull();
    expect(ultima.mensagens[0]).toMatch(/já vamos te retornar/);
  });
});

describe("expiração de conversa", () => {
  const estadoAntigo: EstadoConversa = {
    etapaAtualId: "etapa-horario",
    fluxoSnapshot: [ETAPA_SERVICO, ETAPA_HORARIO, ETAPA_CONFIRMACAO],
    dadosTemporarios: { __servico_id: "svc-corte", __duracao_minutos: 60 },
    atualizadoEm: new Date(AGORA.getTime() - 7 * 3_600_000),
  };

  it("reconhece conversa abandonada pelo tempo de inatividade", () => {
    expect(conversaExpirou(estadoAntigo, contexto())).toBe(true);
    expect(
      conversaExpirou(
        { ...estadoAntigo, atualizadoEm: AGORA },
        contexto(),
      ),
    ).toBe(false);
  });

  it("recomeça do zero em conversa expirada, descartando o estado antigo", () => {
    const decisao = decidir(contexto(), estadoAntigo, mensagem("1"));

    expect(decisao.estado?.etapaAtualId).toBe("etapa-servico");
    expect(decisao.estado?.dadosTemporarios.__servico_id).toBeUndefined();
  });
});

describe("robustez do estado", () => {
  it("recomeça quando a etapa atual desapareceu do snapshot", () => {
    const estado: EstadoConversa = {
      etapaAtualId: "etapa-que-nao-existe",
      fluxoSnapshot: [ETAPA_SERVICO, ETAPA_HORARIO, ETAPA_CONFIRMACAO],
      dadosTemporarios: {},
      atualizadoEm: AGORA,
    };

    const decisao = decidir(contexto(), estado, mensagem("1"));

    expect(decisao.estado?.etapaAtualId).toBe("etapa-servico");
  });

  it("usa o snapshot da conversa, não o fluxo atual do dono", () => {
    // Conversa começou com o fluxo de 3 etapas.
    const primeira = decidir(contexto(), null, mensagem("oi"));

    // O dono adicionou uma etapa nova enquanto a conversa estava em curso.
    const fluxoNovo = contexto({
      etapasAtivas: [
        ETAPA_SERVICO,
        ETAPA_PRIMEIRA_VEZ,
        { ...ETAPA_HORARIO, ordem: 3 },
        { ...ETAPA_CONFIRMACAO, ordem: 4 },
      ],
    });
    const segunda = decidir(fluxoNovo, primeira.estado, mensagem("1"));

    // A conversa em voo termina na versão em que começou: pula a etapa nova.
    expect(segunda.estado?.etapaAtualId).toBe("etapa-horario");
    expect(segunda.estado?.fluxoSnapshot).toHaveLength(3);
  });

  it("não muta o estado recebido", () => {
    const estado: EstadoConversa = {
      etapaAtualId: "etapa-servico",
      fluxoSnapshot: [ETAPA_SERVICO, ETAPA_HORARIO, ETAPA_CONFIRMACAO],
      dadosTemporarios: { __opcoes_oferecidas: ["svc-corte", "svc-barba"] },
      atualizadoEm: AGORA,
    };
    const copia = structuredClone({
      ...estado,
      atualizadoEm: estado.atualizadoEm.toISOString(),
    });

    decidir(contexto(), estado, mensagem("1"));

    expect({
      ...estado,
      atualizadoEm: estado.atualizadoEm.toISOString(),
    }).toEqual(copia);
  });
});

describe("respostasCustomizadas", () => {
  it("descarta apenas as chaves internas com prefixo __", () => {
    expect(
      respostasCustomizadas({
        __servico_id: "x",
        __data_hora: "y",
        observacao: "manter",
        primeira_vez: "sim",
      }),
    ).toEqual({ observacao: "manter", primeira_vez: "sim" });
  });
});

describe("mensagemAgendamentoConfirmado", () => {
  it("informa serviço e horário no fuso do estabelecimento", () => {
    const texto = mensagemAgendamentoConfirmado(
      {
        tipo: "criar_agendamento",
        servicoId: "svc-corte",
        dataHora: instanteNoFuso("2026-08-07", "09:00", FUSO),
        duracaoMinutos: 60,
        nomeCliente: "Cliente",
        respostasExtras: {},
      },
      "Corte",
      FUSO,
    );

    expect(texto).toContain("Corte");
    expect(texto).toContain("09:00");
    expect(texto).toMatch(/lembrete/);
  });

  /**
   * O formato do slot é contrato público, não detalhe interno: a transcrição em
   * `components/conversa-demo.tsx` é anunciada na landing e em `/como-funciona`
   * como o que o bot realmente manda.
   *
   * O bug que este teste tranca: `.replace(",", "")` removia só a primeira das
   * **duas** vírgulas que o pt-BR emite (`"sex., 14/08, 09:00"`), e o cliente
   * recebia uma vírgula solta antes da hora.
   */
  it("formata o horário sem vírgula nem ponto sobrando", () => {
    const texto = mensagemAgendamentoConfirmado(
      {
        tipo: "criar_agendamento",
        servicoId: "svc-corte",
        dataHora: instanteNoFuso("2026-08-14", "09:00", FUSO),
        duracaoMinutos: 60,
        nomeCliente: "Cliente",
        respostasExtras: {},
      },
      "Corte",
      FUSO,
    );

    expect(texto).toContain("sex 14/08 09:00");
    expect(texto).not.toContain("sex.");
    expect(texto).not.toContain(", 09:00");
  });
});
