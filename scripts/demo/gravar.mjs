/**
 * Grava o vídeo de demonstração para prospecção.
 *
 * Sobe o app apontado para a **stack local**, semeia o tenant de demonstração,
 * dirige o browser com Playwright e converte a saída para mp4.
 *
 * Duas coisas que este script existe para garantir, e que um `next dev` na mão
 * não garante:
 *
 * 1. **Nunca gravar produção.** O `.env` do projeto aponta para o Supabase real.
 *    Aqui as variáveis são passadas explicitamente para o processo filho, e o
 *    seed recusa qualquer URL que não seja localhost.
 * 2. **Cursor visível.** O vídeo do Playwright NÃO desenha o ponteiro do mouse
 *    (verificado extraindo frames): sem o cursor injetado abaixo, os cliques
 *    acontecem sem causa visível na tela.
 *
 * Uso: node scripts/demo/gravar.mjs
 */

import { spawn } from "node:child_process";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { DATAS_ORIGINAIS, LEGENDAS, RITMO } from "./roteiro.mjs";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const SAIDA = path.join(RAIZ, "scripts/demo/saida");
const PORTA = 3100;
const BASE = `http://127.0.0.1:${PORTA}`;

const SUPABASE_LOCAL = "http://127.0.0.1:54321";
const ANON_LOCAL =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_LOCAL =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const FORMATOS = [
  // Vertical primeiro: é o que vai por WhatsApp, e força o layout mobile do
  // dashboard — que é como o dono realmente usa o produto, entre atendimentos.
  { nome: "vertical", largura: 720, altura: 1280, zoomConversa: 1.55 },
  { nome: "desktop", largura: 1280, altura: 720, zoomConversa: 1.0 },
];

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Injeção na página: cursor falso, legenda e supressão do badge de dev.
// ---------------------------------------------------------------------------

/**
 * O Playwright dispara eventos de input de verdade (via CDP), então o
 * `mousemove` do DOM acontece e um elemento pode simplesmente segui-lo — não é
 * preciso mover cursor e ponteiro em paralelo pelo script.
 *
 * `pointer-events:none` é obrigatório: sem isso o próprio cursor intercepta o
 * clique que deveria chegar no botão.
 */
const SCRIPT_PAGINA = `
(() => {
  const SETA =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
      '<path d="M5 2l14 9-6 1 3.5 7-3 1.5L10 13l-5 3z" fill="#fff" stroke="#0f172a" stroke-width="1.4" stroke-linejoin="round"/>' +
      '</svg>'
    );

  const estilo = document.createElement("style");
  estilo.textContent = [
    // Badge de dev do Next: some da gravação sem mexer em next.config.ts.
    "nextjs-portal{display:none!important}",
    "#__cursor{position:fixed;left:0;top:0;width:26px;height:26px;pointer-events:none;z-index:2147483647;background:no-repeat center/contain url(\\"" + SETA + "\\");filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))}",
    "#__halo{position:fixed;left:0;top:0;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:999px;pointer-events:none;z-index:2147483646;background:rgba(20,184,166,.5);opacity:0;transform:scale(0);transition:transform .45s ease-out,opacity .45s ease-out}",
    "#__legenda{position:fixed;left:50%;bottom:6%;transform:translateX(-50%) translateY(8px);max-width:86%;padding:14px 20px;border-radius:14px;background:rgba(2,6,23,.92);color:#f8fafc;font-size:clamp(15px,2.4vw,22px);line-height:1.35;text-align:center;pointer-events:none;z-index:2147483645;opacity:0;transition:opacity .35s ease,transform .35s ease;box-shadow:0 10px 30px rgba(0,0,0,.35)}",
    "#__legenda[data-visivel=\\"1\\"]{opacity:1;transform:translateX(-50%) translateY(0)}",
  ].join("\\n");

  function instalar() {
    if (document.getElementById("__cursor")) return;
    document.head.appendChild(estilo);
    for (const id of ["__halo", "__cursor", "__legenda"]) {
      const el = document.createElement("div");
      el.id = id;
      document.body.appendChild(el);
    }
  }

  if (document.body) instalar();
  else document.addEventListener("DOMContentLoaded", instalar);

  let x = 0, y = 0;
  addEventListener("mousemove", (e) => {
    x = e.clientX; y = e.clientY;
    const c = document.getElementById("__cursor");
    const h = document.getElementById("__halo");
    if (c) c.style.transform = "translate(" + x + "px," + y + "px)";
    if (h) h.style.transform = "translate(" + x + "px," + y + "px) scale(0)";
  }, true);

  addEventListener("mousedown", () => {
    const h = document.getElementById("__halo");
    if (!h) return;
    h.style.opacity = "1";
    h.style.transform = "translate(" + x + "px," + y + "px) scale(1)";
    setTimeout(() => { h.style.opacity = "0"; }, 420);
  }, true);

  window.__legenda = (texto) => {
    const el = document.getElementById("__legenda");
    if (!el) return;
    if (texto === null) { el.dataset.visivel = "0"; return; }
    el.textContent = texto;
    el.dataset.visivel = "1";
  };
})();
`;

