import { describe, expect, it } from "vitest";
import {
  CHAVES_MENSAGEM,
  OBRIGATORIOS_POR_CHAVE,
  PLACEHOLDERS_POR_CHAVE,
  dividirPlaceholders,
  aplicarModelo,
  renderizarOuPadrao,
  validarModelo,
} from "./modelo-mensagem";

describe("validarModelo", () => {
  it("aceita texto com os placeholders da chave", () => {
    const r = validarModelo(
      "sinal_cobranca",
      "Para segurar o horário de {servico} em {quando}, pague {valor} em até {prazo}.",
    );

    expect(r).toEqual({ ok: true, texto: expect.stringContaining("{prazo}") });
  });

  /**
   * O caso que a validação existe para impedir: um typo gravado vira `{valro}` no
   * WhatsApp do cliente, e o dono descobre pelo cliente, dias depois.
   */
  it("recusa placeholder digitado errado, dizendo quais valem", () => {
    const r = validarModelo("sinal_cobranca", "Pague {valro} agora");

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toContain("{valro}");
    expect(r.erro).toContain("{valor}");
  });

  /**
   * Conjunto por chave, não global: `{prazo}` não existe na confirmação — o
   * pagamento já caiu. Uma lista global aceitaria e renderizaria vazio.
   */
  it("recusa placeholder que existe em outra chave", () => {
    expect(validarModelo("sinal_recebido", "Recebi {valor} em {prazo}").ok).toBe(
      false,
    );
    // `{quando}` porque a confirmação passou a exigi-lo — ver "obrigatórios".
    expect(validarModelo("sinal_recebido", "Recebi {valor}, {quando}").ok).toBe(
      true,
    );
  });

  it("na chave sem campos, qualquer placeholder é recusado com texto próprio", () => {
    const r = validarModelo("sinal_expirado", "O prazo de {valor} venceu");

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toMatch(/nenhum campo autom[áa]tico/i);
  });

  /** Branco significa "voltar ao padrão", e quem apaga a linha é o chamador. */
  it("texto em branco é válido e volta vazio", () => {
    for (const entrada of ["", "   ", "\n\t "]) {
      expect(validarModelo("sinal_cobranca", entrada)).toEqual({
        ok: true,
        texto: "",
      });
    }
  });

  it("apara as pontas do texto aceito", () => {
    const r = validarModelo("sinal_expirado", "  O prazo venceu.  ");
    expect(r).toEqual({ ok: true, texto: "O prazo venceu." });
  });

  it("recusa texto acima do limite, explicando o efeito no celular", () => {
    const r = validarModelo("sinal_expirado", "a".repeat(901));

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toMatch(/Ler mais/);
  });

  it("tolera espaço dentro das chaves", () => {
    // Com os dois obrigatórios, senão a recusa viria por outro motivo e o teste
    // passaria a medir outra coisa.
    expect(
      validarModelo("sinal_cobranca", "Pague { valor } até { prazo }").ok,
    ).toBe(true);
  });

  /** Chave e conjunto de placeholders andam juntos: nada órfão. */
  it("toda chave declarada tem conjunto de placeholders", () => {
    for (const chave of CHAVES_MENSAGEM) {
      expect(PLACEHOLDERS_POR_CHAVE[chave], chave).toBeDefined();
    }
  });
});

describe("aplicarModelo", () => {
  it("troca o que conhece", () => {
    expect(
      aplicarModelo("Pague {valor} por {servico}", {
        valor: "R$ 20,00",
        servico: "Corte",
      }),
    ).toBe("Pague R$ 20,00 por Corte");
  });

  it("repete o mesmo placeholder quantas vezes aparecer", () => {
    expect(aplicarModelo("{valor} — sim, {valor}", { valor: "R$ 1,00" })).toBe(
      "R$ 1,00 — sim, R$ 1,00",
    );
  });

  /**
   * Placeholder desconhecido fica como está, em vez de virar vazio: "sinal de
   * {valor} recebido" denuncia o problema, "sinal de  recebido" parece erro de
   * digitação do dono.
   */
  it("deixa intacto o que não conhece, em vez de apagar", () => {
    expect(aplicarModelo("Pague {valor} via {desconhecido}", { valor: "R$ 5" }))
      .toBe("Pague R$ 5 via {desconhecido}");
  });

  it("não quebra sem placeholder nenhum", () => {
    expect(aplicarModelo("Texto fixo.", { valor: "x" })).toBe("Texto fixo.");
  });
});

