import { createClient } from "@supabase/supabase-js";
import { http, HttpResponse, passthrough } from "msw";
import { setupServer } from "msw/node";
import { addDays, format } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

/**
 * Integração do cron de lembretes: Postgres local real + Evolution mockada.
 *
 * O que precisa ficar provado aqui é a idempotência — um segundo disparo (por
 * redeploy ou retry da Vercel) não pode mandar dois lembretes ao cliente.
 */

const API_SUPABASE = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const API_EVOLUTION = "https://evolution.teste";
const CRON_SECRET = "segredo-do-cron";
const FUSO = "America/Sao_Paulo";

const stackNoAr = await fetch(`${API_SUPABASE}/rest/v1/`, {
  headers: { apikey: SERVICE_KEY },
})
  .then((r) => r.ok || r.status === 404)
  .catch(() => false);

process.env.NEXT_PUBLIC_SUPABASE_URL = API_SUPABASE;
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
process.env.EVOLUTION_API_URL = API_EVOLUTION;
process.env.EVOLUTION_API_ADMIN_KEY = "chave-global";
process.env.CRON_SECRET = CRON_SECRET;

const admin = createClient(API_SUPABASE, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { GET } = await import("@/app/api/cron/enviar-lembretes/route");

let enviadas: { destino: string; texto: string }[] = [];
/** Quando definido, o mock responde com esse status em vez de sucesso. */
let falharCom: number | null = null;

const servidor = setupServer(
  http.all(`${API_SUPABASE}/*`, () => passthrough()),
  http.post(`${API_EVOLUTION}/message/sendText/:instancia`, async ({ request }) => {
    if (falharCom !== null) {
      return HttpResponse.json({ error: "falhou" }, { status: falharCom });
    }
    const corpo = (await request.json()) as { number: string; text: string };
    enviadas.push({ destino: corpo.number, texto: corpo.text });
    return HttpResponse.json({ key: { id: "enviada" } });
  }),
);

beforeAll(() => servidor.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  enviadas = [];
  falharCom = null;
});
afterAll(() => servidor.close());

const criados: string[] = [];

/** Data de amanhã no fuso do estabelecimento — a janela que o cron busca. */
function amanha(): string {
  return format(addDays(new TZDate(new Date(), FUSO), 1), "yyyy-MM-dd");
}

