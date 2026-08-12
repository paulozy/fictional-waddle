import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Sinal por Pix — as garantias que só o Postgres dá.
 *
 * Tudo aqui é constraint, RLS, grant por coluna ou transação dentro de RPC.
 * Nenhuma dessas coisas existe num mock: um teste com Supabase falso afirmaria
 * que a função foi chamada, e o que precisa ser verdade é que o BANCO recusa.
 *
 * O caso mais caro do arquivo é `estorno_pendente`: o cliente pagou e não tem
 * horário. Ele nasce de uma corrida (a EXCLUDE barrando a ressurreição), e uma
 * corrida não se testa contra objeto simulado.
 *
 * Chaves abaixo são as demo fixas do Supabase CLI — não são segredo.
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
  const email = `${rotulo}-${Date.now()}-${criados.length}@encaixaria.test`;
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

async function criarServico(u: Usuario, nome = "Corte") {
  const { data, error } = await u.cliente
    .from("servicos")
    .insert({ usuario_id: u.id, nome, duracao_minutos: 60 })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function criarClienteFinal(u: Usuario, jid: string) {
  const { data, error } = await admin
    .from("clientes_finais")
    .insert({ usuario_id: u.id, remote_jid: jid, nome: "Cliente" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/** Daqui a `horas`, em instante absoluto. */
function daquiA(horas: number): string {
  return new Date(Date.now() + horas * 3_600_000).toISOString();
}

/**
 * Horário livre, diferente a cada chamada.
 *
 * Sem isto, dois cenários do MESMO dono caem no mesmo instante e batem na
 * `agendamentos_sem_sobreposicao` — que é a constraint sob teste em outros
 * casos deste arquivo. O setup falharia por acidente, com a mensagem do bug
 * real, e o teste ficaria vermelho sem nada de errado no produto.
 */
let deslocamento = 0;
function horarioLivre(): string {
  deslocamento += 1;
  return daquiA(48 + deslocamento * 2);
}

type Cenario = {
  usuario: Usuario;
  agendamentoId: string;
  cobrancaId: string;
  pagamentoId: string;
};

/**
 * Agendamento `confirmado` + `sinal_status = 'aguardando'` + cobrança pendente.
 *
 * Escrito com a service role porque é exatamente o que o produto faz: as colunas
 * de sinal ficam fora do `grant update` de `authenticated` de propósito, e há um
 * teste abaixo afirmando isso.
 */
async function cenarioComSinal(
  u: Usuario,
  opcoes: { dataHora?: string; expiraEm?: string; valorCentavos?: number } = {},
): Promise<Cenario> {
  const servicoId = await criarServico(u);
  const clienteId = await criarClienteFinal(u, `${crypto.randomUUID()}@s.whatsapp.net`);

  const dataHora = opcoes.dataHora ?? horarioLivre();
  const expiraEm = opcoes.expiraEm ?? daquiA(1);
  const valorCentavos = opcoes.valorCentavos ?? 2000;

  const { data: ag, error: erroAg } = await admin
    .from("agendamentos")
    .insert({
      usuario_id: u.id,
      cliente_id: clienteId,
      servico_id: servicoId,
      data_hora: dataHora,
      duracao_minutos: 60,
      sinal_status: "aguardando",
      sinal_expira_em: expiraEm,
    })
    .select("id")
    .single();
  if (erroAg) throw erroAg;

  const pagamentoId = `mp-${crypto.randomUUID()}`;

  const { data: cob, error: erroCob } = await admin
    .from("cobrancas_sinal")
    .insert({
      usuario_id: u.id,
      agendamento_id: ag.id,
      provedor_pagamento_id: pagamentoId,
      valor_centavos: valorCentavos,
      qr_code: "00020126...5802BR6304ABCD",
      expira_em: expiraEm,
    })
    .select("id")
    .single();
  if (erroCob) throw erroCob;

  return {
    usuario: u,
    agendamentoId: ag.id as string,
    cobrancaId: cob.id as string,
    pagamentoId,
  };
}

async function lerAgendamento(id: string) {
  const { data, error } = await admin
    .from("agendamentos")
    .select("status, sinal_status, cancelado_por, cancelamento_motivo")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

async function lerCobranca(id: string) {
  const { data, error } = await admin
    .from("cobrancas_sinal")
    .select("status, pago_em, estorno_pendente")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

describe.skipIf(!stackNoAr)("sinal por Pix (integração)", () => {
  let dono: Usuario;
  let intruso: Usuario;

  beforeAll(async () => {
    dono = await criarUsuario("sinal-dono");
    intruso = await criarUsuario("sinal-intruso");
  });

  afterAll(async () => {
    for (const id of criados) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  describe("expirar_sinais_vencidos", () => {
    it("cancela o hold vencido e devolve o slot ao mercado", async () => {
      const u = await criarUsuario("expira");
      const cenario = await cenarioComSinal(u, { expiraEm: daquiA(-1) });

      const { data, error } = await admin.rpc("expirar_sinais_vencidos", {
        p_usuario_id: u.id,
      });
      expect(error).toBeNull();
      expect(data).toBe(1);

      const ag = await lerAgendamento(cenario.agendamentoId);
      expect(ag.status).toBe("cancelado");
      expect(ag.sinal_status).toBe("expirado");
      // Nem 'cliente' nem 'dono': ninguém decidiu, o prazo passou.
      expect(ag.cancelado_por).toBe("sistema");
      expect(ag.cancelamento_motivo).toBe("sinal_nao_pago");

      // A cobrança acompanha, senão o painel mostraria "aguardando" para sempre.
      expect((await lerCobranca(cenario.cobrancaId)).status).toBe("expirado");
    });

    it("não toca em hold dentro do prazo", async () => {
      const u = await criarUsuario("no-prazo");
      const cenario = await cenarioComSinal(u, { expiraEm: daquiA(1) });

      const { data } = await admin.rpc("expirar_sinais_vencidos", {
        p_usuario_id: u.id,
      });
      expect(data).toBe(0);
      expect((await lerAgendamento(cenario.agendamentoId)).status).toBe(
        "confirmado",
      );
    });

    it("é escopada por tenant: não expira hold de outro dono", async () => {
      const alvo = await criarUsuario("alvo");
      const cenario = await cenarioComSinal(alvo, { expiraEm: daquiA(-1) });

      const { data } = await admin.rpc("expirar_sinais_vencidos", {
        p_usuario_id: intruso.id,
      });
      expect(data).toBe(0);
      expect((await lerAgendamento(cenario.agendamentoId)).status).toBe(
        "confirmado",
      );
    });

    it("reconcilia o sinal de agendamento cancelado por outro caminho", async () => {
      // O cancelamento pelo dono e o cancelamento pelo cliente gravam
      // `status = 'cancelado'` e não sabem nada sobre sinal. Sem esta
      // reconciliação, a agenda mostraria "Aguardando sinal" ao lado de um
      // horário cancelado, e a cobrança ficaria `pendente` para sempre.
      const u = await criarUsuario("reconcilia");
      const cenario = await cenarioComSinal(u, { expiraEm: daquiA(6) });

      await admin
        .from("agendamentos")
        .update({
          status: "cancelado",
          cancelado_em: new Date().toISOString(),
          cancelado_por: "cliente",
        })
        .eq("id", cenario.agendamentoId);

      const { data } = await admin.rpc("expirar_sinais_vencidos", {
        p_usuario_id: u.id,
      });

      // Não conta como liberação: o slot já tinha sido devolvido pelo cancelamento.
      expect(data).toBe(0);

      const ag = await lerAgendamento(cenario.agendamentoId);
      expect(ag.sinal_status).toBe("expirado");
      // Preserva quem cancelou de verdade — a reconciliação não reescreve autoria.
      expect(ag.cancelado_por).toBe("cliente");

      // E a cobrança para de ficar pendente mesmo com o prazo ainda correndo.
      expect((await lerCobranca(cenario.cobrancaId)).status).toBe("expirado");
    });

    it("libera de fato o horário para outro cliente", async () => {
      const u = await criarUsuario("libera");
      const quando = daquiA(72);
      const cenario = await cenarioComSinal(u, {
        dataHora: quando,
        expiraEm: daquiA(-1),
      });

      // Antes de expirar, a EXCLUDE barra o mesmo horário.
      const outroCliente = await criarClienteFinal(u, "concorrente@s.whatsapp.net");
      const servicoId = await criarServico(u, "Barba");
      const tentativa = await admin.from("agendamentos").insert({
        usuario_id: u.id,
        cliente_id: outroCliente,
        servico_id: servicoId,
        data_hora: quando,
        duracao_minutos: 60,
      });
      expect(tentativa.error?.code).toBe("23P01");

      await admin.rpc("expirar_sinais_vencidos", { p_usuario_id: u.id });

      const depois = await admin.from("agendamentos").insert({
        usuario_id: u.id,
        cliente_id: outroCliente,
        servico_id: servicoId,
        data_hora: quando,
        duracao_minutos: 60,
      });
      expect(depois.error).toBeNull();
      void cenario;
    });
  });

  describe("confirmar_sinal_pago", () => {
    it("promove o agendamento no caminho feliz", async () => {
      const u = await criarUsuario("paga");
      const cenario = await cenarioComSinal(u);

      const { data, error } = await admin.rpc("confirmar_sinal_pago", {
        p_provedor_pagamento_id: cenario.pagamentoId,
        p_valor_centavos: 2000,
      });
      expect(error).toBeNull();
      expect(data).toBe("promovido");

      const ag = await lerAgendamento(cenario.agendamentoId);
      expect(ag.status).toBe("confirmado");
      expect(ag.sinal_status).toBe("pago");

      const cob = await lerCobranca(cenario.cobrancaId);
      expect(cob.status).toBe("pago");
      expect(cob.pago_em).not.toBeNull();
      expect(cob.estorno_pendente).toBe(false);
    });

    it("é idempotente: reentrega do MP não promove duas vezes", async () => {
      const u = await criarUsuario("reentrega");
      const cenario = await cenarioComSinal(u);

      const primeira = await admin.rpc("confirmar_sinal_pago", {
        p_provedor_pagamento_id: cenario.pagamentoId,
        p_valor_centavos: 2000,
      });
      const segunda = await admin.rpc("confirmar_sinal_pago", {
        p_provedor_pagamento_id: cenario.pagamentoId,
        p_valor_centavos: 2000,
      });

      expect(primeira.data).toBe("promovido");
      // 'ja_processado' é o caso NORMAL, não erro: o MP reenvia a notificação.
      expect(segunda.data).toBe("ja_processado");
    });

    it("ignora id de pagamento desconhecido", async () => {
      const { data } = await admin.rpc("confirmar_sinal_pago", {
        p_provedor_pagamento_id: "mp-inexistente",
        p_valor_centavos: 2000,
      });
      expect(data).toBe("sem_cobranca");
    });

    it("recusa valor divergente do cobrado", async () => {
      const u = await criarUsuario("divergente");
      const cenario = await cenarioComSinal(u, { valorCentavos: 2000 });

      const { data } = await admin.rpc("confirmar_sinal_pago", {
        p_provedor_pagamento_id: cenario.pagamentoId,
        p_valor_centavos: 500,
      });
      expect(data).toBe("valor_divergente");

      // E o horário continua apenas reservado, nunca pago.
      expect((await lerAgendamento(cenario.agendamentoId)).sinal_status).toBe(
        "aguardando",
      );
    });

    it("ressuscita o agendamento se o Pix cair depois do prazo com o slot livre", async () => {
      const u = await criarUsuario("atrasado");
      const cenario = await cenarioComSinal(u, { expiraEm: daquiA(-1) });

      await admin.rpc("expirar_sinais_vencidos", { p_usuario_id: u.id });
      expect((await lerAgendamento(cenario.agendamentoId)).status).toBe(
        "cancelado",
      );

      const { data } = await admin.rpc("confirmar_sinal_pago", {
        p_provedor_pagamento_id: cenario.pagamentoId,
        p_valor_centavos: 2000,
      });
      expect(data).toBe("reconfirmado");

      const ag = await lerAgendamento(cenario.agendamentoId);
      expect(ag.status).toBe("confirmado");
      expect(ag.sinal_status).toBe("pago");
      // Os campos de cancelamento são limpos, senão a agenda mostraria um
      // agendamento vivo carimbado como cancelado.
      expect(ag.cancelado_por).toBeNull();
      expect(ag.cancelamento_motivo).toBeNull();
      expect((await lerCobranca(cenario.cobrancaId)).estorno_pendente).toBe(false);
    });

    it("marca estorno pendente se o slot foi tomado depois de expirar", async () => {
      const u = await criarUsuario("tomado");
      const quando = daquiA(96);
      const cenario = await cenarioComSinal(u, {
        dataHora: quando,
        expiraEm: daquiA(-1),
      });

      await admin.rpc("expirar_sinais_vencidos", { p_usuario_id: u.id });

      // Outro cliente fecha o mesmo horário na janela.
      const outro = await criarClienteFinal(u, "rapido@s.whatsapp.net");
      const servicoId = await criarServico(u, "Outro");
      const { error } = await admin.from("agendamentos").insert({
        usuario_id: u.id,
        cliente_id: outro,
        servico_id: servicoId,
        data_hora: quando,
        duracao_minutos: 60,
      });
      expect(error).toBeNull();

      const { data } = await admin.rpc("confirmar_sinal_pago", {
        p_provedor_pagamento_id: cenario.pagamentoId,
        p_valor_centavos: 2000,
      });
      expect(data).toBe("estorno_pendente");

      // O dinheiro entrou: a cobrança fica 'pago', com a bandeira levantada.
      const cob = await lerCobranca(cenario.cobrancaId);
      expect(cob.status).toBe("pago");
      expect(cob.estorno_pendente).toBe(true);

      // E o agendamento NÃO volta — o horário é de quem chegou primeiro.
      expect((await lerAgendamento(cenario.agendamentoId)).status).toBe(
        "cancelado",
      );
    });

    it("nunca ressuscita agendamento que o DONO cancelou", async () => {
      const u = await criarUsuario("dono-cancelou");
      const cenario = await cenarioComSinal(u);

      await admin
        .from("agendamentos")
        .update({
          status: "cancelado",
          cancelado_em: new Date().toISOString(),
          cancelado_por: "dono",
          cancelamento_motivo: "estabelecimento_indisponivel",
        })
        .eq("id", cenario.agendamentoId);

      const { data } = await admin.rpc("confirmar_sinal_pago", {
        p_provedor_pagamento_id: cenario.pagamentoId,
        p_valor_centavos: 2000,
      });
      expect(data).toBe("estorno_pendente");

      // Reconfirmar desfaria uma decisão humana pelas costas do dono.
      const ag = await lerAgendamento(cenario.agendamentoId);
      expect(ag.status).toBe("cancelado");
      expect(ag.cancelado_por).toBe("dono");
      expect((await lerCobranca(cenario.cobrancaId)).estorno_pendente).toBe(true);
    });

    it("não ressuscita horário que já passou", async () => {
      const u = await criarUsuario("passado");
      // A EXCLUDE não barra passado, então sem a guarda o agendamento voltaria
      // vencido e o lembrete nunca sairia.
      const cenario = await cenarioComSinal(u, {
        dataHora: daquiA(-5),
        expiraEm: daquiA(-6),
      });

      await admin.rpc("expirar_sinais_vencidos", { p_usuario_id: u.id });

      const { data } = await admin.rpc("confirmar_sinal_pago", {
        p_provedor_pagamento_id: cenario.pagamentoId,
        p_valor_centavos: 2000,
      });
      expect(data).toBe("estorno_pendente");
      expect((await lerAgendamento(cenario.agendamentoId)).status).toBe(
        "cancelado",
      );
    });
  });

  describe("constraints", () => {
    it("recusa sinal exigido sem prazo", async () => {
      const u = await criarUsuario("sem-prazo");
      const servicoId = await criarServico(u);
      const clienteId = await criarClienteFinal(u, "sem-prazo@s.whatsapp.net");

      const { error } = await admin.from("agendamentos").insert({
        usuario_id: u.id,
        cliente_id: clienteId,
        servico_id: servicoId,
        data_hora: daquiA(24),
        duracao_minutos: 60,
        sinal_status: "aguardando",
        // sinal_expira_em ausente de propósito
      });

      // 23514 = check_violation. Prazo nulo nunca venceria (`null < now()` é
      // NULL), e o slot ficaria bloqueado para sempre.
      expect(error?.code).toBe("23514");
    });

    it("recusa plano fora do vocabulário", async () => {
      const { error } = await admin
        .from("perfis")
        .update({ plano: "premium" })
        .eq("id", dono.id);
      expect(error?.code).toBe("23514");
    });

    it("nasce com plano 'basico' e sem conta de pagamento conectada", async () => {
      const { data } = await admin
        .from("perfis")
        .select("plano, pagamento_conectado_em, sinal_minutos_validade")
        .eq("id", dono.id)
        .single();

      expect(data!.plano).toBe("basico");
      expect(data!.pagamento_conectado_em).toBeNull();
      expect(data!.sinal_minutos_validade).toBe(30);
    });
  });

  describe("RLS e grants", () => {
    it("o dono NÃO lê as próprias credenciais de pagamento", async () => {
      await admin.from("credenciais_pagamento").insert({
        usuario_id: dono.id,
        access_token_cifrado: "cifrado",
        refresh_token_cifrado: "cifrado",
        expira_em: daquiA(4320),
        conta_externa_id: "123456",
      });

      // RLS com ZERO policies: o token movimenta conta bancária de terceiro, e
      // nem para debug o dono precisa dele.
      const { data, error } = await dono.cliente
        .from("credenciais_pagamento")
        .select("access_token_cifrado");

      expect(error === null ? data : []).toEqual([]);
    });

    it("o dono lê as próprias cobranças, e só as próprias", async () => {
      const meu = await cenarioComSinal(dono);
      const alheio = await cenarioComSinal(intruso);

      const { data, error } = await dono.cliente
        .from("cobrancas_sinal")
        .select("id");
      expect(error).toBeNull();

      const ids = (data ?? []).map((l) => l.id);
      expect(ids).toContain(meu.cobrancaId);
      expect(ids).not.toContain(alheio.cobrancaId);
    });

    it("o dono NÃO consegue declarar um sinal como pago", async () => {
      const cenario = await cenarioComSinal(dono);

      // Sem o grant de coluna, isto morre em 42501 antes de qualquer policy.
      // É o que faz do registro uma prova, e não um campo de texto.
      const { error } = await dono.cliente
        .from("agendamentos")
        .update({ sinal_status: "pago" })
        .eq("id", cenario.agendamentoId);

      expect(error).not.toBeNull();
      expect((await lerAgendamento(cenario.agendamentoId)).sinal_status).toBe(
        "aguardando",
      );
    });

    it("o dono NÃO consegue se autoconceder a capacidade de cobrar sinal", async () => {
      const { error } = await dono.cliente
        .from("perfis")
        .update({ plano: "sinal" })
        .eq("id", dono.id);

      expect(error).not.toBeNull();

      const { data } = await admin
        .from("perfis")
        .select("plano")
        .eq("id", dono.id)
        .single();
      expect(data!.plano).toBe("basico");
    });

    it("o dono configura o prazo do sinal", async () => {
      const { error } = await dono.cliente
        .from("perfis")
        .update({ sinal_minutos_validade: 45 })
        .eq("id", dono.id);

      expect(error).toBeNull();
    });
  });
});
