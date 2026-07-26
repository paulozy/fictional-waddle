import { describe, expect, it } from "vitest";
import {
  classificarEvento,
  extrairMotivoDesconexao,
  extrairContagemQrCode,
  ehBroadcast,
  ehGrupo,
  extrairEstadoConexao,
  extrairMensagem,
  extrairNumeroDono,
  jidPermitido,
  lerListaPermitidos,
  normalizarIdentificadorJid,
  telefoneDoJid,
} from "./webhook-payload";

/** Payload realista de MESSAGES_UPSERT da Evolution API v2. */
function payloadMensagem(sobrescritas: {
  fromMe?: boolean;
  remoteJid?: string;
  id?: string;
  pushName?: string | null;
  message?: unknown;
} = {}) {
  return {
    event: "messages.upsert",
    instance: "11111111-1111-1111-1111-111111111111",
    data: {
      key: {
        remoteJid: sobrescritas.remoteJid ?? "5511999998888@s.whatsapp.net",
        fromMe: sobrescritas.fromMe ?? false,
        id: sobrescritas.id ?? "3EB0A1B2C3D4E5F6",
      },
      pushName:
        sobrescritas.pushName === undefined ? "Joana" : sobrescritas.pushName,
      message:
        sobrescritas.message === undefined
          ? { conversation: "1" }
          : sobrescritas.message,
      messageType: "conversation",
      messageTimestamp: 1786000000,
    },
    destination: "https://agendazap.test/api/webhook/whatsapp/x",
    date_time: "2026-08-07T12:00:00.000Z",
    server_url: "https://evolution.teste",
  };
}

describe("classificarEvento", () => {
  it("reconhece os quatro eventos que importam", () => {
    expect(classificarEvento({ event: "messages.upsert" })).toBe("mensagem");
    expect(classificarEvento({ event: "MESSAGES_UPSERT" })).toBe("mensagem");
    expect(classificarEvento({ event: "connection.update" })).toBe("conexao");
    expect(classificarEvento({ event: "CONNECTION_UPDATE" })).toBe("conexao");
    // Já era assinado em NOME_EVENTOS_WEBHOOK, mas caía em "ignorado": a
    // aplicação recebia toda regeração de QR e descartava.
    expect(classificarEvento({ event: "qrcode.updated" })).toBe("qrcode");
    expect(classificarEvento({ event: "QRCODE_UPDATED" })).toBe("qrcode");
    // O único que carrega o motivo da queda.
    expect(classificarEvento({ event: "status.instance" })).toBe("status");
    expect(classificarEvento({ event: "STATUS_INSTANCE" })).toBe("status");
  });

  it("ignora eventos que não tratamos", () => {
    for (const event of [
      "messages.update",
      "contacts.upsert",
      "presence.update",
      "",
    ]) {
      expect(classificarEvento({ event }), event).toBe("ignorado");
    }
  });

  it("não quebra com corpo inesperado", () => {
    for (const corpo of [null, undefined, [], "texto", 42, {}]) {
      expect(classificarEvento(corpo)).toBe("ignorado");
    }
  });
});

describe("telefoneDoJid", () => {
  it("extrai o telefone de JID comum", () => {
    expect(telefoneDoJid("5511999998888@s.whatsapp.net")).toBe("5511999998888");
  });

  it("devolve nulo para @lid, que não carrega telefone", () => {
    // O WhatsApp está migrando para Linked IDs; tratar como telefone geraria
    // número inválido.
    expect(telefoneDoJid("154417159582282@lid")).toBeNull();
  });

  it("devolve nulo para grupo e broadcast", () => {
    expect(telefoneDoJid("120363000000000000@g.us")).toBeNull();
    expect(telefoneDoJid("status@broadcast")).toBeNull();
  });

  it("descarta sufixo de dispositivo", () => {
    expect(telefoneDoJid("5511999998888:12@s.whatsapp.net")).toBe(
      "5511999998888",
    );
  });

  it("devolve nulo quando não sobra número plausível", () => {
    expect(telefoneDoJid("abc@s.whatsapp.net")).toBeNull();
    expect(telefoneDoJid("123@s.whatsapp.net")).toBeNull();
    expect(telefoneDoJid("sem-arroba")).toBeNull();
  });
});

