import { describe, expect, it } from "vitest";
import type { TipoEtapa } from "@/lib/bot/engine-fluxo";
import {
  campoDestinoSchema,
  ehEtapaDeSistema,
  etapaCustomizadaSchema,
  opcoesDeTextoLivre,
  rotuloDoTipo,
  validarFluxo,
  type EtapaParaValidar,
} from "./fluxo";

function etapa(
  tipo: TipoEtapa,
  campo_destino: string | null = null,
): EtapaParaValidar {
  return { id: `${tipo}-${campo_destino ?? "sistema"}`, tipo, campo_destino, ativo: true };
}

const FLUXO_PADRAO = [
  etapa("servico"),
  etapa("horario"),
  etapa("confirmacao"),
];

describe("ehEtapaDeSistema", () => {
  it("classifica as três etapas obrigatórias", () => {
    expect(ehEtapaDeSistema("servico")).toBe(true);
    expect(ehEtapaDeSistema("horario")).toBe(true);
    expect(ehEtapaDeSistema("confirmacao")).toBe(true);
    expect(ehEtapaDeSistema("escolha_unica")).toBe(false);
    expect(ehEtapaDeSistema("texto_livre")).toBe(false);
  });
});

describe("validarFluxo", () => {
  it("aceita o fluxo semeado por padrão", () => {
    expect(validarFluxo(FLUXO_PADRAO)).toEqual({ valido: true });
  });

  it("aceita perguntas customizadas em qualquer posição antes da confirmação", () => {
    const posicoes: EtapaParaValidar[][] = [
      // antes do serviço
      [etapa("escolha_unica", "a"), ...FLUXO_PADRAO],
      // entre serviço e horário
      [
        etapa("servico"),
        etapa("texto_livre", "b"),
        etapa("horario"),
        etapa("confirmacao"),
      ],
      // depois do horário
      [
        etapa("servico"),
        etapa("horario"),
        etapa("escolha_unica", "c"),
        etapa("confirmacao"),
      ],
    ];

    for (const fluxo of posicoes) {
      expect(validarFluxo(fluxo), JSON.stringify(fluxo.map((e) => e.tipo)))
        .toEqual({ valido: true });
    }
  });

  it("exige que serviço venha antes de horário", () => {
    // A disponibilidade depende da duração do serviço: não é preferência de UX.
    const resultado = validarFluxo([
      etapa("horario"),
      etapa("servico"),
      etapa("confirmacao"),
    ]);

    expect(resultado).toEqual({
      valido: false,
      erro: "A escolha do serviço precisa vir antes da escolha do horário.",
    });
  });

  it("exige que a confirmação seja a última", () => {
    const resultado = validarFluxo([
      etapa("servico"),
      etapa("horario"),
      etapa("confirmacao"),
      etapa("texto_livre", "depois"),
    ]);

    expect(resultado).toMatchObject({
      valido: false,
      erro: "A confirmação precisa ser a última etapa do fluxo.",
    });
  });

  it("exige a presença de cada etapa de sistema", () => {
    const casos: [EtapaParaValidar[], RegExp][] = [
      [[etapa("horario"), etapa("confirmacao")], /escolha do serviço/],
      [[etapa("servico"), etapa("confirmacao")], /escolha do horário/],
      [[etapa("servico"), etapa("horario")], /confirmação/],
      [[], /escolha do serviço/],
    ];

    for (const [fluxo, esperado] of casos) {
      const resultado = validarFluxo(fluxo);
      expect(resultado.valido).toBe(false);
      expect((resultado as { erro: string }).erro).toMatch(esperado);
    }
  });

  it("proíbe duplicar etapa de sistema", () => {
    const resultado = validarFluxo([
      etapa("servico"),
      { ...etapa("servico"), id: "servico-2" },
      etapa("horario"),
      etapa("confirmacao"),
    ]);

    expect(resultado).toMatchObject({
      valido: false,
      erro: "Só pode existir uma etapa de escolha do serviço.",
    });
  });

  it("proíbe campo_destino repetido — senão uma resposta sobrescreve a outra", () => {
    const resultado = validarFluxo([
      etapa("servico"),
      etapa("texto_livre", "observacao"),
      etapa("horario"),
      etapa("escolha_unica", "observacao"),
      etapa("confirmacao"),
    ]);

    expect(resultado.valido).toBe(false);
    expect((resultado as { erro: string }).erro).toMatch(/mesmo campo/);
  });

  it("não confunde campo nulo das etapas de sistema com repetição", () => {
    // As três etapas de sistema têm campo_destino nulo, e isso é correto.
    expect(validarFluxo(FLUXO_PADRAO)).toEqual({ valido: true });
  });
});

