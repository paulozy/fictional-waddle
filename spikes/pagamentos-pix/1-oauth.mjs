#!/usr/bin/env node
/**
 * Q1 + Q2: o round-trip OAuth entrega um `access_token` de VENDEDOR?
 *
 * Sobe um servidor mínimo, imprime a URL de autorização, captura o `code` do
 * redirect e troca por token. O que precisa sair provado daqui:
 *
 * - **Q1** — o fluxo fecha sem aprovação comercial nenhuma. A doc de OAuth do MP
 *   não menciona aprovação prévia; o contato com gerente comercial aparece só
 *   para configurar data de liberação de `application_fee`, que não usamos
 *   (a decisão é não cobrar comissão). Isto aqui é a verificação empírica.
 * - **Q2** — vem `refresh_token` e o `scope` inclui `offline_access`. Sem os dois,
 *   o token morre em 180 dias e cada tenant tem de reautorizar à mão: a feature
 *   morre na operação, não no código.
 *
 * O `redirect_uri` é a incerteza que a doc não resolve: ela só exige que seja
 * "uma URL estática" e que **corresponda exatamente** ao cadastrado na aplicação,
 * e não diz se `http://localhost` é aceito. Por isso o script aceita as duas
 * formas — localhost direto, ou uma URL de túnel apontando para `PORTA_LOCAL`.
 * Se o MP recusar http, o erro aparece na própria tela de autorização, e essa
 * recusa também é resposta de Q1.
 *
 * Uso: `node spikes/pagamentos-pix/1-oauth.mjs`
 */

import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import {
  ARQUIVO_TOKENS,
  carregarEnv,
  chamar,
  env,
  gravarJson,
  linha,
  mascarar,
  titulo,
  veredito,
} from "./comum.mjs";

carregarEnv();

const CLIENT_ID = env("MP_CLIENT_ID");
const CLIENT_SECRET = env("MP_CLIENT_SECRET");
const REDIRECT_URI = env("MP_REDIRECT_URI");

const destino = new URL(REDIRECT_URI);
const ehLocal = ["localhost", "127.0.0.1"].includes(destino.hostname);
/**
 * Com túnel, o `redirect_uri` público não diz em que porta local escutar — o
 * túnel é que faz a ponte. Daí `PORTA_LOCAL`.
 */
const PORTA = Number(
  process.env.PORTA_LOCAL ?? (ehLocal ? destino.port || "80" : "8788"),
);

const state = randomBytes(16).toString("hex");

const urlAutorizacao = new URL("https://auth.mercadopago.com/authorization");
urlAutorizacao.searchParams.set("client_id", CLIENT_ID);
urlAutorizacao.searchParams.set("response_type", "code");
urlAutorizacao.searchParams.set("platform_id", "mp");
urlAutorizacao.searchParams.set("state", state);
urlAutorizacao.searchParams.set("redirect_uri", REDIRECT_URI);
// A doc é explícita: o refresh só existe se a aplicação pedir este escopo E o
// vendedor tiver autorizado no authorization code flow.
urlAutorizacao.searchParams.set("scope", "offline_access");

titulo("Q1/Q2 — autorização OAuth do vendedor");
linha("Abra esta URL logado na conta do VENDEDOR (nunca na sua conta de app):");
linha();
linha(urlAutorizacao.toString());
linha();
linha(`Aguardando o redirect em ${REDIRECT_URI} (porta local ${PORTA})…`);
if (!ehLocal) {
  linha(`Lembre de deixar o túnel apontando para http://localhost:${PORTA}`);
}

const servidor = createServer(async (req, res) => {
  const recebida = new URL(req.url, `http://localhost:${PORTA}`);

  if (recebida.pathname !== destino.pathname) {
    res.writeHead(404).end("caminho ignorado");
    return;
  }

  const responder = (texto) => {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end(texto);
  };

  const erro = recebida.searchParams.get("error");
  if (erro) {
    // Recusa do MP também é dado de Q1: `invalid_redirect_uri` aqui significa
    // que http/localhost não serve e o túnel passa a ser pré-requisito.
    titulo("O Mercado Pago recusou a autorização");
    linha(`error: ${erro}`);
    linha(`error_description: ${recebida.searchParams.get("error_description") ?? "—"}`);
    veredito("Q1", false, `autorização recusada com '${erro}' — anotar no README`);
    responder("Recusado. Veja o terminal.");
    servidor.close();
    return;
  }

  const codigo = recebida.searchParams.get("code");
  const stateRecebido = recebida.searchParams.get("state");

  if (!codigo) {
    responder("Sem `code` na query. Veja o terminal.");
    return;
  }

  if (stateRecebido !== state) {
    titulo("State divergente — abortando");
    linha("A resposta não corresponde à requisição que este processo iniciou.");
    responder("State divergente. Veja o terminal.");
    servidor.close();
    return;
  }

  responder("Autorizado. Pode fechar esta aba e voltar ao terminal.");

  titulo("Trocando o code por token (`code` vale ~10 min)");

  const { ok, status, corpo } = await chamar("https://api.mercadopago.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: codigo,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
    }),
  });

  if (!ok) {
    linha(`HTTP ${status}`);
    linha(JSON.stringify(corpo, null, 2));
    veredito("Q1", false, `troca de token falhou com HTTP ${status}`);
    servidor.close();
    return;
  }

  const escopo = String(corpo.scope ?? "");
  const temRefresh = Boolean(corpo.refresh_token);
  const temOffline = escopo.includes("offline_access");

  linha(`user_id (vendedor): ${corpo.user_id}`);
  linha(`live_mode:          ${corpo.live_mode}`);
  linha(`scope:              ${escopo || "<vazio>"}`);
  linha(`expires_in:         ${corpo.expires_in}s (~${Math.round((corpo.expires_in ?? 0) / 86400)} dias)`);
  linha(`access_token:       ${mascarar(corpo.access_token)}`);
  linha(`refresh_token:      ${temRefresh ? mascarar(corpo.refresh_token) : "AUSENTE"}`);

  titulo("Vereditos");
  veredito("Q1", true, "fluxo OAuth fechou sem aprovação comercial prévia");
  veredito(
    "Q2 (parcial)",
    temRefresh && temOffline,
    temRefresh && temOffline
      ? "refresh_token presente e offline_access concedido — rodar 2-refresh.mjs"
      : `refresh_token=${temRefresh}, offline_access=${temOffline} — sem os dois o token morre em 180 dias`,
  );

  gravarJson(ARQUIVO_TOKENS, { ...corpo, obtido_em: new Date().toISOString() });
  linha();
  linha(`Gravado em ${ARQUIVO_TOKENS.pathname} (gitignored).`);

  servidor.close();
});

servidor.listen(PORTA);
