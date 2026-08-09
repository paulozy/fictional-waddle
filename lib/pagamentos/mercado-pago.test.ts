import { http, HttpResponse } from "msw";
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

import {
  ErroMercadoPago,
  consultarPagamento,
  criarPagamentoPix,
  estornarPagamento,
  renovarToken,
  trocarCodigoPorToken,
  urlDeAutorizacao,
} from "./mercado-pago";

/**
 * Contrato com o Mercado Pago via msw: intercepta o fetch real, e o código sob
 * teste não muda em nada.
 *
 * A cobertura que importa aqui não é o caminho feliz — é o que acontece quando o
 * MP responde algo inesperado, porque cada um desses casos vira, em produção, um
 * cliente esperando um Pix que não chegou.
 */
const API = "https://mp.teste";

const servidor = setupServer();

let capturada: {
  url: string;
  corpo: unknown;
  autorizacao: string | null;
  idempotencia: string | null;
} | null = null;

beforeAll(() => servidor.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  servidor.resetHandlers();
  capturada = null;
});
afterAll(() => servidor.close());

beforeEach(() => {
  process.env.MERCADO_PAGO_API_URL = `${API}/`; // barra final de propósito
  process.env.MERCADO_PAGO_CLIENT_ID = "client-id-teste";
  process.env.MERCADO_PAGO_CLIENT_SECRET = "client-secret-teste";
  delete process.env.MERCADO_PAGO_EMAIL_PAGADOR;
});

function capturar(rota: string, resposta: unknown, status = 200) {
  return http.post(`${API}${rota}`, async ({ request }) => {
    capturada = {
      url: request.url,
      corpo: await request.json().catch(() => null),
      autorizacao: request.headers.get("authorization"),
      idempotencia: request.headers.get("x-idempotency-key"),
    };
    return HttpResponse.json(resposta as Record<string, unknown>, { status });
  });
}

const TOKENS_OK = {
  access_token: "APP_USR-access",
  refresh_token: "TG-refresh",
  expires_in: 15_552_000,
  user_id: 987654321,
};

describe("OAuth", () => {
  it("troca o código pelo par de tokens", async () => {
    servidor.use(capturar("/oauth/token", TOKENS_OK));

    const tokens = await trocarCodigoPorToken("codigo-123", "https://app/cb");

    expect(tokens.accessToken).toBe("APP_USR-access");
    expect(tokens.refreshToken).toBe("TG-refresh");
    expect(tokens.contaExternaId).toBe("987654321");
    expect(tokens.expiraEm.getTime()).toBeGreaterThan(Date.now());

    expect(capturada?.corpo).toMatchObject({
      grant_type: "authorization_code",
      code: "codigo-123",
      redirect_uri: "https://app/cb",
      client_secret: "client-secret-teste",
    });
  });

  it("renova e devolve o refresh_token NOVO", async () => {
    // O refresh rotaciona (medido no spike). Quem chama tem de gravar o par
    // novo; guardar o antigo mata a conexão em silêncio 180 dias depois.
    servidor.use(
      capturar("/oauth/token", { ...TOKENS_OK, refresh_token: "TG-rotacionado" }),
    );

    const tokens = await renovarToken("TG-antigo");

    expect(tokens.refreshToken).toBe("TG-rotacionado");
    expect(capturada?.corpo).toMatchObject({
      grant_type: "refresh_token",
      refresh_token: "TG-antigo",
    });
  });

  it("falha alto quando não vem refresh_token", async () => {
    // Quase sempre é `offline_access` desmarcado no painel. Sem falhar aqui, o
    // sintoma apareceria só meses depois.
    servidor.use(
      capturar("/oauth/token", { ...TOKENS_OK, refresh_token: undefined }),
    );

    await expect(trocarCodigoPorToken("c", "u")).rejects.toThrow(
      /offline_access/,
    );
  });

  it("monta a URL de autorização com state", () => {
    const url = new URL(urlDeAutorizacao({ redirectUri: "https://a/cb", state: "xyz" }));

    expect(url.origin + url.pathname).toBe(
      "https://auth.mercadopago.com.br/authorization",
    );
    expect(url.searchParams.get("client_id")).toBe("client-id-teste");
    expect(url.searchParams.get("state")).toBe("xyz");
    expect(url.searchParams.get("redirect_uri")).toBe("https://a/cb");
  });
});

