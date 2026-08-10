// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Passos, TOTAL_PASSOS } from "./passos";

/**
 * O que se pode afirmar aqui: quantas barras existem, quais estão preenchidas e o
 * que o texto anuncia. **Não** se pode afirmar cor nem largura — o jsdom não tem
 * cascata CSS, e `bg-primary` é string opaca para ele. Daí o `data-preenchido`:
 * ele carrega o estado de forma verificável, e a classe só o traduz em cor.
 */

afterEach(cleanup);

function barras() {
  return Array.from(
    document.querySelectorAll<HTMLElement>("[data-preenchido]"),
  ).map((barra) => barra.dataset.preenchido);
}

describe("indicador de passos", () => {
  it("anuncia o passo em texto, não só em cor", () => {
    render(<Passos atual={2} />);

    expect(screen.getByText(`Passo 2 de ${TOTAL_PASSOS}`)).toBeTruthy();
  });

  it("preenche uma barra por passo já alcançado", () => {
    render(<Passos atual={1} />);
    expect(barras()).toEqual(["true", "false", "false"]);

    cleanup();
    render(<Passos atual={2} />);
    expect(barras()).toEqual(["true", "true", "false"]);

    cleanup();
    render(<Passos atual={3} />);
    expect(barras()).toEqual(["true", "true", "true"]);
  });

  /**
   * As barras não devem ser lidas por leitor de tela: são três elementos vazios,
   * e a informação inteira já está na frase acima delas.
   */
  it("esconde as barras da árvore de acessibilidade", () => {
    const { container } = render(<Passos atual={1} />);

    const grupo = container.querySelector("[aria-hidden]");
    expect(grupo).not.toBeNull();
    expect(grupo?.querySelectorAll("[data-preenchido]")).toHaveLength(
      TOTAL_PASSOS,
    );
  });
});