// ---------------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------------

/**
 * `next dev` e não `next build && next start`: o build inlinaria a URL do
 * Supabase LOCAL dentro de `.next`, e um `npm run start` posterior do usuário
 * silenciosamente falaria com localhost achando que fala com produção. O custo é
 * ter de pré-aquecer as rotas (abaixo) para nenhuma compilação aparecer no vídeo.
 */
async function subirApp() {
  /**
   * Recusa se a porta já responde, e isso não é preciosismo.
   *
   * Sem a checagem, um `next dev` órfão de uma execução interrompida segura a
   * 3100: o spawn morre com `EADDRINUSE`, mas o `fetch` de prontidão abaixo é
   * respondido pelo processo velho e o script segue achando que subiu o dele.
   * Resultado: grava contra um servidor cuja configuração ninguém conhece
   * (podendo apontar para outro banco) e o `kill` do final não o alcança.
   */
  const jaResponde = await fetch(BASE, { signal: AbortSignal.timeout(1500) })
    .then(() => true)
    .catch(() => false);

  if (jaResponde) {
    throw new Error(
      `já existe algo servindo em ${BASE}.\n` +
        "Este script precisa subir o próprio servidor, com as variáveis da stack\n" +
        "local — gravar contra um servidor alheio pode gravar produção.\n" +
        `Libere a porta:  kill $(lsof -t -i:${PORTA})`,
    );
  }

  /**
   * O binário local direto, e **não** `npx next`: o `npx` exec/forka o `next` e
   * um `kill` no `npx` deixa o servidor rodando. Na prática isso segurava a porta
   * depois do script terminar, e a execução seguinte caía na guarda acima —
   * escondida atrás de um "já existe algo servindo" que parecia culpa do usuário.
   */
  const processo = spawn(
    path.join(RAIZ, "node_modules/.bin/next"),
    ["dev", "--port", String(PORTA)],
    {
      cwd: RAIZ,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "development",
        NEXT_PUBLIC_SUPABASE_URL: SUPABASE_LOCAL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_LOCAL,
        SUPABASE_SERVICE_ROLE_KEY: SERVICE_LOCAL,
        // Sem número de contato o banner de assinatura não tem botão; o tenant
        // de demonstração está com assinatura ativa, então nem aparece.
        WHATSAPP_CONTATO: "",
        SITE_URL: BASE,
      },
    },
  );

  processo.stderr.on("data", (d) => {
    const linha = String(d);
    if (/error/i.test(linha)) process.stderr.write(`[next] ${linha}`);
  });

  const limite = Date.now() + 90_000;
  while (Date.now() < limite) {
    try {
      const r = await fetch(BASE, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return processo;
    } catch {
      // ainda subindo
    }
    await esperar(500);
  }

  processo.kill("SIGTERM");
  throw new Error("o servidor não respondeu em 90s");
}

