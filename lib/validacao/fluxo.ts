import { z } from "zod";
import type { TipoEtapa } from "@/lib/bot/engine-fluxo";

/**
 * Regras de construção do fluxo de conversa. Módulo **puro**.
 *
 * Compartilhado entre a UI do builder (feedback imediato ao arrastar) e a Server
 * Action (autoridade). Ter as duas pontas na mesma função é o que evita a UI
 * permitir algo que o servidor recusa depois.
 *
 * As mesmas regras também existem como constraint no banco — aqui elas rendem
 * mensagem legível, lá elas são a garantia.
 */

export const TIPOS_SISTEMA: TipoEtapa[] = ["servico", "horario", "confirmacao"];
export const TIPOS_CUSTOMIZADOS: TipoEtapa[] = ["escolha_unica", "texto_livre"];

export type EtapaParaValidar = {
  id: string;
  tipo: TipoEtapa;
  campo_destino: string | null;
  ativo: boolean;
};

export function ehEtapaDeSistema(tipo: TipoEtapa): boolean {
  return TIPOS_SISTEMA.includes(tipo);
}

export type ResultadoValidacao =
  | { valido: true }
  | { valido: false; erro: string };

/**
 * Valida a ordem proposta para o fluxo.
 *
 * `etapasOrdenadas` já vem na ordem pretendida — a posição no array é a `ordem`.
 */
export function validarFluxo(
  etapasOrdenadas: EtapaParaValidar[],
): ResultadoValidacao {
  for (const tipo of TIPOS_SISTEMA) {
    const quantidade = etapasOrdenadas.filter((e) => e.tipo === tipo).length;

    if (quantidade === 0) {
      return {
        valido: false,
        erro: `O fluxo precisa ter a etapa de ${rotuloDoTipo(tipo)}.`,
      };
    }
    if (quantidade > 1) {
      return {
        valido: false,
        erro: `Só pode existir uma etapa de ${rotuloDoTipo(tipo)}.`,
      };
    }
  }

  const posicao = (tipo: TipoEtapa) =>
    etapasOrdenadas.findIndex((e) => e.tipo === tipo);

  // A disponibilidade depende da duração do serviço escolhido, então a etapa de
  // serviço tem de vir antes da de horário — não é preferência de UX.
  if (posicao("servico") > posicao("horario")) {
    return {
      valido: false,
      erro: "A escolha do serviço precisa vir antes da escolha do horário.",
    };
  }

  // A confirmação mostra o resumo: nada pode ser perguntado depois dela.
  if (posicao("confirmacao") !== etapasOrdenadas.length - 1) {
    return {
      valido: false,
      erro: "A confirmação precisa ser a última etapa do fluxo.",
    };
  }

  const camposVistos = new Set<string>();
  for (const etapa of etapasOrdenadas) {
    if (!etapa.campo_destino) continue;

    if (camposVistos.has(etapa.campo_destino)) {
      return {
        valido: false,
        erro: `Duas etapas gravam no mesmo campo "${etapa.campo_destino}". Cada pergunta precisa de um nome de campo diferente.`,
      };
    }
    camposVistos.add(etapa.campo_destino);
  }

  return { valido: true };
}

export type Direcao = "cima" | "baixo";

export type ResultadoMovimento<T> =
  | { movido: true; etapas: T[] }
  | { movido: false; erro: string | null };

/**
 * Move uma etapa uma posição, validando o resultado.
 *
 * Existe porque **arrastar não é um caminho utilizável no celular**. A alça
 * tinha ~20×14px e o `PointerSensor` sem `touch-action` perdia o gesto para o
 * scroll da página antes de completar o limiar de ativação — o texto da tela
 * prometia arraste e o arraste não acontecia. Setas de uma posição resolvem
 * toque, teclado e leitor de tela de uma vez, e ainda são testáveis, o que o
 * drag do dnd-kit não é fora de um navegador.
 *
 * Devolve `erro: null` quando o movimento simplesmente não existe (topo, fim,
 * índice inválido): a UI já desabilita o botão nesses casos, e mostrar "não dá
 * para subir a primeira" seria ruído. `erro` com texto é a regra de negócio
 * falando — serviço antes de horário, confirmação por último — e essa precisa
 * aparecer, porque o botão parecia disponível.
 */
