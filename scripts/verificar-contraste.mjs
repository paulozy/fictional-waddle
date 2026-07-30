#!/usr/bin/env node
/**
 * Verificação de contraste dos tokens de cor, nos dois temas.
 *
 * Lê `app/globals.css` e converte cada token OKLCH para sRGB — não repete
 * nenhum valor. Um script com a paleta copiada dentro desatualiza na primeira
 * mudança e passa a dar um "ok" que não significa nada.
 *
 * Cobre também os **pares compostos com alfa** (`bg-destructive/10`,
 * `border-destructive/30`, `hover:bg-primary/…`). Esses dependem do
 * `--background` para compor, então mexer no fundo muda o resultado deles sem
 * que nenhum token pareça ter mudado — foi assim que quase passou batido que
 * clarear a primária faria o hover padrão do shadcn reprovar AA.
 *
 * Uso: `npm run verificar:contraste`
 */

import { readFileSync } from "node:fs";

const CSS = new URL("../app/globals.css", import.meta.url);

// ---------------------------------------------------------------- cor

const paraLinear = (c) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** Luminância relativa da WCAG 2.x. */
function luminancia([r, g, b]) {
  const [rl, gl, bl] = [r, g, b].map(paraLinear);
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function contraste(a, b) {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
}

/** OKLCH → sRGB 0-255, com clamp de gamut (é o que o navegador faz). */
function oklchParaRgb(L, C, Hgraus) {
  const h = (Hgraus * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];

  return lin.map((v) => {
    const codificado =
      v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(v, 0) ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, codificado)) * 255);
  });
}

/** Compõe `fg` com opacidade sobre `bg`, como o navegador. */
function compor(fg, alfa, bg) {
  return [0, 1, 2].map((i) => Math.round(fg[i] * alfa + bg[i] * (1 - alfa)));
}

const paraHex = (rgb) =>
  "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();

// ------------------------------------------------------- leitura do CSS

/** Extrai `--token: oklch(...)` de um bloco do CSS. */
function lerTokens(css, seletor) {
  const inicio = css.search(new RegExp(`${seletor}\\s*\\{`));
  if (inicio < 0) throw new Error(`bloco ${seletor} não encontrado`);

  const bloco = css.slice(inicio, css.indexOf("}", inicio));
  const tokens = {};

  for (const [, nome, l, c, h] of bloco.matchAll(
    /--([\w-]+):\s*oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/g,
  )) {
    tokens[nome] = oklchParaRgb(Number(l), Number(c), Number(h));
  }

  return tokens;
}

// ------------------------------------------------------------- pares

/**
 * `min` segue a WCAG 2.2: 4,5:1 para texto normal (1.4.3) e 3:1 para limite de
 * componente e estado de foco (1.4.11). Os pares com `min` abaixo disso não têm
 * piso normativo — são divisores decorativos, e o número só existe para o
 * elemento não sumir.
 */
