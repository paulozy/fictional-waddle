// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * Regressão da tela anterior, que era uma só para dois caminhos.
 *
 * O `/login` antigo tinha **dois** botões de submit ("Entrar" e "Criar conta")
 * dividindo um campo de senha, e disso vinham dois defeitos que nada verificava:
 * o campo declarava `autoComplete="current-password"` mesmo servindo ao cadastro
 * — errado para o gerenciador de senha em metade dos usos — e não havia saída
 * nenhuma para quem esqueceu a senha.
 *
 * O que **não** dá para afirmar aqui: tamanho de alvo, 16px de fonte, ausência de
 * transbordo. O jsdom não tem cascata CSS nem layout, então `toHaveClass` provaria
 * apenas que alguém escreveu a classe. Aquilo se mede em navegador.
 */

vi.mock("../actions", () => ({ entrar: vi.fn() }));

const { FormularioLogin } = await import("./formulario-login");

afterEach(cleanup);

describe("formulário de login", () => {
  it("tem um único botão de submit", () => {
    render(<FormularioLogin recado={null} />);

    const submits = screen
      .getAllByRole("button")
      .filter((botao) => botao.getAttribute("type") === "submit");

    expect(submits).toHaveLength(1);
    expect(submits[0].textContent).toBe("Entrar");
  });

  it("oferece caminho para quem esqueceu a senha", () => {
    render(<FormularioLogin recado={null} />);

    const link = screen.getByRole("link", { name: "Esqueci a senha" });
    expect(link.getAttribute("href")).toBe("/recuperar-senha");
  });

  it("manda quem não tem conta para o cadastro, não para cá", () => {
    render(<FormularioLogin recado={null} />);

    const link = screen.getByRole("link", { name: "Criar conta" });
    expect(link.getAttribute("href")).toBe("/registro");
  });

  /**
   * Agora que a tela só serve para entrar, o campo pode declarar a intenção certa
   * — e o gerenciador de senha volta a oferecer a senha salva a quem entra todo
   * dia, sem prejudicar quem está criando conta (que tem tela própria, com
   * `new-password`).
   */
  it("declara `current-password` no campo de senha", () => {
    render(<FormularioLogin recado={null} />);

    const senha = screen.getByLabelText("Senha");
    expect(senha.getAttribute("autocomplete")).toBe("current-password");
    expect(senha.getAttribute("type")).toBe("password");
  });

  it("exibe o recado de link expirado como status, não como alerta", () => {
    render(<FormularioLogin recado="Esse link não vale mais." />);

    const recado = screen.getByRole("status");
    expect(recado.textContent).toBe("Esse link não vale mais.");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