describe("ehGrupo / ehBroadcast", () => {
  it("identifica grupo e broadcast", () => {
    expect(ehGrupo("120363000000000000@g.us")).toBe(true);
    expect(ehGrupo("5511999998888@s.whatsapp.net")).toBe(false);
    expect(ehBroadcast("status@broadcast")).toBe(true);
    expect(ehBroadcast("5511999998888@s.whatsapp.net")).toBe(false);
  });
});

describe("extrairMensagem", () => {
  it("extrai mensagem simples", () => {
    expect(extrairMensagem(payloadMensagem())).toEqual({
      id: "3EB0A1B2C3D4E5F6",
      remoteJid: "5511999998888@s.whatsapp.net",
      texto: "1",
      pushName: "Joana",
      telefone: "5511999998888",
    });
  });

  it("lê texto de extendedTextMessage — resposta com citação ou link", () => {
    const mensagem = extrairMensagem(
      payloadMensagem({
        message: {
          extendedTextMessage: {
            text: "quero o 2",
            contextInfo: { stanzaId: "abc" },
          },
        },
      }),
    );

    expect(mensagem?.texto).toBe("quero o 2");
  });

  it("prefere conversation quando os dois campos existem", () => {
    const mensagem = extrairMensagem(
      payloadMensagem({
        message: {
          conversation: "principal",
          extendedTextMessage: { text: "secundario" },
        },
      }),
    );

    expect(mensagem?.texto).toBe("principal");
  });

  it("ignora mensagem do próprio bot — senão vira loop infinito", () => {
    expect(extrairMensagem(payloadMensagem({ fromMe: true }))).toBeNull();
  });

  it("ignora grupo e broadcast", () => {
    expect(
      extrairMensagem(payloadMensagem({ remoteJid: "1203630000@g.us" })),
    ).toBeNull();
    expect(
      extrairMensagem(payloadMensagem({ remoteJid: "status@broadcast" })),
    ).toBeNull();
  });

  it("aceita JID @lid, com telefone nulo", () => {
    const mensagem = extrairMensagem(
      payloadMensagem({ remoteJid: "154417159582282@lid" }),
    );

    // A conversa acontece normalmente: a identidade é o JID, não o telefone.
    expect(mensagem?.remoteJid).toBe("154417159582282@lid");
    expect(mensagem?.telefone).toBeNull();
  });

  it("ignora mídia sem texto — a V0 é menu numerado", () => {
    for (const message of [
      { audioMessage: { seconds: 3 } },
      { stickerMessage: { url: "x" } },
      { imageMessage: { url: "x" } },
      { conversation: "" },
      { conversation: "   " },
      {},
    ]) {
      expect(extrairMensagem(payloadMensagem({ message })), JSON.stringify(message))
        .toBeNull();
    }
  });

  it("ignora payload sem key, sem id ou sem remoteJid", () => {
    expect(extrairMensagem({ event: "messages.upsert", data: {} })).toBeNull();
    expect(extrairMensagem(payloadMensagem({ id: "" }))).toBeNull();
    expect(extrairMensagem(payloadMensagem({ remoteJid: "" }))).toBeNull();
  });

  it("aceita pushName ausente sem quebrar", () => {
    expect(extrairMensagem(payloadMensagem({ pushName: null }))?.pushName)
      .toBeNull();
  });

  it("não quebra com corpo malformado", () => {
    for (const corpo of [null, undefined, [], "texto", 42, {}, { data: 1 }]) {
      expect(extrairMensagem(corpo)).toBeNull();
    }
  });
});

describe("normalizarIdentificadorJid", () => {
  it("reduz JID ao identificador comparável", () => {
    expect(normalizarIdentificadorJid("5511999998888@s.whatsapp.net")).toBe(
      "5511999998888",
    );
    expect(normalizarIdentificadorJid("5511999998888:12@s.whatsapp.net")).toBe(
      "5511999998888",
    );
    expect(normalizarIdentificadorJid("154417159582282@lid")).toBe(
      "154417159582282",
    );
  });

  it("tolera número digitado à mão", () => {
    // A variável de ambiente é preenchida por humano.
    for (const entrada of [
      "+55 (11) 99999-8888",
      "55 11 99999 8888",
      "5511999998888",
    ]) {
      expect(normalizarIdentificadorJid(entrada), entrada).toBe(
        "5511999998888",
      );
    }
  });
});

