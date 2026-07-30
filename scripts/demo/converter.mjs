/**
 * Converte os WebM do Playwright para mp4 e publica em `public/demo/`.
 *
 * A conversão não é conveniência: o Playwright grava **VP8 em WebM**, que o
 * WhatsApp não reproduz como vídeo (aparece como arquivo para baixar) e que o
 * Safari/iOS também não toca. O mp4 é o formato entregável nos dois destinos —
 * prospecção por WhatsApp e a landing — e o WebM é só o intermediário.
 *
 * O destino é `public/` e não `saida/` porque estes arquivos são **assets do
 * site**: a landing os serve em `app/(marketing)/page.tsx`. O WebM fica em
 * `saida/`, fora do versionamento.
 *
 * Gera também um pôster por vídeo. Ele não é enfeite: a landing usa
 * `preload="none"` (ver o comentário lá), então sem pôster o lugar do vídeo
 * apareceria como um retângulo preto vazio até alguém clicar.
 *
 * Uso: node scripts/demo/converter.mjs
 */

import { spawn } from "node:child_process";
import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const SAIDA = path.join(RAIZ, "scripts/demo/saida");
const PUBLICO = path.join(RAIZ, "public/demo");

/**
 * Segundo de onde sai o pôster de cada formato, escolhido olhando frame por
 * frame: no vertical a conversa cheia é a imagem que vende; no desktop a grade
 * da semana preenche o quadro 16:9 melhor que o cartão de conversa, que fica
 * pequeno no meio de muito branco.
 */
const SEGUNDO_DO_POSTER = { vertical: 17, desktop: 29 };

function rodar(comando, argumentos) {
  return new Promise((resolve, reject) => {
    const p = spawn(comando, argumentos, { stdio: ["ignore", "ignore", "pipe"] });
    let erro = "";
    p.stderr.on("data", (d) => (erro += d));
    p.on("close", (codigo) =>
      codigo === 0 ? resolve() : reject(new Error(erro.slice(-800))),
    );
  });
}

const arquivos = (await readdir(SAIDA)).filter((f) => f.endsWith(".webm"));
if (!arquivos.length) {
  console.error("Nenhum .webm em scripts/demo/saida — rode gravar.mjs primeiro.");
  process.exit(1);
}

await mkdir(PUBLICO, { recursive: true });

for (const arquivo of arquivos) {
  const entrada = path.join(SAIDA, arquivo);
  const destino = path.join(PUBLICO, arquivo.replace(/\.webm$/, ".mp4"));

  await rodar("ffmpeg", [
    "-y",
    "-loglevel", "error",
    "-i", entrada,
    // O WebM do Playwright tem taxa de quadros variável; normalizar evita
    // reprodução acelerada em players que assumem taxa constante.
    "-r", "30",
    "-c:v", "libx264",
    "-preset", "slow",
    "-crf", "23",
    // `yuv420p` e `profile high` são o que dá compatibilidade ampla de celular;
    // sem o pix_fmt explícito o libx264 pode sair em yuv444p, que muito player
    // de Android simplesmente não abre.
    "-pix_fmt", "yuv420p",
    "-profile:v", "high",
    "-level", "4.0",
    // Move o índice para o começo: o vídeo começa a tocar antes de baixar tudo.
    "-movflags", "+faststart",
    // Sem trilha de áudio: o roteiro é legendado, e faixa muda vazia só engorda.
    "-an",
    destino,
  ]);

  const formato = arquivo.includes("vertical") ? "vertical" : "desktop";
  const poster = destino.replace(/\.mp4$/, ".webp");

  await rodar("ffmpeg", [
    "-y",
    "-loglevel", "error",
    "-ss", String(SEGUNDO_DO_POSTER[formato]),
    "-i", destino,
    "-vframes", "1",
    "-c:v", "libwebp",
    "-quality", "74",
    poster,
  ]);

  const { size } = await stat(destino);
  const { size: tamanhoPoster } = await stat(poster);
  console.log(
    `${path.basename(destino)} — ${(size / 1024 / 1024).toFixed(1)} MB ` +
      `(+ pôster ${Math.round(tamanhoPoster / 1024)} KB)`,
  );
}
