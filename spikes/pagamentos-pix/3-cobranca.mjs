#!/usr/bin/env node
/**
 * Q3 (a pergunta que decide o modelo inteiro) + Q7.
 *
 * **Q3 — o dinheiro pousa na conta do vendedor, não na nossa.** Criamos um Pix
 * dinâmico usando o `access_token` do vendedor e conferimos que o `collector_id`
 * da cobrança é o `user_id` dele. Se vier o nosso, "nunca custodiar" é ficção com
 * o Mercado Pago e o desenho todo cai — voltaríamos a ser subcredenciador, com a
 * Res. BCB 522/2025 (liquidação centralizada obrigatória desde 11/05/2026) em
 * cima. Isso é NO-GO de arquitetura, não bug de script.
 *
 * **Q7 — que PII o MP devolve.** Imprime o inventário de chaves da resposta, só
 * nomes e tipos, nunca valores. É o que define a lista de descarte por LGPD antes
 * de existir schema: o produto não deve guardar CPF nem nome de pagador.
 *
 * O valor default é R$ 0,01 de propósito: o passo seguinte é pagar de verdade, e
 * a prova não fica melhor com valor maior.
 *
 * Uso: `node spikes/pagamentos-pix/3-cobranca.mjs [valor]`
 */

import { randomUUID } from "node:crypto";
import {
  ARQUIVO_COBRANCA,
  ARQUIVO_TOKENS,
  carregarEnv,
  chamar,
  gravarJson,
  inventariarChaves,
  lerJson,
  linha,
  titulo,
  veredito,
} from "./comum.mjs";

carregarEnv();

let tokens;
try {
  tokens = lerJson(ARQUIVO_TOKENS);
} catch {
  linha("Não achei .tokens.json — rode 1-oauth.mjs primeiro.");
  process.exit(1);
}

const valor = Number(process.argv[2] ?? process.env.VALOR ?? "0.01");
if (!Number.isFinite(valor) || valor <= 0) {
  linha(`Valor inválido: ${process.argv[2]}`);
  process.exit(1);
}

/**
 * O MP quer offset explícito em `date_of_expiration`, não o `Z` do
 * `toISOString()`. `+00:00` é o mesmo instante e é aceito.
 */
const expiraEm = new Date(Date.now() + 30 * 60_000).toISOString().replace("Z", "+00:00");

titulo(`Q3/Q7 — criando Pix de R$ ${valor.toFixed(2)} com o token do vendedor`);

const { ok, status, corpo } = await chamar("https://api.mercadopago.com/v1/payments", {
  method: "POST",
  headers: {
    authorization: `Bearer ${tokens.access_token}`,
    "content-type": "application/json",
    // Obrigatório pelo MP em criação de pagamento, e é a mesma disciplina que a
    // produção vai precisar contra reentrega.
    "x-idempotency-key": randomUUID(),
  },
  body: JSON.stringify({
    transaction_amount: valor,
    description: "Spike Encaixaria — sinal de agendamento",
    payment_method_id: "pix",
    date_of_expiration: expiraEm,
    payer: {
      // Dado de teste. A produção NÃO deve inventar nem exigir CPF do cliente
      // final: a identidade dele no produto é o remote_jid do WhatsApp.
      //
      // `@…test` é recusado com "payer.email must be a valid email" (medido): o MP
      // valida o TLD. `testuser.com` é o domínio que ele mesmo usa nas contas de
      // teste, então passa.
      email: process.env.MP_EMAIL_PAGADOR ?? "pagador-spike@testuser.com",
    },
  }),
});

if (!ok) {
  linha(`HTTP ${status}`);
  linha(JSON.stringify(corpo, null, 2));
  veredito("Q3", false, `criação de cobrança falhou com HTTP ${status}`);
  process.exit(1);
}

const pix = corpo.point_of_interaction?.transaction_data ?? {};
const collector = corpo.collector_id;
const vendedor = Number(tokens.user_id);
const noVendedor = Number(collector) === vendedor;

linha(`id:            ${corpo.id}`);
linha(`status:        ${corpo.status} / ${corpo.status_detail}`);
linha(`live_mode:     ${corpo.live_mode}`);
linha(`collector_id:  ${collector}`);
linha(`user_id token: ${vendedor}`);
linha(`expira em:     ${corpo.date_of_expiration}`);
linha(`ticket_url:    ${pix.ticket_url ?? "—"}`);
linha();
linha("copia-e-cola:");
linha(pix.qr_code ?? "<AUSENTE>");

titulo("Q7 — inventário de chaves da resposta (nomes e tipos, sem valores)");
for (const item of inventariarChaves(corpo)) {
  // Marca o que teria de ser descartado antes de qualquer gravação nossa.
  const sensivel = /payer|identification|cpf|document|email|first_name|last_name|phone/i.test(item);
  linha(`${sensivel ? "⚠ " : "  "}${item}`);
}

titulo("Vereditos");
veredito(
  "Q3",
  noVendedor,
  noVendedor
    ? "collector_id == user_id do vendedor: o dinheiro pousa na conta dele, não na nossa"
    : `collector_id (${collector}) DIFERENTE do vendedor (${vendedor}) — NO-GO do modelo "nunca custodiar"`,
);
veredito(
  "Q4 (parcial)",
  Boolean(pix.qr_code),
  pix.qr_code
    ? "payload recebido — rodar decodificar-brcode.mjs e depois pagar de verdade"
    : "sem qr_code na resposta",
);

gravarJson(ARQUIVO_COBRANCA, corpo);
linha();
linha(`Resposta completa em ${ARQUIVO_COBRANCA.pathname} (gitignored — contém dados do pagador).`);
