import { createHmac } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { http, HttpResponse, passthrough } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { cifrar } from "@/lib/cripto";

/**
 * Ponta a ponta do sinal por Pix: conversa no WhatsApp → cobrança → pagamento →
 * agendamento confirmado.
 *
 * **Nenhum `.env` do projeto é lido.** Os arquivos do repositório carregam
 * credenciais de sandbox, homologação e produção, e um teste que as usasse
 * poderia criar cobrança de verdade na conta de alguém. Aqui todo segredo é
 * inventado neste arquivo, o Mercado Pago e a Evolution API são stubs locais de
 * msw, e o Postgres é o local (`supabase start`). O Vitest não carrega `.env`,
 * então o isolamento não depende de disciplina de quem roda.
 *
 * Bate nos **route handlers reais**, com os payloads no formato que cada
 * provedor manda de verdade — é o que faz disso um teste de integração do
 * sistema, e não uma encenação com objetos simulados. As duas peças que só o
 * banco garante (a constraint anti-sobreposição e as RPCs transacionais) estão
 * no caminho, não mockadas.
 */

const API_SUPABASE = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const API_EVOLUTION = "https://evolution.e2e";
const API_MP = "https://mercadopago.e2e";

const SEGREDO_WEBHOOK_BOT = "segredo-do-bot-e2e";
const SEGREDO_WEBHOOK_MP = "segredo-do-mp-e2e";
/** 32 bytes em hex. Inventada aqui; nunca sai deste arquivo. */
const CHAVE_CIFRA = "a".repeat(64);

/** `user_id` do dono no MP. O stub devolve este valor como `collector_id`. */
const CONTA_MP_DO_DONO = "555000111";

const stackNoAr = await fetch(`${API_SUPABASE}/rest/v1/`, {
  headers: { apikey: SERVICE_KEY },
})
  .then((r) => r.ok || r.status === 404)
  .catch(() => false);

process.env.NEXT_PUBLIC_SUPABASE_URL = API_SUPABASE;
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
process.env.WEBHOOK_SECRET = SEGREDO_WEBHOOK_BOT;
process.env.WEBHOOK_BASE_URL = "https://encaixaria.e2e";
process.env.EVOLUTION_API_URL = API_EVOLUTION;
process.env.EVOLUTION_API_ADMIN_KEY = "chave-global-e2e";
process.env.MERCADO_PAGO_API_URL = API_MP;
process.env.MERCADO_PAGO_CLIENT_ID = "client-id-e2e";
process.env.MERCADO_PAGO_CLIENT_SECRET = "client-secret-e2e";
process.env.MERCADO_PAGO_WEBHOOK_SECRET = SEGREDO_WEBHOOK_MP;
process.env.PAGAMENTO_CRYPTO_KEY = CHAVE_CIFRA;

const admin = createClient(API_SUPABASE, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { POST: webhookBot } = await import(
  "@/app/api/webhook/whatsapp/[instance]/route"
);
const { POST: webhookPagamento } = await import(
  "@/app/api/webhook/pagamento/mercadopago/route"
);

/** Mensagens que o cliente final recebeu. */
let enviadas: string[] = [];
/** Cobranças que o "Mercado Pago" criou, por id de pagamento. */
const cobrancasNoPsp = new Map<
  string,
  { valorCentavos: number; referenciaExterna: string; expiraEm: string }
>();
/** Corpo da última chamada de criação de cobrança, para asserção. */
let ultimaCriacao: Record<string, unknown> | null = null;
let proximoPagamentoId = 1;

const servidor = setupServer(
  // O Postgres é real: só os provedores externos são interceptados.
  // `onUnhandledRequest: "error"` garante que qualquer chamada não prevista
  // apareça como falha em vez de sair de verdade para a internet.
  http.all(`${API_SUPABASE}/*`, () => passthrough()),

  http.post(`${API_EVOLUTION}/message/sendText/:instancia`, async ({ request }) => {
    const corpo = (await request.json()) as { text: string };
    enviadas.push(corpo.text);
    return HttpResponse.json({ key: { id: "enviada" } });
  }),

  // --- Stub do Mercado Pago ---------------------------------------------
  http.post(`${API_MP}/v1/payments`, async ({ request }) => {
    const corpo = (await request.json()) as Record<string, unknown>;
    ultimaCriacao = corpo;

    const id = String(proximoPagamentoId++);
    cobrancasNoPsp.set(id, {
      valorCentavos: Math.round(Number(corpo.transaction_amount) * 100),
      referenciaExterna: String(corpo.external_reference),
      expiraEm: String(corpo.date_of_expiration),
    });

    return HttpResponse.json({
      id: Number(id),
      status: "pending",
      // O dono das credenciais, por construção. É o que a aplicação confere
      // antes de mandar o código ao cliente.
      collector_id: Number(CONTA_MP_DO_DONO),
      point_of_interaction: {
        transaction_data: { qr_code: `00020126-PIX-${id}-6304ABCD` },
      },
    });
  }),

  http.get(`${API_MP}/v1/payments/:id`, ({ params }) => {
    const registro = cobrancasNoPsp.get(String(params.id));
    if (!registro) return new HttpResponse(null, { status: 404 });

    return HttpResponse.json({
      id: Number(params.id),
      status: "approved",
      transaction_amount: registro.valorCentavos / 100,
      external_reference: registro.referenciaExterna,
    });
  }),
);

beforeAll(() => servidor.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  enviadas = [];
  ultimaCriacao = null;
});
afterEach(() => servidor.resetHandlers());
afterAll(async () => {
  servidor.close();
  for (const id of criados) await admin.auth.admin.deleteUser(id);
});

