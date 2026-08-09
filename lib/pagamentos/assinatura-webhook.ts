import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Validação da assinatura `x-signature` do Mercado Pago.
 *
 * Função pura, com o segredo por parâmetro — idioma de `lib/trial-numero.ts`.
 * Quem lê a env var é a rota, que é quem tem contexto para decidir o que fazer
 * quando ela falta (aqui: recusar, porque este é o único portão do endpoint).
 *
 * O header chega como `ts=1704908010,v1=618c85...`, e o que é assinado não é o
 * corpo: é um MANIFESTO montado a partir do id do recurso, do `x-request-id` e
 * do `ts`. Consequência que não é óbvia — **o corpo do POST não está coberto
 * pela assinatura**. Por isso a rota é obrigada a reconsultar o pagamento na API
 * do MP em vez de acreditar no que veio no corpo: a assinatura prova que a
 * notificação veio deles, não que o conteúdo dela é verdadeiro.
 */

export type PartesAssinatura = { ts: string; v1: string };

/**
 * Quebra o header em `ts` e `v1`.
 *
 * Tolerante a espaço em volta da vírgula e a chaves fora de ordem, porque nada
 * na doc promete formatação estável — e um parser posicional quebraria em
 * silêncio no dia em que eles inverterem os campos.
 */
export function extrairPartes(header: string | null): PartesAssinatura | null {
  if (!header) return null;

  const partes = new Map<string, string>();

  for (const pedaco of header.split(",")) {
    const separador = pedaco.indexOf("=");
    if (separador === -1) continue;

    const chave = pedaco.slice(0, separador).trim();
    const valor = pedaco.slice(separador + 1).trim();
    if (chave && valor) partes.set(chave, valor);
  }

  const ts = partes.get("ts");
  const v1 = partes.get("v1");

  return ts && v1 ? { ts, v1 } : null;
}

/**
 * Monta o manifesto exatamente como o MP especifica:
 * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 *
 * Campo ausente é OMITIDO junto com seu rótulo — não vira string vazia. A doc é
 * explícita, e a diferença importa: `request-id:;` produz um HMAC diferente de
 * não ter o trecho, e a validação falharia em toda notificação sem esse header.
 *
 * O `data.id` vai em minúsculas quando alfanumérico, também por exigência da
 * doc deles.
 */
export function montarManifesto(dados: {
  dataId: string;
  requestId: string | null;
  ts: string;
}): string {
  const pedacos: string[] = [`id:${dados.dataId.toLowerCase()};`];

  if (dados.requestId) pedacos.push(`request-id:${dados.requestId};`);

  pedacos.push(`ts:${dados.ts};`);

  return pedacos.join("");
}

/** Comparação em tempo constante, tolerante a tamanhos diferentes. */
function iguaisEmTempoConstante(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");

  // `timingSafeEqual` LANÇA se os tamanhos diferem, então o teste de tamanho
  // tem de vir antes — e ele já vaza o tamanho, que não é segredo.
  if (bufA.length !== bufB.length) return false;

  return timingSafeEqual(bufA, bufB);
}

/**
 * Verdadeiro se a assinatura confere.
 *
 * **Não há janela de validade sobre o `ts`, e isso é decisão, não esquecimento.**
 * O MP reentrega notificação que falhou, e a reentrega pode chegar horas depois.
 * Uma janela apertada recusaria justamente a retentativa de um pagamento que a
 * primeira tentativa não conseguiu registrar — trocaríamos um risco teórico
 * (replay) por perda real de confirmação de dinheiro. E o replay já é inócuo:
 * `confirmar_sinal_pago` é idempotente por `provedor_pagamento_id`, então
 * reenviar a mesma notificação mil vezes produz uma promoção só.
 */
export function assinaturaValida(dados: {
  header: string | null;
  dataId: string;
  requestId: string | null;
  segredo: string;
}): boolean {
  if (!dados.segredo) return false;

  const partes = extrairPartes(dados.header);
  if (!partes) return false;

  const esperado = createHmac("sha256", dados.segredo)
    .update(
      montarManifesto({
        dataId: dados.dataId,
        requestId: dados.requestId,
        ts: partes.ts,
      }),
    )
    .digest("hex");

  return iguaisEmTempoConstante(esperado, partes.v1.toLowerCase());
}
