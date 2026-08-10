import { afterEach, describe, expect, it } from "vitest";
import { contaTalvezCriada, mensagemDeCadastro } from "./mensagens";

afterEach(() => {
  delete process.env.WHATSAPP_CONTATO;
});

describe("mensagens de cadastro", () => {
  it.each([
    ["user_already_exists", /já tem conta/],
    ["email_exists", /já tem conta/],
    ["weak_password", /Senha fraca/],
    ["over_email_send_rate_limit", /Espere um minuto/],
    ["email_address_invalid", /digitação/],
  ])("traduz %s", (codigo, esperado) => {
    expect(mensagemDeCadastro(codigo)).toMatch(esperado);
  });

  it("código desconhecido e ausente caem na frase genérica", () => {
    expect(mensagemDeCadastro("algo_novo_do_supabase")).toMatch(
      /Tente de novo em instantes/,
    );
    expect(mensagemDeCadastro(undefined)).toMatch(/Tente de novo em instantes/);
  });

  /**
   * O caso que aconteceu em produção: SMTP respondeu `535 "Authentication
   * credentials invalid"`, o Supabase gravou o usuário e devolveu 500 com
   * `unexpected_failure`.
   *
   * "Tente de novo" seria a pior orientação possível — a conta já existe, está
   * não confirmada, e nenhuma tentativa nova conserta isso do lado do dono.
   */
  describe("falha de envio do e-mail de confirmação", () => {
    it("diz que a conta foi criada, e não manda tentar de novo", () => {
      const mensagem = mensagemDeCadastro("unexpected_failure");

      expect(mensagem).toMatch(/conta foi criada/i);
      expect(mensagem).toMatch(/falha nossa/i);
      expect(mensagem).not.toMatch(/tente de novo/i);
    });

    it("aponta o WhatsApp de contato quando ele está configurado", () => {
      process.env.WHATSAPP_CONTATO = "+55 (11) 99999-8888";

      expect(mensagemDeCadastro("unexpected_failure")).toContain(
        "https://wa.me/5511999998888",
      );
    });

    it("sem a variável, oferece ajuda sem inventar endereço", () => {
      const mensagem = mensagemDeCadastro("unexpected_failure");

      expect(mensagem).toMatch(/Fale com a gente/);
      expect(mensagem).not.toContain("wa.me");
    });

    it("é o único caso em que a conta pode já existir", () => {
      expect(contaTalvezCriada("unexpected_failure")).toBe(true);
      expect(contaTalvezCriada("weak_password")).toBe(false);
      expect(contaTalvezCriada(undefined)).toBe(false);
    });
  });
});
