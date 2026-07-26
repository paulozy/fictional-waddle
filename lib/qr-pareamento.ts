/**
 * Ritmo do QR de pareamento. Módulo **puro**.
 *
 * O problema que resolve: o relógio do cliente e o do servidor não estão em
 * fase, e o servidor não avisa quando roda o código.
 *
 * O Baileys rotaciona o QR a cada `qrTimeout` (45s na Evolution 2.3.7), no
 * ritmo dele, tenha ou não alguém olhando a tela. E `GET /instance/connect`
 * numa instância em `connecting` devolve o QR **em cache** — não força rotação
 * nenhuma (medido: três chamadas em 9s, mesmo código, mesmo `count`). Uma
 * contagem regressiva que reinicia sozinha a cada busca acumula erro de fase e
 * acaba exibindo um código morto com a barra dizendo que ainda vale:
 *
 * ```
 * t=0   QR#1 nasce (morre em t=45).  Contagem do cliente: 45
 * t=45  busca → chega QR#1 em CACHE. Contagem reinicia em 45 (até t=90)
 * t=45  ── QR#1 morre ──
 * t=45→90  45s exibindo um QR morto
 * ```
 *
 * A saída é parar de confiar no relógio local e usar o único sinal que o
 * servidor dá: `count`, quantas vezes ele já regerou o QR nesta sessão. Se o
 * número não mudou, o código na tela é o mesmo — não reiniciar a contagem e
 * tentar de novo em alguns segundos. Se mudou, aí sim o QR é outro.
 */

/**
 * Validade nominal de um QR, em segundos — o `qrTimeout` do Baileys.
 *
 * É só o display. Quem garante a correção é a comparação de `count`: numa
 * reconexão o QR pode chegar com 30s de vida já gastos, e constante nenhuma
 * adivinha isso.
 */
export const SEGUNDOS_VALIDADE_QR = 45;

/**
 * De quanto em quanto tempo insistir quando o servidor devolveu o QR em cache.
 *
 * Curto de propósito: é a granularidade do erro de fase. Buscar não custa nada
 * ao orçamento de pareamento — `GET /instance/connect` não regenera QR e não
 * consome o `QRCODE_LIMIT`.
 */
export const SEGUNDOS_RETENTATIVA = 2;

export type DecisaoQr =
  /** Código diferente do que está na tela: reiniciar a contagem. */
  | { tipo: "novo" }
  /** Mesmo código em cache: manter o que está na tela e insistir. */
  | { tipo: "repetido" };

/**
 * O código que acabou de chegar é diferente do que está na tela?
 *
 * `atual` nulo devolve `"novo"` **de propósito**, e é a decisão que mais
 * importa aqui. Nem toda versão da Evolution informa `count` — a 2.3.7, por
 * exemplo, não o inclui no webhook `QRCODE_UPDATED`. Sem contagem não há como
 * detectar cache, e o comportamento certo é o antigo: aceitar o código e
 * reiniciar. Falhar para o lado de "repetido" prenderia a tela num laço de
 * retentativa sem nunca mostrar QR novo.
 *
 * Contagem que **retrocede** também conta como novo: significa servidor
 * reiniciado ou instância recriada, e nesse caso o código na tela é velho.
 */
export function classificarLeituraQr(
  anterior: number | null,
  atual: number | null,
): DecisaoQr {
  if (atual === null) return { tipo: "novo" };
  if (anterior === null) return { tipo: "novo" };

  return atual === anterior ? { tipo: "repetido" } : { tipo: "novo" };
}