describe("lerListaPermitidos", () => {
  it("devolve lista vazia quando a variável não está definida", () => {
    expect(lerListaPermitidos(undefined)).toEqual([]);
    expect(lerListaPermitidos("")).toEqual([]);
    expect(lerListaPermitidos("   ")).toEqual([]);
  });

  it("aceita números e JIDs misturados, com espaços", () => {
    expect(
      lerListaPermitidos(
        " 5511999998888 , 5511977776666@s.whatsapp.net ,+55 11 91111-2222",
      ),
    ).toEqual(["5511999998888", "5511977776666", "5511911112222"]);
  });

  it("descarta entradas sem dígito", () => {
    expect(lerListaPermitidos("5511999998888,,---,")).toEqual([
      "5511999998888",
    ]);
  });
});

describe("jidPermitido", () => {
  it("lista vazia atende todos — é o comportamento de produção", () => {
    // O default não pode ser um jeito silencioso de o bot parar de atender.
    expect(jidPermitido("5511999998888@s.whatsapp.net", [])).toBe(true);
    expect(jidPermitido("154417159582282@lid", [])).toBe(true);
  });

  it("com lista, atende só quem está nela", () => {
    const permitidos = lerListaPermitidos("5511999998888");

    expect(jidPermitido("5511999998888@s.whatsapp.net", permitidos)).toBe(true);
    expect(jidPermitido("5511900000000@s.whatsapp.net", permitidos)).toBe(false);
  });

  it("ignora sufixo de dispositivo ao comparar", () => {
    expect(
      jidPermitido(
        "5511999998888:31@s.whatsapp.net",
        lerListaPermitidos("5511999998888"),
      ),
    ).toBe(true);
  });

  it("libera @lid só quando o próprio identificador está na lista", () => {
    // JID @lid não carrega telefone, então não há como derivá-lo do número.
    expect(
      jidPermitido("154417159582282@lid", lerListaPermitidos("5511999998888")),
    ).toBe(false);
    expect(
      jidPermitido("154417159582282@lid", lerListaPermitidos("154417159582282")),
    ).toBe(true);
  });
});

describe("extrairEstadoConexao", () => {
  it("lê o state do CONNECTION_UPDATE", () => {
    expect(
      extrairEstadoConexao({
        event: "connection.update",
        data: { state: "open", statusReason: 200 },
      }),
    ).toBe("open");
  });

  it("devolve nulo quando o state não vem", () => {
    expect(extrairEstadoConexao({ event: "connection.update", data: {} }))
      .toBeNull();
    expect(extrairEstadoConexao(null)).toBeNull();
  });
});

