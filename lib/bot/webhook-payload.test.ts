import { describe, expect, it } from "vitest";
import {
  classificarEvento,
  ehBroadcast,
  ehGrupo,
  extrairEstadoConexao,
  extrairMensagem,
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
  it("reconhece os dois eventos que importam", () => {
    expect(classificarEvento({ event: "messages.upsert" })).toBe("mensagem");
    expect(classificarEvento({ event: "MESSAGES_UPSERT" })).toBe("mensagem");
    expect(classificarEvento({ event: "connection.update" })).toBe("conexao");
    expect(classificarEvento({ event: "CONNECTION_UPDATE" })).toBe("conexao");
  });

  it("ignora eventos que não tratamos", () => {
    for (const event of [
      "qrcode.updated",
      "messages.update",
      "contacts.upsert",
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
