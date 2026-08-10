import { delay, http, HttpResponse } from "msw";
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
  ErroEvolutionApi,
  NOME_EVENTOS_WEBHOOK,
  configurarWebhook,
  criarInstancia,
  enviarTexto,
  excluirInstancia,
  obterEstadoConexao,
  obterQrCode,
  traduzirEstado,
} from "./evolution-api";

/**
 * Testes de contrato com a Evolution API via msw: interceptam o fetch real, e o
 * código sob teste não muda em nada. É onde os modos de falha que importam
 * ficam cobertos — 503 de licença, instância inexistente, resposta não-JSON.
 */
const API = "https://evolution.teste";
const INSTANCIA = "11111111-1111-1111-1111-111111111111";

const servidor = setupServer();

/** Última requisição capturada, para asserção de corpo e headers. */
let capturada: { url: string; corpo: unknown; apikey: string | null } | null =
  null;

beforeAll(() => servidor.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  servidor.resetHandlers();
  capturada = null;
});
afterAll(() => servidor.close());

beforeEach(() => {
  process.env.EVOLUTION_API_URL = `${API}/`; // barra final de propósito
  process.env.EVOLUTION_API_ADMIN_KEY = "chave-global";
  process.env.WEBHOOK_BASE_URL = "https://encaixaria.test/";
  process.env.WEBHOOK_SECRET = "segredo-do-webhook";
});

type CorpoJson = Parameters<typeof HttpResponse.json>[0];

function capturar(metodo: "get" | "post", caminho: string, resposta: CorpoJson) {
  servidor.use(
    http[metodo](`${API}${caminho}`, async ({ request }) => {
      capturada = {
        url: request.url,
        corpo: request.body ? await request.json().catch(() => null) : null,
        apikey: request.headers.get("apikey"),
      };
      return HttpResponse.json(resposta);
    }),
  );
}

describe("criarInstancia", () => {
  it("registra a instância com o nome igual ao usuario_id e devolve o QR", async () => {
    capturar("post", "/instance/create", {
      instance: { instanceName: INSTANCIA, status: "created" },
      hash: "token-da-instancia",
      qrcode: { base64: "data:image/png;base64,AAA" },
    });

    const resultado = await criarInstancia(INSTANCIA);

    expect(resultado).toEqual({
      qrCodeBase64: "data:image/png;base64,AAA",
      // Sem `numero`, a Evolution não chama `requestPairingCode` e não devolve
      // código — o QR é o único caminho, que é o caso do desktop.
      codigoPareamento: null,
      // Sem `count` na resposta não há linha de base para comparar.
      regeracoes: null,
      tokenInstancia: "token-da-instancia",
    });
    expect(capturada?.apikey).toBe("chave-global");
    expect(capturada?.corpo).toMatchObject({
      instanceName: INSTANCIA,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
    });
    // Sem número informado, `number` não pode ir no corpo: mandar vazio faria
    // o Baileys tentar parear com string em branco.
    expect(capturada?.corpo).not.toHaveProperty("number");
  });

  it("pede o código de pareamento quando o número é informado", async () => {
    // Caminho do celular: lá o QR está no mesmo aparelho que precisaria
    // fotografá-lo, então o código é o único jeito de conectar.
    capturar("post", "/instance/create", {
      instance: { instanceName: INSTANCIA, status: "created" },
      hash: "token-da-instancia",
      qrcode: { base64: "data:image/png;base64,AAA", pairingCode: "998BDFPH" },
    });

    const resultado = await criarInstancia(INSTANCIA, "5511993235002");

    expect(resultado.codigoPareamento).toBe("998BDFPH");
    expect(capturada?.corpo).toMatchObject({ number: "5511993235002" });
  });

  it("propaga o count do create como linha de base do QR", async () => {
    // O create da 2.3.7 devolve `count: 1`. Assumir zero aqui faria a primeira
    // renovação comparar contra um valor que nunca existiu e concluir "código
    // novo" quando o servidor só devolveu o mesmo QR em cache.
    capturar("post", "/instance/create", {
      instance: { instanceName: INSTANCIA, status: "created" },
      hash: "token-da-instancia",
      qrcode: { base64: "data:image/png;base64,AAA", count: 1 },
    });

    expect((await criarInstancia(INSTANCIA)).regeracoes).toBe(1);
  });

  it("registra webhook com byEvents false e a rota única do tenant", async () => {
    capturar("post", "/instance/create", { hash: "t" });

    await criarInstancia(INSTANCIA);

    const corpo = capturada?.corpo as {
      webhook: {
        url: string;
        byEvents: boolean;
        headers: Record<string, string>;
        events: string[];
      };
    };

    // Com byEvents true a Evolution anexaria o nome do evento à URL e a rota
    // única nunca receberia nada.
    expect(corpo.webhook.byEvents).toBe(false);
    expect(corpo.webhook.url).toBe(
      `https://encaixaria.test/api/webhook/whatsapp/${INSTANCIA}`,
    );
    // O segredo no header é a autenticação real: o UUID da URL não é segredo.
    expect(corpo.webhook.headers["x-encaixaria-secret"]).toBe(
      "segredo-do-webhook",
    );
    expect(corpo.webhook.events).toEqual([
      "MESSAGES_UPSERT",
      "CONNECTION_UPDATE",
      "QRCODE_UPDATED",
      // Único evento que carrega `disconnectionReasonCode`: sem ele o app
      // sabe que a conexão caiu, mas nunca por quê.
      "STATUS_INSTANCE",
    ]);
  });

  it("aceita hash como objeto, formato de algumas versões", async () => {
    capturar("post", "/instance/create", { hash: { apikey: "token-objeto" } });

    expect((await criarInstancia(INSTANCIA)).tokenInstancia).toBe(
      "token-objeto",
    );
  });

  it("não duplica barra quando EVOLUTION_API_URL termina em /", async () => {
    capturar("post", "/instance/create", { hash: "t" });

    await criarInstancia(INSTANCIA);

    expect(capturada?.url).toBe(`${API}/instance/create`);
  });
});