/** Compila cada rota antes de gravar, para o vídeo não pegar tela de loading. */
async function preAquecer(rotas) {
  for (const rota of rotas) {
    await fetch(`${BASE}${rota}`).catch(() => {});
  }
}

function semear() {
  return new Promise((resolve, reject) => {
    const p = spawn("node", ["scripts/demo/semear.mjs"], {
      cwd: RAIZ,
      stdio: ["ignore", "pipe", "inherit"],
      env: { ...process.env, SUPABASE_DEMO_URL: SUPABASE_LOCAL },
    });
    let saida = "";
    p.stdout.on("data", (d) => (saida += d));
    p.on("close", (codigo) => {
      if (codigo !== 0) return reject(new Error(`seed falhou (${codigo})`));
      try {
        resolve(JSON.parse(saida));
      } catch (erro) {
        reject(new Error(`seed não devolveu JSON: ${erro.message}`));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Rótulos, no mesmo formato que a engine produz
// ---------------------------------------------------------------------------

/**
 * Reproduz `formatarSlot`/`formatarDia` de `lib/bot/engine-fluxo.ts`, incluindo
 * o `replace(/[.,]/g, "")` — o pt-BR emite `"sex., 31/07"` e o formato do
 * produto é `"sex 31/07"`. Se a engine mudar de formato, o vídeo passa a mentir
 * sobre ser transcrição literal.
 */
function rotuloDoDia(data) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  })
    .format(new Date(`${data}T12:00:00Z`))
    .replace(/[.,]/g, "");
}

// ---------------------------------------------------------------------------
// Cenas
// ---------------------------------------------------------------------------

const SELETOR_FALAS = '[role="img"] > div[aria-hidden] > p';

/**
 * Ato 1: a conversa, revelada fala por fala.
 *
 * A `ConversaDemo` renderiza tudo de uma vez (é uma transcrição estática na
 * landing). Aqui as falas são escondidas e reveladas no ritmo de uma conversa
 * real — sem tocar no componente, que continua servindo à landing e ao SEO.
 */
async function atoConversa(pagina, formato, dados) {
  // A landing, e não `/como-funciona`: o herói dá a cena de abertura com a marca
  // e a `ConversaDemo` está na mesma página, então é uma navegação só.
  await pagina.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await pagina.evaluate(SCRIPT_PAGINA);

  await pagina.evaluate((t) => window.__legenda(t), LEGENDAS.abertura);
  await esperar(2800);

  /**
   * O cartão da conversa é movido para um palco que cobre a tela.
   *
   * Sem isso, a cena mais importante do vídeo disputa atenção com o resto da
   * landing — na primeira tomada apareceu o título "Por que menu de números"
   * atrás da legenda, no meio da conversa.
   *
   * Mover nó do DOM aqui é seguro porque `ConversaDemo` não é `"use client"`:
   * não há hidratação que possa reescrever essa subárvore.
   *
   * `align-items:flex-end` faz o cartão crescer de baixo para cima conforme as
   * falas aparecem, como uma conversa de verdade — e resolve de graça o caso de
   * a conversa ficar mais alta que o quadro.
   */
  await pagina.evaluate(
    ({ seletor, originais, rotulo, zoom }) => {
      const cartao = document.querySelector('[role="img"]');
      if (!cartao) throw new Error("cartão da ConversaDemo não encontrado");

      const palco = document.createElement("div");
      palco.id = "__palco";
      palco.style.cssText = [
        "position:fixed",
        "inset:0",
        "z-index:2147483640",
        `background:${getComputedStyle(document.body).backgroundColor}`,
        "display:flex",
        "align-items:flex-end",
        "justify-content:center",
        "padding:20px 14px 8%",
        "overflow:hidden",
        /**
         * Conversa mais alta que o quadro é a regra, não a exceção — no desktop
         * (720px) ela nunca cabe inteira. Sem a máscara a primeira fala aparecia
         * fatiada na borda de cima, o que lê como defeito; com ela, o corte é um
         * fade e lê como conversa rolada.
         */
        "mask-image:linear-gradient(to bottom,transparent 0,#000 7%)",
        "-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 7%)",
      ].join(";");
      document.body.appendChild(palco);
      palco.appendChild(cartao);

      // `zoom` e não `transform: scale`: afeta o layout, então o cartão
      // `max-w-sm` realmente ocupa o quadro em vez de ser escalado por cima.
      cartao.style.zoom = String(zoom);
      cartao.style.width = "100%";
      cartao.style.maxWidth = "24rem";

      /**
       * `display:none`, não `opacity:0`. Com opacity o cartão mantinha a altura
       * de todas as falas e a cena abria com um retângulo branco gigante, com o
       * cabeçalho empurrado para fora do quadro.
       */
      for (const fala of palco.querySelectorAll(seletor)) {
        for (const antiga of originais) {
          fala.textContent = fala.textContent.replaceAll(antiga, rotulo);
        }
        fala.style.display = "none";
        fala.style.transition = "opacity .28s ease, transform .28s ease";
      }
    },
    {
      seletor: SELETOR_FALAS,
      originais: DATAS_ORIGINAIS,
      rotulo: rotuloDoDia(dados.destaque.data),
      zoom: formato.zoomConversa,
    },
  );

  /**
   * A legenda apresenta a cena e sai.
   *
   * Mantê-la no ar durante a conversa cobria a última fala — e a folga do palco
   * não resolve sozinha, porque `zoom` faz o cartão transbordar o cálculo do
   * flex. Além disso é melhor cinema: quem está lendo o menu numerado não está
   * lendo a legenda.
   */
  await pagina.evaluate((t) => window.__legenda(t), LEGENDAS.conversa);
  await esperar(2200);
  await pagina.evaluate(() => window.__legenda(null));
  await esperar(400);

  const total = await pagina.locator(SELETOR_FALAS).count();
  for (let i = 0; i < total; i++) {
    const doCliente = await pagina.evaluate(
      ({ seletor, indice }) => {
        const fala = document.querySelectorAll(seletor)[indice];
        fala.style.display = "";
        fala.style.opacity = "0";
        fala.style.transform = "translateY(8px)";
        // Dois quadros: o primeiro aplica o display, o segundo dispara a
        // transição. No mesmo quadro o browser não animaria nada.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            fala.style.opacity = "1";
            fala.style.transform = "none";
          }),
        );
        // A fala do cliente é a alinhada à direita.
        return fala.classList.contains("self-end");
      },
      { seletor: SELETOR_FALAS, indice: i },
    );

    await esperar(doCliente ? RITMO.cliente : RITMO.bot);
  }

  await pagina.evaluate((t) => window.__legenda(t), LEGENDAS.semApp);
  await esperar(RITMO.cena + 900);
  await pagina.evaluate(() => window.__legenda(null));
}

