/**
 * Semeia o tenant de demonstração usado pelo vídeo de prospecção.
 *
 * Roda **só contra a stack local** — a guarda no topo não é zelo excessivo: o
 * `.env` do projeto aponta para o Supabase de produção, então um `node
 * scripts/demo/semear.mjs` distraído criaria uma conta falsa, serviços falsos e
 * agendamentos falsos no banco que atende os pilotos de verdade.
 *
 * Imprime em stdout um JSON com o que o roteiro de gravação precisa saber
 * (credenciais e o agendamento em destaque), para os dois scripts não repetirem
 * as mesmas datas em dois lugares.
 *
 * Uso: node scripts/demo/semear.mjs
 */

const URL_SUPABASE = process.env.SUPABASE_DEMO_URL ?? "http://127.0.0.1:54321";
const CHAVE_SERVICO =
  process.env.SUPABASE_DEMO_SERVICE_ROLE_KEY ??
  // Chave de service role do `supabase start` local, igual e pública em toda
  // instalação. Não é segredo: só funciona contra 127.0.0.1.
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const EMAIL = "demo@encaixaria.test";
const SENHA = "demonstracao-2026";
const FUSO = "America/Sao_Paulo";

// São Paulo não tem horário de verão desde 2019, então o deslocamento é fixo.
// Montar o instante com o offset explícito evita depender do fuso da máquina.
const OFFSET = "-03:00";

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|$)/.test(URL_SUPABASE)) {
  console.error(
    `\nRECUSADO: ${URL_SUPABASE} não é a stack local.\n\n` +
      "Este script cria conta, serviços e agendamentos falsos. Apontado para\n" +
      "produção, ele sujaria o banco que atende os clientes reais.\n" +
      "Suba a stack local (`supabase start`) e rode de novo.\n",
  );
  process.exit(1);
}