describe("obterQrCode", () => {
  it("devolve base64, código e código de pareamento", async () => {
    capturar("get", `/instance/connect/${INSTANCIA}`, {
      base64: "data:image/png;base64,BBB",
      code: "2@abc",
      pairingCode: "ABCD-1234",
      count: 3,
    });

    expect(await obterQrCode(INSTANCIA)).toEqual({
      base64: "data:image/png;base64,BBB",
      codigo: "2@abc",
      codigoPareamento: "ABCD-1234",
      regeracoes: 3,
    });
  });

  it("devolve nulos quando a resposta vem incompleta", async () => {
    capturar("get", `/instance/connect/${INSTANCIA}`, {});

    expect(await obterQrCode(INSTANCIA)).toEqual({
      base64: null,
      codigo: null,
      codigoPareamento: null,
      regeracoes: null,
    });
  });

  it("preserva count zero, que significa 'ainda não gerou'", async () => {
    // `?? null` trataria 0 como ausente e a tela perderia a diferença entre
    // "nenhuma regeração" e "o servidor não informou".
    capturar("get", `/instance/connect/${INSTANCIA}`, { base64: "x", count: 0 });

    expect((await obterQrCode(INSTANCIA)).regeracoes).toBe(0);
  });

  it("anexa o número na query quando informado", async () => {
    capturar("get", `/instance/connect/${INSTANCIA}`, { base64: "x" });

    await obterQrCode(INSTANCIA, "5511993235002");

    // É o `?number=` que faz a Evolution pedir o código de pareamento ao
    // WhatsApp; sem ele o `pairingCode` volta sempre nulo.
    expect(new URL(capturada!.url).searchParams.get("number")).toBe(
      "5511993235002",
    );
  });

  it("não manda a query sem número", async () => {
    capturar("get", `/instance/connect/${INSTANCIA}`, { base64: "x" });

    await obterQrCode(INSTANCIA);

    expect(new URL(capturada!.url).search).toBe("");
  });
});

describe("traduzirEstado", () => {
  it("mapeia o vocabulário da Evolution — open é pareado", () => {
    expect(traduzirEstado("open")).toBe("conectado");
    expect(traduzirEstado("connecting")).toBe("conectando");
    expect(traduzirEstado("close")).toBe("desconectado");
  });

  it("trata estado desconhecido ou ausente como desconectado", () => {
    // Nunca assumir que a instância está conectada.
    expect(traduzirEstado(undefined)).toBe("desconectado");
    expect(traduzirEstado("estado-novo-que-nao-conhecemos")).toBe(
      "desconectado",
    );
  });
});

describe("obterEstadoConexao", () => {
  it("lê o estado da instância", async () => {
    capturar("get", `/instance/connectionState/${INSTANCIA}`, {
      instance: { state: "open" },
    });

    expect(await obterEstadoConexao(INSTANCIA)).toBe("conectado");
  });
});