describe("renderizarOuPadrao", () => {
  const PADRAO = "Texto padrão do código.";

  /** Sem linha e com linha vazia significam a mesma coisa para o bot. */
  it("cai no padrão quando não há modelo, é nulo ou é branco", () => {
    for (const modelo of [undefined, null, "", "   "]) {
      expect(renderizarOuPadrao(modelo, { valor: "R$ 1" }, PADRAO)).toBe(PADRAO);
    }
  });

  it("usa o modelo do dono quando existe", () => {
    expect(renderizarOuPadrao("Manda {valor}", { valor: "R$ 1" }, PADRAO)).toBe(
      "Manda R$ 1",
    );
  });
});

describe("placeholders obrigatórios", () => {
  /**
   * Sem `{valor}` o cliente não sabe quanto pagar; sem `{prazo}` ele não sabe que
   * o horário cai — e a expiração vira reclamação. Barrar ao salvar é o único
   * momento em que alguém está olhando.
   */
  it("recusa cobrança sem valor ou sem prazo, dizendo o que falta", () => {
    const semValor = validarModelo("sinal_cobranca", "Pague até {prazo}");
    expect(semValor.ok).toBe(false);
    if (!semValor.ok) expect(semValor.erro).toContain("{valor}");

    const semPrazo = validarModelo("sinal_cobranca", "Pague {valor}");
    expect(semPrazo.ok).toBe(false);
    if (!semPrazo.ok) expect(semPrazo.erro).toContain("{prazo}");

    expect(validarModelo("sinal_cobranca", "Pague {valor} até {prazo}").ok).toBe(
      true,
    );
  });

  it("recusa confirmação sem o horário", () => {
    expect(validarModelo("sinal_recebido", "Recebi {valor}").ok).toBe(false);
    expect(validarModelo("sinal_recebido", "Recebi, {quando}").ok).toBe(true);
  });

  /** Voltar ao padrão continua possível: branco é caminho próprio. */
  it("branco continua válido mesmo com obrigatórios", () => {
    expect(validarModelo("sinal_cobranca", "")).toEqual({ ok: true, texto: "" });
  });

  it("todo obrigatório também é um permitido — senão seria impossível salvar", () => {
    for (const chave of CHAVES_MENSAGEM) {
      for (const nome of OBRIGATORIOS_POR_CHAVE[chave]) {
        expect(PLACEHOLDERS_POR_CHAVE[chave], `${chave}/${nome}`).toContain(nome);
      }
    }
  });
});

describe("dividirPlaceholders", () => {
  const PERMITIDOS = ["valor", "prazo"];

  it("separa texto e campos preservando o conteúdo original", () => {
    const pedacos = dividirPlaceholders("Pague {valor} até {prazo}!", PERMITIDOS);

    expect(pedacos.map((p) => p.valor).join("")).toBe("Pague {valor} até {prazo}!");
    expect(pedacos.filter((p) => p.tipo === "campo")).toHaveLength(2);
  });

  /** É a pista visual: o inválido aparece marcado, não como texto comum. */
  it("marca como desconhecido o campo fora da lista", () => {
    const pedacos = dividirPlaceholders("Pague {valro}", PERMITIDOS);
    const campo = pedacos.find((p) => p.tipo === "campo");

    expect(campo).toMatchObject({ nome: "valro", conhecido: false });
  });

  it("campo no começo e no fim não perde pedaço", () => {
    expect(dividirPlaceholders("{valor}", PERMITIDOS)).toEqual([
      { tipo: "campo", valor: "{valor}", nome: "valor", conhecido: true },
    ]);
    expect(
      dividirPlaceholders("{valor} fim", PERMITIDOS).map((p) => p.valor).join(""),
    ).toBe("{valor} fim");
  });

  it("texto sem campo nenhum vira um pedaço só", () => {
    expect(dividirPlaceholders("Sem campos", PERMITIDOS)).toEqual([
      { tipo: "texto", valor: "Sem campos" },
    ]);
  });

  it("string vazia não gera pedaço", () => {
    expect(dividirPlaceholders("", PERMITIDOS)).toEqual([]);
  });
});
