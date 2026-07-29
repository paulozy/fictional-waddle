import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashNumeroWhatsapp } from "@/lib/trial-numero";

/**
 * Cobre a **orquestração** da reivindicação de número do trial, não a regra.
 *
 * A regra de decisão está em `lib/assinatura.test.ts`, a leitura de payload em
 * `lib/bot/webhook-payload.test.ts` e o hash em `lib/trial-numero.test.ts`. O
 * que só existe aqui, e é a parte relevante para segurança, é o fio: quando a
 * reivindicação dispara, quando **não** dispara, que os fail-safes permissivos
 * não derrubam a atualização de conexão, e que o número nunca chega a um log.
 */

const SEGREDO = "segredo-do-webhook";
const PEPPER = "pepper-de-teste";
const TENANT = "11111111-1111-1111-1111-111111111111";
const NUMERO = "5511999998888";
const JID_DONO = `${NUMERO}@s.whatsapp.net`;

type Resultado = { data: unknown; error: unknown };

let perfilRetornado: Resultado;
let resultadoRpc: Resultado;
let chamadasRpc: { nome: string; args: Record<string, unknown> }[];
let tabelasEscritas: string[];

function criarQueryFake(resultado: Resultado) {
  const builder: Record<string, unknown> = {};
  for (const metodo of [
    "select",
    "eq",
    "in",
    "gte",
    "lt",
    "update",
    "insert",
    "order",
    "limit",
  ]) {
    builder[metodo] = () => builder;
  }
  builder.maybeSingle = () => Promise.resolve(resultado);
  builder.then = (resolver: (valor: Resultado) => unknown) =>
    Promise.resolve(resultado).then(resolver);
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  criarClienteAdmin: () => ({
    from: (tabela: string) => {
      tabelasEscritas.push(tabela);
      // Só `perfis` é configurável: os testes daqui param no gate ou logo
      // depois, e o resto do fluxo da conversa é coberto em `engine-fluxo`.
      return criarQueryFake(
        tabela === "perfis" ? perfilRetornado : { data: [], error: null },
      );
    },
    rpc: (nome: string, args: Record<string, unknown>) => {
      chamadasRpc.push({ nome, args });
      return Promise.resolve(resultadoRpc);
    },
  }),
}));

vi.mock("@/lib/evolution-api", () => ({
  enviarTexto: vi.fn(),
  ErroEvolutionApi: class ErroEvolutionApi extends Error {},
  // Comportamento real: só `open` é conectado.
  traduzirEstado: (estado: string | undefined) =>
    estado === "open"
      ? "conectado"
      : estado === "connecting"
        ? "conectando"
        : "desconectado",
}));

const { POST } = await import("./route");

function chamar(payload: unknown, nomeHeader = "x-encaixaria-secret") {
  return POST(
    new Request("http://localhost/api/webhook/whatsapp/instancia", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [nomeHeader]: SEGREDO,
      },
      body: JSON.stringify(payload),
    }),
    { params: Promise.resolve({ instance: TENANT }) },
  );
}

function conexao(estado: string, dados: Record<string, unknown> = {}) {
  return {
    event: "connection.update",
    sender: JID_DONO,
    data: { state: estado, ...dados },
  };
}

function perfil(campos: Record<string, unknown> = {}) {
  return {
    id: TENANT,
    fuso_horario: "America/Sao_Paulo",
    passo_slot_minutos: 30,
    antecedencia_minima_minutos: 60,
    antecedencia_maxima_dias: 30,
    status_conexao_whatsapp: "conectado",
    status_assinatura: "trial",
    trial_expira_em: "2099-01-01T00:00:00Z",
    trial_bloqueado_em: null,
    ...campos,
  };
}

/** Só as chamadas à RPC do trial — o webhook também usa `confirmar_agendamento`. */
function reivindicacoes() {
  return chamadasRpc.filter((c) => c.nome === "reivindicar_numero_trial");
}