async function criarTenantComAgendamento(opcoes: {
  conectado?: boolean;
  quandoAmanha?: boolean;
  nomeCliente?: string | null;
} = {}) {
  const email = `cron-${Date.now()}-${criados.length}@agendazap.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "senha-de-teste-123",
    email_confirm: true,
  });
  if (error) throw error;

  const usuarioId = data.user!.id;
  criados.push(usuarioId);

  await admin
    .from("perfis")
    .update({
      status_conexao_whatsapp:
        opcoes.conectado === false ? "desconectado" : "conectado",
      fuso_horario: FUSO,
    })
    .eq("id", usuarioId);

  const { data: servico } = await admin
    .from("servicos")
    .insert({ usuario_id: usuarioId, nome: "Corte", duracao_minutos: 60 })
    .select("id")
    .single();

  const jid = `5511${String(criados.length).padStart(9, "0")}@s.whatsapp.net`;
  const { data: cliente } = await admin
    .from("clientes_finais")
    .insert({
      usuario_id: usuarioId,
      remote_jid: jid,
      nome: opcoes.nomeCliente === undefined ? "Joana" : opcoes.nomeCliente,
    })
    .select("id")
    .single();

  // 14:00 local para não encostar em virada de dia em nenhum fuso.
  const dia = opcoes.quandoAmanha === false ? hojeMais(3) : amanha();
  const { data: agendamento, error: erroAgendamento } = await admin
    .from("agendamentos")
    .insert({
      usuario_id: usuarioId,
      cliente_id: cliente!.id,
      servico_id: servico!.id,
      data_hora: new TZDate(`${dia}T14:00:00`, FUSO).toISOString(),
      duracao_minutos: 60,
    })
    .select("id")
    .single();
  if (erroAgendamento) throw erroAgendamento;

  return { usuarioId, agendamentoId: agendamento!.id, jid };
}

function hojeMais(dias: number): string {
  return format(addDays(new TZDate(new Date(), FUSO), dias), "yyyy-MM-dd");
}

function disparar(autorizacao: string | null = `Bearer ${CRON_SECRET}`) {
  const headers: Record<string, string> = {};
  if (autorizacao !== null) headers.authorization = autorizacao;

  return GET(
    new Request("https://agendazap.test/api/cron/enviar-lembretes", {
      headers,
    }),
  );
}

async function lerLog(agendamentoId: string) {
  const { data } = await admin
    .from("log_envio")
    .select("tipo, status_entrega, erro_detalhe")
    .eq("agendamento_id", agendamentoId);
  return data ?? [];
}

describe.skipIf(!stackNoAr)("cron de lembretes (integração)", () => {
  afterAll(async () => {
    for (const id of criados) await admin.auth.admin.deleteUser(id);
  });

  describe("autenticação", () => {
    it("rejeita chamada sem o header que a Vercel envia", async () => {
      const resposta = await disparar(null);

      expect(resposta.status).toBe(401);
      expect(enviadas).toEqual([]);
    });

    it("rejeita segredo errado", async () => {
      expect((await disparar("Bearer errado")).status).toBe(401);
    });

    it("rejeita header sem o prefixo Bearer", async () => {
      expect((await disparar(CRON_SECRET)).status).toBe(401);
    });
  });

  describe("envio", () => {
    it("envia lembrete do agendamento de amanhã e registra como enviado", async () => {
      const { agendamentoId, jid } = await criarTenantComAgendamento();

      const resposta = await disparar();
      expect(resposta.status).toBe(200);

      const meu = enviadas.filter((e) => e.destino === jid);
      expect(meu).toHaveLength(1);
      expect(meu[0].texto).toContain("Joana");
      expect(meu[0].texto).toContain("Corte");
      expect(meu[0].texto).toContain("14:00");

      expect(await lerLog(agendamentoId)).toEqual([
        { tipo: "lembrete", status_entrega: "enviado", erro_detalhe: null },
      ]);
    });

    it("não envia duas vezes quando o cron roda de novo", async () => {
      const { agendamentoId, jid } = await criarTenantComAgendamento();

      await disparar();
      const primeiraRodada = enviadas.filter((e) => e.destino === jid).length;
      enviadas = [];

      // Redeploy ou retry da Vercel: a reserva idempotente em log_envio bloqueia.
      await disparar();

      expect(primeiraRodada).toBe(1);
      expect(enviadas.filter((e) => e.destino === jid)).toEqual([]);
      expect(await lerLog(agendamentoId)).toHaveLength(1);
    });

    it("ignora agendamento que não é de amanhã", async () => {
      const { agendamentoId, jid } = await criarTenantComAgendamento({
        quandoAmanha: false,
      });

      await disparar();

      expect(enviadas.filter((e) => e.destino === jid)).toEqual([]);
      expect(await lerLog(agendamentoId)).toEqual([]);
    });

    it("ignora agendamento cancelado", async () => {
      const { agendamentoId, jid } = await criarTenantComAgendamento();
      await admin
        .from("agendamentos")
        .update({ status: "cancelado" })
        .eq("id", agendamentoId);

      await disparar();

      expect(enviadas.filter((e) => e.destino === jid)).toEqual([]);
    });

    it("saúda sem nome quando o cliente não tem pushName", async () => {
      const { jid } = await criarTenantComAgendamento({ nomeCliente: null });

      await disparar();

      const meu = enviadas.filter((e) => e.destino === jid);
      expect(meu).toHaveLength(1);
      expect(meu[0].texto).toMatch(/^Oi! /);
    });
  });

  describe("falhas registradas em log_envio", () => {
    it("não envia e registra erro quando o WhatsApp está desconectado", async () => {
      const { agendamentoId, jid } = await criarTenantComAgendamento({
        conectado: false,
      });

      await disparar();

      // Nunca assumir que a instância está conectada.
      expect(enviadas.filter((e) => e.destino === jid)).toEqual([]);
      expect(await lerLog(agendamentoId)).toEqual([
        {
          tipo: "lembrete",
          status_entrega: "erro",
          erro_detalhe: "whatsapp desconectado",
        },
      ]);
    });

    it("registra erro quando a Evolution API falha no envio", async () => {
      const { agendamentoId } = await criarTenantComAgendamento();
      falharCom = 500;

      await disparar();

      const log = await lerLog(agendamentoId);
      expect(log).toHaveLength(1);
      expect(log[0].status_entrega).toBe("erro");
      expect(log[0].erro_detalhe).toContain("evolution 500");
    });

    it("registra falta de licença de forma reconhecível", async () => {
      const { agendamentoId } = await criarTenantComAgendamento();
      falharCom = 503;

      await disparar();

      const log = await lerLog(agendamentoId);
      expect(log[0].status_entrega).toBe("erro");
      expect(log[0].erro_detalhe).toContain("evolution 503");
    });
  });

  describe("multi-tenant", () => {
    it("envia para cada estabelecimento pela sua própria instância", async () => {
      const a = await criarTenantComAgendamento();
      const b = await criarTenantComAgendamento();

      const resposta = await disparar();
      const corpo = (await resposta.json()) as { enviados: number };

      expect(corpo.enviados).toBeGreaterThanOrEqual(2);
      expect(enviadas.some((e) => e.destino === a.jid)).toBe(true);
      expect(enviadas.some((e) => e.destino === b.jid)).toBe(true);
    });
  });
});
