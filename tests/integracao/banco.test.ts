import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Testes de integração contra o Postgres local (`supabase start`).
 *
 * Estas garantias não dão para testar com mock: RLS, constraint EXCLUDE,
 * triggers e RPCs vivem no banco. Como a RLS é a camada de segurança real do
 * produto, testá-la é obrigatório e não opcional.
 *
 * Chaves abaixo são as demo fixas do Supabase CLI, iguais em toda instalação
 * local — não são segredo.
 */
const API_URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const stackNoAr = await fetch(`${API_URL}/rest/v1/`, {
  headers: { apikey: ANON_KEY },
})
  .then((r) => r.ok || r.status === 404)
  .catch(() => false);

const admin = createClient(API_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Usuario = { id: string; cliente: SupabaseClient };

const criados: string[] = [];

async function criarUsuario(rotulo: string): Promise<Usuario> {
  const email = `${rotulo}-${Date.now()}-${criados.length}@agendazap.test`;
  const senha = "senha-de-teste-123";

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });
  if (error) throw error;
  const id = data.user!.id;
  criados.push(id);

  const cliente = createClient(API_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: erroLogin } = await cliente.auth.signInWithPassword({
    email,
    password: senha,
  });
  if (erroLogin) throw erroLogin;

  return { id, cliente };
}

