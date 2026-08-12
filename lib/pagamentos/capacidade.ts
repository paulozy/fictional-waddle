/**
 * "Este estabelecimento pode cobrar sinal?" — fonte única da resposta.
 *
 * Função pura, sem Supabase e sem rede, pelo mesmo motivo de `lib/assinatura.ts`:
 * os consumidores leem o perfil por caminhos diferentes (o painel com o client
 * que respeita RLS, o bot com o client admin), e só a REGRA é comum. Uma versão
 * que consultasse o banco obrigaria cada um a passar o client dele e tornaria a
 * regra intestável sem stack de pé.
 */

/**
 * O mínimo que qualquer `select` precisa trazer.
 *
 * Os dois campos são OBRIGATÓRIOS, e não opcionais, de propósito — mesmo idioma
 * de `trial_bloqueado_em` em `PerfilAssinatura`. Um campo opcional deixaria o
 * TypeScript aceitar em silêncio um `select` que esqueceu a coluna, e o gate
 * responderia sempre "não pode cobrar" sem ninguém entender por quê. Sendo
 * obrigatório, o compilador quebra no `select` incompleto.
 */
export type PerfilCobranca = {
  plano: string;
  pagamento_conectado_em: string | null;
  /**
   * A política de cancelamento/devolução escrita pelo dono. Nulo = cobrança
   * desligada, e o TypeScript quebra em todo `select` que esquecer a coluna pelo
   * mesmo motivo dos dois campos acima.
   */
  politica_sinal: string | null;
};

/** Por que a cobrança não está disponível. `null` = está. */
export type MotivoSemCobranca = "plano" | "nao_conectado" | "sem_politica";

/**
 * Diagnóstico para o painel.
 *
 * Existe separado do booleano porque as duas causas pedem telas diferentes:
 * "seu plano não inclui" leva a uma conversa comercial, "conecte sua conta" leva
 * a um botão. Um booleano só faria o painel dizer "indisponível" e o dono abrir
 * suporte para descobrir qual dos dois é.
 */
export function motivoSemCobranca(
  perfil: PerfilCobranca | null | undefined,
): MotivoSemCobranca | null {
  // Perfil ausente é fail-safe: sem saber quem é, não se cobra ninguém. Mesma
  // direção de `assinaturaValida`, e pelo mesmo motivo — a falha aceitável é
  // "não cobrou", nunca "cobrou sem poder".
  if (!perfil) return "plano";

  if (perfil.plano !== "sinal") return "plano";

  // Ter o plano sem conta conectada é o estado normal logo depois da
  // contratação, e não um erro. Mas cobrar nele seria prometer ao cliente final
  // um Pix que não temos como emitir.
  if (!perfil.pagamento_conectado_em) return "nao_conectado";

  /*
    A terceira condição, e a única que não é sobre a nossa relação com o dono —
    é sobre a relação dele com o cliente final.

    Cobrar um sinal sem ter dito o que acontece com o dinheiro quando o cliente
    desmarca deixa a pessoa que pagou sem nenhuma informação sobre o próprio
    dinheiro, e o produto seria o instrumento dessa omissão. O bloqueio é
    deliberadamente **duro** (não é aviso no painel, é a cobrança não acontecer),
    porque o custo de errar aqui não cai sobre quem decidiu: cai sobre o cliente
    do nosso cliente.

    `btrim` porque o CHECK do banco aceita nulo, e um campo com espaços passaria
    por um teste de string vazia.
  */
  if (!perfil.politica_sinal?.trim()) return "sem_politica";

  return null;
}

/** Atalho para o caminho do bot, que não precisa saber a causa. */
export function cobrancaSinalHabilitada(
  perfil: PerfilCobranca | null | undefined,
): boolean {
  return motivoSemCobranca(perfil) === null;
}

/**
 * Converte o `valor_sinal` do serviço em centavos, ou `null` se não há sinal.
 *
 * Centavos porque toda a transação é inteira: `cobrancas_sinal.valor_centavos` e
 * a comparação com o que o PSP devolve. Fazer aritmética de dinheiro de terceiro
 * em float é a classe de bug que só aparece na conciliação.
 *
 * Zero e negativo devolvem `null`, e não zero: um Pix de R$ 0,00 seria recusado
 * pelo provedor, e a conversa travaria numa cobrança impossível. "Sem sinal" e
 * "sinal de zero" são a mesma intenção, então colapsam no mesmo valor.
 */
export function sinalEmCentavos(
  valorSinal: number | string | null | undefined,
): number | null {
  if (valorSinal === null || valorSinal === undefined) return null;

  // O Postgres devolve `numeric` como string no supabase-js, para não perder
  // precisão. Aceitar os dois evita um `Number()` espalhado por quem chama.
  const valor = typeof valorSinal === "string" ? Number(valorSinal) : valorSinal;

  if (!Number.isFinite(valor) || valor <= 0) return null;

  return Math.round(valor * 100);
}