function paresDoTema(t) {
  const alfa = (nome, a, sobre) => compor(t[nome], a, t[sobre]);

  return [
    ["foreground / background", t.foreground, t.background, 4.5],
    ["muted-foreground / background", t["muted-foreground"], t.background, 4.5],
    ["muted-foreground / card", t["muted-foreground"], t.card, 4.5],
    ["muted-foreground / muted", t["muted-foreground"], t.muted, 4.5],
    ["primary / background", t.primary, t.background, 4.5],
    ["primary / card", t.primary, t.card, 4.5],
    ["primary-foreground / primary", t["primary-foreground"], t.primary, 4.5],
    [
      "primary-foreground / primary-hover",
      t["primary-foreground"],
      t["primary-hover"],
      4.5,
    ],
    [
      "secondary-foreground / secondary",
      t["secondary-foreground"],
      t.secondary,
      4.5,
    ],
    ["accent-foreground / accent", t["accent-foreground"], t.accent, 4.5],
    ["destructive / background", t.destructive, t.background, 4.5],
    [
      "destructive-foreground / destructive",
      t["destructive-foreground"],
      t.destructive,
      4.5,
    ],
    ["aviso / background", t.aviso, t.background, 4.5],
    ["aviso / aviso-suave", t.aviso, t["aviso-suave"], 4.5],

    // Limite de componente e foco — WCAG 1.4.11.
    ["input / background", t.input, t.background, 3],
    ["input / card", t.input, t.card, 3],
    ["ring / background", t.ring, t.background, 3],
    ["ring / card", t.ring, t.card, 3],
    ["agora / card", t.agora, t.card, 3],

    // Blocos do calendário.
    [
      "confirmado tinta/fundo",
      t["status-confirmado-tinta"],
      t["status-confirmado"],
      4.5,
    ],
    [
      "concluido tinta/fundo",
      t["status-concluido-tinta"],
      t["status-concluido"],
      4.5,
    ],
    [
      "cancelado tinta/fundo",
      t["status-cancelado-tinta"],
      t["status-cancelado"],
      4.5,
    ],
    ["falta tinta/fundo", t["status-falta-tinta"], t["status-falta"], 4.5],

    /**
     * Anel de foco **dentro** do bloco do calendário — WCAG 1.4.11.
     *
     * O par `ring / card` acima não cobre isto: o bloco usa `ring-inset`, então o anel
     * é desenhado sobre o fundo do próprio status, não sobre o papel do card. Foi o que
     * ninguém tinha medido quando o bloco virou botão focável.
     */
    ["ring / fundo confirmado", t.ring, t["status-confirmado"], 3],
    ["ring / fundo concluido", t.ring, t["status-concluido"], 3],
    ["ring / fundo cancelado", t.ring, t["status-cancelado"], 3],
    ["ring / fundo falta", t.ring, t["status-falta"], 3],

    // Compostos com alfa — em uso real no app.
    [
      "destructive sobre destructive/10",
      t.destructive,
      alfa("destructive", 0.1, "background"),
      4.5,
    ],
    [
      "destructive sobre destructive/10 (card)",
      t.destructive,
      alfa("destructive", 0.1, "card"),
      4.5,
    ],
    [
      "borda destructive/30 / background",
      alfa("destructive", 0.3, "background"),
      t.background,
      1.2,
    ],
    [
      "borda aviso/40 / aviso-suave",
      alfa("aviso", 0.4, "aviso-suave"),
      t["aviso-suave"],
      1.2,
    ],

    // Divisores: sem piso normativo, só não podem sumir.
    ["border / background", t.border, t.background, 1.2],
    ["regua-forte / background", t["regua-forte"], t.background, 1.2],
    ["card / background", t.card, t.background, 1.02],
  ];
}

// ------------------------------------------------------------- execução

const css = readFileSync(CSS, "utf8");
let falhas = 0;
const apertados = [];

for (const [nome, seletor] of [
  ["CLARO", ":root"],
  ["ESCURO", "\\.dark"],
]) {
  const tokens = lerTokens(css, seletor);
  console.log(`\n${"=".repeat(66)}\n  TEMA ${nome}\n${"=".repeat(66)}`);

  for (const [rotulo, frente, fundo, min] of paresDoTema(tokens)) {
    if (!frente || !fundo) {
      console.log(`  ????? ${rotulo} — token ausente no CSS`);
      falhas++;
      continue;
    }

    const razao = contraste(frente, fundo);
    const passa = razao >= min;
    if (!passa) falhas++;
    // Margem curta não é falha, mas é o que quebra na próxima mudança.
    if (passa && min >= 4.5 && razao < 4.8) apertados.push(`${nome}: ${rotulo}`);

    console.log(
      `  ${passa ? "ok   " : "FALHA"} ${rotulo.padEnd(40)} ` +
        `${razao.toFixed(2).padStart(6)}:1  (min ${min})  ` +
        `${paraHex(frente)} / ${paraHex(fundo)}`,
    );
  }
}

console.log("");
if (apertados.length) {
  console.log(`margem curta (< 4,8:1) — cuidado ao mexer:`);
  for (const a of apertados) console.log(`  · ${a}`);
  console.log("");
}

if (falhas) {
  console.error(`${falhas} par(es) reprovando.`);
  process.exit(1);
}

console.log("Todos os pares passam.");
