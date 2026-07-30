#!/usr/bin/env node
/**
 * Q2: o refresh funciona sem interação humana, e o `refresh_token` rotaciona?
 *
 * A doc do MP afirma as duas coisas — que o fluxo permite "continuar utilizando
 * um Access Token válido sem a necessidade de uma nova interação com o usuário",
 * e que "cada vez que você renovar o `access_token`, o `refresh_token` também vai
 * ser renovado", com o aviso de que "você deverá armazená-lo novamente".
 * Este script existe para **medir** a segunda, porque ela é o risco operacional
 * de verdade: se a rotação acontece e a gravação do valor novo falha, a conexão
 * daquele tenant morre em silêncio e só reaparece como "o bot parou de mandar o
 * Pix" 180 dias depois.
 *
 * Consequência para a implementação real, se confirmado: a gravação do par novo
 * tem de ser a mesma operação que a chamada de refresh, e o token antigo só pode
 * ser descartado depois do commit.
 *
 * Uso: `node spikes/pagamentos-pix/2-refresh.mjs` (depois de 1-oauth.mjs)
 */

import {
  ARQUIVO_TOKENS,
  carregarEnv,
  chamar,
  env,
  gravarJson,
  lerJson,
  linha,
  digital,
  mascarar,
  titulo,
  veredito,
} from "./comum.mjs";

carregarEnv();

const CLIENT_ID = env("MP_CLIENT_ID");
const CLIENT_SECRET = env("MP_CLIENT_SECRET");

let anterior;
try {
  anterior = lerJson(ARQUIVO_TOKENS);
} catch {
  linha("Não achei .tokens.json — rode 1-oauth.mjs primeiro.");
  process.exit(1);
}

if (!anterior.refresh_token) {
  titulo("Sem refresh_token para exercitar");
  veredito("Q2", false, "1-oauth.mjs não recebeu refresh_token; offline_access não foi concedido");
  process.exit(1);
}

titulo("Q2 — renovando o access_token sem interação do vendedor");

const { ok, status, corpo } = await chamar("https://api.mercadopago.com/oauth/token", {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json" },
  body: JSON.stringify({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: anterior.refresh_token,
  }),
});

if (!ok) {
  linha(`HTTP ${status}`);
  linha(JSON.stringify(corpo, null, 2));
  veredito("Q2", false, `refresh falhou com HTTP ${status}`);
  process.exit(1);
}

const accessMudou = corpo.access_token !== anterior.access_token;
const refreshRotacionou = corpo.refresh_token !== anterior.refresh_token;

// Impressão digital, não máscara: tokens do MP compartilham prefixo e terminam no
// `user_id`, então a máscara imprime idêntico para valores diferentes e a evidência
// de rotação pareceria contradizer o veredito.
linha(`access_token antes:   ${digital(anterior.access_token)}  ${mascarar(anterior.access_token)}`);
linha(`access_token depois:  ${digital(corpo.access_token)}  ${mascarar(corpo.access_token)}`);
linha(`refresh_token antes:  ${digital(anterior.refresh_token)}`);
linha(`refresh_token depois: ${digital(corpo.refresh_token)}`);
linha();
linha(`expires_in: ${corpo.expires_in}s (~${Math.round((corpo.expires_in ?? 0) / 86400)} dias)`);
linha(`scope:      ${corpo.scope ?? "<vazio>"}`);
linha(`user_id:    ${corpo.user_id} ${corpo.user_id === anterior.user_id ? "(mesmo vendedor)" : "(MUDOU — investigar)"}`);

titulo("Vereditos");
veredito("Q2", accessMudou, accessMudou ? "renovou sem interação humana" : "access_token não mudou");
veredito(
  "Rotação do refresh_token",
  true,
  refreshRotacionou
    ? "ROTACIONOU — a implementação real precisa regravar o par a cada refresh, ou perde o tenant"
    : "não rotacionou nesta chamada — reconferir antes de assumir estabilidade",
);

// Regrava sempre, inclusive o refresh novo: é o comportamento que a produção
// terá de ter, e deixar o arquivo com o valor velho quebraria a próxima rodada.
gravarJson(ARQUIVO_TOKENS, {
  ...corpo,
  obtido_em: new Date().toISOString(),
  refresh_anterior_rotacionou: refreshRotacionou,
});

linha();
linha(`Regravado em ${ARQUIVO_TOKENS.pathname}.`);