beforeEach(() => {
  process.env.WEBHOOK_SECRET = SEGREDO;
  process.env.TRIAL_HASH_PEPPER = PEPPER;
  delete process.env.BOT_JIDS_PERMITIDOS;
  perfilRetornado = { data: perfil(), error: null };
  resultadoRpc = { data: "liberado", error: null };
  chamadasRpc = [];
  tabelasEscritas = [];
  vi.restoreAllMocks();
});

describe("reivindicação de número no evento de conexão", () => {
  it("reivindica com o hash do número quando pareia", async () => {
    const resposta = await chamar(conexao("open", { wuid: JID_DONO }));

    expect(resposta.status).toBe(200);
    expect(reivindicacoes()).toEqual([
      {
        nome: "reivindicar_numero_trial",
        args: {
          p_usuario_id: TENANT,
          p_numero_hash: hashNumeroWhatsapp(NUMERO, PEPPER),
        },
      },
    ]);
  });

  /**
   * O trial é consumido ao conectar, não ao desconectar. Reivindicar em
   * `close` gravaria o número de quem só teve a sessão caída.
   */
  it("não reivindica quando o estado não é conectado", async () => {
    await chamar(conexao("close", { wuid: JID_DONO }));
    await chamar(conexao("connecting", { wuid: JID_DONO }));

    expect(reivindicacoes()).toEqual([]);
  });

  it("é idempotente por chamada: cada evento reivindica o mesmo hash", async () => {
    await chamar(conexao("open", { wuid: JID_DONO }));
    await chamar(conexao("open", { wuid: JID_DONO }));

    const hashes = reivindicacoes().map((c) => c.args.p_numero_hash);
    expect(hashes).toEqual([hashes[0], hashes[0]]);
  });

  it("ignora instância desconhecida sem reivindicar nada", async () => {
    perfilRetornado = { data: null, error: null };

    await chamar(conexao("open", { wuid: JID_DONO }));

    expect(reivindicacoes()).toEqual([]);
  });
});

describe("fail-safes permissivos da reivindicação", () => {
  /**
   * Direção oposta ao gate de assinatura, de propósito: pepper ausente é erro
   * nosso de configuração, e bloquear todo mundo que conecta seria pior que
   * deixar um trial reciclável passar.
   */
  it("sem TRIAL_HASH_PEPPER, não chama a RPC e ainda grava a conexão", async () => {
    delete process.env.TRIAL_HASH_PEPPER;
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});

    const resposta = await chamar(conexao("open", { wuid: JID_DONO }));

    expect(resposta.status).toBe(200);
    expect(reivindicacoes()).toEqual([]);
    expect(tabelasEscritas).toContain("perfis");
    expect(erro).toHaveBeenCalled();
  });

  it("sem número no payload, não chama a RPC e ainda grava a conexão", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const resposta = await chamar({
      event: "connection.update",
      data: { state: "open" },
    });

    expect(resposta.status).toBe(200);
    expect(reivindicacoes()).toEqual([]);
    expect(tabelasEscritas).toContain("perfis");
  });

  it("erro na RPC não derruba o webhook", async () => {
    resultadoRpc = { data: null, error: { code: "42501" } };
    vi.spyOn(console, "error").mockImplementation(() => {});

    const resposta = await chamar(conexao("open", { wuid: JID_DONO }));

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ ok: true });
  });

  /** Ver o comentário do domínio em `extrairNumeroDono`. */
  it("avisa quando o dono chega em formato @lid, mas segue reivindicando", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});

    await chamar(conexao("open", { wuid: "154417159582282@lid" }));

    expect(reivindicacoes()).toHaveLength(1);
    expect(aviso).toHaveBeenCalledWith(
      expect.stringContaining("formato inesperado"),
      expect.objectContaining({ dominio: "lid" }),
    );
  });
});