/**
 * Ato 2: o outro lado. Login de verdade (`signInWithPassword`) e a agenda do dono
 * com o horário que a conversa acabou de marcar.
 */
async function atoAgenda(pagina, formato, dados) {
  await pagina.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await pagina.evaluate(SCRIPT_PAGINA);
  await pagina.evaluate((t) => window.__legenda(t), LEGENDAS.agenda);

  // Digitação com atraso: campo preenchido de uma vez parece corte de edição.
  await pagina.locator('input[name="email"]').click();
  await pagina.locator('input[name="email"]').pressSequentially(dados.email, {
    delay: 55,
  });
  await pagina.locator('input[name="senha"]').click();
  await pagina.locator('input[name="senha"]').pressSequentially(dados.senha, {
    delay: 45,
  });
  await esperar(500);

  await Promise.all([
    pagina.waitForURL(/agendamentos/, { timeout: 30_000 }),
    pagina.getByRole("button", { name: /entrar/i }).first().click(),
  ]);
  await pagina.waitForLoadState("networkidle");
  await pagina.evaluate(SCRIPT_PAGINA);
  await pagina.evaluate((t) => window.__legenda(t), LEGENDAS.agenda);
  await esperar(2200);

  /**
   * No vertical a lista abre no dia de hoje e o agendamento em destaque é no dia
   * seguinte, então há um toque no seletor de dia — que é interação real do
   * produto, não encenação. No desktop a grade da semana já mostra o dia todo.
   */
  if (formato.nome === "vertical") {
    const diaDestaque = pagina
      .locator(`nav[aria-label="Escolher o dia"] a[href*="${dados.destaque.data}"]`)
      .first();
    if (await diaDestaque.count()) {
      await diaDestaque.hover();
      await esperar(600);
      await diaDestaque.click();
      await pagina.waitForLoadState("networkidle");
      await pagina.evaluate(SCRIPT_PAGINA);
      await esperar(1800);
    }
  }

  // Destaca o agendamento da conversa, para o olho achar sem procurar.
  await pagina.evaluate((cliente) => {
    const alvo = [...document.querySelectorAll("*")].find(
      (el) =>
        el.children.length === 0 && el.textContent?.trim() === cliente,
    );
    const cartao = alvo?.closest("li, article, div[class*='rounded']");
    if (!cartao) return;
    cartao.style.transition = "box-shadow .5s ease, transform .5s ease";
    cartao.style.boxShadow = "0 0 0 3px rgb(20 184 166), 0 8px 24px rgba(0,0,0,.25)";
    cartao.style.transform = "scale(1.02)";
    cartao.scrollIntoView({ block: "center", behavior: "smooth" });
  }, dados.destaque.cliente);

  await esperar(2600);
  await pagina.evaluate((t) => window.__legenda(t), LEGENDAS.fechamento);
  await esperar(2800);
}