const criados: string[] = [];

/** Tenant com a capacidade ligada, conta conectada e um serviço que cobra sinal. */
async function criarTenantQueCobra(valorSinal: number | null = 20) {
  const email = `e2e-sinal-${Date.now()}-${criados.length}@encaixaria.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "senha-de-teste-123",
    email_confirm: true,
  });
  if (error) throw error;

  const usuarioId = data.user!.id;
  criados.push(usuarioId);

  // Sempre aberto, para existir slot independentemente da hora em que o teste
  // rodar (o handler usa `new Date()` real).
  await admin.from("horarios_disponiveis").insert(
    [0, 1, 2, 3, 4, 5, 6].map((dia) => ({
      usuario_id: usuarioId,
      dia_semana: dia,
      hora_inicio: "00:00:00",
      hora_fim: "24:00:00",
    })),
  );

  await admin
    .from("perfis")
    .update({
      antecedencia_minima_minutos: 0,
      passo_slot_minutos: 60,
      status_conexao_whatsapp: "conectado",
      plano: "sinal",
      pagamento_conectado_em: new Date().toISOString(),
      sinal_minutos_validade: 30,
    })
    .eq("id", usuarioId);

  await admin.from("credenciais_pagamento").insert({
    usuario_id: usuarioId,
    access_token_cifrado: cifrar("APP_USR-token-do-dono", CHAVE_CIFRA),
    refresh_token_cifrado: cifrar("TG-refresh-do-dono", CHAVE_CIFRA),
    // Longe do vencimento: renovar aqui chamaria o /oauth/token do stub e
    // testaria outra coisa.
    expira_em: new Date(Date.now() + 180 * 86_400_000).toISOString(),
    conta_externa_id: CONTA_MP_DO_DONO,
  });

  const { data: servico } = await admin
    .from("servicos")
    .insert({
      usuario_id: usuarioId,
      nome: "Corte",
      duracao_minutos: 60,
      preco: 50,
      valor_sinal: valorSinal,
    })
    .select("id")
    .single();

  return { usuarioId, servicoId: servico!.id as string };
}

const JID = "5511977776666@s.whatsapp.net";

async function mandarMensagem(usuarioId: string, texto: string, id: string) {
  return webhookBot(
    new Request(`https://encaixaria.e2e/api/webhook/whatsapp/${usuarioId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-encaixaria-secret": SEGREDO_WEBHOOK_BOT,
      },
      body: JSON.stringify({
        event: "messages.upsert",
        data: {
          key: { remoteJid: JID, fromMe: false, id },
          pushName: "Joana",
          message: { conversation: texto },
          messageType: "conversation",
        },
      }),
    }),
    { params: Promise.resolve({ instance: usuarioId }) },
  );
}

/**
 * Conduz a conversa até a confirmação: menu de serviço → horário → confirmar.
 *
 * Quatro mensagens porque o fluxo semeado tem três etapas de sistema e a
 * primeira mensagem só abre a conversa.
 */
async function agendarAteConfirmar(usuarioId: string, sufixo = "a") {
  await mandarMensagem(usuarioId, "oi", `m1-${sufixo}`);
  await mandarMensagem(usuarioId, "1", `m2-${sufixo}`);
  await mandarMensagem(usuarioId, "1", `m3-${sufixo}`);
  enviadas = [];
  await mandarMensagem(usuarioId, "1", `m4-${sufixo}`);
}

