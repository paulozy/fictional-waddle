import { createClient } from "@supabase/supabase-js";
import { http, HttpResponse, passthrough } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

/**
 * Teste de integração do webhook: Postgres local de verdade + Evolution API
 * mockada por msw.
 *
 * Bate no route handler real, com payloads no formato que a Evolution manda.
 * O banco é real de propósito — mockar o query builder do supabase-js testaria a
 * biblioteca, não o handler, e não pegaria nada do compare-and-set nem da
 * constraint anti-sobreposição.
 */

const API_SUPABASE = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const API_EVOLUTION = "https://evolution.teste";
const SEGREDO = "segredo-de-teste";

const stackNoAr = await fetch(`${API_SUPABASE}/rest/v1/`, {
  headers: { apikey: SERVICE_KEY },
})
  .then((r) => r.ok || r.status === 404)
  .catch(() => false);

process.env.NEXT_PUBLIC_SUPABASE_URL = API_SUPABASE;
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
process.env.WEBHOOK_SECRET = SEGREDO;
process.env.EVOLUTION_API_URL = API_EVOLUTION;
process.env.EVOLUTION_API_ADMIN_KEY = "chave-global";

const admin = createClient(API_SUPABASE, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { POST } = await import(
  "@/app/api/webhook/whatsapp/[instance]/route"
);

/** Textos enviados ao cliente final durante o teste. */
let enviadas: { instancia: string; destino: string; texto: string }[] = [];

const servidor = setupServer(
  // O Supabase local passa direto: o banco é real neste teste. Só a Evolution
  // API é interceptada, e `onUnhandledRequest: "error"` garante que qualquer
  // chamada externa não prevista apareça como falha em vez de sair de verdade.
  http.all(`${API_SUPABASE}/*`, () => passthrough()),
  http.post(`${API_EVOLUTION}/message/sendText/:instancia`, async ({ request, params }) => {
    const corpo = (await request.json()) as { number: string; text: string };
    enviadas.push({
      instancia: String(params.instancia),
      destino: corpo.number,
      texto: corpo.text,
    });
    return HttpResponse.json({ key: { id: "enviada" } });
  }),
);

beforeAll(() => servidor.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  enviadas = [];
});
afterAll(() => servidor.close());

const criados: string[] = [];

async function criarTenant() {
  const email = `webhook-${Date.now()}-${criados.length}@agendazap.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "senha-de-teste-123",
    email_confirm: true,
  });
  if (error) throw error;

  const usuarioId = data.user!.id;
  criados.push(usuarioId);

  // Sempre aberto, para que exista slot independentemente de quando o teste
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
    })
    .eq("id", usuarioId);

  const { data: servico } = await admin
    .from("servicos")
    .insert({
      usuario_id: usuarioId,
      nome: "Corte",
      duracao_minutos: 60,
      preco: 50,
    })
    .select("id")
    .single();

  return { usuarioId, servicoId: servico!.id };
}

const JID = "5511999998888@s.whatsapp.net";

function payloadMensagem(texto: string, id: string, extras: Record<string, unknown> = {}) {
  return {
    event: "messages.upsert",
    data: {
      key: { remoteJid: JID, fromMe: false, id, ...(extras.key ?? {}) },
      pushName: "Joana",
      message: { conversation: texto },
      messageType: "conversation",
      ...extras,
    },
  };
}

async function chamar(
  instancia: string,
  corpo: unknown,
  segredo: string | null = SEGREDO,
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (segredo !== null) headers["x-agendazap-secret"] = segredo;

  return POST(
    new Request(`https://agendazap.test/api/webhook/whatsapp/${instancia}`, {
      method: "POST",
      headers,
      body: JSON.stringify(corpo),
    }),
    // No Next 16 o params de segmento dinâmico é Promise.
    { params: Promise.resolve({ instance: instancia }) },
  );
}

