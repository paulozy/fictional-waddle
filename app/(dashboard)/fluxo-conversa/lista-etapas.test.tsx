// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ListaEtapas, type EtapaDaLista } from "./lista-etapas";

/**
 * O que este arquivo cobre: a reordenação **por botão**, que é o caminho que o
 * celular tem. O arraste do dnd-kit não é testável aqui — depende de eventos de
 * ponteiro com captura e de medição de layout, e o próprio dnd-kit testa o dele
 * em navegador de verdade. Essa é uma das razões de as setas serem o controle
 * primário e não um extra.
 */

const reordenarEtapas = vi.hoisted(() => vi.fn());

vi.mock("./actions", () => ({
  reordenarEtapas,
  editarPergunta: vi.fn(),
  removerEtapa: vi.fn(),
}));

function etapa(
  id: string,
  tipo: EtapaDaLista["tipo"],
  pergunta: string,
): EtapaDaLista {
  return {
    id,
    tipo,
    campo_destino: tipo === "escolha_unica" ? "primeira_vez" : null,
    ativo: true,
    ordem: 0,
    pergunta_texto: pergunta,
    opcoes: null,
    obrigatorio: true,
  };
}

const ETAPAS: EtapaDaLista[] = [
  etapa("s1", "servico", "Qual serviço?"),
  etapa("p1", "escolha_unica", "Primeira vez aqui?"),
  etapa("h1", "horario", "Qual horário?"),
  etapa("c1", "confirmacao", "Confirma?"),
];

function seta(direcao: "cima" | "baixo", pergunta: string) {
  return screen.getByRole("button", {
    name: new RegExp(`Mover para ${direcao}.*${pergunta}`),
  }) as HTMLButtonElement;
}

beforeEach(() => {
  reordenarEtapas.mockReset();
  reordenarEtapas.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe("ListaEtapas — reordenar por botão", () => {
  it("sobe uma etapa e persiste a ordem nova", async () => {
    render(<ListaEtapas etapas={ETAPAS} />);

    fireEvent.click(seta("cima", "Primeira vez aqui\\?"));

    await waitFor(() => {
      expect(reordenarEtapas).toHaveBeenCalledWith(["p1", "s1", "h1", "c1"]);
    });
  });

  it("desce uma etapa e persiste a ordem nova", async () => {
    render(<ListaEtapas etapas={ETAPAS} />);

    fireEvent.click(seta("baixo", "Primeira vez aqui\\?"));

    await waitFor(() => {
      expect(reordenarEtapas).toHaveBeenCalledWith(["s1", "h1", "p1", "c1"]);
    });
  });

  it("renumera a lista depois do movimento", async () => {
    render(<ListaEtapas etapas={ETAPAS} />);

    fireEvent.click(seta("cima", "Primeira vez aqui\\?"));

    // O rótulo carrega o número da posição: se a lista não renumerar, o leitor
    // de tela passa a anunciar a posição errada depois do primeiro movimento.
    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: /Mover para baixo: etapa 1, Primeira vez aqui\?/,
        }),
      ).toBeTruthy();
    });
  });

  it("desabilita os movimentos impossíveis, sem esconder o botão", () => {
    render(<ListaEtapas etapas={ETAPAS} />);

    // Primeira da lista não sobe.
    expect(seta("cima", "Qual serviço\\?").disabled).toBe(true);
    // Descer o horário jogaria algo para depois da confirmação.
    expect(seta("baixo", "Qual horário\\?").disabled).toBe(true);
    // A confirmação é sempre a última — não desce nem sobe (subir tiraria ela
    // do fim).
    expect(seta("baixo", "Confirma\\?").disabled).toBe(true);
    expect(seta("cima", "Confirma\\?").disabled).toBe(true);

    expect(seta("cima", "Primeira vez aqui\\?").disabled).toBe(false);
  });

  it("não chama o servidor quando o movimento é impossível", () => {
    render(<ListaEtapas etapas={ETAPAS} />);

    fireEvent.click(seta("cima", "Qual serviço\\?"));

    expect(reordenarEtapas).not.toHaveBeenCalled();
  });

  it("desfaz a ordem na tela quando o servidor recusa", async () => {
    reordenarEtapas.mockResolvedValue({ erro: "Não foi possível reordenar." });
    render(<ListaEtapas etapas={ETAPAS} />);

    fireEvent.click(seta("cima", "Primeira vez aqui\\?"));

    // A ordem é otimista; sem o rollback a tela ficaria mentindo sobre o que
    // está gravado.
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(
        /Não foi possível reordenar/,
      );
    });
    expect(
      screen.getByRole("button", {
        name: /Mover para cima: etapa 2, Primeira vez aqui\?/,
      }),
    ).toBeTruthy();
  });

  it("descreve os três caminhos de reordenação no texto de ajuda", () => {
    render(<ListaEtapas etapas={ETAPAS} />);

    // O texto antigo prometia só arraste, que é o caminho que não funcionava
    // em toque.
    expect(screen.getByText(/setas para mudar a ordem/i)).toBeTruthy();
  });
});