describe("campoDestinoSchema", () => {
  it("aceita identificadores simples", () => {
    for (const valido of ["primeira_vez", "obs", "campo_1", "a"]) {
      expect(campoDestinoSchema.safeParse(valido).success, valido).toBe(true);
    }
  });

  it("rejeita o prefixo reservado da engine", () => {
    // `__` é usado por dados internos em dados_temporarios; o banco também
    // proíbe. Permitir aqui deixaria o cliente sobrescrever o estado do bot.
    for (const invalido of ["__servico_id", "__data_hora", "__"]) {
      expect(campoDestinoSchema.safeParse(invalido).success, invalido).toBe(
        false,
      );
    }
  });

  it("rejeita formatos que não são identificador", () => {
    for (const invalido of [
      "Primeira Vez",
      "primeira vez",
      "1campo",
      "campo-destino",
      "acentuação",
      "",
      "_campo",
    ]) {
      expect(campoDestinoSchema.safeParse(invalido).success, invalido).toBe(
        false,
      );
    }
  });
});

describe("etapaCustomizadaSchema", () => {
  const base = {
    tipo: "texto_livre" as const,
    pergunta_texto: "Alguma observação?",
    campo_destino: "observacao",
    obrigatorio: false,
  };

  it("aceita pergunta aberta sem opções", () => {
    expect(etapaCustomizadaSchema.safeParse(base).success).toBe(true);
  });

  it("exige ao menos duas opções em múltipla escolha", () => {
    const resultado = etapaCustomizadaSchema.safeParse({
      ...base,
      tipo: "escolha_unica",
      opcoes: [{ label: "Sim", valor: "sim" }],
    });

    expect(resultado.success).toBe(false);
    expect(resultado.error!.issues[0].message).toMatch(/ao menos 2 opções/);
  });

  it("aceita múltipla escolha com duas opções", () => {
    expect(
      etapaCustomizadaSchema.safeParse({
        ...base,
        tipo: "escolha_unica",
        opcoes: [
          { label: "Sim", valor: "sim" },
          { label: "Não", valor: "nao" },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejeita pergunta vazia", () => {
    const resultado = etapaCustomizadaSchema.safeParse({
      ...base,
      pergunta_texto: "   ",
    });

    expect(resultado.success).toBe(false);
    expect(resultado.error!.issues[0].message).toMatch(/Escreva a pergunta/);
  });

  it("não aceita tipo de etapa de sistema", () => {
    for (const tipo of ["servico", "horario", "confirmacao"]) {
      expect(
        etapaCustomizadaSchema.safeParse({ ...base, tipo }).success,
        tipo,
      ).toBe(false);
    }
  });
});

describe("opcoesDeTextoLivre", () => {
  it("transforma uma opção por linha, derivando o valor do label", () => {
    expect(opcoesDeTextoLivre("Sim\nNão")).toEqual([
      { label: "Sim", valor: "sim" },
      { label: "Não", valor: "nao" },
    ]);
  });

  it("ignora linhas vazias e espaços", () => {
    expect(opcoesDeTextoLivre("  Sim  \n\n\n  Não\n")).toEqual([
      { label: "Sim", valor: "sim" },
      { label: "Não", valor: "nao" },
    ]);
  });

  it("normaliza acento, espaço e pontuação no valor", () => {
    expect(opcoesDeTextoLivre("Já sou cliente!")).toEqual([
      { label: "Já sou cliente!", valor: "ja_sou_cliente" },
    ]);
  });

  it("garante um valor mesmo quando o label não tem caractere aproveitável", () => {
    expect(opcoesDeTextoLivre("???")).toEqual([
      { label: "???", valor: "opcao" },
    ]);
  });

  it("devolve vazio para entrada vazia", () => {
    expect(opcoesDeTextoLivre("")).toEqual([]);
    expect(opcoesDeTextoLivre("   \n  ")).toEqual([]);
  });
});

describe("rotuloDoTipo", () => {
  it("dá nome legível a todos os tipos", () => {
    const tipos: TipoEtapa[] = [
      "servico",
      "horario",
      "confirmacao",
      "escolha_unica",
      "texto_livre",
    ];

    for (const tipo of tipos) {
      expect(rotuloDoTipo(tipo).length, tipo).toBeGreaterThan(0);
    }
  });
});
