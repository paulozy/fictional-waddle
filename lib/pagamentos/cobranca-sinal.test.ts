import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { urlDeNotificacao } from "./cobranca-sinal";

/**
 * A URL que vai para o Mercado Pago.
 *
 * Existe porque `WEBHOOK_BASE_URL` e `APP_PUBLIC_URL` já foram a MESMA variável,
 * servindo dois públicos com exigências opostas — a Evolution API, que alcança o
 * app de dentro da rede do Docker, e os servidores do MP, que alcançam de fora.
 * Consertar um lado quebrava o outro em silêncio, e o modo de falha é o pior que
 * este produto tem: o cliente paga, a confirmação nunca chega, a varredura
 * cancela o agendamento, e como o webhook nunca rodou nem `estorno_pendente` é
 * levantado — ninguém descobre que há dinheiro para devolver.
 */

const ORIGINAIS = {
  publica: process.env.APP_PUBLIC_URL,
  webhook: process.env.WEBHOOK_BASE_URL,
};

beforeEach(() => {
  delete process.env.APP_PUBLIC_URL;
  delete process.env.WEBHOOK_BASE_URL;
});

afterEach(() => {
  process.env.APP_PUBLIC_URL = ORIGINAIS.publica;
  process.env.WEBHOOK_BASE_URL = ORIGINAIS.webhook;
});

describe("urlDeNotificacao", () => {
  it("monta a partir da APP_PUBLIC_URL", () => {
    process.env.APP_PUBLIC_URL = "https://encaixaria.com.br";

    expect(urlDeNotificacao()).toBe(
      "https://encaixaria.com.br/api/webhook/pagamento/mercadopago",
    );
  });

  it("descarta barra final, para não gerar caminho com barra dupla", () => {
    process.env.APP_PUBLIC_URL = "https://encaixaria.com.br///";

    expect(urlDeNotificacao()).toBe(
      "https://encaixaria.com.br/api/webhook/pagamento/mercadopago",
    );
  });

  /** Em produção as duas coincidem; ambiente já configurado não pode quebrar. */
  it("cai na WEBHOOK_BASE_URL quando a pública não está definida", () => {
    process.env.WEBHOOK_BASE_URL = "https://encaixaria.vercel.app";

    expect(urlDeNotificacao()).toBe(
      "https://encaixaria.vercel.app/api/webhook/pagamento/mercadopago",
    );
  });

  it("vazia não conta como definida, e a queda acontece igual", () => {
    process.env.APP_PUBLIC_URL = "   ";
    process.env.WEBHOOK_BASE_URL = "https://encaixaria.vercel.app";

    expect(urlDeNotificacao()).toContain("encaixaria.vercel.app");
  });

  /**
   * O caso que motivou tudo: `WEBHOOK_BASE_URL` apontada para o gateway da rede
   * do Docker — valor CORRETO para a Evolution — vazando para o MP.
   */
  it("recusa o gateway do Docker e a faixa 172.16/12 inteira", () => {
    for (const base of [
      "http://172.20.0.1:3000",
      "http://172.16.0.1:3000",
      "http://172.31.255.254:3000",
    ]) {
      process.env.APP_PUBLIC_URL = base;
      expect(() => urlDeNotificacao(), base).toThrow(/endereço público/i);
    }
  });

  it("recusa localhost, loopback e as outras faixas privadas", () => {
    for (const base of [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://0.0.0.0:3000",
      "http://10.1.2.3:3000",
      "http://192.168.0.10:3000",
      "http://169.254.1.1:3000",
    ]) {
      process.env.APP_PUBLIC_URL = base;
      expect(() => urlDeNotificacao(), base).toThrow(/endereço público/i);
    }
  });

  /**
   * `172.32` e `172.15` estão FORA da RFC 1918 — a faixa privada é 172.16–172.31.
   * Uma regex frouxa (`^172\.`) recusaria endereço público de verdade.
   */
  it("não recusa endereço público que só se parece com privado", () => {
    for (const base of [
      "https://172.32.0.1",
      "https://172.15.0.1",
      "https://10x.exemplo.com.br",
      "https://localhost.encaixaria.com.br",
    ]) {
      process.env.APP_PUBLIC_URL = base;
      expect(() => urlDeNotificacao(), base).not.toThrow();
    }
  });

  it("recusa valor que não é URL", () => {
    process.env.APP_PUBLIC_URL = "encaixaria.com.br";

    expect(() => urlDeNotificacao()).toThrow(/endereço público/i);
  });

  /** Sem nenhuma das duas, o erro é o de env obrigatória ausente. */
  it("lança quando não há env nenhuma", () => {
    expect(() => urlDeNotificacao()).toThrow(/WEBHOOK_BASE_URL/);
  });

  /** A mensagem tem de dizer o que fazer — é lida num log, sob pressão. */
  it("o erro aponta o túnel e avisa para não reusar a WEBHOOK_BASE_URL", () => {
    process.env.APP_PUBLIC_URL = "http://172.20.0.1:3000";

    expect(() => urlDeNotificacao()).toThrow(/t[úu]nel/i);
    expect(() => urlDeNotificacao()).toThrow(/WEBHOOK_BASE_URL/);
    // O valor recebido entra na mensagem: sem ele, quem lê o log não sabe qual
    // das duas variáveis está errada.
    expect(() => urlDeNotificacao()).toThrow(/172\.20\.0\.1/);
  });
});