/** `YYYY-MM-DD` de hoje no calendário do negócio, não no da máquina. */
function hojeNoFuso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function somarDias(data, dias) {
  // Meio-dia UTC como âncora: longe o bastante das bordas para que somar dias
  // nunca escorregue por causa de offset.
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** 0 = domingo, igual ao `dia_semana` de `horarios_disponiveis`. */
function diaDaSemana(data) {
  return new Date(`${data}T12:00:00Z`).getUTCDay();
}

/** Próximo dia em que a barbearia abre (seg a sáb), a partir de amanhã. */
function proximoDiaAberto(base) {
  for (let i = 1; i <= 7; i++) {
    const candidato = somarDias(base, i);
    if (diaDaSemana(candidato) !== 0) return candidato;
  }
  throw new Error("impossível: uma semana sem dia útil");
}

const instante = (data, hora) => `${data}T${hora}:00${OFFSET}`;

const cabecalhos = {
  apikey: CHAVE_SERVICO,
  Authorization: `Bearer ${CHAVE_SERVICO}`,
  "Content-Type": "application/json",
};

async function api(caminho, opcoes = {}) {
  const resposta = await fetch(`${URL_SUPABASE}${caminho}`, {
    ...opcoes,
    headers: { ...cabecalhos, ...(opcoes.headers ?? {}) },
  });
  if (!resposta.ok) {
    throw new Error(
      `${opcoes.method ?? "GET"} ${caminho} → ${resposta.status}: ${await resposta.text()}`,
    );
  }
  const texto = await resposta.text();
  return texto ? JSON.parse(texto) : null;
}

const rest = (tabela, opcoes = {}) =>
  api(`/rest/v1/${tabela}`, {
    ...opcoes,
    headers: { Prefer: "return=representation", ...(opcoes.headers ?? {}) },
  });

// ---------------------------------------------------------------------------
// 1. Conta. Recriada a cada execução, para o vídeo nunca gravar resíduo de uma
//    gravação anterior (agendamento cancelado na tomada passada, por exemplo).
// ---------------------------------------------------------------------------
const { users } = await api("/auth/v1/admin/users?per_page=200");
const existente = users.find((u) => u.email === EMAIL);
if (existente) {
  await api(`/auth/v1/admin/users/${existente.id}`, { method: "DELETE" });
}

const usuario = await api("/auth/v1/admin/users", {
  method: "POST",
  body: JSON.stringify({ email: EMAIL, password: SENHA, email_confirm: true }),
});
const id = usuario.id;

// ---------------------------------------------------------------------------
// 2. Perfil. O trigger `ao_criar_usuario` já criou a linha e semeou as etapas
//    de sistema; aqui só ajustamos o que a demonstração precisa mostrar.
//
//    `status_assinatura: "ativo"` é requisito de enquadramento, não enfeite: em
//    `trial` o `components/banner-assinatura.tsx` aparece no topo de todas as
//    telas e ocuparia a parte de cima do vídeo com uma cobrança nossa.
// ---------------------------------------------------------------------------
await rest(`perfis?id=eq.${id}`, {
  method: "PATCH",
  body: JSON.stringify({
    nome_estabelecimento: "Barbearia do Nino",
    fuso_horario: FUSO,
    passo_slot_minutos: 30,
    antecedencia_minima_minutos: 60,
    antecedencia_maxima_dias: 30,
    status_conexao_whatsapp: "conectado",
    status_assinatura: "ativo",
  }),
});

// ---------------------------------------------------------------------------
// 3. Serviços — exatamente os mesmos de `components/conversa-demo.tsx`.
//
//    A conversa da landing é transcrição literal do que a engine envia, e o
//    vídeo mostra as duas metades em sequência: se os nomes, durações ou preços
//    divergirem, o lead vê dois produtos diferentes na mesma peça.
// ---------------------------------------------------------------------------
const servicos = await rest("servicos", {
  method: "POST",
  body: JSON.stringify([
    { usuario_id: id, nome: "Corte masculino", duracao_minutos: 30, preco: 60 },
    { usuario_id: id, nome: "Corte + barba", duracao_minutos: 45, preco: 90 },
    { usuario_id: id, nome: "Barba", duracao_minutos: 15, preco: 35 },
  ]),
});
const porNome = Object.fromEntries(servicos.map((s) => [s.nome, s]));

// ---------------------------------------------------------------------------
// 4. Grade semanal, com intervalo de almoço — que é justamente o que duas
//    linhas no mesmo `dia_semana` modelam.
// ---------------------------------------------------------------------------
await rest("horarios_disponiveis", {
  method: "POST",
  body: JSON.stringify(
    [1, 2, 3, 4, 5, 6].flatMap((dia) => [
      { usuario_id: id, dia_semana: dia, hora_inicio: "09:00", hora_fim: "13:00" },
      { usuario_id: id, dia_semana: dia, hora_inicio: "14:00", hora_fim: "19:00" },
    ]),
  ),
});

// ---------------------------------------------------------------------------
// 5. Clientes e agendamentos.
//
//    A semana precisa parecer viva sem parecer cheia: agenda vazia não vende, e
//    agenda lotada contradiz o "ainda tem vaga" da conversa. Os horários são
//    espaçados de propósito — `agendamentos_sem_sobreposicao` rejeitaria
//    sobreposição, e um erro aqui abortaria o seed no meio.
// ---------------------------------------------------------------------------
const hoje = hojeNoFuso();
const destaque = proximoDiaAberto(hoje);
const seguinte = proximoDiaAberto(destaque);

const clientes = await rest("clientes_finais", {
  method: "POST",
  body: JSON.stringify(
    [
      ["Joana Ribeiro", "5511988887777"],
      ["Marcos Aurélio", "5511977776666"],
      ["Tiago Nunes", "5511966665555"],
      ["Rafael Lima", "5511955554444"],
      ["Bruno Sato", "5511944443333"],
    ].map(([nome, telefone]) => ({
      usuario_id: id,
      nome,
      telefone,
      remote_jid: `${telefone}@s.whatsapp.net`,
    })),
  ),
});
const cliente = Object.fromEntries(clientes.map((c) => [c.nome, c.id]));

const marcar = (nome, servico, data, hora) => ({
  usuario_id: id,
  cliente_id: cliente[nome],
  servico_id: porNome[servico].id,
  duracao_minutos: porNome[servico].duracao_minutos,
  data_hora: instante(data, hora),
});

/**
 * As 09:00 e 10:30 do dia em destaque ficam DELIBERADAMENTE vazias.
 *
 * São as duas outras opções que o bot oferece na conversa, e o vídeo mostra a
 * conversa e a agenda em sequência: ocupá-las aqui seria o bot oferecendo vaga
 * que a agenda, dois segundos depois, diz estar tomada. Quem assiste com atenção
 * é exatamente o lead que vale.
 */
const agendamentos = [
  // Hoje, para a lista de celular não abrir vazia.
  marcar("Marcos Aurélio", "Corte masculino", hoje, "10:00"),
  marcar("Tiago Nunes", "Barba", hoje, "16:30"),

  // Dia em destaque. O de 14:00 é o horário que a conversa acabou de marcar.
  marcar("Bruno Sato", "Corte masculino", destaque, "11:30"),
  marcar("Joana Ribeiro", "Corte + barba", destaque, "14:00"),
  marcar("Marcos Aurélio", "Barba", destaque, "17:00"),

  marcar("Rafael Lima", "Corte masculino", seguinte, "09:30"),
  marcar("Tiago Nunes", "Corte + barba", seguinte, "11:00"),
];

// Em `agendamentos` a duração é snapshot e `data_hora_fim` vem do trigger, então
// o insert omite a coluna de propósito.
await rest("agendamentos", {
  method: "POST",
  body: JSON.stringify(agendamentos),
});

console.log(
  JSON.stringify(
    {
      email: EMAIL,
      senha: SENHA,
      usuarioId: id,
      estabelecimento: "Barbearia do Nino",
      hoje,
      // O que o vídeo destaca, e que o roteiro injeta na conversa da landing
      // para as duas metades contarem a mesma história.
      destaque: {
        data: destaque,
        hora: "14:00",
        servico: "Corte + barba",
        cliente: "Joana Ribeiro",
      },
      // As outras duas opções que a conversa oferece antes da escolhida.
      opcoes: [
        { data: destaque, hora: "09:00" },
        { data: destaque, hora: "10:30" },
      ],
      diaSeguinte: seguinte,
    },
    null,
    2,
  ),
);
