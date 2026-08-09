#!/usr/bin/env node
/**
 * Fumaça HTTP contra o servidor Next de verdade.
 *
 * O grosso da feature de sinal é coberto por `tests/e2e/sinal-pix.test.ts`, que
 * bate nos route handlers direto. Isso é rápido e testa a lógica, mas **não**
 * prova que a rota existe no servidor: um handler pode estar correto e não ser
 * alcançável — pasta fora do lugar, matcher do proxy engolindo a URL, build sem
 * a rota no manifesto. Este script fecha essa lacuna subindo `next start` e
 * falando HTTP de verdade.
 *
 * **Nenhum `.env` do projeto é usado.** Todas as variáveis relevantes são
 * passadas explicitamente no `spawn`, e o Next dá precedência ao que já está em
 * `process.env` sobre o que está em arquivo. Os valores são inventados aqui: o
 * Supabase aponta para o local, e o Mercado Pago para um endereço que não existe
 * (nenhum teste daqui chega a chamá-lo).
 *
 * Uso: `node scripts/e2e/fumaca-http.mjs` (exige `npm run build` e `supabase start`).
 */

import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";

const PORTA = 3311;
const BASE = `http://127.0.0.1:${PORTA}`;
const SEGREDO_MP = "segredo-de-fumaca";

const AMBIENTE = {
  ...process.env,
  NODE_ENV: "production",
  PORT: String(PORTA),
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
  SUPABASE_SERVICE_ROLE_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
  MERCADO_PAGO_WEBHOOK_SECRET: SEGREDO_MP,
  MERCADO_PAGO_API_URL: "http://127.0.0.1:59999",
  MERCADO_PAGO_CLIENT_ID: "fumaca",
  MERCADO_PAGO_CLIENT_SECRET: "fumaca",
  MERCADO_PAGO_REDIRECT_URI: `${BASE}/api/pagamentos/mercadopago/callback`,
  PAGAMENTO_CRYPTO_KEY: "b".repeat(64),
  WEBHOOK_SECRET: "fumaca-bot",
  WEBHOOK_BASE_URL: BASE,
  EVOLUTION_API_URL: "http://127.0.0.1:59998",
  EVOLUTION_API_ADMIN_KEY: "fumaca",
};

function assinar(pagamentoId, segredo) {
  const ts = "1754740000";
  const requestId = "fumaca-1";
  const v1 = createHmac("sha256", segredo)
    .update(`id:${pagamentoId};request-id:${requestId};ts:${ts};`)
    .digest("hex");
  return { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": requestId };
}

function notificar(pagamentoId, segredo) {
  return fetch(
    `${BASE}/api/webhook/pagamento/mercadopago?data.id=${pagamentoId}&type=payment`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...assinar(pagamentoId, segredo),
      },
      body: JSON.stringify({ type: "payment", data: { id: pagamentoId } }),
    },
  );
}

async function esperarSubir(tentativas = 60) {
  for (let i = 0; i < tentativas; i += 1) {
    try {
      const r = await fetch(`${BASE}/login`, { redirect: "manual" });
      if (r.status < 500) return;
    } catch {
      // ainda subindo
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("o servidor não subiu a tempo");
}

const casos = [];
function verificar(nome, condicao, detalhe) {
  casos.push({ nome, ok: Boolean(condicao), detalhe });
}

const servidor = spawn("npx", ["next", "start", "--port", String(PORTA)], {
  env: AMBIENTE,
  stdio: ["ignore", "pipe", "pipe"],
});

let saida = "";
servidor.stdout.on("data", (b) => (saida += b));
servidor.stderr.on("data", (b) => (saida += b));

try {
  await esperarSubir();

  // 1. A rota do webhook de pagamento existe e é alcançável.
  const semAssinatura = await fetch(
    `${BASE}/api/webhook/pagamento/mercadopago?data.id=1&type=payment`,
    { method: "POST", body: "{}" },
  );
  verificar(
    "webhook de pagamento existe e recusa quem não assina",
    semAssinatura.status === 401,
    `status ${semAssinatura.status}`,
  );

  // 2. Assinatura errada não passa (fail-closed de verdade, sobre HTTP).
  const assinaturaErrada = await notificar("123", "segredo-errado");
  verificar(
    "assinatura inválida é recusada com 401",
    assinaturaErrada.status === 401,
    `status ${assinaturaErrada.status}`,
  );

  // 3. Assinatura válida + pagamento desconhecido = tratado em definitivo (200).
  //    Também prova que o handler alcança o Postgres local.
  const desconhecido = await notificar("999999", SEGREDO_MP);
  const corpo = await desconhecido.json();
  verificar(
    "assinatura válida com id desconhecido responde 200",
    desconhecido.status === 200 && corpo.detalhe === "cobrança desconhecida",
    `status ${desconhecido.status}, detalhe ${JSON.stringify(corpo.detalhe)}`,
  );

  // 4. A tela de pagamentos existe e é protegida.
  const painel = await fetch(`${BASE}/pagamentos`, { redirect: "manual" });
  verificar(
    "/pagamentos existe e exige sessão",
    painel.status === 307 || painel.status === 302,
    `status ${painel.status}`,
  );

  // 5. O callback do OAuth existe e manda o anônimo para o login.
  const callback = await fetch(
    `${BASE}/api/pagamentos/mercadopago/callback?code=x&state=y`,
    { redirect: "manual" },
  );
  verificar(
    "callback do OAuth existe e exige sessão",
    callback.status === 303 &&
      (callback.headers.get("location") ?? "").endsWith("/login"),
    `status ${callback.status}, location ${callback.headers.get("location")}`,
  );
} finally {
  servidor.kill("SIGTERM");
}

const falhas = casos.filter((c) => !c.ok);

for (const caso of casos) {
  console.log(`${caso.ok ? "✔" : "✘"} ${caso.nome}${caso.ok ? "" : ` — ${caso.detalhe}`}`);
}

if (falhas.length) {
  console.error(`\n${falhas.length} verificação(ões) falharam.`);
  console.error("\n--- saída do servidor ---\n" + saida.slice(-3000));
  process.exit(1);
}

console.log(`\n${casos.length} verificações passaram.`);