describe("reivindicação pelo caminho de mensagem", () => {
  const mensagem = {
    event: "messages.upsert",
    sender: JID_DONO,
    data: {
      key: { remoteJid: "5511977776666@s.whatsapp.net", id: "MSG1", fromMe: false },
      message: { conversation: "oi" },
      pushName: "Cliente",
    },
  };

  /**
   * Rede de segurança para `CONNECTION_UPDATE` perdido: a Evolution não reenvia,
   * e sem isto o número nunca entraria no livro-caixa — a conta atenderia
   * clientes com o trial fora do registro.
   */
  it("reivindica quando corrige status de conexão vencido", async () => {
    perfilRetornado = {
      data: perfil({ status_conexao_whatsapp: "desconectado" }),
      error: null,
    };

    await chamar(mensagem);

    expect(reivindicacoes()).toHaveLength(1);
    expect(reivindicacoes()[0].args.p_numero_hash).toBe(
      hashNumeroWhatsapp(NUMERO, PEPPER),
    );
  });

  /** Já conectado é o caso comum: não gastar uma RPC em toda mensagem. */
  it("não reivindica quando o status já estava correto", async () => {
    await chamar(mensagem);

    expect(reivindicacoes()).toEqual([]);
  });

  /**
   * A reivindicação precisa vir ANTES do gate: um tenant bloqueado ainda tem o
   * livro-caixa atualizado, e é o gate que decide silenciar.
   */
  it("reivindica mesmo com assinatura inválida, e o bot silencia depois", async () => {
    perfilRetornado = {
      data: perfil({
        status_conexao_whatsapp: "desconectado",
        trial_bloqueado_em: "2026-07-01T00:00:00Z",
      }),
      error: null,
    };
    vi.spyOn(console, "info").mockImplementation(() => {});

    const corpo = await (await chamar(mensagem)).json();

    expect(reivindicacoes()).toHaveLength(1);
    expect(corpo).toMatchObject({ detalhe: "assinatura inválida" });
  });
});

describe("privacidade dos logs", () => {
  /**
   * O número é dado pessoal e o hash é a chave do livro-caixa: nenhum dos dois
   * pode vazar para log. Varre todos os argumentos de todos os níveis de console
   * em vez de checar chamada por chamada, para que um `console.log` novo em
   * qualquer ponto do fluxo também caia neste teste.
   */
  it("nunca registra o número nem o hash", async () => {
    const espioes = (["log", "info", "warn", "error"] as const).map((nivel) =>
      vi.spyOn(console, nivel).mockImplementation(() => {}),
    );
    const hash = hashNumeroWhatsapp(NUMERO, PEPPER);

    await chamar(conexao("open", { wuid: JID_DONO }));
    resultadoRpc = { data: "bloqueado", error: null };
    await chamar(conexao("open", { wuid: JID_DONO }));
    resultadoRpc = { data: null, error: { code: "42501" } };
    await chamar(conexao("open", { wuid: JID_DONO }));

    const registrado = JSON.stringify(
      espioes.flatMap((espiao) => espiao.mock.calls),
    );
    expect(registrado).not.toContain(NUMERO);
    expect(registrado).not.toContain(hash);
  });
});

describe("transição do nome do header secreto", () => {
  /**
   * O rename trocou `x-agendazap-secret` por `x-encaixaria-secret`, mas a
   * configuração do webhook vive **do lado da Evolution**: uma instância já
   * pareada segue mandando o nome antigo até `configurarWebhook` rodar nela de
   * novo, o que hoje só acontece dentro de `gerarQrCode`. Se o leitor aceitasse
   * apenas o nome novo, todo webhook cairia **em silêncio** — bot mudo e painel
   * dizendo que a conexão está de pé.
   *
   * Quando todas as instâncias tiverem reconectado, o caso do header legado
   * deve virar uma asserção de 401, e o ramo em `route.ts` sai junto.
   */
  it("aceita o header novo", async () => {
    const resposta = await chamar(conexao("open", { wuid: JID_DONO }));
    expect(resposta.status).toBe(200);
  });

  it("ainda aceita o header legado, para instância já pareada", async () => {
    const resposta = await chamar(
      conexao("open", { wuid: JID_DONO }),
      "x-agendazap-secret",
    );
    expect(resposta.status).toBe(200);
  });

  it("rejeita qualquer outro nome de header", async () => {
    const resposta = await chamar(
      conexao("open", { wuid: JID_DONO }),
      "x-outro-secret",
    );
    expect(resposta.status).toBe(401);
  });
});
