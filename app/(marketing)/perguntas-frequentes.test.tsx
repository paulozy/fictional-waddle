// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PerguntasFrequentes } from "./perguntas-frequentes";
import { PERGUNTAS } from "./perguntas";

/**
 * Este arquivo existe por causa de uma regressão específica, não por cobertura.
 *
 * O FAQ vivia num `Accordion` do Radix, que **desmonta o conteúdo fechado**. As
 * perguntas iam para o HTML; as respostas, não. Como o Google não clica em nada,
 * as ~750 palavras mais específicas do produto simplesmente não existiam para a
 * busca — e nada no código dizia que estava errado.
 *
 * A asserção que importa é a **ausência de interação**: nenhum `fireEvent` antes
 * de procurar a resposta. Se alguém trocar `<details>` por um componente que
 * monta sob demanda, este teste cai.
 */

afterEach(cleanup);

describe("dados das perguntas", () => {
  it("tem pergunta e resposta em todas", () => {
    for (const { pergunta, resposta } of PERGUNTAS) {
      expect(pergunta.trim().length).toBeGreaterThan(0);
      expect(resposta.trim().length).toBeGreaterThan(0);
    }
  });

  /** A pergunta é a `key` da lista: duplicata viraria aviso do React. */
  it("não repete pergunta", () => {
    const perguntas = PERGUNTAS.map((p) => p.pergunta);

    expect(new Set(perguntas).size).toBe(perguntas.length);
  });
});

describe("PerguntasFrequentes", () => {
  it("renderiza toda resposta no DOM sem nenhum clique", () => {
    render(<PerguntasFrequentes />);

    for (const { resposta } of PERGUNTAS) {
      expect(screen.getByText(resposta)).toBeTruthy();
    }
  });

  it("renderiza toda pergunta", () => {
    render(<PerguntasFrequentes />);

    for (const { pergunta } of PERGUNTAS) {
      expect(screen.getByText(pergunta)).toBeTruthy();
    }
  });

  /**
   * `name` compartilhado é o que dá "só um aberto por vez" sem JavaScript. Sem
   * ele o comportamento muda em silêncio: todos abertos de uma vez, o que não
   * quebra o SEO mas quebra o desenho da seção.
   */
  it("agrupa os itens pelo mesmo name, para abrir um por vez", () => {
    const { container } = render(<PerguntasFrequentes />);
    const itens = Array.from(container.querySelectorAll("details"));

    expect(itens).toHaveLength(PERGUNTAS.length);
    for (const item of itens) {
      expect(item.getAttribute("name")).toBe("perguntas");
    }
  });
});
