import { z } from "zod";
import { minutosDoDia, minutosDoDiaOuNulo } from "@/lib/bot/disponibilidade";

/**
 * Schemas de validação da agenda. Módulo puro: as Server Actions apenas
 * aplicam, e os testes cobrem as regras aqui — inclusive as que a UI de HTML
 * não consegue garantir (formato de hora, preço com vírgula, fim antes do
 * início).
 */

/**
 * Preço é opcional: o dono pode não querer divulgar valor pelo WhatsApp.
 * Aceita vírgula decimal porque é o que se digita em teclado brasileiro.
 */
const precoOpcional = z
  .string()
  .trim()
  .transform((valor) => (valor === "" ? null : Number(valor.replace(",", "."))))
  .refine((valor) => valor === null || (Number.isFinite(valor) && valor >= 0), {
    message: "Preço inválido.",
  });

/**
 * Duração validada em etapas explícitas, não com `z.coerce.number()`.
 *
 * `z.coerce.number()` sobre "45,5" produz `NaN`, e `NaN` **passa** pelo teste de
 * tipo (é um number). O resultado era a mensagem errada — "duração mínima de 5
 * minutos" para quem digitou vírgula. Aqui a vírgula é normalizada como no
 * preço, e cada falha tem a mensagem que corresponde ao erro real.
 */
const duracaoEmMinutos = z
  .string()
  .trim()
  .transform((valor) =>
    // `Number("")` é 0, não NaN — sem este guarda, campo vazio viraria "duração
    // mínima é de 5 minutos" em vez de "informe a duração".
    valor === "" ? Number.NaN : Number(valor.replace(",", ".")),
  )
  .refine(Number.isFinite, "Informe a duração em minutos.")
  .refine(
    (valor) => !Number.isFinite(valor) || Number.isInteger(valor),
    "A duração precisa ser um número inteiro de minutos.",
  )
  .refine(
    (valor) => !Number.isInteger(valor) || valor >= 5,
    "A duração mínima é de 5 minutos.",
  )
  .refine(
    (valor) => !Number.isInteger(valor) || valor <= 480,
    "A duração máxima é de 8 horas.",
  );

export const servicoSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, "Informe o nome do serviço.")
    .max(80, "Nome muito longo (máximo 80 caracteres)."),
  duracaoMinutos: duracaoEmMinutos,
  preco: precoOpcional,
  /**
   * Mesmo formato do preço — vírgula decimal, vazio vira `null`. Reusar
   * `precoOpcional` é o que garante que "20,00" digitado no teclado brasileiro
   * signifique a mesma coisa nos dois campos.
   *
   * `null` e `0` colapsam em "sem sinal" mais adiante (`sinalEmCentavos`): um Pix
   * de R$ 0,00 seria recusado pelo provedor e travaria a conversa.
   *
   * **O `preprocess` não é conveniência: o campo REALMENTE não existe** no
   * formulário de quem não tem a capacidade de cobrar (`CamposServico` só o
   * renderiza com `cobraSinal`). Exigir a chave faria todo salvamento de serviço
   * de um tenant comum falhar na validação — e a mensagem seria sobre um campo
   * que ele nunca viu.
   */
  valorSinal: z.preprocess((valor) => valor ?? "", precoOpcional),
});

export type EntradaServico = z.infer<typeof servicoSchema>;

