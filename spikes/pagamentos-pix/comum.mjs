/**
 * Utilidades compartilhadas do spike. Nada aqui é código de produto.
 *
 * Node puro, sem dependência nova, no mesmo espírito de
 * `scripts/verificar-contraste.mjs`. Em particular **não** usamos
 * `node --env-file`: aquilo exige Node >= 20.6, e um spike que morre com
 * "unknown option" na máquina de outra pessoa não responde pergunta nenhuma.
 * Parsear o `.env.spike` à mão custa dez linhas e não tem versão mínima.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const AQUI = new URL(".", import.meta.url);

export const ARQUIVO_TOKENS = new URL(".tokens.json", AQUI);
export const ARQUIVO_COBRANCA = new URL("cobranca.json", AQUI);

/** Lê `.env.spike` sem sobrescrever o que já veio do ambiente. */
export function carregarEnv() {
  let bruto;
  try {
    bruto = readFileSync(new URL(".env.spike", AQUI), "utf8");
  } catch {
    return;
  }

  for (const linha of bruto.split("\n")) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith("#")) continue;

    const corte = limpa.indexOf("=");
    if (corte < 1) continue;

    const chave = limpa.slice(0, corte).trim();
    // Aspas em volta do valor são convenção de arquivo .env, não parte do valor.
    const valor = limpa
      .slice(corte + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2");

    if (process.env[chave] === undefined) process.env[chave] = valor;
  }
}

/**
 * Falha cedo e com instrução, em vez de mandar `undefined` para o Mercado Pago e
 * receber um `invalid_client` que não diz o que faltou.
 */
export function env(nome) {
  const valor = process.env[nome];
  if (!valor) {
    throw new Error(
      `${nome} ausente. Preencha spikes/pagamentos-pix/.env.spike ` +
        `(veja o README para de onde tirar cada valor).`,
    );
  }
  return valor;
}

/** Mostra o suficiente para conferir que é o token certo, sem vazá-lo no log. */
export function mascarar(segredo) {
  if (typeof segredo !== "string" || segredo.length < 12) return "<curto ou ausente>";
  return `${segredo.slice(0, 6)}…${segredo.slice(-4)} (${segredo.length} chars)`;
}

/**
 * Impressão digital curta, para comparar dois segredos sem exibir nenhum.
 *
 * `mascarar` não serve para isso: tokens do MP compartilham prefixo e terminam no
 * `user_id`, então dois valores diferentes imprimem **idêntico** (`TG-6a6…9972`) e
 * a evidência de rotação parece contradizer o veredito. Aqui um dígito diferente
 * no meio muda o digest inteiro.
 */
export function digital(segredo) {
  if (typeof segredo !== "string" || !segredo) return "<ausente>";
  return `sha256:${createHash("sha256").update(segredo).digest("hex").slice(0, 12)}`;
}

/**
 * `fetch` que devolve corpo e status juntos.
 *
 * Não lança em status de erro de propósito: no spike, a resposta de erro do
 * Mercado Pago **é** o dado que estamos procurando — `invalid_scope`,
 * `invalid_redirect_uri` e afins são exatamente as respostas de Q1.
 */
export async function chamar(url, opcoes = {}) {
  const resposta = await fetch(url, opcoes);
  const texto = await resposta.text();

  let corpo = texto;
  try {
    corpo = JSON.parse(texto);
  } catch {
    // Deixa como texto: erro de gateway às vezes volta em HTML.
  }

  return { ok: resposta.ok, status: resposta.status, corpo, cabecalhos: resposta.headers };
}

export function lerJson(arquivo) {
  return JSON.parse(readFileSync(arquivo, "utf8"));
}

export function gravarJson(arquivo, dados) {
  writeFileSync(arquivo, `${JSON.stringify(dados, null, 2)}\n`);
}

/**
 * Inventário raso de chaves de um objeto, para Q7 (que PII o MP devolve).
 *
 * Só os nomes e o tipo — nunca os valores. O objetivo é montar a lista de
 * descarte por LGPD antes de existir schema, e para isso saber que veio um campo
 * `payer.identification.number` basta; ver o CPF em si seria o contrário do
 * objetivo.
 */
export function inventariarChaves(objeto, prefixo = "") {
  const achados = [];

  for (const [chave, valor] of Object.entries(objeto ?? {})) {
    const caminho = prefixo ? `${prefixo}.${chave}` : chave;

    if (valor && typeof valor === "object" && !Array.isArray(valor)) {
      achados.push(...inventariarChaves(valor, caminho));
    } else {
      const tipo = valor === null ? "null" : Array.isArray(valor) ? "array" : typeof valor;
      achados.push(`${caminho}: ${tipo}${valor === null || valor === "" ? " (vazio)" : ""}`);
    }
  }

  return achados;
}

/**
 * Compara HMAC em tempo constante. Exagero para um spike, mas o script vira
 * referência para o handler de produção, e ali `===` seria oráculo de timing.
 */
export function hmacConfere(esperado, recebido) {
  const a = Buffer.from(esperado, "utf8");
  const b = Buffer.from(recebido ?? "", "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hmacSha256Hex(segredo, mensagem) {
  return createHmac("sha256", segredo).update(mensagem).digest("hex");
}

export const linha = (t = "") => console.log(t);

export function titulo(texto) {
  linha();
  linha(`── ${texto} ${"─".repeat(Math.max(0, 68 - texto.length))}`);
  linha();
}

/** Veredito de uma pergunta do spike, no formato que o README espera. */
export function veredito(pergunta, passou, detalhe) {
  linha(`${passou ? "✔" : "✘"} ${pergunta}: ${detalhe}`);
}