describe("enviarTexto", () => {
  it("envia corpo plano { number, text }", async () => {
    capturar("post", `/message/sendText/${INSTANCIA}`, { key: { id: "x" } });

    await enviarTexto(INSTANCIA, "5511999998888@s.whatsapp.net", "Olá!");

    // `{ textMessage: { text } }` é o formato v1 e não funciona na v2.
    expect(capturada?.corpo).toEqual({
      number: "5511999998888@s.whatsapp.net",
      text: "Olá!",
    });
  });

  it("envia para JID @lid sem tentar reconstruir telefone", async () => {
    capturar("post", `/message/sendText/${INSTANCIA}`, {});

    await enviarTexto(INSTANCIA, "154417159582282@lid", "Olá!");

    expect((capturada?.corpo as { number: string }).number).toBe(
      "154417159582282@lid",
    );
  });
});

describe("configurarWebhook", () => {
  it("reenvia a config para instância existente", async () => {
    capturar("post", `/webhook/set/${INSTANCIA}`, { webhook: { enabled: true } });

    await configurarWebhook(INSTANCIA);

    expect(capturada?.corpo).toMatchObject({
      webhook: { enabled: true, byEvents: false },
    });
  });
});

/**
 * A lista de eventos assinados é premissa de segurança da pausa por atendimento
 * humano, não só configuração.
 *
 * Medido na Evolution 2.3.7: o que **nós** enviamos por `sendText` chega como
 * `SEND_MESSAGE`, e o que o **dono** digita chega como `MESSAGES_UPSERT` com
 * `fromMe: true`. `lib/bot/webhook-payload.ts` usa exatamente essa separação para
 * saber que o dono assumiu a conversa.
 *
 * Assinar `SEND_MESSAGE` faria toda mensagem do bot parecer o dono: o bot pausaria
 * a si mesmo em toda conversa que atendesse, em silêncio e sem erro em lugar
 * nenhum. Este teste afirma a **ausência** — no idioma dos testes de SEO que
 * afirmam ausência de markup obsoleto — porque evento a mais não quebra nada de
 * forma visível.
 */
describe("eventos assinados no webhook", () => {
  it("NÃO assina SEND_MESSAGE: quebraria a detecção de atendimento humano", () => {
    expect(NOME_EVENTOS_WEBHOOK).not.toContain("SEND_MESSAGE");
  });

  it("assina os quatro eventos que a aplicação trata", () => {
    expect([...NOME_EVENTOS_WEBHOOK]).toEqual([
      "MESSAGES_UPSERT",
      "CONNECTION_UPDATE",
      "QRCODE_UPDATED",
      "STATUS_INSTANCE",
    ]);
  });
});

