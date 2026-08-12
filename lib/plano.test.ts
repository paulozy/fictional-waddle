import { describe, expect, it } from "vitest";
import {
  ehIdPlano,
  nomeDoPlano,
  PLANO_PADRAO,
  PLANOS,
  precoDoPlano,
} from "./plano";

/**
 * O que se testa aqui é a ponte entre o valor do banco e o nome de venda.
 *
 * `perfis.plano` guarda `'basico'`/`'sinal'` e o site diz "Essencial"/"Garantido".
 * Um descasamento entre os dois não levanta erro em lugar nenhum: a tela mostra o
 * plano errado, ou o preço errado, e quem descobre é o cliente lendo a fatura que
 * ele não reconhece.
 */

describe("ehIdPlano", () => {
  it("aceita exatamente os ids que existem em PLANOS", () => {
    for (const plano of PLANOS) {
      expect(ehIdPlano(plano.id)).toBe(true);
    }
  });

  /*
    "garantido" e "essencial" entram aqui de propósito: são os nomes **de venda**,
    e é o que alguém chutaria ao forjar o formulário — ou o que um dia alguém
    escreveria por engano no lugar do valor da coluna.
  */
  it.each([["garantido"], ["essencial"], ["premium"], [""], [null], [undefined], [0]])(
    "recusa %o",
    (valor) => {
      expect(ehIdPlano(valor)).toBe(false);
    },
  );
});

/**
 * O CHECK `perfis_plano_valido` aceita `('basico','sinal')`. Se `PLANOS` deixar de
 * cobrir exatamente esses dois, o formulário de cadastro passa a oferecer uma
 * opção que o banco recusa — ou a esconder uma que ele aceita.
 */
describe("PLANOS espelha o CHECK do banco", () => {
  it("cobre basico e sinal, sem sobra", () => {
    expect(PLANOS.map((p) => p.id).sort()).toEqual(["basico", "sinal"]);
  });

  it("tem exatamente um plano destacado, que é o de cobrança de sinal", () => {
    const destacados = PLANOS.filter((p) => p.destacado);

    expect(destacados).toHaveLength(1);
    expect(destacados[0].id).toBe("sinal");
  });

  it("usa o plano de entrada como padrão", () => {
    expect(PLANO_PADRAO).toBe("basico");
    expect(PLANOS[0].id).toBe(PLANO_PADRAO);
  });
});

/**
 * A tolerância a nulo não é frouxidão: `perfil` pode ser nulo (leitura que falhou,
 * conta recém-criada), e a direção do erro importa. Cair no Essencial mostra
 * capacidade a menos, que vira conversa comercial; cair no Garantido anunciaria um
 * preço que o cliente não contratou.
 */
describe("nomeDoPlano e precoDoPlano", () => {
  it("traduzem o valor do banco para o nome e o preço de venda", () => {
    expect(nomeDoPlano("basico")).toBe("Essencial");
    expect(nomeDoPlano("sinal")).toBe("Garantido");
    expect(precoDoPlano("basico")).toBe("49,90");
    expect(precoDoPlano("sinal")).toBe("64,90");
  });

  it.each([null, undefined, "premium", ""])(
    "cai no plano de entrada para %o",
    (valor) => {
      expect(nomeDoPlano(valor)).toBe("Essencial");
      expect(precoDoPlano(valor)).toBe("49,90");
    },
  );
});
