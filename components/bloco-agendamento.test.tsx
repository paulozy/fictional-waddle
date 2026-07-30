// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BlocoAgendamento } from "@/components/bloco-agendamento";
import type { BlocoCalendario } from "@/lib/calendario";

/**
 * O que dá para afirmar aqui, e o que não dá.
 *
 * O jsdom não tem layout nem cascata: `getBoundingClientRect()` devolve zero e classe
 * do Tailwind é string opaca. Então **nada aqui prova** que o glifo aparece no canto,
 * que o anel de hover pinta, ou que o popover não é recortado pelo `overflow-hidden` —
 * isso é navegador, e está na lista de verificação manual.
 *
 * O que é verificável, e é justamente o que estava errado antes, é o **contrato de
 * acessibilidade do gatilho**: como o bloco se anuncia, e se ele se anuncia pela ação
 * destrutiva ou pelo que ele é.
 *
 * O conteúdo do popover não é exercitado: o Radix o monta em portal com medição de
 * posição, e o valor de afirmar isso em jsdom seria baixo perto da fragilidade. A regra
 * que decide o rodapé (`motivoNaoCancelavel`) é pura e está coberta em
 * `lib/calendario.test.ts`.
 *
 * Sem `@testing-library/jest-dom` e sem `user-event`: nenhum dos dois está no projeto.
 */

vi.mock("@/app/(dashboard)/agendamentos/actions", () => ({
  cancelarAgendamento: vi.fn(),
}));

afterEach(cleanup);

function bloco(sobrescritas: Partial<BlocoCalendario> = {}): BlocoCalendario {
  return {
    id: "ag-1",
    coluna: 3,
    data: "2026-08-12",
    rotuloDia: "qua",
    rotuloNumero: "12/08",
    linhaInicio: 3,
    linhasOcupadas: 2,
    horaInicio: "09:00",
    horaFim: "10:00",
    titulo: "Corte de cabelo",
    cliente: "Joana",
    status: "confirmado",
    compacto: false,
    ...sobrescritas,
  };
}

describe("BlocoAgendamento", () => {
  /**
   * A regressão que importa. Antes o botão era `aria-label="Cancelar agendamento: …"`,
   * o que fazia o leitor de tela varrer a semana ouvindo uma fileira de "Cancelar
   * agendamento" — sem forma de ler um item sem mirar numa ação destrutiva.
   */
  it("não se anuncia pela ação destrutiva", () => {
    render(<BlocoAgendamento bloco={bloco()} cancelavel />);

    /**
     * A asserção é sobre o **nome acessível calculado** (`getByRole` usa
     * `dom-accessibility-api`), e não sobre `textContent`: um `aria-label` não aparece
     * em `textContent`, então checar o texto não pegaria justamente a regressão que
     * este teste existe para pegar.
     */
    expect(screen.queryByRole("button", { name: /cancelar/i })).toBeNull();

    // E o nome vem de texto, não de `aria-label`, para sempre conter o rótulo visível
    // (WCAG 2.5.3 Label in Name) — um `aria-label` reescrito quebraria isso.
    expect(screen.getByRole("button").getAttribute("aria-label")).toBeNull();
  });

  it("anuncia dia, data, horário, cliente e status", () => {
    render(<BlocoAgendamento bloco={bloco()} cancelavel />);

    // Nome acessível calculado, não textContent.
    const botao = screen.getByRole("button", {
      name: /qua 12\/08 · 09:00–10:00 · Joana · Corte de cabelo · Confirmado/,
    });

    expect(botao).toBeTruthy();
  });

  /**
   * O `title` era o único portador do nome do cliente em bloco compacto, e não aparece
   * em toque nem é anunciado com confiança. Se ele voltar, o dado volta a ser
   * inacessível — daí o teste.
   */
  it("não usa title para carregar informação", () => {
    const { container } = render(
      <BlocoAgendamento bloco={bloco({ compacto: true })} cancelavel />,
    );

    expect(container.querySelector("[title]")).toBeNull();
  });

  /** Mesmo em bloco compacto, onde o cliente não é desenhado, ele é anunciado. */
  it("anuncia o cliente mesmo no bloco compacto", () => {
    render(<BlocoAgendamento bloco={bloco({ compacto: true })} cancelavel />);

    expect(screen.getByRole("button").textContent).toContain("Joana");
  });

  /** Radix marca o gatilho como abridor de diálogo; é o que o leitor de tela usa. */
  it("declara que abre um painel", () => {
    render(<BlocoAgendamento bloco={bloco()} cancelavel />);

    const botao = screen.getByRole("button");
    expect(botao.getAttribute("aria-haspopup")).toBe("dialog");
    expect(botao.getAttribute("aria-expanded")).toBe("false");
  });

  /** Cancelável ou não, o bloco é legível — é o que permitiu matar o `title`. */
  it("é gatilho mesmo quando não é cancelável", () => {
    render(<BlocoAgendamento bloco={bloco({ status: "falta" })} cancelavel={false} />);

    const nome = screen.getByRole("button").textContent ?? "";
    expect(nome).toContain("Faltou");
    expect(nome).toContain("Joana");
  });
});