async function criarServico(u: Usuario, nome: string, duracao = 60) {
  const { data, error } = await u.cliente
    .from("servicos")
    .insert({ usuario_id: u.id, nome, duracao_minutos: duracao })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

describe.skipIf(!stackNoAr)("banco (integração)", () => {
  let dono: Usuario;
  let outroDono: Usuario;

  beforeAll(async () => {
    dono = await criarUsuario("dono");
    outroDono = await criarUsuario("outro");
  });

  afterAll(async () => {
    for (const id of criados) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  describe("trigger de novo usuário", () => {
    it("cria o perfil com a instância nomeada pelo id do usuário", async () => {
      const { data, error } = await dono.cliente
        .from("perfis")
        .select("id, evolution_instance_name, fuso_horario, passo_slot_minutos")
        .single();

      expect(error).toBeNull();
      expect(data).toMatchObject({
        id: dono.id,
        evolution_instance_name: dono.id,
        fuso_horario: "America/Sao_Paulo",
        passo_slot_minutos: 30,
      });
    });

    it("semeia as três etapas de sistema na ordem correta", async () => {
      const { data, error } = await dono.cliente
        .from("fluxo_etapas")
        .select("tipo, ordem, campo_destino, ativo")
        .order("ordem");

      expect(error).toBeNull();
      expect(data?.map((e) => e.tipo)).toEqual([
        "servico",
        "horario",
        "confirmacao",
      ]);
      // Etapas de sistema gravam em coluna própria, não em respostas_extras.
      expect(data?.every((e) => e.campo_destino === null)).toBe(true);
      expect(data?.every((e) => e.ativo)).toBe(true);
    });
  });

  describe("RLS", () => {
    it("esconde serviço de um tenant do outro", async () => {
      await criarServico(dono, "Corte");

      const { data, error } = await outroDono.cliente
        .from("servicos")
        .select("id, nome");

      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("impede inserir dado no nome de outro tenant", async () => {
      const { error } = await outroDono.cliente
        .from("servicos")
        .insert({ usuario_id: dono.id, nome: "Invasão", duracao_minutos: 30 });

      // 42501 = insufficient_privilege (violação de policy de RLS)
      expect(error?.code).toBe("42501");
    });

    it("impede atualizar dado de outro tenant", async () => {
      const servicoId = await criarServico(dono, "Barba");

      const { data, error } = await outroDono.cliente
        .from("servicos")
        .update({ nome: "Sequestrado" })
        .eq("id", servicoId)
        .select();

      // A policy filtra a linha: nada para atualizar, sem erro.
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("não deixa o dono escrever em conversas_estado (só service role)", async () => {
      const { error } = await dono.cliente.from("conversas_estado").insert({
        usuario_id: dono.id,
        remote_jid: "5511999999999@s.whatsapp.net",
      });

      expect(error?.code).toBe("42501");
    });
  });

  describe("agendamentos", () => {
    it("deriva data_hora_fim de data_hora + duracao_minutos", async () => {
      const servicoId = await criarServico(dono, "Coloração", 90);
      const clienteId = await criarClienteFinal(dono, "jid-fim");

      const { data, error } = await dono.cliente
        .from("agendamentos")
        .insert({
          usuario_id: dono.id,
          cliente_id: clienteId,
          servico_id: servicoId,
          data_hora: "2026-08-10T13:00:00Z",
          duracao_minutos: 90,
        })
        .select("data_hora_fim")
        .single();

      expect(error).toBeNull();
      expect(new Date(data!.data_hora_fim).toISOString()).toBe(
        "2026-08-10T14:30:00.000Z",
      );
    });

    it("rejeita sobreposição no mesmo tenant com 23P01", async () => {
      const servicoId = await criarServico(dono, "Manicure", 60);
      const clienteId = await criarClienteFinal(dono, "jid-overlap");

      const base = {
        usuario_id: dono.id,
        cliente_id: clienteId,
        servico_id: servicoId,
        duracao_minutos: 60,
      };

      const primeiro = await dono.cliente
        .from("agendamentos")
        .insert({ ...base, data_hora: "2026-08-11T13:00:00Z" });
      expect(primeiro.error).toBeNull();

      // Começa 30min depois: sobrepõe a segunda metade do primeiro.
      const segundo = await dono.cliente
        .from("agendamentos")
        .insert({ ...base, data_hora: "2026-08-11T13:30:00Z" });

      expect(segundo.error?.code).toBe("23P01");
    });

    it("permite horário idêntico em tenants diferentes", async () => {
      const servicoA = await criarServico(dono, "Sobrancelha", 30);
      const clienteA = await criarClienteFinal(dono, "jid-tenant-a");
      const servicoB = await criarServico(outroDono, "Sobrancelha", 30);
      const clienteB = await criarClienteFinal(outroDono, "jid-tenant-b");

      const a = await dono.cliente.from("agendamentos").insert({
        usuario_id: dono.id,
        cliente_id: clienteA,
        servico_id: servicoA,
        data_hora: "2026-08-12T13:00:00Z",
        duracao_minutos: 30,
      });
      const b = await outroDono.cliente.from("agendamentos").insert({
        usuario_id: outroDono.id,
        cliente_id: clienteB,
        servico_id: servicoB,
        data_hora: "2026-08-12T13:00:00Z",
        duracao_minutos: 30,
      });

      expect(a.error).toBeNull();
      expect(b.error).toBeNull();
    });

    it("libera o slot quando o agendamento é cancelado", async () => {
      const servicoId = await criarServico(dono, "Hidratação", 60);
      const clienteId = await criarClienteFinal(dono, "jid-cancel");

      const { data: criado } = await dono.cliente
        .from("agendamentos")
        .insert({
          usuario_id: dono.id,
          cliente_id: clienteId,
          servico_id: servicoId,
          data_hora: "2026-08-13T13:00:00Z",
          duracao_minutos: 60,
        })
        .select("id")
        .single();

      await dono.cliente
        .from("agendamentos")
        .update({ status: "cancelado" })
        .eq("id", criado!.id);

      // O índice é parcial em status = 'confirmado', então o slot volta a valer.
      const { error } = await dono.cliente.from("agendamentos").insert({
        usuario_id: dono.id,
        cliente_id: clienteId,
        servico_id: servicoId,
        data_hora: "2026-08-13T13:00:00Z",
        duracao_minutos: 60,
      });

      expect(error).toBeNull();
    });
  });

  describe("fluxo_etapas", () => {
    it("proíbe campo_destino duplicado no mesmo usuário", async () => {
      const etapa = {
        usuario_id: dono.id,
        tipo: "texto_livre",
        pergunta_texto: "Alguma observação?",
        campo_destino: "observacao",
      };

      const primeira = await dono.cliente
        .from("fluxo_etapas")
        .insert({ ...etapa, ordem: 10 });
      expect(primeira.error).toBeNull();

      const segunda = await dono.cliente
        .from("fluxo_etapas")
        .insert({ ...etapa, ordem: 11 });
      expect(segunda.error?.code).toBe("23505");
    });

    it("proíbe duplicar etapa de sistema", async () => {
      const { error } = await dono.cliente.from("fluxo_etapas").insert({
        usuario_id: dono.id,
        ordem: 20,
        tipo: "confirmacao",
        pergunta_texto: "Confirma?",
      });

      expect(error?.code).toBe("23505");
    });

    it("exige campo_destino em etapa customizada", async () => {
      const { error } = await dono.cliente.from("fluxo_etapas").insert({
        usuario_id: dono.id,
        ordem: 21,
        tipo: "escolha_unica",
        pergunta_texto: "Primeira vez aqui?",
      });

      expect(error?.code).toBe("23514"); // check_violation
    });

    it("rejeita campo_destino com prefixo reservado __", async () => {
      const { error } = await dono.cliente.from("fluxo_etapas").insert({
        usuario_id: dono.id,
        ordem: 22,
        tipo: "texto_livre",
        pergunta_texto: "Interno?",
        campo_destino: "__servico_id",
      });

      expect(error?.code).toBe("23514");
    });
  });

  describe("reordenar_fluxo_etapas", () => {
    it("regrava a ordem na sequência recebida", async () => {
      const u = await criarUsuario("reordena");
      const { data: etapas } = await u.cliente
        .from("fluxo_etapas")
        .select("id, tipo")
        .order("ordem");

      // Inverte: confirmacao, horario, servico
      const invertido = [...etapas!].reverse().map((e) => e.id);
      const { error } = await u.cliente.rpc("reordenar_fluxo_etapas", {
        p_ids: invertido,
      });
      expect(error).toBeNull();

      const { data: depois } = await u.cliente
        .from("fluxo_etapas")
        .select("tipo, ordem")
        .order("ordem");

      expect(depois?.map((e) => e.tipo)).toEqual([
        "confirmacao",
        "horario",
        "servico",
      ]);
      expect(depois?.map((e) => e.ordem)).toEqual([1, 2, 3]);
    });

    it("rejeita lista parcial", async () => {
      const u = await criarUsuario("parcial");
      const { data: etapas } = await u.cliente
        .from("fluxo_etapas")
        .select("id")
        .order("ordem");

      const { error } = await u.cliente.rpc("reordenar_fluxo_etapas", {
        p_ids: [etapas![0].id],
      });

      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/todas as 3 etapas/);
    });

    it("rejeita id de outro tenant", async () => {
      const u = await criarUsuario("intruso");
      const { data: minhas } = await u.cliente
        .from("fluxo_etapas")
        .select("id")
        .order("ordem");
      const { data: alheias } = await dono.cliente
        .from("fluxo_etapas")
        .select("id")
        .order("ordem")
        .limit(1);

      const ids = [...minhas!.slice(0, 2).map((e) => e.id), alheias![0].id];
      const { error } = await u.cliente.rpc("reordenar_fluxo_etapas", {
        p_ids: ids,
      });

      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/nao pertence ao fluxo/);
    });
  });

  describe("confirmar_agendamento", () => {
    it("cria cliente e agendamento numa só chamada", async () => {
      const servicoId = await criarServico(dono, "Escova", 45);

      const { data: agendamentoId, error } = await admin.rpc(
        "confirmar_agendamento",
        {
          p_usuario_id: dono.id,
          p_remote_jid: "5511988887777@s.whatsapp.net",
          p_telefone: "5511988887777",
          p_nome_cliente: "Joana",
          p_servico_id: servicoId,
          p_data_hora: "2026-08-14T13:00:00Z",
          p_duracao_minutos: 45,
          p_respostas_extras: { observacao: "sem química" },
        },
      );

      expect(error).toBeNull();
      expect(agendamentoId).toBeTruthy();

      const { data } = await dono.cliente
        .from("agendamentos")
        .select("respostas_extras, data_hora_fim, clientes_finais(nome)")
        .eq("id", agendamentoId)
        .single();

      expect(data!.respostas_extras).toEqual({ observacao: "sem química" });
      expect(new Date(data!.data_hora_fim).toISOString()).toBe(
        "2026-08-14T13:45:00.000Z",
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((data as any).clientes_finais.nome).toBe("Joana");
    });

    it("reaproveita o cliente no segundo agendamento do mesmo JID", async () => {
      const servicoId = await criarServico(dono, "Pedicure", 30);
      const jid = "5511977776666@s.whatsapp.net";

      await admin.rpc("confirmar_agendamento", {
        p_usuario_id: dono.id,
        p_remote_jid: jid,
        p_telefone: "5511977776666",
        p_nome_cliente: "Marina",
        p_servico_id: servicoId,
        p_data_hora: "2026-08-15T13:00:00Z",
        p_duracao_minutos: 30,
      });

      // Segunda vez sem pushName: não pode apagar o nome já conhecido.
      await admin.rpc("confirmar_agendamento", {
        p_usuario_id: dono.id,
        p_remote_jid: jid,
        p_telefone: null,
        p_nome_cliente: null,
        p_servico_id: servicoId,
        p_data_hora: "2026-08-16T13:00:00Z",
        p_duracao_minutos: 30,
      });

      const { data } = await dono.cliente
        .from("clientes_finais")
        .select("id, nome, telefone")
        .eq("remote_jid", jid);

      expect(data).toHaveLength(1);
      expect(data![0].nome).toBe("Marina");
      expect(data![0].telefone).toBe("5511977776666");
    });

    it("propaga 23P01 quando o slot foi tomado no meio da conversa", async () => {
      const servicoId = await criarServico(dono, "Massagem", 60);
      const argumentos = {
        p_usuario_id: dono.id,
        p_servico_id: servicoId,
        p_data_hora: "2026-08-17T13:00:00Z",
        p_duracao_minutos: 60,
      };

      const primeiro = await admin.rpc("confirmar_agendamento", {
        ...argumentos,
        p_remote_jid: "5511911111111@s.whatsapp.net",
        p_telefone: "5511911111111",
        p_nome_cliente: "Cliente A",
      });
      expect(primeiro.error).toBeNull();

      const segundo = await admin.rpc("confirmar_agendamento", {
        ...argumentos,
        p_remote_jid: "5511922222222@s.whatsapp.net",
        p_telefone: "5511922222222",
        p_nome_cliente: "Cliente B",
      });

      expect(segundo.error?.code).toBe("23P01");
    });
  });

  describe("log_envio", () => {
    it("não permite dois lembretes para o mesmo agendamento", async () => {
      const servicoId = await criarServico(dono, "Depilação", 30);
      const clienteId = await criarClienteFinal(dono, "jid-lembrete");
      const { data: agendamento } = await dono.cliente
        .from("agendamentos")
        .insert({
          usuario_id: dono.id,
          cliente_id: clienteId,
          servico_id: servicoId,
          data_hora: "2026-08-18T13:00:00Z",
          duracao_minutos: 30,
        })
        .select("id")
        .single();

      const argumentos = {
        p_agendamento_id: agendamento!.id,
        p_usuario_id: dono.id,
      };

      // Primeira execução do cron reserva o envio.
      const primeira = await admin.rpc(
        "registrar_lembrete_pendente",
        argumentos,
      );
      expect(primeira.error).toBeNull();
      expect(primeira.data).toBeTruthy();

      // Segunda execução (redeploy, retry da Vercel) devolve null: não envia.
      const segunda = await admin.rpc(
        "registrar_lembrete_pendente",
        argumentos,
      );
      expect(segunda.error).toBeNull();
      expect(segunda.data).toBeNull();

      const { count } = await admin
        .from("log_envio")
        .select("*", { count: "exact", head: true })
        .eq("agendamento_id", agendamento!.id)
        .eq("tipo", "lembrete");
      expect(count).toBe(1);
    });
  });

  describe("LGPD", () => {
    it("apaga os dados do tenant em cascata ao excluir a conta", async () => {
      const efemero = await criarUsuario("efemero");
      const servicoId = await criarServico(efemero, "Corte", 30);
      const clienteId = await criarClienteFinal(efemero, "jid-efemero");
      await efemero.cliente.from("agendamentos").insert({
        usuario_id: efemero.id,
        cliente_id: clienteId,
        servico_id: servicoId,
        data_hora: "2026-08-19T13:00:00Z",
        duracao_minutos: 30,
      });

      const { error } = await admin.auth.admin.deleteUser(efemero.id);
      expect(error).toBeNull();

      for (const tabela of [
        "perfis",
        "servicos",
        "clientes_finais",
        "agendamentos",
        "fluxo_etapas",
      ]) {
        const { count } = await admin
          .from(tabela)
          .select("*", { count: "exact", head: true })
          .eq(tabela === "perfis" ? "id" : "usuario_id", efemero.id);
        expect(count, `${tabela} deveria estar vazia`).toBe(0);
      }
    });
  });
});

async function criarClienteFinal(u: Usuario, jid: string) {
  const { data, error } = await u.cliente
    .from("clientes_finais")
    .insert({ usuario_id: u.id, remote_jid: `${jid}-${Date.now()}` })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}
