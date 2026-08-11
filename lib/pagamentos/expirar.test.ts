import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A varredura no caminho de leitura do painel.
 *
 * O que se prende aqui é o que torna esta função segura e barata: ela usa a
 * **service role** (a RPC é `security invoker` com `execute` só para
 * `service_role`, porque escreve nas colunas de sinal que `authenticated` não
 * pode tocar), então o id tem de vir sempre da sessão; e ela não pode custar uma
 * escrita para os tenants que não cobram sinal, que são a maioria.
 */

const chamadas = vi.hoisted(
  () => [] as { nome: string; args: Record<string, unknown> }[],
);
const resultado = vi.hoisted(() => ({ error: null as { code: string } | null }));

vi.mock("@/lib/supabase/admin", () => ({
  criarClienteAdmin: () => ({
    rpc: (nome: string, args: Record<string, unknown>) => {
      chamadas.push({ nome, args });
      return Promise.resolve({ data: 1, error: resultado.error });
    },
  }),
}));

const { expirarSinaisDoDono } = await import("./expirar");

const TENANT = "11111111-1111-1111-1111-111111111111";

/** Tenant que cobra sinal: plano certo e conta conectada. */
function cobra() {
  return { plano: "sinal", pagamento_conectado_em: "2026-08-01T00:00:00Z" };
}

beforeEach(() => {
  chamadas.length = 0;
  resultado.error = null;
});

describe("expirarSinaisDoDono", () => {
  it("varre com o id recebido, e só a RPC de expiração", async () => {
    await expirarSinaisDoDono(TENANT, cobra());

    expect(chamadas).toEqual([
      { nome: "expirar_sinais_vencidos", args: { p_usuario_id: TENANT } },
    ]);
  });

  /**
   * A guarda existe para não pagar uma escrita em toda abertura de agenda de todo
   * tenant — a esmagadora maioria não usa a capacidade. Quem a desligou com holds
   * abertos continua coberto pelo cron diário, que ignora esta condição.
   */
  it("não varre quem não cobra sinal", async () => {
    for (const perfil of [
      null,
      undefined,
      { plano: "basico", pagamento_conectado_em: "2026-08-01T00:00:00Z" },
      { plano: "sinal", pagamento_conectado_em: null },
    ]) {
      await expirarSinaisDoDono(TENANT, perfil);
    }

    expect(chamadas).toEqual([]);
  });

  /**
   * Fail-open: é higiene de dado, não conteúdo da página. Derrubar a agenda do
   * dono porque a limpeza falhou seria trocar a função pelo enfeite — a página
   * mostra o estado antigo, que é o que mostrava antes desta função existir.
   */
  it("erro do banco não propaga, só registra", async () => {
    resultado.error = { code: "42501" };
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(expirarSinaisDoDono(TENANT, cobra())).resolves.toBeUndefined();
    expect(erro).toHaveBeenCalled();
  });

  /** Nem o id nem o hash entram em log: o id de tenant basta para depurar. */
  it("o log não carrega nada além do tenant e do código", async () => {
    resultado.error = { code: "42501" };
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});

    await expirarSinaisDoDono(TENANT, cobra());

    const [, contexto] = erro.mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.keys(contexto).sort()).toEqual(["codigo", "usuario_id"]);
  });
});
