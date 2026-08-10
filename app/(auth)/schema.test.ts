import { describe, expect, it } from "vitest";
import { FUSO_PADRAO, ehFusoConhecido } from "@/lib/fusos";
import {
  lerCredenciais,
  lerEmail,
  lerEstabelecimento,
  lerNovaSenha,
  lerTelefone,
} from "./schema";

/**
 * Estes schemas são a única validação que sobra num POST direto: `required` e
 * `minLength` no HTML valem para quem digita na tela, e para mais ninguém.
 */

function dados(campos: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [chave, valor] of Object.entries(campos)) {
    formData.set(chave, valor);
  }
  return formData;
}

describe("credenciais", () => {
  it("normaliza o e-mail: espaço em volta e caixa alta", () => {
    const resultado = lerCredenciais(
      dados({ email: "  Dono@Barbearia.COM.br ", senha: "12345678" }),
    );

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.email).toBe("dono@barbearia.com.br");
    }
  });

  it("recusa senha com menos de 8 caracteres", () => {
    const resultado = lerCredenciais(
      dados({ email: "dono@salao.com", senha: "1234567" }),
    );

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toMatch(/8 caracteres/);
    }
  });

  it("recusa e-mail sem forma de e-mail", () => {
    expect(
      lerCredenciais(dados({ email: "dono@", senha: "12345678" })).success,
    ).toBe(false);
  });

  /** Campo ausente, que é o que chega num POST forjado sem o formulário. */
  it("recusa campo ausente em vez de tratar como vazio", () => {
    expect(lerCredenciais(new FormData()).success).toBe(false);
  });

  /**
   * A senha **não** é aparada. Espaço é caractere válido de segredo, e um
   * `.trim()` aqui faria a senha aceita no cadastro divergir da enviada no
   * login — travando a conta sem mensagem que explique.
   */
  it("preserva espaço dentro e em volta da senha", () => {
    const resultado = lerCredenciais(
      dados({ email: "dono@salao.com", senha: " senha com espaço " }),
    );

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.senha).toBe(" senha com espaço ");
    }
  });
});

describe("recuperação de senha", () => {
  it("aceita só o e-mail, sem exigir senha", () => {
    const resultado = lerEmail(dados({ email: "dono@salao.com" }));
    expect(resultado.success).toBe(true);
  });
});

describe("nova senha", () => {
  it("aceita quando as duas conferem", () => {
    const resultado = lerNovaSenha(
      dados({ senha: "senhanova1", confirmacao: "senhanova1" }),
    );
    expect(resultado.success).toBe(true);
  });

  it("recusa quando divergem, apontando o campo de confirmação", () => {
    const resultado = lerNovaSenha(
      dados({ senha: "senhanova1", confirmacao: "senhanova2" }),
    );

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      const problema = resultado.error.issues[0];
      expect(problema.path).toEqual(["confirmacao"]);
      expect(problema.message).toMatch(/iguais/);
    }
  });

  it("recusa senha curta antes de comparar as duas", () => {
    expect(
      lerNovaSenha(dados({ senha: "curta", confirmacao: "curta" })).success,
    ).toBe(false);
  });
});

describe("estabelecimento", () => {
  it("apara o nome e aceita o fuso da lista", () => {
    const resultado = lerEstabelecimento(
      dados({ nome: "  Barbearia do Nino  ", fuso: "America/Manaus" }),
    );

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.nome).toBe("Barbearia do Nino");
      expect(resultado.data.fuso).toBe("America/Manaus");
    }
  });

  /**
   * O caso que motiva a lista fechada: `America/SaoPaulo` (sem o sublinhado) não
   * é zona IANA, e um `TZDate` construído com ela cai em UTC **em silêncio** —
   * deslocando a agenda inteira em três horas sem nada falhar.
   */
  it("recusa fuso inexistente que parece certo", () => {
    const resultado = lerEstabelecimento(
      dados({ nome: "Salão", fuso: "America/SaoPaulo" }),
    );

    expect(resultado.success).toBe(false);
    expect(ehFusoConhecido("America/SaoPaulo")).toBe(false);
    expect(ehFusoConhecido(FUSO_PADRAO)).toBe(true);
  });

  it("recusa nome vazio e nome acima de 80 caracteres", () => {
    expect(
      lerEstabelecimento(dados({ nome: " ", fuso: FUSO_PADRAO })).success,
    ).toBe(false);
    expect(
      lerEstabelecimento(dados({ nome: "a".repeat(81), fuso: FUSO_PADRAO }))
        .success,
    ).toBe(false);
  });
});

describe("telefone do passo 3", () => {
  it("normaliza o que o dono digita com máscara", () => {
    const resultado = lerTelefone(dados({ numero: "(11) 99323-5002" }));

    expect(resultado.valido).toBe(true);
    if (resultado.valido) expect(resultado.numero).toBe("5511993235002");
  });

  it("devolve a mensagem de `lib/telefone.ts` quando o número não serve", () => {
    const resultado = lerTelefone(dados({ numero: "993" }));

    expect(resultado.valido).toBe(false);
    if (!resultado.valido) expect(resultado.erro).toMatch(/DDD/);
  });

  it("trata campo ausente como número vazio, sem lançar", () => {
    expect(lerTelefone(new FormData()).valido).toBe(false);
  });
});