const horaDoDia = z
  .string()
  .trim()
  // 24:00 é o único valor com hora 24 que o Postgres aceita em `time` — aceitar
  // "24:30" aqui daria erro genérico de banco em vez de mensagem de validação.
  .regex(
    /^(([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?|24:00(:00)?)$/,
    "Use o formato HH:MM.",
  );

export const horarioSchema = z
  .object({
    diaSemana: z.coerce
      .number({ error: "Escolha o dia da semana." })
      .int()
      .min(0, "Dia da semana inválido.")
      .max(6, "Dia da semana inválido."),
    horaInicio: horaDoDia,
    horaFim: horaDoDia,
  })
  .refine(
    (dados) => {
      // Variante que não lança: o refine de objeto pode rodar mesmo quando um
      // campo já falhou o regex, e uma exceção aqui viraria erro 500 em vez de
      // mensagem de validação. Formato inválido já é reportado pelo campo.
      const inicio = minutosDoDiaOuNulo(dados.horaInicio);
      const fim = minutosDoDiaOuNulo(dados.horaFim);
      if (inicio === null || fim === null) return true;
      return fim > inicio;
    },
    {
      message: "O horário de fim precisa ser depois do início.",
      path: ["horaFim"],
    },
  );

export type EntradaHorario = z.infer<typeof horarioSchema>;

/**
 * Detecta sobreposição entre a nova janela e as já cadastradas no mesmo dia.
 *
 * Não é constraint de banco porque duas janelas encostadas (09:00-12:00 e
 * 12:00-18:00) são legítimas e o merge de intervalos as trataria como uma só —
 * a validação aqui é para evitar cadastro confuso, não para garantir correção
 * do cálculo. Intervalos semi-abertos: tocar não é sobrepor.
 */
export function conflitaComGrade(
  nova: EntradaHorario,
  existentes: { dia_semana: number; hora_inicio: string; hora_fim: string }[],
): boolean {
  const inicio = minutosDoDia(nova.horaInicio);
  const fim = minutosDoDia(nova.horaFim);

  return existentes
    .filter((h) => h.dia_semana === nova.diaSemana)
    .some(
      (h) =>
        inicio < minutosDoDia(h.hora_fim) &&
        minutosDoDia(h.hora_inicio) < fim,
    );
}

/**
 * Erro de formulário no formato que os Client Components consomem.
 *
 * `campos` é opcional para os formulários que ainda mostram um erro só: quem
 * adota o mapa passa a marcar o input culpado com `aria-invalid`, e quem não
 * adota continua lendo `erro` como antes.
 */
/**
 * `aviso` existe para o caso em que a escrita deu certo mas um **efeito
 * secundário** falhou — hoje só o cancelamento: o horário foi liberado na agenda e
 * o aviso ao cliente não saiu porque o WhatsApp está desconectado.
 *
 * Não é `erro`: tratar como erro faria o dono achar que o cancelamento não
 * aconteceu e tentar de novo. E não é silêncio: o CLAUDE.md exige que quem dispara
 * mensagem "falhe de forma clara", e para um dono operando à mão entre atendimentos
 * a tela que ele está olhando naquele segundo é mais clara que qualquer log.
 *
 * Opcional de propósito: as outras quatro telas que usam `EstadoFormulario` não
 * mudam nada.
 */
export type EstadoFormulario =
  | { erro: string; campos?: Record<string, string[]> }
  | { ok: true; aviso?: string }
  | undefined;

export function primeiroErro(erro: z.ZodError): string {
  return erro.issues[0].message;
}

/**
 * Converte um `ZodError` em erro global + erro por campo.
 *
 * `z.flattenError` é a forma da Zod v4; `error.flatten()` ainda existe, mas é o
 * caminho legado.
 */
export function errosDoFormulario(erro: z.ZodError): {
  erro: string;
  campos: Record<string, string[]>;
} {
  const { fieldErrors } = z.flattenError(erro);

  return {
    erro: primeiroErro(erro),
    campos: fieldErrors as Record<string, string[]>,
  };
}

/**
 * Teto de faixas por dia.
 *
 * Não é limitação técnica: manhã, tarde e noite cobrem qualquer expediente real,
 * e a quarta sobra para o caso esquisito. O limite existe para o editor não
 * virar uma lista infinita e para o payload da ação ter tamanho previsível.
 */
export const MAX_FAIXAS_POR_DIA = 4;

export const faixaSchema = z.object({
  horaInicio: horaDoDia,
  horaFim: horaDoDia,
});

export type Faixa = z.infer<typeof faixaSchema>;

export const diaDaGradeSchema = z.object({
  diaSemana: z.coerce
    .number({ error: "Dia da semana inválido." })
    .int()
    .min(0, "Dia da semana inválido.")
    .max(6, "Dia da semana inválido."),
  faixas: z
    .array(faixaSchema)
    .max(MAX_FAIXAS_POR_DIA, `No máximo ${MAX_FAIXAS_POR_DIA} faixas por dia.`),
});

export type DiaDaGrade = z.infer<typeof diaDaGradeSchema>;

/** A grade inteira: sempre os sete dias, mesmo os fechados (faixas vazias). */
export const gradeSemanalSchema = z.object({
  dias: z.array(diaDaGradeSchema).length(7, "A grade precisa dos sete dias."),
});

/**
 * Primeira faixa cujo fim não é depois do início, ou `null`.
 *
 * Separado do schema porque o `refine` de objeto pode rodar mesmo com o regex
 * de hora já tendo falhado, e uma exceção ali viraria 500 em vez de mensagem.
 */
export function faixaInvertida(faixas: Faixa[]): Faixa | null {
  for (const faixa of faixas) {
    const inicio = minutosDoDiaOuNulo(faixa.horaInicio);
    const fim = minutosDoDiaOuNulo(faixa.horaFim);
    if (inicio === null || fim === null) continue;
    if (fim <= inicio) return faixa;
  }

  return null;
}

/**
 * Detecta sobreposição **entre as faixas do próprio dia**.
 *
 * Intervalos semi-abertos: 09:00–12:00 e 12:00–18:00 se tocam e são legítimos —
 * é exatamente como se modela o intervalo de almoço.
 */
export function faixasSobrepostas(faixas: Faixa[]): boolean {
  const janelas = faixas
    .map((faixa) => ({
      inicio: minutosDoDiaOuNulo(faixa.horaInicio),
      fim: minutosDoDiaOuNulo(faixa.horaFim),
    }))
    .filter(
      (j): j is { inicio: number; fim: number } =>
        j.inicio !== null && j.fim !== null,
    )
    .sort((a, b) => a.inicio - b.inicio);

  return janelas.some(
    (janela, i) => i > 0 && janela.inicio < janelas[i - 1].fim,
  );
}

// --------------------------------------------------------------- cancelamento

/**
 * Motivos de cancelamento, em vocabulário fechado.
 *
 * Espelha o CHECK de `agendamentos.cancelamento_motivo`. Enum e não texto livre
 * porque num contexto de clínica um campo aberto capturaria dado de saúde — dado
 * sensível pela LGPD Art. 11, com base legal que nós, operadores, não podemos
 * suprir. E porque o que vende como diferencial é agregação ("40% dos
 * cancelamentos foram do estabelecimento"), que texto livre não dá.
 *
 * Tupla `as const` para o `z.enum` abaixo aceitar direto, sem cast.
 */
export const MOTIVOS_CANCELAMENTO = [
  "cliente_pediu",
  "cliente_vai_remarcar",
  "estabelecimento_indisponivel",
  "agendamento_errado",
  "outro",
] as const;

export type MotivoCancelamento = (typeof MOTIVOS_CANCELAMENTO)[number];

/**
 * Rótulos da UI.
 *
 * `Record<MotivoCancelamento, string>` e não um objeto solto: acrescentar valor em
 * `MOTIVOS_CANCELAMENTO` sem escrever o rótulo aqui quebra o build, em vez de
 * renderizar um radio sem texto.
 */
export const ROTULOS_MOTIVO_CANCELAMENTO: Record<MotivoCancelamento, string> = {
  cliente_pediu: "O cliente pediu para cancelar",
  cliente_vai_remarcar: "O cliente vai remarcar",
  estabelecimento_indisponivel: "Não vou poder atender",
  agendamento_errado: "Agendamento errado ou duplicado",
  outro: "Outro motivo",
};

/**
 * Teto da observação interna.
 *
 * Igual ao CHECK da coluna. Curto de propósito: sem limite, "nota" vira
 * prontuário — e prontuário é exatamente o que este campo não deve ser.
 */
export const MAX_OBSERVACAO_CANCELAMENTO = 200;

export const cancelamentoSchema = z.object({
  id: z.uuid("Agendamento não encontrado."),
  motivo: z.enum(MOTIVOS_CANCELAMENTO, {
    error: "Escolha o motivo do cancelamento.",
  }),
  /**
   * Nota interna, opcional. **Nunca é enviada ao cliente** — é o que permite o
   * campo existir apesar do risco de dado sensível: texto livre que sai para o
   * titular seria um canal de saída para o que o dono digitou, inclusive um
   * deslize.
   *
   * Vazio vira `null` e não `""`, para a coluna não guardar string vazia
   * indistinguível de "não escreveu nada".
   */
  observacao: z
    .string()
    .trim()
    .max(
      MAX_OBSERVACAO_CANCELAMENTO,
      `Observação muito longa (máximo ${MAX_OBSERVACAO_CANCELAMENTO} caracteres).`,
    )
    .transform((valor) => (valor === "" ? null : valor)),
});

export type EntradaCancelamento = z.infer<typeof cancelamentoSchema>;