/** Assina como o Mercado Pago assinaria a notificação. */
function notificar(pagamentoId: string, opcoes: { segredo?: string } = {}) {
  const ts = "1754740000";
  const requestId = "req-e2e-1";
  const manifesto = `id:${pagamentoId};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac("sha256", opcoes.segredo ?? SEGREDO_WEBHOOK_MP)
    .update(manifesto)
    .digest("hex");

  return webhookPagamento(
    new Request(
      `https://encaixaria.e2e/api/webhook/pagamento/mercadopago?data.id=${pagamentoId}&type=payment`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-signature": `ts=${ts},v1=${v1}`,
          "x-request-id": requestId,
        },
        body: JSON.stringify({ type: "payment", data: { id: pagamentoId } }),
      },
    ),
  );
}

async function lerAgendamento(usuarioId: string) {
  const { data } = await admin
    .from("agendamentos")
    .select("id, status, sinal_status, sinal_expira_em, data_hora")
    .eq("usuario_id", usuarioId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function lerCobranca(usuarioId: string) {
  const { data } = await admin
    .from("cobrancas_sinal")
    .select("id, provedor_pagamento_id, valor_centavos, status, estorno_pendente, qr_code")
    .eq("usuario_id", usuarioId)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

describe.skipIf(!stackNoAr)("E2E — sinal por Pix", () => {
  describe("caminho feliz", () => {
    it("cobra o sinal ao confirmar e promove o agendamento quando o Pix cai", async () => {
      const { usuarioId } = await criarTenantQueCobra(20);

      // --- 1. O cliente agenda pelo WhatsApp -----------------------------
      await agendarAteConfirmar(usuarioId);

      const agendamento = await lerAgendamento(usuarioId);
      const cobranca = await lerCobranca(usuarioId);

      // O horário já está bloqueado desde agora: não existe "reserva pendente"
      // disputando o slot com a constraint.
      expect(agendamento!.status).toBe("confirmado");
      expect(agendamento!.sinal_status).toBe("aguardando");
      expect(agendamento!.sinal_expira_em).not.toBeNull();

      expect(cobranca!.valor_centavos).toBe(2000);
      expect(cobranca!.status).toBe("pendente");
      expect(cobranca!.estorno_pendente).toBe(false);

      // --- 2. O cliente recebe DUAS mensagens ----------------------------
      expect(enviadas).toHaveLength(2);
      // `\s` e não espaço literal: o `Intl.NumberFormat` separa "R$" do número
      // com espaço NÃO-QUEBRÁVEL (U+00A0), e uma asserção com espaço comum
      // falharia sem que houvesse nada errado no texto.
      expect(enviadas[0]).toMatch(/R\$\s?20,00/);
      expect(enviadas[0]).toContain("Corte");

      // O copia-e-cola vai SOZINHO: no WhatsApp o cliente segura para copiar, e
      // qualquer texto em volta entra na cópia e faz o banco recusar o código.
      expect(enviadas[1]).toBe(cobranca!.qr_code);
      expect(enviadas[1]).toMatch(/^00020126-PIX-/);

      // E o texto de "agendamento confirmado" NÃO sai junto: as duas mensagens
      // se contradiriam.
      expect(enviadas.join("\n")).not.toMatch(/está (confirmado|agendado)/i);

      // --- 3. A cobrança foi criada na conta do DONO ---------------------
      expect(ultimaCriacao).toMatchObject({
        payment_method_id: "pix",
        transaction_amount: 20,
        external_reference: cobranca!.id,
      });
      // Sem comissão sobre a transação do dono.
      expect(ultimaCriacao).not.toHaveProperty("application_fee");

      // --- 4. O Pix cai --------------------------------------------------
      enviadas = [];
      const resposta = await notificar(cobranca!.provedor_pagamento_id);
      expect(resposta.status).toBe(200);

      const promovido = await lerAgendamento(usuarioId);
      expect(promovido!.status).toBe("confirmado");
      expect(promovido!.sinal_status).toBe("pago");

      const paga = await lerCobranca(usuarioId);
      expect(paga!.status).toBe("pago");
      expect(paga!.estorno_pendente).toBe(false);

      // --- 5. O cliente é avisado ----------------------------------------
      expect(enviadas).toHaveLength(1);
      expect(enviadas[0]).toMatch(/confirmado/i);
      expect(enviadas[0]).toMatch(/R\$\s?20,00/);
    });

    it("não cobra nada quando o serviço não tem valor de sinal", async () => {
      const { usuarioId } = await criarTenantQueCobra(null);

      await agendarAteConfirmar(usuarioId);

      const agendamento = await lerAgendamento(usuarioId);
      expect(agendamento!.status).toBe("confirmado");
      expect(agendamento!.sinal_status).toBe("nao_exigido");
      expect(await lerCobranca(usuarioId)).toBeNull();

      // Volta a ser a confirmação normal, numa mensagem só.
      expect(enviadas).toHaveLength(1);
      expect(enviadas[0]).toMatch(/agendamento|confirmado/i);
    });
  });

  describe("segurança do webhook de pagamento", () => {
    it("recusa assinatura inválida com 401, sem tocar no banco", async () => {
      const { usuarioId } = await criarTenantQueCobra(20);
      await agendarAteConfirmar(usuarioId);
      const cobranca = await lerCobranca(usuarioId);

      const resposta = await notificar(cobranca!.provedor_pagamento_id, {
        segredo: "segredo-errado",
      });

      expect(resposta.status).toBe(401);
      expect((await lerAgendamento(usuarioId))!.sinal_status).toBe("aguardando");
      expect((await lerCobranca(usuarioId))!.status).toBe("pendente");
    });

    it("é idempotente: reentrega não promove nem avisa duas vezes", async () => {
      const { usuarioId } = await criarTenantQueCobra(20);
      await agendarAteConfirmar(usuarioId);
      const cobranca = await lerCobranca(usuarioId);

      await notificar(cobranca!.provedor_pagamento_id);
      enviadas = [];
      const segunda = await notificar(cobranca!.provedor_pagamento_id);

      expect(segunda.status).toBe(200);
      // O MP reenvia a mesma notificação várias vezes; duas mensagens de
      // "sinal recebido" seriam o sintoma visível para o cliente.
      expect(enviadas).toHaveLength(0);
    });

    it("ignora notificação de pagamento desconhecido", async () => {
      // Assinatura válida, id que não é nosso — outra aplicação no mesmo
      // endpoint. Definitivo, então 200.
      const resposta = await notificar("999999999");
      expect(resposta.status).toBe(200);
    });
  });

  describe("expiração do prazo", () => {
    it("cancela o agendamento e devolve o horário ao mercado", async () => {
      const { usuarioId } = await criarTenantQueCobra(20);
      await agendarAteConfirmar(usuarioId);

      const agendamento = await lerAgendamento(usuarioId);

      // Empurra o prazo para trás em vez de esperar 30 minutos.
      await admin
        .from("agendamentos")
        .update({ sinal_expira_em: new Date(Date.now() - 1000).toISOString() })
        .eq("id", agendamento!.id);

      // A varredura é preguiçosa: roda no início do cálculo de disponibilidade,
      // que é exatamente o instante em que um slot travado causaria dano.
      enviadas = [];
      await mandarMensagem(usuarioId, "oi", "m-depois");

      const expirado = await lerAgendamento(usuarioId);
      expect(expirado!.status).toBe("cancelado");
      expect(expirado!.sinal_status).toBe("expirado");
      expect((await lerCobranca(usuarioId))!.status).toBe("expirado");
    });

    it("pagou depois do prazo com o horário livre: ressuscita o agendamento", async () => {
      const { usuarioId } = await criarTenantQueCobra(20);
      await agendarAteConfirmar(usuarioId);
      const cobranca = await lerCobranca(usuarioId);
      const agendamento = await lerAgendamento(usuarioId);

      await admin
        .from("agendamentos")
        .update({ sinal_expira_em: new Date(Date.now() - 1000).toISOString() })
        .eq("id", agendamento!.id);
      await admin.rpc("expirar_sinais_vencidos", { p_usuario_id: usuarioId });

      enviadas = [];
      const resposta = await notificar(cobranca!.provedor_pagamento_id);
      expect(resposta.status).toBe(200);

      const revivido = await lerAgendamento(usuarioId);
      expect(revivido!.status).toBe("confirmado");
      expect(revivido!.sinal_status).toBe("pago");
      expect((await lerCobranca(usuarioId))!.estorno_pendente).toBe(false);
      expect(enviadas[0]).toMatch(/confirmado/i);
    });

    it("pagou depois do prazo com o horário tomado: marca estorno pendente e avisa", async () => {
      const { usuarioId, servicoId } = await criarTenantQueCobra(20);
      await agendarAteConfirmar(usuarioId);
      const cobranca = await lerCobranca(usuarioId);
      const agendamento = await lerAgendamento(usuarioId);

      await admin
        .from("agendamentos")
        .update({ sinal_expira_em: new Date(Date.now() - 1000).toISOString() })
        .eq("id", agendamento!.id);
      await admin.rpc("expirar_sinais_vencidos", { p_usuario_id: usuarioId });

      // Outra pessoa fecha o mesmo horário na janela.
      const { data: outro } = await admin
        .from("clientes_finais")
        .insert({ usuario_id: usuarioId, remote_jid: "5511900000000@s.whatsapp.net" })
        .select("id")
        .single();

      const { error: erroConcorrente } = await admin.from("agendamentos").insert({
        usuario_id: usuarioId,
        cliente_id: outro!.id,
        servico_id: servicoId,
        data_hora: agendamento!.data_hora,
        duracao_minutos: 60,
      });
      expect(erroConcorrente).toBeNull();

      enviadas = [];
      const resposta = await notificar(cobranca!.provedor_pagamento_id);
      expect(resposta.status).toBe(200);

      // O dinheiro entrou e não há horário: é o caso que exige decisão humana.
      const { data: cobrancaFinal } = await admin
        .from("cobrancas_sinal")
        .select("status, estorno_pendente")
        .eq("id", cobranca!.id)
        .single();

      expect(cobrancaFinal!.status).toBe("pago");
      expect(cobrancaFinal!.estorno_pendente).toBe(true);

      // O cliente é avisado de que nada foi marcado, e mandado ao estabelecimento.
      expect(enviadas).toHaveLength(1);
      expect(enviadas[0]).toMatch(/nada foi marcado/i);
      expect(enviadas[0]).not.toMatch(/\d+\s*(dia|hora)/i);
    });
  });

  describe("gate de capacidade", () => {
    it("não cobra quando o plano não inclui o adicional", async () => {
      const { usuarioId } = await criarTenantQueCobra(20);
      await admin.from("perfis").update({ plano: "basico" }).eq("id", usuarioId);

      await agendarAteConfirmar(usuarioId);

      expect((await lerAgendamento(usuarioId))!.sinal_status).toBe("nao_exigido");
      expect(await lerCobranca(usuarioId)).toBeNull();
      expect(enviadas).toHaveLength(1);
    });

    it("não cobra quando a conta do Mercado Pago não está conectada", async () => {
      const { usuarioId } = await criarTenantQueCobra(20);
      await admin
        .from("perfis")
        .update({ pagamento_conectado_em: null })
        .eq("id", usuarioId);

      await agendarAteConfirmar(usuarioId);

      expect((await lerAgendamento(usuarioId))!.sinal_status).toBe("nao_exigido");
      expect(await lerCobranca(usuarioId)).toBeNull();
    });
  });

  describe("falha do provedor não derruba o agendamento", () => {
    it("mantém o horário quando o Mercado Pago recusa a cobrança", async () => {
      const { usuarioId } = await criarTenantQueCobra(20);

      servidor.use(
        http.post(`${API_MP}/v1/payments`, () =>
          HttpResponse.json({ message: "erro" }, { status: 500 }),
        ),
      );

      await agendarAteConfirmar(usuarioId);

      // Fail-open deliberado: cancelar um agendamento real porque o PSP caiu
      // puniria o cliente por um problema que não é dele.
      const agendamento = await lerAgendamento(usuarioId);
      expect(agendamento!.status).toBe("confirmado");
      expect(agendamento!.sinal_status).toBe("nao_exigido");
      expect(await lerCobranca(usuarioId)).toBeNull();

      // E o cliente ouve a confirmação normal, nunca silêncio.
      expect(enviadas).toHaveLength(1);
      expect(enviadas[0]).toMatch(/agendamento|confirmado/i);
    });

    it("não manda o código se o recebedor divergir do dono", async () => {
      const { usuarioId } = await criarTenantQueCobra(20);

      servidor.use(
        http.post(`${API_MP}/v1/payments`, () =>
          HttpResponse.json({
            id: 424242,
            status: "pending",
            // Conta de OUTRA pessoa: mandar o código seria o dinheiro do
            // cliente indo para o lugar errado.
            collector_id: 999999999,
            point_of_interaction: {
              transaction_data: { qr_code: "00020126-PIX-ERRADO" },
            },
          }),
        ),
      );

      await agendarAteConfirmar(usuarioId);

      expect(await lerCobranca(usuarioId)).toBeNull();
      expect(enviadas.join("\n")).not.toContain("00020126-PIX-ERRADO");
      expect((await lerAgendamento(usuarioId))!.sinal_status).toBe("nao_exigido");
    });
  });
});
