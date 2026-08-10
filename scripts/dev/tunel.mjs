#!/usr/bin/env node
/**
 * Sincroniza o `.env.local` com o túnel que já está rodando.
 *
 * Testar o OAuth do Mercado Pago local exige que TRÊS valores concordem com a
 * URL pública do túnel — `MERCADO_PAGO_REDIRECT_URI`, `WEBHOOK_BASE_URL` e
 * `SERVER_ACTIONS_ALLOWED_ORIGINS`. Manter os três à mão é onde o processo
 * quebra: cada um deles, sozinho e em silêncio, produz um sintoma diferente e
 * nenhum aponta para a causa.
 *
 * Este script lê a URL do próprio ngrok (API local em :4040) e reescreve só
 * essas chaves. **Não toca no `.env`** — o `.env.local` tem precedência no Next e
 * é descartável: apagou, volta ao normal.
 *
 * Uso:
 *   ngrok http 3000            # noutro terminal
 *   node scripts/dev/tunel.mjs
 */

import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const API_NGROK = "http://127.0.0.1:4040/api/tunnels";
const PORTA_APP = 3000;
const ARQUIVO = ".env.local";

/** Chaves que este script controla. O resto do arquivo é preservado. */
const CHAVES = [
  "MERCADO_PAGO_REDIRECT_URI",
  "WEBHOOK_BASE_URL",
  "SERVER_ACTIONS_ALLOWED_ORIGINS",
  "PAGAMENTO_CRYPTO_KEY",
];

async function urlDoTunel() {
  let resposta;
  try {
    resposta = await fetch(API_NGROK, { signal: AbortSignal.timeout(3000) });
  } catch {
    throw new Error(
      "o ngrok não está rodando (API local em :4040 não respondeu).\n" +
        `  Suba num outro terminal:  ngrok http ${PORTA_APP}`,
    );
  }

  const { tunnels = [] } = await resposta.json();
  const publico = tunnels.find(
    (t) => t.public_url?.startsWith("https://") && t.config?.addr?.includes(String(PORTA_APP)),
  );

  if (!publico) {
    throw new Error(
      `o ngrok está rodando, mas nenhum túnel HTTPS aponta para a porta ${PORTA_APP}.\n` +
        `  Túneis vistos: ${tunnels.map((t) => `${t.public_url} -> ${t.config?.addr}`).join(", ") || "nenhum"}`,
    );
  }

  return publico.public_url;
}

/** Preserva o que já existe e sobrescreve só as chaves acima. */
function montarArquivo(existente, valores) {
  const linhas = existente ? existente.split("\n") : [];
  const restantes = new Map(Object.entries(valores));

  const atualizadas = linhas.map((linha) => {
    const chave = CHAVES.find((k) => linha.startsWith(`${k}=`));
    if (!chave || !restantes.has(chave)) return linha;
    const valor = restantes.get(chave);
    restantes.delete(chave);
    return `${chave}=${valor}`;
  });

  if (restantes.size > 0) {
    if (atualizadas.length && atualizadas.at(-1) !== "") atualizadas.push("");
    atualizadas.push("# Escrito por scripts/dev/tunel.mjs — não editar à mão.");
    for (const [chave, valor] of restantes) atualizadas.push(`${chave}=${valor}`);
  }

  return `${atualizadas.join("\n").replace(/\n+$/, "")}\n`;
}

/**
 * Reaproveita a chave existente só se ela for válida.
 *
 * A checagem de tamanho não é zelo: uma chave de 64 bytes (`openssl rand -hex 64`)
 * é aceita pelo arquivo e recusada pelo Node com `Invalid key length`, e a falha
 * só aparece no fim do OAuth, como "não foi possível concluir a conexão".
 */
function chaveDeCifra(existente) {
  const atual = existente?.match(/^PAGAMENTO_CRYPTO_KEY=(.*)$/m)?.[1]?.trim();
  if (atual && /^[0-9a-f]{64}$/i.test(atual)) return { valor: atual, nova: false };
  return { valor: randomBytes(32).toString("hex"), nova: true };
}

const base = await urlDoTunel();
const host = new URL(base).host;
const existente = existsSync(ARQUIVO) ? readFileSync(ARQUIVO, "utf8") : "";
const cifra = chaveDeCifra(existente);

const redirect = `${base}/api/pagamentos/mercadopago/callback`;
const webhook = `${base}/api/webhook/pagamento/mercadopago`;

writeFileSync(
  ARQUIVO,
  montarArquivo(existente, {
    MERCADO_PAGO_REDIRECT_URI: redirect,
    WEBHOOK_BASE_URL: base,
    SERVER_ACTIONS_ALLOWED_ORIGINS: host,
    PAGAMENTO_CRYPTO_KEY: cifra.valor,
  }),
);

console.log(`Túnel detectado: ${base}\n`);
console.log(`${ARQUIVO} atualizado:`);
console.log(`  MERCADO_PAGO_REDIRECT_URI      = ${redirect}`);
console.log(`  WEBHOOK_BASE_URL               = ${base}`);
console.log(`  SERVER_ACTIONS_ALLOWED_ORIGINS = ${host}`);
console.log(
  `  PAGAMENTO_CRYPTO_KEY           = ${cifra.nova ? "gerada agora (32 bytes)" : "mantida (já era válida)"}\n`,
);
console.log("No painel do Mercado Pago, cadastre estas duas URLs:");
console.log(`  Configurações avançadas → URLs de redirecionamento:\n    ${redirect}`);
console.log(`  Webhooks → URL de produção (evento: Pagamentos):\n    ${webhook}\n`);
console.log("Depois:");
console.log("  1. reinicie o `next dev` (mudança de env não recarrega a quente)");
console.log(`  2. abra ${base}/login  — e NÃO use localhost daqui em diante`);
console.log("     (o cookie fica preso à origem em que você logar)");
