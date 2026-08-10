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
let conversaRetornada: Resultado;
let resultadoRpc: Resultado;
let chamadasRpc: { nome: string; args: Record<string, unknown> }[];
let tabelasEscritas: string[];

/**
 * `resultadoLista` existe porque a MESMA tabela é lida com `maybeSingle()` (uma
 * linha) e escrita com `.select("id")` (array). Um só resultado faria o
 * compare-and-set de `persistir` ler `data.length` de um objeto, receber
 * `undefined` e concluir "corrida perdida" — o teste morreria antes do efeito.
 */
function criarQueryFake(resultado: Resultado, resultadoLista = resultado) {
  const builder: Record<string, unknown> = {};
  for (const metodo of [
    "select",
    "eq",
    "in",
    "gte",
    "lt",
    "update",
    "insert",
    "upsert",
    "order",
    "limit",
  ]) {
    builder[metodo] = () => builder;
  }
  builder.maybeSingle = () => Promise.resolve(resultado);
  builder.then = (resolver: (valor: Resultado) => unknown) =>
    Promise.resolve(resultadoLista).then(resolver);
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  criarClienteAdmin: () => ({
    from: (tabela: string) => {
      tabelasEscritas.push(tabela);
      // `perfis` e `conversas_estado` são configuráveis: os testes daqui param
      // num dos gates ou logo depois, e o resto do fluxo da conversa é coberto
      // em `engine-fluxo`.
      if (tabela === "perfis") return criarQueryFake(perfilRetornado);
      if (tabela === "conversas_estado") {
        return criarQueryFake(conversaRetornada, {
          data: [{ id: "conversa-1" }],
          error: null,
        });
      }
      return criarQueryFake({ data: [], error: null });
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
  // Sem conversa em curso é o default, como numa primeira mensagem.
  conversaRetornada = { data: null, error: null };
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

/**
 * O gate de pausa para atendimento humano. A regra da janela está em
 * `lib/bot/pausa.test.ts`; o que só existe aqui é o fio: que o webhook silencia,
 * que **não** toca no estado da conversa, e que a pausa de uma conversa não
 * atinge outra.
 */
describe("pausa para atendimento humano", () => {
  const mensagem = {
    event: "messages.upsert",
    sender: JID_DONO,
    data: {
      key: { remoteJid: "5511977776666@s.whatsapp.net", id: "MSG-NOVA", fromMe: false },
      message: { conversation: "oi" },
      pushName: "Cliente",
    },
  };

  function conversa(campos: Record<string, unknown> = {}) {
    return {
      data: {
        id: "conversa-1",
        etapa_atual_id: null,
        fluxo_snapshot: [],
        dados_temporarios: {},
        ultima_mensagem_id: "MSG-ANTERIOR",
        versao: 3,
        atualizado_em: new Date().toISOString(),
        pausado_ate: null,
        ...campos,
      },
      error: null,
    };
  }

  /** Uma hora à frente: dono acabou de intervir. */
  function daquiUmaHora() {
    return new Date(Date.now() + 60 * 60_000).toISOString();
  }

  it("silencia enquanto a janela está aberta", async () => {
    conversaRetornada = conversa({ pausado_ate: daquiUmaHora() });

    const corpo = await (await chamar(mensagem)).json();

    expect(corpo).toMatchObject({
      detalhe: "conversa pausada para atendimento humano",
    });
  });

  /**
   * O ponto mais importante do gate: sair antes de qualquer escrita.
   *
   * Se o caminho de pausa gravasse `ultima_mensagem_id`, ele estaria afirmando
   * que processou uma mensagem que ignorou. E se zerasse o estado, o cliente
   * parado na etapa de horário voltaria para o começo quando o dono retomasse.
   */
  it("não escreve nada: nem estado da conversa, nem agendamento", async () => {
    conversaRetornada = conversa({
      pausado_ate: daquiUmaHora(),
      etapa_atual_id: "etapa-horario",
      dados_temporarios: { __horario_fase: "dias" },
    });

    await chamar(mensagem);

    // `conversas_estado` aparece uma vez só — a leitura do gate.
    expect(tabelasEscritas.filter((t) => t === "conversas_estado")).toHaveLength(1);
    expect(chamadasRpc).toEqual([]);
  });

  it("janela vencida volta a atender normalmente", async () => {
    conversaRetornada = conversa({
      pausado_ate: new Date(Date.now() - 60_000).toISOString(),
    });

    const corpo = await (await chamar(mensagem)).json();

    expect(corpo).not.toMatchObject({
      detalhe: "conversa pausada para atendimento humano",
    });
  });

  it("sem pausa registrada, atende como antes", async () => {
    conversaRetornada = conversa({ pausado_ate: null });

    const corpo = await (await chamar(mensagem)).json();

    expect(corpo).not.toMatchObject({
      detalhe: "conversa pausada para atendimento humano",
    });
  });

  /**
   * Pausa é por conversa, não por tenant: o dono atendendo um cliente à mão não
   * é motivo para o bot parar de atender os outros. A leitura é filtrada por
   * `remote_jid`, então uma conversa sem linha nenhuma não herda pausa alguma.
   */
  it("conversa sem linha não herda a pausa de outra", async () => {
    conversaRetornada = { data: null, error: null };

    const corpo = await (await chamar(mensagem)).json();

    expect(corpo).not.toMatchObject({
      detalhe: "conversa pausada para atendimento humano",
    });
  });

  /**
   * A ordem entre os dois gates que silenciam. Assinatura inválida vence, e não
   * por preferência: o gate comercial roda antes de a linha da conversa ser
   * lida, então nem há `pausado_ate` em mãos naquele ponto.
   */
  /** O dono digitando: `fromMe: true` num `messages.upsert`. */
  const doDono = {
    event: "messages.upsert",
    sender: JID_DONO,
    data: {
      key: { remoteJid: "5511977776666@s.whatsapp.net", id: "MSG-DONO", fromMe: true },
      message: { conversation: "oi, posso te encaixar às 14h" },
      pushName: "Paulo",
    },
  };

  it("mensagem do dono abre a janela de pausa", async () => {
    const corpo = await (await chamar(doDono)).json();

    expect(corpo).toMatchObject({ detalhe: "pausado por atendimento humano" });
    expect(tabelasEscritas).toContain("conversas_estado");
  });

  /**
   * O bot não responde ao cliente quando o dono digita. Quem está do outro lado
   * está falando com o dono naquele instante — qualquer mensagem nossa seria o bot
   * se intrometendo na conversa que ele saiu da frente para permitir.
   */
  it("não responde nada ao cliente nem chama RPC nenhuma", async () => {
    const { enviarTexto } = await import("@/lib/evolution-api");
    // O `vi.fn()` do mock de módulo é o mesmo objeto em todos os testes do
    // arquivo, e `restoreAllMocks` não zera histórico de chamada.
    vi.mocked(enviarTexto).mockClear();

    await chamar(doDono);

    expect(enviarTexto).not.toHaveBeenCalled();
    expect(chamadasRpc).toEqual([]);
  });

  /** Áudio do dono é intervenção igual — e é como muito dono responde. */
  it("pausa também quando o dono manda áudio, sem texto nenhum", async () => {
    const corpo = await (
      await chamar({
        ...doDono,
        data: { ...doDono.data, message: { audioMessage: { seconds: 9 } } },
      })
    ).json();

    expect(corpo).toMatchObject({ detalhe: "pausado por atendimento humano" });
  });

  /**
   * Num tenant bloqueado o bot já está silencioso, então pausar seria escrita sem
   * efeito — e escrita é justamente o que não se faz por conta de quem não paga.
   */
  it("tenant com assinatura inválida não gera escrita de pausa", async () => {
    perfilRetornado = {
      data: perfil({ trial_bloqueado_em: "2026-07-01T00:00:00Z" }),
      error: null,
    };
    vi.spyOn(console, "info").mockImplementation(() => {});

    const corpo = await (await chamar(doDono)).json();

    expect(corpo).toMatchObject({ detalhe: "assinatura inválida" });
    expect(tabelasEscritas).not.toContain("conversas_estado");
  });

  /**
   * A retomada. A regra de reapresentar sem interpretar a mensagem está em
   * `lib/bot/engine-fluxo.test.ts`; aqui só se afirma que o webhook escolhe esse
   * caminho quando encontra uma janela vencida.
   */
  it("janela vencida faz o bot voltar avisando, sem consumir a mensagem", async () => {
    const { AVISO_RETOMADA } = await import("@/lib/bot/engine-fluxo");
    const { enviarTexto } = await import("@/lib/evolution-api");
    vi.mocked(enviarTexto).mockClear();

    // Etapa no snapshot: é dela que a retomada reapresenta a pergunta. Sem
    // snapshot, a engine cairia em `iniciar` e o aviso não teria o que preceder.
    const etapa = {
      id: "etapa-obs",
      ordem: 1,
      tipo: "texto_livre",
      pergunta_texto: "Alguma observação?",
      opcoes: null,
      campo_destino: "observacao",
      obrigatorio: false,
    };

    conversaRetornada = conversa({
      pausado_ate: new Date(Date.now() - 60_000).toISOString(),
      etapa_atual_id: etapa.id,
      fluxo_snapshot: [etapa],
    });

    await chamar(mensagem);

    const textos = vi.mocked(enviarTexto).mock.calls.map((c) => c[2]);
    expect(textos[0]).toBe(AVISO_RETOMADA);
  });

  /**
   * O cliente pedindo uma pessoa. O léxico e o intercepto são de
   * `engine-fluxo.test.ts`; aqui se afirma o que só o adaptador faz — gravar a
   * pausa e **avisar o dono**, sem o que a feature seria pior que não existir (o
   * cliente ouviria "avisei o pessoal" e ninguém ficaria sabendo).
   */
  it("pedido de atendente pausa e avisa o dono no self-chat dele", async () => {
    const { AVISO_CHAMANDO_PESSOA } = await import("@/lib/bot/engine-fluxo");
    const { enviarTexto } = await import("@/lib/evolution-api");
    vi.mocked(enviarTexto).mockClear();

    await chamar({
      ...mensagem,
      data: { ...mensagem.data, message: { conversation: "atendente" } },
    });

    const chamadas = vi.mocked(enviarTexto).mock.calls;

    // O aviso ao dono sai primeiro: efeitos rodam antes do envio ao cliente.
    expect(chamadas[0][1]).toBe(JID_DONO);
    expect(chamadas[0][2]).toContain("pediu para falar com uma pessoa");
    // E identifica QUEM pediu, senão o dono tem de abrir todas as conversas.
    expect(chamadas[0][2]).toContain("Cliente");

    expect(chamadas[1][1]).toBe("5511977776666@s.whatsapp.net");
    expect(chamadas[1][2]).toBe(AVISO_CHAMANDO_PESSOA);

    expect(tabelasEscritas).toContain("conversas_estado");
  });

  /**
   * Fail-open: sem `sender` no payload não há para onde avisar, mas a pausa já foi
   * gravada e o cliente já foi respondido. Derrubar a requisição faria a Evolution
   * reentregar o webhook e o cliente receber a mesma mensagem várias vezes.
   */
  it("sem JID do dono no payload, ainda pausa e responde ao cliente", async () => {
    const { enviarTexto } = await import("@/lib/evolution-api");
    vi.mocked(enviarTexto).mockClear();
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const semSender = {
      event: "messages.upsert",
      data: { ...mensagem.data, message: { conversation: "atendente" } },
    };

    const resposta = await chamar(semSender);

    expect(resposta.status).toBe(200);
    const destinos = vi.mocked(enviarTexto).mock.calls.map((c) => c[1]);
    expect(destinos).toEqual(["5511977776666@s.whatsapp.net"]);
  });

  it("assinatura inválida silencia antes de a pausa ser consultada", async () => {
    perfilRetornado = {
      data: perfil({ trial_bloqueado_em: "2026-07-01T00:00:00Z" }),
      error: null,
    };
    conversaRetornada = conversa({ pausado_ate: daquiUmaHora() });
    vi.spyOn(console, "info").mockImplementation(() => {});

    const corpo = await (await chamar(mensagem)).json();

    expect(corpo).toMatchObject({ detalhe: "assinatura inválida" });
    expect(tabelasEscritas).not.toContain("conversas_estado");
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
