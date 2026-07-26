import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cobre o gate de assinatura do cron: quem está com trial expirado ou
 * assinatura cancelada não recebe lembrete.
 *
 * A regra de decisão em si está testada em `lib/assinatura.test.ts`, com a
 * matriz completa de status. O que se verifica aqui é o **fio**: que o cron lê
 * as colunas certas, consulta a regra e realmente pula o tenant antes de gastar
 * query e antes de mandar mensagem.
 */

const SEGREDO = "segredo-do-cron";
const TENANT = "11111111-1111-1111-1111-111111111111";

/** Resultados que o client fake devolve, por tabela. */
type Resultados = Record<string, { data: unknown; error: unknown }>;

let resultados: Resultados;
let tabelasConsultadas: string[];
const enviarTexto = vi.fn();

/**
 * Builder encadeável e "thenable": todo método devolve ele mesmo, e o `await`
 * resolve no resultado da tabela. Reproduz a forma do supabase-js
 * (`.select().eq().gte()...` awaited no fim) sem depender da lib de verdade.
 */
function criarQueryFake(resultado: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const metodo of [
    "select",
    "eq",
    "in",
    "gte",
    "lt",
    "order",
    "limit",
    "update",
    "insert",
  ]) {
    builder[metodo] = () => builder;
  }
  builder.then = (resolver: (valor: typeof resultado) => unknown) =>
    Promise.resolve(resultado).then(resolver);
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  criarClienteAdmin: () => ({
    from: (tabela: string) => {
      tabelasConsultadas.push(tabela);
      return criarQueryFake(resultados[tabela] ?? { data: [], error: null });
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  }),
}));

vi.mock("@/lib/evolution-api", () => ({
  enviarTexto,
  // O handler importa a classe para distinguir erro da Evolution de erro real.
  ErroEvolutionApi: class ErroEvolutionApi extends Error {},
}));

const { GET } = await import("./route");

function perfil(campos: Record<string, unknown>) {
  return {
    id: TENANT,
    fuso_horario: "America/Sao_Paulo",
    status_conexao_whatsapp: "conectado",
    nome_estabelecimento: "Salão Teste",
    ...campos,
  };
}

function chamar() {
  return GET(
    new Request("http://localhost/api/cron/enviar-lembretes", {
      headers: { authorization: `Bearer ${SEGREDO}` },
    }),
  );
}

beforeEach(() => {
  process.env.CRON_SECRET = SEGREDO;
  resultados = {};
  tabelasConsultadas = [];
  enviarTexto.mockReset();
});

describe("gate de assinatura no cron de lembretes", () => {
  it("pula tenant com trial expirado sem consultar agendamentos", async () => {
    resultados.perfis = {
      data: [
        perfil({
          status_assinatura: "trial",
          trial_expira_em: "2020-01-01T00:00:00Z",
        }),
      ],
      error: null,
    };

    const corpo = await (await chamar()).json();

    expect(corpo).toMatchObject({
      ok: true,
      tenants: 1,
      pulados_assinatura: 1,
      enviados: 0,
      erros: 0,
    });
    expect(enviarTexto).not.toHaveBeenCalled();
    // O gate vem antes da query: nada de agendamentos para quem não vai receber.
    expect(tabelasConsultadas).toEqual(["perfis"]);
  });

  it("pula tenant com assinatura cancelada", async () => {
    resultados.perfis = {
      data: [
        perfil({ status_assinatura: "cancelado", trial_expira_em: null }),
      ],
      error: null,
    };

    const corpo = await (await chamar()).json();

    expect(corpo).toMatchObject({ pulados_assinatura: 1, enviados: 0 });
    expect(enviarTexto).not.toHaveBeenCalled();
  });

  it("processa tenant ativo mesmo com o trial já vencido", async () => {
    resultados.perfis = {
      data: [
        perfil({
          status_assinatura: "ativo",
          trial_expira_em: "2020-01-01T00:00:00Z",
        }),
      ],
      error: null,
    };
    resultados.agendamentos = { data: [], error: null };

    const corpo = await (await chamar()).json();

    expect(corpo).toMatchObject({ pulados_assinatura: 0, erros: 0 });
    // Chegou a buscar a agenda do dia seguinte — não foi barrado no gate.
    expect(tabelasConsultadas).toContain("agendamentos");
  });

  it("isola tenants: um bloqueado não impede o envio do outro", async () => {
    const OUTRO = "22222222-2222-2222-2222-222222222222";
    resultados.perfis = {
      data: [
        perfil({
          status_assinatura: "trial",
          trial_expira_em: "2020-01-01T00:00:00Z",
        }),
        perfil({
          id: OUTRO,
          status_assinatura: "ativo",
          trial_expira_em: null,
        }),
      ],
      error: null,
    };
    resultados.agendamentos = { data: [], error: null };

    const corpo = await (await chamar()).json();

    expect(corpo).toMatchObject({
      tenants: 2,
      pulados_assinatura: 1,
      erros: 0,
    });
  });

  it("rejeita chamada sem o CRON_SECRET", async () => {
    const resposta = await GET(
      new Request("http://localhost/api/cron/enviar-lembretes"),
    );

    expect(resposta.status).toBe(401);
    expect(enviarTexto).not.toHaveBeenCalled();
  });
});