describe("erros", () => {
  it("sinaliza 503 LICENSE_REQUIRED com mensagem específica", async () => {
    // A 2.4.0 exige ativação de licença; a V0 roda na 2.3.7.
    servidor.use(
      http.get(`${API}/instance/connectionState/${INSTANCIA}`, () =>
        HttpResponse.json(
          { status: 503, error: "LICENSE_REQUIRED" },
          { status: 503 },
        ),
      ),
    );

    const erro = await obterEstadoConexao(INSTANCIA).catch((e) => e);

    expect(erro).toBeInstanceOf(ErroEvolutionApi);
    expect(erro.licencaAusente).toBe(true);
    expect(erro.status).toBe(503);
    expect(erro.message).toMatch(/não está licenciada/);
    expect(erro.message).toMatch(/2\.3\.7/);
  });

  it("não confunde outro 503 com falta de licença", async () => {
    servidor.use(
      http.get(`${API}/instance/connectionState/${INSTANCIA}`, () =>
        HttpResponse.text("upstream indisponível", { status: 503 }),
      ),
    );

    const erro = await obterEstadoConexao(INSTANCIA).catch((e) => e);

    expect(erro.licencaAusente).toBe(false);
  });

  it("propaga 404 de instância inexistente com o caminho no erro", async () => {
    servidor.use(
      http.get(`${API}/instance/connectionState/${INSTANCIA}`, () =>
        HttpResponse.json({ error: "not found" }, { status: 404 }),
      ),
    );

    const erro = await obterEstadoConexao(INSTANCIA).catch((e) => e);

    expect(erro.status).toBe(404);
    expect(erro.message).toContain("/instance/connectionState/");
  });

  it("não engasga com resposta não-JSON de gateway", async () => {
    servidor.use(
      http.post(`${API}/message/sendText/${INSTANCIA}`, () =>
        HttpResponse.text("<html>502 Bad Gateway</html>", { status: 502 }),
      ),
    );

    const erro = await enviarTexto(INSTANCIA, "x@s.whatsapp.net", "oi").catch(
      (e) => e,
    );

    expect(erro).toBeInstanceOf(ErroEvolutionApi);
    expect(erro.status).toBe(502);
    expect(erro.corpo).toContain("502 Bad Gateway");
  });

  it("falha alto quando falta variável de ambiente", async () => {
    delete process.env.EVOLUTION_API_URL;

    await expect(obterEstadoConexao(INSTANCIA)).rejects.toThrowError(
      /EVOLUTION_API_URL/,
    );
  });

  it("converte timeout em erro tipado, não em DOMException crua", async () => {
    // Um DOMException vazando até a UI virava "erro inesperado ao preparar a
    // conexão", sem nada no log que apontasse a causa.
    process.env.EVOLUTION_TIMEOUT_MS = "50";
    servidor.use(
      http.get(`${API}/instance/connectionState/${INSTANCIA}`, async () => {
        await delay(400);
        return HttpResponse.json({ instance: { state: "open" } });
      }),
    );

    const erro = await obterEstadoConexao(INSTANCIA).catch((e) => e);

    expect(erro).toBeInstanceOf(ErroEvolutionApi);
    expect(erro.status).toBe(504);
    expect(erro.message).toMatch(/não respondeu em 50ms/);
    expect(erro.licencaAusente).toBe(false);

    delete process.env.EVOLUTION_TIMEOUT_MS;
  });

  it("dá ao create um teto maior que o das outras chamadas", async () => {
    /**
     * Regressão: `/instance/create` sobe uma sessão Baileys e gera o QR — medido
     * em ~11s num self-hosted local. Com o teto de 10s que valia para tudo, ele
     * abortava do lado do cliente DEPOIS de ter dado certo no servidor, deixando
     * instância órfã em `connecting` e erro genérico na tela.
     */
    process.env.EVOLUTION_TIMEOUT_MS = "50";
    servidor.use(
      http.post(`${API}/instance/create`, async () => {
        await delay(300);
        return HttpResponse.json({ hash: "t", qrcode: { base64: "AAA" } });
      }),
    );

    // Passa dos 50ms do default sem abortar, porque o create tem teto próprio.
    await expect(criarInstancia(INSTANCIA)).resolves.toMatchObject({
      qrCodeBase64: "AAA",
    });

    delete process.env.EVOLUTION_TIMEOUT_MS;
  });

  it("reconhece 403 de instância já existente", async () => {
    // 403 é fácil confundir com credencial inválida; o caminho de recuperação
    // depende de distinguir os dois.
    servidor.use(
      http.post(`${API}/instance/create`, () =>
        HttpResponse.json(
          {
            status: 403,
            error: "Forbidden",
            response: { message: ['This name "x" is already in use.'] },
          },
          { status: 403 },
        ),
      ),
    );

    const erro = await criarInstancia(INSTANCIA).catch((e) => e);

    expect(erro).toBeInstanceOf(ErroEvolutionApi);
    expect(erro.instanciaJaExiste).toBe(true);
  });

  it("não confunde outro 403 com instância existente", async () => {
    servidor.use(
      http.post(`${API}/instance/create`, () =>
        HttpResponse.json({ error: "invalid apikey" }, { status: 403 }),
      ),
    );

    const erro = await criarInstancia(INSTANCIA).catch((e) => e);

    expect(erro.instanciaJaExiste).toBe(false);
  });
});

describe("excluirInstancia", () => {
  it("usa o verbo DELETE", async () => {
    /**
     * Regressão: com POST a Evolution v2 responde
     * `404 Cannot POST /instance/delete/...`, que parece "instância não existe" e
     * mascara o erro de implementação.
     */
    let metodo: string | null = null;

    servidor.use(
      http.delete(`${API}/instance/delete/${INSTANCIA}`, ({ request }) => {
        metodo = request.method;
        return HttpResponse.json({ status: "SUCCESS" });
      }),
    );

    await excluirInstancia(INSTANCIA);

    expect(metodo).toBe("DELETE");
  });
});
