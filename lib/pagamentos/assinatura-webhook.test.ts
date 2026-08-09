import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  assinaturaValida,
  extrairPartes,
  montarManifesto,
} from "./assinatura-webhook";

const SEGREDO = "segredo-de-webhook-do-mp";

/** Assina como o MP assinaria, para não testar a implementação contra si mesma. */
function assinar(manifesto: string, segredo = SEGREDO): string {
  return createHmac("sha256", segredo).update(manifesto).digest("hex");
}

function headerValido(dados: {
  dataId: string;
  requestId: string | null;
  ts?: string;
  segredo?: string;
}): string {
  const ts = dados.ts ?? "1754740000";
  const v1 = assinar(
    montarManifesto({ dataId: dados.dataId, requestId: dados.requestId, ts }),
    dados.segredo,
  );
  return `ts=${ts},v1=${v1}`;
}

describe("extrairPartes", () => {
  it("lê ts e v1", () => {
    expect(extrairPartes("ts=123,v1=abc")).toEqual({ ts: "123", v1: "abc" });
  });

  it("tolera espaço e ordem invertida", () => {
    // Nada na doc promete formatação estável, e um parser posicional quebraria
    // em silêncio no dia em que eles inverterem os campos.
    expect(extrairPartes(" v1=abc , ts=123 ")).toEqual({
      ts: "123",
      v1: "abc",
    });
  });

  it("devolve nulo quando falta parte, está vazio ou é nulo", () => {
    expect(extrairPartes("ts=123")).toBeNull();
    expect(extrairPartes("v1=abc")).toBeNull();
    expect(extrairPartes("lixo")).toBeNull();
    expect(extrairPartes("")).toBeNull();
    expect(extrairPartes(null)).toBeNull();
  });
});

describe("montarManifesto", () => {
  it("segue o formato do MP", () => {
    expect(
      montarManifesto({ dataId: "123", requestId: "req-1", ts: "999" }),
    ).toBe("id:123;request-id:req-1;ts:999;");
  });

  it("OMITE o rótulo de request-id quando ele não vem", () => {
    // `request-id:;` produziria um HMAC diferente de não ter o trecho, e a
    // validação falharia em toda notificação sem esse header.
    expect(montarManifesto({ dataId: "123", requestId: null, ts: "999" })).toBe(
      "id:123;ts:999;",
    );
  });

  it("minúsculas no data.id alfanumérico, por exigência da doc", () => {
    expect(
      montarManifesto({ dataId: "AbC123", requestId: null, ts: "1" }),
    ).toBe("id:abc123;ts:1;");
  });
});

describe("assinaturaValida", () => {
  it("aceita assinatura correta", () => {
    expect(
      assinaturaValida({
        header: headerValido({ dataId: "123", requestId: "req-1" }),
        dataId: "123",
        requestId: "req-1",
        segredo: SEGREDO,
      }),
    ).toBe(true);
  });

  it("aceita sem request-id", () => {
    expect(
      assinaturaValida({
        header: headerValido({ dataId: "123", requestId: null }),
        dataId: "123",
        requestId: null,
        segredo: SEGREDO,
      }),
    ).toBe(true);
  });

  it("recusa segredo errado", () => {
    expect(
      assinaturaValida({
        header: headerValido({
          dataId: "123",
          requestId: null,
          segredo: "outro",
        }),
        dataId: "123",
        requestId: null,
        segredo: SEGREDO,
      }),
    ).toBe(false);
  });

  it("recusa quando o id do recurso foi trocado", () => {
    // O ataque óbvio: pegar uma notificação legítima e apontá-la para outra
    // cobrança. O id entra no manifesto exatamente para fechar isso.
    expect(
      assinaturaValida({
        header: headerValido({ dataId: "123", requestId: null }),
        dataId: "456",
        requestId: null,
        segredo: SEGREDO,
      }),
    ).toBe(false);
  });

  it("recusa quando o ts foi adulterado", () => {
    const header = headerValido({ dataId: "123", requestId: null });
    expect(
      assinaturaValida({
        header: header.replace(/ts=\d+/, "ts=1"),
        dataId: "123",
        requestId: null,
        segredo: SEGREDO,
      }),
    ).toBe(false);
  });

  it("recusa header ausente ou malformado", () => {
    for (const header of [null, "", "lixo", "ts=1"]) {
      expect(
        assinaturaValida({
          header,
          dataId: "123",
          requestId: null,
          segredo: SEGREDO,
        }),
      ).toBe(false);
    }
  });

  it("recusa segredo vazio — fail-closed", () => {
    // Env var ausente não pode virar "aceita tudo": este é o único portão do
    // endpoint de pagamento.
    expect(
      assinaturaValida({
        header: headerValido({ dataId: "123", requestId: null, segredo: "" }),
        dataId: "123",
        requestId: null,
        segredo: "",
      }),
    ).toBe(false);
  });

  it("aceita v1 em maiúsculas", () => {
    const header = headerValido({ dataId: "123", requestId: null });
    expect(
      assinaturaValida({
        header: header.toUpperCase().replace("TS=", "ts=").replace("V1=", "v1="),
        dataId: "123",
        requestId: null,
        segredo: SEGREDO,
      }),
    ).toBe(true);
  });

  it("NÃO recusa por ts antigo — reentrega do MP chega horas depois", () => {
    // Decisão registrada no módulo: uma janela de validade trocaria um risco
    // teórico (replay, já inócuo pela idempotência) por perda real de
    // confirmação de dinheiro.
    expect(
      assinaturaValida({
        header: headerValido({
          dataId: "123",
          requestId: null,
          ts: "1000000000",
        }),
        dataId: "123",
        requestId: null,
        segredo: SEGREDO,
      }),
    ).toBe(true);
  });
});
