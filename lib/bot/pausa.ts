/**
 * Pausa do bot para atendimento humano. Módulo **puro**.
 *
 * Existe separado do webhook pelo mesmo motivo que `lib/assinatura.ts`: a
 * pergunta "esta conversa está pausada?" tem três consumidores que leem a linha
 * por caminhos diferentes (o webhook com o client admin, o painel com o client
 * que respeita RLS, e os testes com nenhum dos dois). Função pura, sem Supabase,
 * é o que impede a regra de existir em três versões.
 */

/**
 * Minutos de silêncio do dono após os quais o bot volta a atender a conversa.
 *
 * Constante de módulo, e **não** coluna em `perfis`: configurável por tenant é
 * escopo que ninguém pediu, e cada campo digitado à mão neste produto é um campo
 * onde um typo vira bot mudo (é a lição do `status_assinatura`).
 *
 * Uma hora é a janela de "estou atendendo esta pessoa agora". Curta demais e o
 * bot interrompe o dono no meio do atendimento; longa demais e uma intervenção
 * de dez segundos silencia o bot por um turno inteiro — e o cliente seguinte
 * daquela mesma conversa espera sem resposta.
 */
export const PAUSA_MINUTOS = 60;

const MS_POR_MINUTO = 60_000;

/**
 * A conversa está sob atendimento humano neste instante?
 *
 * Nulo é o caso comum (nunca pausada, ou retomada à mão pelo painel) e significa
 * ativa. Data inválida também libera: estado corrompido não pode silenciar o bot
 * para sempre, e o modo de falha aceitável aqui é "o bot respondeu quando não
 * devia", nunca "o bot parou de atender e ninguém viu".
 */
export function pausaAtiva(
  pausadoAte: string | Date | null | undefined,
  agora: Date,
): boolean {
  if (!pausadoAte) return false;

  const fim =
    pausadoAte instanceof Date ? pausadoAte.getTime() : Date.parse(pausadoAte);

  if (!Number.isFinite(fim)) return false;

  return fim > agora.getTime();
}

/**
 * Fim da janela a partir de agora, em ISO — o valor que vai para a coluna.
 *
 * Cada mensagem do dono chama isto de novo, o que **renova** a janela em vez de
 * somar: o dono que conversa por vinte minutos continua com uma hora de silêncio
 * pela frente a contar da última mensagem dele, e não duas horas por ter mandado
 * duas mensagens.
 */
export function fimDaPausa(agora: Date, minutos = PAUSA_MINUTOS): string {
  return new Date(agora.getTime() + minutos * MS_POR_MINUTO).toISOString();
}
