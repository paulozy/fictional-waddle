import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regressão de "Conectar outro número não gerava código novo".
 *
 * Medido contra a Evolution 2.3.7: o controller **só honra o `number` do
 * `/instance/connect` quando o estado é `close`**. Com a instância em
 * `connecting`, pedir `connect?number=OUTRO` devolvia o pairing code em cache
 * do número anterior; em `open`, não devolvia QR nenhum — e a tela lia isso
 * como "já pareado" e voltava ao cartão verde, sem erro e sem pista.
 *
 * O que estes testes prendem é a **ordem**: logout antes do connect. Invertê-la
 * (ou pedir o QR sem esperar o `close`) reintroduz exatamente o bug, e o
 * sintoma é silencioso — a tela mostra um código que nunca vai parear.
 */

const chamadas = vi.hoisted(() => ({ ordem: [] as string[] }));
const estadoAtual = vi.hoisted(() => ({ valor: "desconectado" as string }));

class ErroFalso extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
    this.name = "ErroEvolutionApi";
  }
  get instanciaJaExiste() {
    return false;
  }
}

const desconectarInstancia = vi.hoisted(() => vi.fn());
const obterQrCode = vi.hoisted(() => vi.fn());
const obterEstadoConexao = vi.hoisted(() => vi.fn());
const criarInstancia = vi.hoisted(() => vi.fn());
const configurarWebhook = vi.hoisted(() => vi.fn());

/**
 * O módulo real é `server-only` e fala com a Evolution por HTTP. Aqui interessa
 * a coreografia do action, não o cliente — mas `ErroEvolutionApi` precisa ser a
 * **mesma** classe que o action testa com `instanceof`, senão o galho de 404
 * (primeiro acesso) nunca é alcançado.
 */
vi.mock("@/lib/evolution-api", () => ({
  ErroEvolutionApi: ErroFalso,
  desconectarInstancia,
  obterQrCode,
  obterEstadoConexao,
  criarInstancia,
  configurarWebhook,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  exigirUsuario: async () => "dono-1",
  criarClienteServidor: async () => ({
    from: () => ({ update: () => ({ eq: async () => ({}) }) }),
  }),
}));

const { gerarQrCode } = await import("./actions");

beforeEach(() => {
  vi.useFakeTimers();
  chamadas.ordem = [];
  estadoAtual.valor = "desconectado";
  vi.clearAllMocks();

  desconectarInstancia.mockImplementation(async (i: string) => {
    chamadas.ordem.push(`logout:${i}`);
    // O `close` é assíncrono ao 200 do logout — é justamente o que a espera
    // do action existe para cobrir.
    estadoAtual.valor = "conectando";
  });
  obterQrCode.mockImplementation(async () => {
    chamadas.ordem.push("connect");
    return {
      base64: "data:image/png;base64,AAA",
      codigo: null,
      codigoPareamento: "D9RMYWHK",
      regeracoes: 2,
    };
  });
  obterEstadoConexao.mockImplementation(async () => estadoAtual.valor);
  configurarWebhook.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

/** O action espera o `close` com timers; sem avançá-los ele nunca resolve. */
async function executar<T>(promessa: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(6_000);
  return promessa;
}

describe("gerarQrCode", () => {
  it("derruba a sessão antes de pedir o código quando o pedido é manual", async () => {
    const resultado = await executar(gerarQrCode("5511977776666", true));

    expect(chamadas.ordem).toEqual(["logout:dono-1", "connect"]);
    expect(resultado.codigoPareamento).toBe("D9RMYWHK");
  });

  it("não derruba nada na renovação automática", async () => {
    // Reiniciar aqui mataria a sessão que o dono está pareando naquele
    // instante — a renovação roda de dois em dois segundos com o QR na tela.
    await executar(gerarQrCode("5511977776666", false));

    expect(desconectarInstancia).not.toHaveBeenCalled();
    expect(chamadas.ordem).toEqual(["connect"]);
  });

  it("espera a instância sair de 'conectado' antes de pedir o código", async () => {
    /**
     * Pedir o QR antes do `close` devolve o código em cache — o bug de novo.
     * Aqui a instância só solta depois de dois ciclos de espera.
     */
    estadoAtual.valor = "conectado";
    desconectarInstancia.mockImplementation(async (i: string) => {
      chamadas.ordem.push(`logout:${i}`);
    });
    let leituras = 0;
    obterEstadoConexao.mockImplementation(async () => {
      leituras += 1;
      return leituras >= 3 ? "desconectado" : "conectado";
    });

    await executar(gerarQrCode("5511977776666", true));

    expect(leituras).toBeGreaterThanOrEqual(3);
    expect(chamadas.ordem).toEqual(["logout:dono-1", "connect"]);
  });

  it("segue para a criação quando a instância ainda não existe", async () => {
    // Primeiro acesso: o logout responde 404 e não pode abortar o fluxo.
    desconectarInstancia.mockRejectedValue(new ErroFalso(404));
    obterQrCode.mockRejectedValueOnce(new ErroFalso(404));
    criarInstancia.mockResolvedValue({
      qrCodeBase64: "data:image/png;base64,BBB",
      codigoPareamento: "E8N44GCE",
      regeracoes: 1,
      tokenInstancia: null,
    });

    const resultado = await executar(gerarQrCode("5511977776666", true));

    expect(criarInstancia).toHaveBeenCalledWith("dono-1", "5511977776666");
    expect(resultado.qrCodeBase64).toBe("data:image/png;base64,BBB");
    expect(resultado.erro).toBeNull();
  });

  it("erra em voz alta se a instância seguir conectada depois do logout", async () => {
    /**
     * Devolver "sem QR e sem erro" aqui é o que fazia a tela voltar ao cartão
     * verde em silêncio: o dono clicava, nada acontecia, e ele repetia o gesto
     * sem nenhuma informação nova.
     */
    estadoAtual.valor = "conectado";
    desconectarInstancia.mockResolvedValue(undefined);
    obterEstadoConexao.mockResolvedValue("conectado");
    obterQrCode.mockResolvedValue({
      base64: null,
      codigo: null,
      codigoPareamento: null,
      regeracoes: null,
    });

    const resultado = await executar(gerarQrCode("5511977776666", true));

    expect(resultado.qrCodeBase64).toBeNull();
    expect(resultado.erro).toMatch(/encerrar a conexão atual/i);
  });
});
