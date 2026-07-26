// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PainelConexao } from "./painel-conexao";

/**
 * Regressão do falso "Código lido".
 *
 * O painel anunciava leitura do QR ~2s depois de ele aparecer, sem ninguém ter
 * escaneado nada, porque tratava o estado `conectando` da Evolution como prova
 * de leitura. `connecting` é o estado **inicial** do socket Baileys — dura toda
 * a sessão de pareamento — e não distingue "QR exibido" de "QR lido".
 *
 * O teste central aqui é o segundo: com o servidor respondendo `conectando`
 * indefinidamente, o QR tem de continuar na tela. Ele existe para impedir que
 * alguém reintroduza um estado intermediário sem um sinal real de leitura, que
 * a Evolution 2.3.7 não expõe por caminho nenhum.
 */

const gerarQrCode = vi.hoisted(() => vi.fn());
const verificarConexao = vi.hoisted(() => vi.fn());

vi.mock("./actions", () => ({ gerarQrCode, verificarConexao }));

/**
 * O objeto do router precisa ser **estável entre renderizações**.
 *
 * Devolver `{ refresh }` novo a cada chamada muda a identidade de `solicitar`
 * (o `useCallback` depende de `router`), o que remonta o efeito da contagem
 * regressiva a cada segundo e reinicia o contador em 40 — o QR nunca expira e
 * a renovação nunca dispara. O `useRouter` real do Next devolve um objeto
 * memoizado do contexto; um mock instável testaria outra coisa.
 */
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

/**
 * `next/image` faz medição e observers que o jsdom não tem. O que importa aqui
 * é que a imagem esteja no documento, com o `alt` que o dono lê.
 */
vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} />
  ),
}));

const QR = "data:image/png;base64,AAA";

function respostaComQr(sobrescritas: Record<string, unknown> = {}) {
  return {
    qrCodeBase64: QR,
    codigoPareamento: null,
    erro: null,
    regeracoes: 1,
    instanciaCriada: false,
    ...sobrescritas,
  };
}

/** Preenche o número e envia — é o que leva o painel ao QR. */
async function gerarCodigo() {
  fireEvent.change(screen.getByLabelText(/Qual o número deste WhatsApp/), {
    target: { value: "11993235002" },
  });

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Conectar/ }));
  });
}

/**
 * Avança os timers fingidos em passos de um segundo.
 *
 * Um `advanceTimersByTimeAsync(240_000)` de uma vez **não** funciona aqui: a
 * renovação do QR é `timer → await gerarQrCode() → setState`, e num salto único
 * os timers seguintes disparam antes de a promessa resolver e o React
 * reconciliar. O ciclo trava depois da primeira renovação — parece bug do
 * componente e é do harness. Em passos de 1s cada tick tem sua volta de
 * microtasks.
 */
async function avancar(ms: number) {
  for (let decorrido = 0; decorrido < ms; decorrido += 1_000) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
  }
}

function qrNaTela() {
  return screen.queryByAltText(/QR code para conectar o WhatsApp/);
}

beforeEach(() => {
  vi.useFakeTimers();
  gerarQrCode.mockReset().mockResolvedValue(respostaComQr());
  verificarConexao.mockReset().mockResolvedValue({
    estado: "conectando",
    erro: null,
  });
  router.refresh.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("PainelConexao", () => {
  it("mostra o QR depois de informar o número", async () => {
    render(<PainelConexao estadoInicial="desconectado" />);
    await gerarCodigo();

    expect(qrNaTela()).not.toBeNull();
    expect(gerarQrCode).toHaveBeenCalledWith("5511993235002");
  });

  it("NÃO anuncia leitura enquanto o servidor responde 'conectando'", async () => {
    render(<PainelConexao estadoInicial="desconectado" />);
    await gerarCodigo();

    // O bug aparecia no primeiro poll, aos 2s. Aqui vão 30s de polling.
    await avancar(30_000);

    expect(verificarConexao).toHaveBeenCalled();
    expect(screen.queryByText(/Código lido/i)).toBeNull();
    expect(screen.queryByText(/Sincronizando/i)).toBeNull();

    // O sintoma pior não era o rótulo errado: era o QR sumir da tela sem
    // nenhuma forma de voltar.
    expect(qrNaTela()).not.toBeNull();
    expect(screen.getByText(/Aguardando a conexão/i)).toBeTruthy();
  });

  it("vai para conectado quando o servidor confirma", async () => {
    render(<PainelConexao estadoInicial="desconectado" />);
    await gerarCodigo();

    verificarConexao.mockResolvedValue({ estado: "conectado", erro: null });
    await avancar(3_000);

    expect(router.refresh).toHaveBeenCalled();
    expect(qrNaTela()).toBeNull();
  });

  it("continua renovando o QR sozinho durante a espera", async () => {
    render(<PainelConexao estadoInicial="desconectado" />);
    await gerarCodigo();
    expect(gerarQrCode).toHaveBeenCalledTimes(1);

    // Com o estado-sumidouro, a contagem regressiva morria no primeiro poll e
    // a renovação nunca mais acontecia.
    gerarQrCode.mockResolvedValue(respostaComQr({ regeracoes: 2 }));
    await avancar(60_000);

    expect(gerarQrCode.mock.calls.length).toBeGreaterThan(1);
    expect(qrNaTela()).not.toBeNull();
  });

  it("oferece saída depois de esgotar as renovações automáticas", async () => {
    render(<PainelConexao estadoInicial="desconectado" />);
    await gerarCodigo();

    // Cada renovação traz um QR novo, então as três contam. Depois disso a
    // tela precisa parar e pedir um clique — estado que o bug tornava
    // inalcançável, deixando o dono sem nenhum botão.
    let regeracoes = 1;
    gerarQrCode.mockImplementation(async () =>
      respostaComQr({ regeracoes: ++regeracoes }),
    );

    await avancar(240_000);

    expect(screen.getByText(/QR code expirou/i)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Gerar novo QR code/i }),
    ).toBeTruthy();
  });

  it("reusa o número informado nas renovações", async () => {
    render(<PainelConexao estadoInicial="desconectado" />);
    await gerarCodigo();

    gerarQrCode.mockResolvedValue(respostaComQr({ regeracoes: 2 }));
    await avancar(60_000);

    // Sem o número a Evolution devolve `pairingCode: null`, e quem está no
    // celular fica sem caminho: lá o QR está no mesmo aparelho que precisaria
    // fotografá-lo.
    for (const chamada of gerarQrCode.mock.calls) {
      expect(chamada[0]).toBe("5511993235002");
    }
  });
});