// ---------------------------------------------------------------------------
// Orquestração
// ---------------------------------------------------------------------------

async function gravarFormato(browser, formato, dados) {
  const dirTemp = path.join(SAIDA, `bruto-${formato.nome}`);
  await rm(dirTemp, { recursive: true, force: true });

  const contexto = await browser.newContext({
    viewport: { width: formato.largura, height: formato.altura },
    deviceScaleFactor: 1,
    recordVideo: {
      dir: dirTemp,
      size: { width: formato.largura, height: formato.altura },
    },
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    colorScheme: "light",
  });

  // Roda em toda navegação, então o cursor e a legenda sobrevivem ao login.
  await contexto.addInitScript(SCRIPT_PAGINA);

  const pagina = await contexto.newPage();
  await atoConversa(pagina, formato, dados);
  await atoAgenda(pagina, formato, dados);

  await contexto.close();

  const [bruto] = (await readdir(dirTemp)).filter((f) => f.endsWith(".webm"));
  const destino = path.join(SAIDA, `encaixaria-${formato.nome}.webm`);
  await rename(path.join(dirTemp, bruto), destino);
  await rm(dirTemp, { recursive: true, force: true });

  return destino;
}

let servidor;
try {
  await mkdir(SAIDA, { recursive: true });

  console.log("→ semeando tenant de demonstração…");
  const dados = await semear();
  console.log(
    `  ${dados.estabelecimento} · destaque ${rotuloDoDia(dados.destaque.data)} ${dados.destaque.hora}`,
  );

  console.log(`→ subindo o app em ${BASE} (Supabase local)…`);
  servidor = await subirApp();
  await preAquecer(["/", "/como-funciona", "/login", "/agendamentos"]);

  const browser = await chromium.launch();
  const gerados = [];
  for (const formato of FORMATOS) {
    console.log(`→ gravando ${formato.nome} (${formato.largura}x${formato.altura})…`);
    gerados.push(await gravarFormato(browser, formato, dados));
  }
  await browser.close();

  console.log("\nWebM gerado:");
  for (const arquivo of gerados) console.log(`  ${arquivo}`);
  console.log("\nAgora converta para mp4: node scripts/demo/converter.mjs");
} finally {
  servidor?.kill("SIGTERM");
}