describe("criarPagamentoPix", () => {
  const RESPOSTA_PIX = {
    id: 1234567890,
    status: "pending",
    collector_id: 987654321,
    point_of_interaction: {
      transaction_data: { qr_code: "00020126...5802BR6304ABCD" },
    },
  };

  const ARGS = {
    accessToken: "APP_USR-do-dono",
    valorCentavos: 2000,
    descricao: "Sinal — Corte",
    referenciaExterna: "cobranca-uuid",
    expiraEm: new Date("2026-08-09T15:30:00.000Z"),
    urlNotificacao: "https://app/api/webhook/pagamento/mercadopago",
    chaveIdempotencia: "cobranca-uuid",
  };

  it("cria com o token do DONO e devolve o copia-e-cola", async () => {
    servidor.use(capturar("/v1/payments", RESPOSTA_PIX));

    const pix = await criarPagamentoPix(ARGS);

    expect(pix.pagamentoId).toBe("1234567890");
    expect(pix.copiaECola).toBe("00020126...5802BR6304ABCD");
    // `collector_id` é o dono por construção — é o que sustenta "nunca
    // custodiamos".
    expect(pix.collectorId).toBe("987654321");
    expect(capturada?.autorizacao).toBe("Bearer APP_USR-do-dono");
  });

  it("manda a chave de idempotência", async () => {
    // Sem ela, uma retentativa de rede geraria uma SEGUNDA cobrança para o mesmo
    // agendamento, e o cliente poderia pagar as duas.
    servidor.use(capturar("/v1/payments", RESPOSTA_PIX));
    await criarPagamentoPix(ARGS);
    expect(capturada?.idempotencia).toBe("cobranca-uuid");
  });

  it("converte centavos para reais só na borda", async () => {
    servidor.use(capturar("/v1/payments", RESPOSTA_PIX));
    await criarPagamentoPix({ ...ARGS, valorCentavos: 1999 });
    expect(capturada?.corpo).toMatchObject({ transaction_amount: 19.99 });
  });

  it("manda date_of_expiration com offset explícito, não Zulu", async () => {
    // `Z` é o tipo de coisa que passa no sandbox e é recusada em produção.
    servidor.use(capturar("/v1/payments", RESPOSTA_PIX));
    await criarPagamentoPix(ARGS);

    const corpo = capturada?.corpo as { date_of_expiration: string };
    expect(corpo.date_of_expiration).toBe("2026-08-09T15:30:00.000+00:00");
    expect(corpo.date_of_expiration).not.toMatch(/Z$/);
  });

  it("manda payment_method_id pix, referência e notificação", async () => {
    servidor.use(capturar("/v1/payments", RESPOSTA_PIX));
    await criarPagamentoPix(ARGS);

    expect(capturada?.corpo).toMatchObject({
      payment_method_id: "pix",
      external_reference: "cobranca-uuid",
      notification_url: "https://app/api/webhook/pagamento/mercadopago",
      payer: { email: "pagamentos@encaixaria.com.br" },
    });
  });

  it("NÃO manda application_fee — não há comissão sobre a transação do dono", async () => {
    servidor.use(capturar("/v1/payments", RESPOSTA_PIX));
    await criarPagamentoPix(ARGS);
    expect(capturada?.corpo).not.toHaveProperty("application_fee");
  });

  it("falha quando o MP não devolve o código Pix", async () => {
    // Inventar um payload a partir de chave guardada seria dinheiro indo para o
    // lugar errado, com falha silenciosa do nosso lado.
    servidor.use(
      capturar("/v1/payments", { id: 1, point_of_interaction: {} }),
    );

    await expect(criarPagamentoPix(ARGS)).rejects.toThrow(/código Pix/);
  });

  it("classifica 401 como credencial inválida", async () => {
    servidor.use(capturar("/v1/payments", { message: "invalid token" }, 401));

    // Significa que o dono desautorizou no painel do MP: a saída é reconectar,
    // não "tente de novo".
    const erro = await criarPagamentoPix(ARGS).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroMercadoPago);
    expect(erro.credencialInvalida).toBe(true);
  });

  it("não classifica 500 como credencial inválida", async () => {
    servidor.use(capturar("/v1/payments", { message: "boom" }, 500));
    const erro = await criarPagamentoPix(ARGS).catch((e) => e);
    expect(erro.credencialInvalida).toBe(false);
    expect(erro.status).toBe(500);
  });

  it("converte falha de transporte em erro tipado", async () => {
    servidor.use(
      http.post(`${API}/v1/payments`, () => HttpResponse.error()),
    );

    const erro = await criarPagamentoPix(ARGS).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroMercadoPago);
    expect(erro.status).toBe(503);
  });
});

describe("consultarPagamento", () => {
  it("marca aprovado só em 'approved'", async () => {
    servidor.use(
      http.get(`${API}/v1/payments/123`, () =>
        HttpResponse.json({
          id: 123,
          status: "approved",
          transaction_amount: 20,
          external_reference: "cob-1",
        }),
      ),
    );

    const pago = await consultarPagamento({
      accessToken: "t",
      pagamentoId: "123",
    });

    expect(pago.aprovado).toBe(true);
    expect(pago.valorCentavos).toBe(2000);
    expect(pago.referenciaExterna).toBe("cob-1");
  });

  it("não considera 'pending' como pago", async () => {
    servidor.use(
      http.get(`${API}/v1/payments/123`, () =>
        HttpResponse.json({ id: 123, status: "pending", transaction_amount: 20 }),
      ),
    );

    expect(
      (await consultarPagamento({ accessToken: "t", pagamentoId: "123" }))
        .aprovado,
    ).toBe(false);
  });

  it("converte reais para centavos sem erro de float", async () => {
    servidor.use(
      http.get(`${API}/v1/payments/123`, () =>
        HttpResponse.json({
          id: 123,
          status: "approved",
          transaction_amount: 19.99,
        }),
      ),
    );

    expect(
      (await consultarPagamento({ accessToken: "t", pagamentoId: "123" }))
        .valorCentavos,
    ).toBe(1999);
  });

  it("escapa o id na URL", async () => {
    servidor.use(
      http.get(`${API}/v1/payments/:id`, ({ params }) =>
        HttpResponse.json({ id: params.id, status: "approved" }),
      ),
    );

    await expect(
      consultarPagamento({ accessToken: "t", pagamentoId: "a/b" }),
    ).resolves.toBeTruthy();
  });
});

describe("estornarPagamento", () => {
  it("chama o endpoint de refund com idempotência", async () => {
    servidor.use(capturar("/v1/payments/123/refunds", { id: 1, status: "approved" }));

    await estornarPagamento({
      accessToken: "t",
      pagamentoId: "123",
      chaveIdempotencia: "estorno-cob-1",
    });

    expect(capturada?.idempotencia).toBe("estorno-cob-1");
    expect(capturada?.autorizacao).toBe("Bearer t");
  });
});