describe("extrairNumeroDono", () => {
  it("lê data.wuid do CONNECTION_UPDATE", () => {
    expect(
      extrairNumeroDono({
        event: "connection.update",
        sender: "5511977776666@s.whatsapp.net",
        data: {
          state: "open",
          wuid: "5511999998888@s.whatsapp.net",
          profileName: "Salão da Ana",
        },
      }),
    ).toEqual({ numero: "5511999998888", dominio: "s.whatsapp.net" });
  });

  it("normaliza sufixo de dispositivo", () => {
    expect(
      extrairNumeroDono({ data: { wuid: "5511999998888:12@s.whatsapp.net" } })
        ?.numero,
    ).toBe("5511999998888");
  });

  /**
   * O `sender` de topo é o JID do dono em todo webhook da Evolution, não só no
   * de conexão — rede de segurança de graça se o `wuid` mudar de nome ou de
   * lugar entre versões.
   */
  it("cai no sender de topo quando o wuid não vem", () => {
    expect(
      extrairNumeroDono({
        event: "connection.update",
        sender: "5511977776666@s.whatsapp.net",
        data: { state: "open" },
      })?.numero,
    ).toBe("5511977776666");
  });

  it("prefere o wuid ao sender", () => {
    expect(
      extrairNumeroDono({
        sender: "5511977776666@s.whatsapp.net",
        data: { wuid: "5511999998888@s.whatsapp.net" },
      })?.numero,
    ).toBe("5511999998888");
  });

  /**
   * Um `@lid` do dono não deveria acontecer (o `wuid` vem de `client.user.id`,
   * que é baseado em telefone), mas se vier, serve como chave igual: o
   * livro-caixa compara identificadores, não telefones.
   *
   * O que **não** pode é isso passar sem sinal: o domínio volta junto justamente
   * para o webhook poder avisar que o espaço de chaves mudou (ver o aviso em
   * `route.ts`). Sem ele, um upgrade da Evolution zeraria a proteção entre
   * contas em silêncio.
   */
  it("aceita identificador @lid e devolve o domínio para detecção", () => {
    expect(extrairNumeroDono({ data: { wuid: "154417159582282@lid" } })).toEqual(
      { numero: "154417159582282", dominio: "lid" },
    );
  });

  it("devolve domínio nulo quando o valor vem sem domínio", () => {
    // Número solto, sem `@`: acontece em variações de payload e não é motivo
    // para descartar a reivindicação.
    expect(extrairNumeroDono({ sender: "5511999998888" })).toEqual({
      numero: "5511999998888",
      dominio: null,
    });
  });

  it("devolve nulo sem wuid e sem sender", () => {
    expect(extrairNumeroDono({ event: "connection.update", data: {} })).toBeNull();
    expect(extrairNumeroDono(null)).toBeNull();
  });

  /** Sem isso, um `sender` degenerado gravaria hash de string vazia. */
  it("devolve nulo quando não sobra dígito nenhum", () => {
    expect(extrairNumeroDono({ data: { wuid: "@s.whatsapp.net" } })).toBeNull();
  });
});

describe("extrairContagemQrCode", () => {
  it("lê a contagem aninhada em data.qrcode.count", () => {
    expect(
      extrairContagemQrCode({ event: "QRCODE_UPDATED", data: { qrcode: { count: 4 } } }),
    ).toBe(4);
  });

  it("lê a contagem direta em data.count", () => {
    // O campo muda de lugar entre versões da Evolution; ler os dois evita
    // depender da versão instalada no servidor.
    expect(
      extrairContagemQrCode({ event: "QRCODE_UPDATED", data: { count: 7 } }),
    ).toBe(7);
  });

  it("preserva zero", () => {
    expect(extrairContagemQrCode({ data: { count: 0 } })).toBe(0);
  });

  it("devolve null quando não há contagem", () => {
    for (const corpo of [null, {}, { data: null }, { data: {} }, { data: { count: "4" } }]) {
      expect(extrairContagemQrCode(corpo)).toBeNull();
    }
  });
});

describe("extrairMotivoDesconexao", () => {
  it("lê o código solto em data", () => {
    expect(
      extrairMotivoDesconexao({
        event: "STATUS_INSTANCE",
        data: { instance: "abc", disconnectionReasonCode: 401 },
      }),
    ).toBe(401);
  });

  it("lê o código aninhado sob data.status", () => {
    // A Evolution move o campo entre versões; ler as duas formas evita depender
    // da versão do servidor, como já se faz com a contagem de QR.
    expect(
      extrairMotivoDesconexao({
        event: "STATUS_INSTANCE",
        data: { status: { disconnectionReasonCode: 428 } },
      }),
    ).toBe(428);
  });

  it("devolve nulo quando o motivo não veio", () => {
    // O CONNECTION_UPDATE de queda diz que caiu, nunca por quê — e é
    // exatamente por isso que STATUS_INSTANCE passou a ser assinado.
    expect(
      extrairMotivoDesconexao({
        event: "CONNECTION_UPDATE",
        data: { state: "close" },
      }),
    ).toBeNull();
  });

  it("não quebra com corpo inesperado", () => {
    for (const corpo of [null, undefined, [], "texto", 42, {}, { data: null }]) {
      expect(extrairMotivoDesconexao(corpo)).toBeNull();
    }
  });

  it("preserva o zero em vez de tratar como ausente", () => {
    expect(
      extrairMotivoDesconexao({ data: { disconnectionReasonCode: 0 } }),
    ).toBe(0);
  });

  it("ignora motivo que não é número", () => {
    expect(
      extrairMotivoDesconexao({ data: { disconnectionReasonCode: "401" } }),
    ).toBeNull();
  });
});