async function lerConversa(usuarioId: string) {
  const { data } = await admin
    .from("conversas_estado")
    .select("etapa_atual_id, dados_temporarios, versao, ultima_mensagem_id")
    .eq("usuario_id", usuarioId)
    .eq("remote_jid", JID)
    .maybeSingle();
  return data;
}

describe.skipIf(!stackNoAr)("webhook do WhatsApp (integração)", () => {
  afterAll(async () => {
    for (const id of criados) await admin.auth.admin.deleteUser(id);
  });

  describe("autenticação", () => {
    it("rejeita chamada sem o header secreto", async () => {
      const { usuarioId } = await criarTenant();
      const resposta = await chamar(usuarioId, payloadMensagem("oi", "m1"), null);

      expect(resposta.status).toBe(401);
      expect(enviadas).toEqual([]);
      expect(await lerConversa(usuarioId)).toBeNull();
    });

    it("rejeita chamada com segredo errado", async () => {
      const { usuarioId } = await criarTenant();
      const resposta = await chamar(
        usuarioId,
        payloadMensagem("oi", "m1"),
        "segredo-errado",
      );

      expect(resposta.status).toBe(401);
    });

    it("aceita 200 sem efeito para instância desconhecida", async () => {
      // O UUID da URL não é segredo, e responder erro faria a Evolution entrar
      // em retry de algo que nunca vai funcionar.
      const resposta = await chamar(
        "00000000-0000-0000-0000-000000000000",
        payloadMensagem("oi", "m1"),
      );

      expect(resposta.status).toBe(200);
      expect(enviadas).toEqual([]);
    });
  });

  describe("filtros", () => {
    it("ignora mensagem do próprio bot", async () => {
      const { usuarioId } = await criarTenant();
      await chamar(
        usuarioId,
        payloadMensagem("oi", "m1", { key: { fromMe: true } }),
      );

      // Responder aqui criaria loop infinito com a própria resposta.
      expect(enviadas).toEqual([]);
      expect(await lerConversa(usuarioId)).toBeNull();
    });

    it("ignora mensagem de grupo", async () => {
      const { usuarioId } = await criarTenant();
      await chamar(usuarioId, {
        event: "messages.upsert",
        data: {
          key: { remoteJid: "1203630000@g.us", fromMe: false, id: "m1" },
          message: { conversation: "oi" },
        },
      });

      expect(enviadas).toEqual([]);
    });

    it("ignora mídia sem texto", async () => {
      const { usuarioId } = await criarTenant();
      await chamar(usuarioId, {
        event: "messages.upsert",
        data: {
          key: { remoteJid: JID, fromMe: false, id: "m1" },
          message: { audioMessage: { seconds: 5 } },
        },
      });

      expect(enviadas).toEqual([]);
    });

    it("ignora remetente fora da lista de permissão", async () => {
      const { usuarioId } = await criarTenant();
      // O JID que fala nos testes é 5511999998888; libera outro só.
      process.env.BOT_JIDS_PERMITIDOS = "5511900000000";

      try {
        const resposta = await chamar(usuarioId, payloadMensagem("oi", "m1"));

        expect(resposta.status).toBe(200);
        expect(enviadas).toEqual([]);
        expect(await lerConversa(usuarioId)).toBeNull();
      } finally {
        delete process.env.BOT_JIDS_PERMITIDOS;
      }
    });

    it("atende remetente que está na lista de permissão", async () => {
      const { usuarioId } = await criarTenant();
      process.env.BOT_JIDS_PERMITIDOS = "5511911112222, 5511999998888";

      try {
        await chamar(usuarioId, payloadMensagem("oi", "m1"));

        expect(enviadas).toHaveLength(1);
      } finally {
        delete process.env.BOT_JIDS_PERMITIDOS;
      }
    });

    it("ignora evento que não tratamos", async () => {
      const { usuarioId } = await criarTenant();
      const resposta = await chamar(usuarioId, {
        event: "qrcode.updated",
        data: { qrcode: "x" },
      });

      expect(resposta.status).toBe(200);
      expect(enviadas).toEqual([]);
    });
  });

  describe("CONNECTION_UPDATE", () => {
    it("marca desconectado quando a sessão cai", async () => {
      const { usuarioId } = await criarTenant();

      await chamar(usuarioId, {
        event: "connection.update",
        data: { state: "close", statusReason: 428 },
      });

      const { data } = await admin
        .from("perfis")
        .select("status_conexao_whatsapp")
        .eq("id", usuarioId)
        .single();

      expect(data!.status_conexao_whatsapp).toBe("desconectado");
    });

    it("marca conectado quando pareia", async () => {
      const { usuarioId } = await criarTenant();
      await admin
        .from("perfis")
        .update({ status_conexao_whatsapp: "desconectado" })
        .eq("id", usuarioId);

      await chamar(usuarioId, {
        event: "connection.update",
        data: { state: "open" },
      });

      const { data } = await admin
        .from("perfis")
        .select("status_conexao_whatsapp")
        .eq("id", usuarioId)
        .single();

      expect(data!.status_conexao_whatsapp).toBe("conectado");
    });
  });

  describe("conversa", () => {
    it("abre a conversa apresentando os serviços", async () => {
      const { usuarioId } = await criarTenant();

      await chamar(usuarioId, payloadMensagem("oi", "m1"));

      expect(enviadas).toHaveLength(1);
      expect(enviadas[0].destino).toBe(JID);
      expect(enviadas[0].instancia).toBe(usuarioId);
      expect(enviadas[0].texto).toContain("1. Corte (60 min)");

      const conversa = await lerConversa(usuarioId);
      expect(conversa?.ultima_mensagem_id).toBe("m1");
      expect(conversa?.versao).toBe(1);
    });

    it("não reprocessa a mesma mensagem — retry da Evolution é comum", async () => {
      const { usuarioId } = await criarTenant();

      await chamar(usuarioId, payloadMensagem("oi", "m1"));
      await chamar(usuarioId, payloadMensagem("oi", "m1"));

      expect(enviadas).toHaveLength(1);
      expect((await lerConversa(usuarioId))?.versao).toBe(1);
    });

    it("reapresenta a etapa sem avançar quando a resposta é inválida", async () => {
      const { usuarioId } = await criarTenant();

      await chamar(usuarioId, payloadMensagem("oi", "m1"));
      await chamar(usuarioId, payloadMensagem("banana", "m2"));

      // Duas mensagens: o aviso e a pergunta repetida — a conversa nunca fica
      // sem saída.
      const [aviso, pergunta] = enviadas.slice(-2).map((e) => e.texto);
      expect(aviso).toContain("Não entendi");
      expect(pergunta).toContain("Qual serviço");

      const conversa = await lerConversa(usuarioId);
      expect(conversa?.dados_temporarios).not.toHaveProperty("__servico_id");
    });

    it("corre a conversa inteira e grava o agendamento", async () => {
      const { usuarioId, servicoId } = await criarTenant();

      await chamar(usuarioId, payloadMensagem("oi", "m1"));
      await chamar(usuarioId, payloadMensagem("1", "m2")); // serviço
      await chamar(usuarioId, payloadMensagem("1", "m3")); // horário

      expect(enviadas.at(-1)!.texto).toContain("1. Confirmar");

      await chamar(usuarioId, payloadMensagem("1", "m4")); // confirma

      expect(enviadas.at(-1)!.texto).toContain("Agendamento confirmado");

      const { data: agendamentos } = await admin
        .from("agendamentos")
        .select("servico_id, duracao_minutos, status, clientes_finais(nome, remote_jid)")
        .eq("usuario_id", usuarioId);

      expect(agendamentos).toHaveLength(1);
      expect(agendamentos![0]).toMatchObject({
        servico_id: servicoId,
        duracao_minutos: 60,
        status: "confirmado",
      });
      // pushName é a única fonte de nome do cliente na V0.
      expect(
        (agendamentos![0] as unknown as { clientes_finais: { nome: string; remote_jid: string } })
          .clientes_finais,
      ).toMatchObject({ nome: "Joana", remote_jid: JID });

      // Conversa zerada, não apagada: a linha guarda `ultima_mensagem_id`, e
      // apagá-la faria a reentrega da confirmação reiniciar a conversa do nada.
      const conversa = await lerConversa(usuarioId);
      expect(conversa?.etapa_atual_id).toBeNull();
      expect(conversa?.dados_temporarios).toEqual({});
      expect(conversa?.ultima_mensagem_id).toBe("m4");
    });

    it("cancela sem gravar quando o cliente responde 2 na confirmação", async () => {
      const { usuarioId } = await criarTenant();

      await chamar(usuarioId, payloadMensagem("oi", "m1"));
      await chamar(usuarioId, payloadMensagem("1", "m2"));
      await chamar(usuarioId, payloadMensagem("1", "m3"));
      await chamar(usuarioId, payloadMensagem("2", "m4"));

      expect(enviadas.at(-1)!.texto).toMatch(/cancelado/i);

      const { count } = await admin
        .from("agendamentos")
        .select("*", { count: "exact", head: true })
        .eq("usuario_id", usuarioId);
      expect(count).toBe(0);
      expect((await lerConversa(usuarioId))?.etapa_atual_id).toBeNull();
    });

    it("não reinicia a conversa quando a confirmação é reentregue", async () => {
      const { usuarioId } = await criarTenant();

      await chamar(usuarioId, payloadMensagem("oi", "m1"));
      await chamar(usuarioId, payloadMensagem("1", "m2"));
      await chamar(usuarioId, payloadMensagem("1", "m3"));
      await chamar(usuarioId, payloadMensagem("1", "m4"));
      enviadas = [];

      // A Evolution reentrega a mesma confirmação. Antes, com a linha apagada, a
      // chave de idempotência morria junto e o cliente recebia "Qual serviço?"
      // logo depois de confirmar.
      await chamar(usuarioId, payloadMensagem("1", "m4"));

      expect(enviadas).toEqual([]);
      const { count } = await admin
        .from("agendamentos")
        .select("*", { count: "exact", head: true })
        .eq("usuario_id", usuarioId);
      expect(count).toBe(1);
    });

    it("não conta agendamento em andamento como horário livre", async () => {
      const { usuarioId, servicoId } = await criarTenant();

      // Serviço de 4h que começou 2h atrás: ainda ocupa a agenda agora.
      const inicio = new Date(Date.now() - 2 * 3_600_000);
      const { data: cliente } = await admin
        .from("clientes_finais")
        .insert({
          usuario_id: usuarioId,
          remote_jid: "5511933333333@s.whatsapp.net",
        })
        .select("id")
        .single();

      await admin.from("agendamentos").insert({
        usuario_id: usuarioId,
        cliente_id: cliente!.id,
        servico_id: servicoId,
        data_hora: inicio.toISOString(),
        duracao_minutos: 240,
      });

      await chamar(usuarioId, payloadMensagem("oi", "m1"));
      await chamar(usuarioId, payloadMensagem("1", "m2"));

      const conversa = await lerConversa(usuarioId);
      const oferecidos = (
        conversa!.dados_temporarios as { __opcoes_oferecidas: string[] }
      ).__opcoes_oferecidas;

      // Nenhum horário oferecido pode colidir com o que está em curso; antes o
      // filtro era por data_hora e o agendamento em andamento desaparecia.
      const fim = inicio.getTime() + 240 * 60_000;
      for (const iso of oferecidos) {
        const candidatoInicio = new Date(iso).getTime();
        const candidatoFim = candidatoInicio + 60 * 60_000;
        expect(
          candidatoInicio < fim && inicio.getTime() < candidatoFim,
          `slot ${iso} colide com o agendamento em andamento`,
        ).toBe(false);
      }
    });

    it("avisa que o horário foi tomado quando o slot vira no meio da conversa", async () => {
      const { usuarioId, servicoId } = await criarTenant();

      await chamar(usuarioId, payloadMensagem("oi", "m1"));
      await chamar(usuarioId, payloadMensagem("1", "m2"));
      await chamar(usuarioId, payloadMensagem("1", "m3"));

      // Descobre exatamente qual instante o cliente escolheu...
      const conversa = await lerConversa(usuarioId);
      const escolhido = (
        conversa!.dados_temporarios as { __data_hora: string }
      ).__data_hora;

      // ...e outro cliente fecha esse horário antes da confirmação chegar.
      const { data: outroCliente } = await admin
        .from("clientes_finais")
        .insert({
          usuario_id: usuarioId,
          remote_jid: "5511911111111@s.whatsapp.net",
        })
        .select("id")
        .single();

      const bloqueio = await admin.from("agendamentos").insert({
        usuario_id: usuarioId,
        cliente_id: outroCliente!.id,
        servico_id: servicoId,
        data_hora: escolhido,
        duracao_minutos: 60,
      });
      expect(bloqueio.error).toBeNull();

      await chamar(usuarioId, payloadMensagem("1", "m4"));

      // A constraint EXCLUDE do banco é o que impede o double-booking; aqui o
      // 23P01 vira caminho de UX, não erro genérico.
      expect(enviadas.at(-1)!.texto).toMatch(/acabou de ser reservado/);

      const { count } = await admin
        .from("agendamentos")
        .select("*", { count: "exact", head: true })
        .eq("usuario_id", usuarioId);
      expect(count).toBe(1);
    });

    it("atende JID @lid sem telefone", async () => {
      const { usuarioId } = await criarTenant();
      const jidLid = "154417159582282@lid";

      await chamar(usuarioId, {
        event: "messages.upsert",
        data: {
          key: { remoteJid: jidLid, fromMe: false, id: "m1" },
          pushName: "Sem Telefone",
          message: { conversation: "oi" },
        },
      });

      expect(enviadas).toHaveLength(1);
      // Responde ao JID recebido, sem tentar reconstruir número.
      expect(enviadas[0].destino).toBe(jidLid);

      const { data } = await admin
        .from("conversas_estado")
        .select("remote_jid, telefone_cliente")
        .eq("usuario_id", usuarioId)
        .single();

      expect(data).toEqual({ remote_jid: jidLid, telefone_cliente: null });
    });

    it("corrige status de conexão vencido ao receber mensagem", async () => {
      const { usuarioId } = await criarTenant();
      await admin
        .from("perfis")
        .update({ status_conexao_whatsapp: "desconectado" })
        .eq("id", usuarioId);

      await chamar(usuarioId, payloadMensagem("oi", "m1"));

      // Chegou mensagem, logo está pareado: webhook de conexão perdido não pode
      // deixar o dashboard mentindo para o dono.
      const { data } = await admin
        .from("perfis")
        .select("status_conexao_whatsapp")
        .eq("id", usuarioId)
        .single();

      expect(data!.status_conexao_whatsapp).toBe("conectado");
    });
  });

  describe("isolamento entre tenants", () => {
    it("não deixa a conversa de um tenant vazar para o outro", async () => {
      const a = await criarTenant();
      const b = await criarTenant();

      await chamar(a.usuarioId, payloadMensagem("oi", "m1"));
      await chamar(b.usuarioId, payloadMensagem("oi", "m1"));

      const conversaA = await lerConversa(a.usuarioId);
      const conversaB = await lerConversa(b.usuarioId);

      expect(conversaA).not.toBeNull();
      expect(conversaB).not.toBeNull();
      // Mesmo telefone falando com dois estabelecimentos: duas conversas.
      expect(enviadas.map((e) => e.instancia)).toEqual([
        a.usuarioId,
        b.usuarioId,
      ]);
    });
  });
});
