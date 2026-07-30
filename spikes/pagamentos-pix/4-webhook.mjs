#!/usr/bin/env node
/**
 * Q5: o webhook de confirmação chega, e o HMAC do `x-signature` valida?
 *
 * Sem confirmação confiável o bot não sabe que o sinal foi pago, e a feature
 * degrada para Pix estático — que é grátis e não tem webhook nenhum, ou seja, um
 * produto bem menor (conciliação vira trabalho manual do dono, exatamente o que
 * a Encaixaria existe para eliminar).
 *
 * A validação segue o manifest do MP: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 * assinado em HMAC-SHA256 com o segredo da aplicação, comparado com o `v1` do
 * header `x-signature`. Duas armadilhas que o script trata de propósito, porque
 * são erro silencioso no handler de produção:
 *
 * 1. **`data.id` alfanumérico vai em minúsculas** no manifest. Errar isso dá
 *    assinatura inválida em parte do tráfego e parece "webhook instável".
 * 2. **O `data.id` vem da query string**, não do corpo. Confiar no corpo é pior
 *    que errar: é aceitar que o remetente escolha o que assinamos.
 *
 * Este script apenas valida e imprime — não grava nada e não fala com o Supabase.
 *
 * Uso: `node spikes/pagamentos-pix/4-webhook.mjs` (precisa de túnel apontando
 *      para a porta local, e a URL cadastrada em Webhooks no painel do MP)
 */

import { createServer } from "node:http";
import {
  carregarEnv,
  env,
  hmacConfere,
  hmacSha256Hex,
  inventariarChaves,
  linha,
  titulo,
  veredito,
} from "./comum.mjs";

carregarEnv();

const SEGREDO = env("MP_WEBHOOK_SECRET");
const PORTA = Number(process.env.PORTA_WEBHOOK ?? "8789");

titulo("Q5 — receptor de webhook do Mercado Pago");
linha(`Escutando em http://localhost:${PORTA}`);
linha("Aponte o túnel para cá e cadastre a URL pública em Suas integrações → Webhooks.");
linha("Depois pague a cobrança criada por 3-cobranca.mjs. Ctrl+C encerra.");

createServer((req, res) => {
  const pedacos = [];
  req.on("data", (p) => pedacos.push(p));

  req.on("end", () => {
    // Sempre 200: o MP reentrega em erro, e um spike que responde 500 gera fila
    // de retry que confunde a leitura do próprio teste.
    res.writeHead(200, { "content-type": "text/plain" }).end("ok");

    if (req.method !== "POST") return;

    const bruto = Buffer.concat(pedacos).toString("utf8");
    const url = new URL(req.url, `http://localhost:${PORTA}`);

    titulo(`Notificação recebida — ${new Date().toISOString()}`);

    const assinatura = req.headers["x-signature"];
    const requestId = req.headers["x-request-id"];

    if (!assinatura) {
      veredito("Q5", false, "sem header x-signature");
      return;
    }

    // Formato: `ts=...,v1=...`
    const partes = Object.fromEntries(
      String(assinatura)
        .split(",")
        .map((p) => p.split("=").map((s) => s.trim()))
        .filter((p) => p.length === 2),
    );

    let corpo = {};
    try {
      corpo = JSON.parse(bruto);
    } catch {
      linha("corpo não é JSON válido");
    }

    const idQuery = url.searchParams.get("data.id") ?? url.searchParams.get("id");
    const idCorpo = corpo?.data?.id;
    // A query manda. O corpo entra só no relato, para deixar visível quando os
    // dois divergem — que é o caso em que confiar no corpo quebraria a validação.
    const id = String(idQuery ?? "").toLowerCase();

    const manifest = `id:${id};request-id:${requestId};ts:${partes.ts};`;
    const calculado = hmacSha256Hex(SEGREDO, manifest);
    const confere = hmacConfere(calculado, partes.v1);

    linha(`type:        ${corpo.type ?? "—"} / action: ${corpo.action ?? "—"}`);
    linha(`data.id (query): ${idQuery ?? "AUSENTE"}`);
    linha(`data.id (corpo): ${idCorpo ?? "—"}${idQuery && idCorpo && String(idCorpo) !== String(idQuery) ? "  ← DIVERGE da query" : ""}`);
    linha(`x-request-id: ${requestId ?? "AUSENTE"}`);
    linha(`ts:           ${partes.ts ?? "AUSENTE"}`);
    linha();
    linha(`manifest: ${manifest}`);
    linha(`v1 recebido:  ${partes.v1 ?? "—"}`);
    linha(`v1 calculado: ${calculado}`);

    if (Object.keys(corpo).length > 0) {
      linha();
      linha("chaves do corpo:");
      for (const item of inventariarChaves(corpo)) linha(`  ${item}`);
    }

    linha();
    veredito(
      "Q5",
      confere,
      confere
        ? "HMAC confere — a confirmação é autenticável, o bot pode confiar nela"
        : "HMAC NÃO confere — conferir o segredo da aplicação e o lowercase do data.id",
    );
    linha(
      "  Lembrete: a notificação diz que ALGO mudou, não que pagou. " +
        "A produção tem de reconsultar GET /v1/payments/{id} e nunca confiar no status do corpo.",
    );
  });
}).listen(PORTA);