export function moverEtapa<T extends EtapaParaValidar>(
  etapas: T[],
  indice: number,
  direcao: Direcao,
): ResultadoMovimento<T> {
  const destino = direcao === "cima" ? indice - 1 : indice + 1;

  if (indice < 0 || indice >= etapas.length) {
    return { movido: false, erro: null };
  }
  if (destino < 0 || destino >= etapas.length) {
    return { movido: false, erro: null };
  }

  const proposta = [...etapas];
  [proposta[indice], proposta[destino]] = [proposta[destino], proposta[indice]];

  // Mesma função que a Server Action usa: a UI nunca oferece o que o servidor
  // recusaria depois.
  const validacao = validarFluxo(proposta);
  if (!validacao.valido) return { movido: false, erro: validacao.erro };

  return { movido: true, etapas: proposta };
}

/** O movimento é possível? É o que decide o `disabled` das setas. */
export function podeMover<T extends EtapaParaValidar>(
  etapas: T[],
  indice: number,
  direcao: Direcao,
): boolean {
  return moverEtapa(etapas, indice, direcao).movido;
}

export function rotuloDoTipo(tipo: TipoEtapa): string {
  switch (tipo) {
    case "servico":
      return "escolha do serviço";
    case "horario":
      return "escolha do horário";
    case "confirmacao":
      return "confirmação";
    case "escolha_unica":
      return "pergunta de múltipla escolha";
    case "texto_livre":
      return "pergunta aberta";
  }
}

/**
 * `campo_destino` é chave de `agendamentos.respostas_extras`, então precisa ser
 * um identificador estável. O prefixo `__` é reservado para o estado interno da
 * engine e o banco também o proíbe.
 */
export const campoDestinoSchema = z
  .string()
  .trim()
  .min(1, "Dê um nome ao campo desta pergunta.")
  .max(40, "Nome de campo muito longo (máximo 40 caracteres).")
  .regex(
    /^(?!__)[a-z][a-z0-9_]*$/,
    "Use apenas letras minúsculas, números e _, começando por letra.",
  );

const opcaoSchema = z.object({
  label: z.string().trim().min(1, "Toda opção precisa de um texto."),
  valor: z.string().trim().min(1),
});

export const etapaCustomizadaSchema = z
  .object({
    tipo: z.enum(["escolha_unica", "texto_livre"]),
    pergunta_texto: z
      .string()
      .trim()
      .min(1, "Escreva a pergunta que o bot vai enviar.")
      .max(500, "Pergunta muito longa (máximo 500 caracteres)."),
    campo_destino: campoDestinoSchema,
    obrigatorio: z.boolean(),
    opcoes: z.array(opcaoSchema).optional(),
  })
  .refine(
    (dados) =>
      dados.tipo !== "escolha_unica" || (dados.opcoes?.length ?? 0) >= 2,
    {
      message: "Uma pergunta de múltipla escolha precisa de ao menos 2 opções.",
      path: ["opcoes"],
    },
  );

export type EntradaEtapaCustomizada = z.infer<typeof etapaCustomizadaSchema>;

/** Deriva `valor` a partir do label quando o dono não informa um. */
export function opcoesDeTextoLivre(texto: string) {
  return texto
    .split("\n")
    .map((linha) => linha.trim())
    .filter((linha) => linha.length > 0)
    .map((label) => ({ label, valor: normalizarValor(label) }));
}

function normalizarValor(label: string): string {
  return (
    label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "opcao"
  );
}

export const perguntaTextoSchema = z
  .string()
  .trim()
  .min(1, "O texto da pergunta não pode ficar vazio.")
  .max(500, "Pergunta muito longa (máximo 500 caracteres).");
