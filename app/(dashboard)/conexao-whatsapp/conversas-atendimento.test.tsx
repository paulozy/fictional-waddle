// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  ConversasAtendimento,
  type ConversaAtendimento,
} from "./conversas-atendimento";

/**
 * O que o jsdom pode afirmar aqui é o **sentido do botão**, e é o que importa: a
 * mesma linha significa duas coisas opostas conforme a conversa esteja pausada ou
 * não, e inverter isso faria o dono devolver ao bot quando quis assumir — e o bot
 * responder por cima dele.
 *
 * Tamanho de alvo, transbordo e quebra de linha não são verificáveis aqui (o
 * jsdom não tem engine de layout): isso é medição em navegador.
 */

const definirPausaConversa = vi.hoisted(() => vi.fn());
vi.mock("./actions", () => ({ definirPausaConversa }));

const ATIVA: ConversaAtendimento = {
  remoteJid: "5511999998888@s.whatsapp.net",
  rotulo: "Joana",
  pausadoAte: null,
  ultimaAtividade: "há 5 min",
};

const PAUSADA: ConversaAtendimento = {
  remoteJid: "5511977776666@s.whatsapp.net",
  rotulo: "Marcos",
  pausadoAte: "10/08, 16:00",
  ultimaAtividade: "há 2 min",
};

beforeEach(() => {
  definirPausaConversa.mockReset();
  definirPausaConversa.mockResolvedValue({ erro: null });
});

afterEach(cleanup);

describe("ConversasAtendimento", () => {
  it("não renderiza nada sem conversa — nem cabeçalho vazio", () => {
    const { container } = render(<ConversasAtendimento conversas={[]} />);

    expect(container.textContent).toBe("");
  });

  it("conversa do bot oferece assumir; conversa pausada oferece devolver", () => {
    render(<ConversasAtendimento conversas={[ATIVA, PAUSADA]} />);

    expect(screen.getByText("Joana")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Assumir conversa" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Devolver ao bot" })).toBeTruthy();
  });

  it("mostra quando o bot volta, no fuso já formatado pelo servidor", () => {
    render(<ConversasAtendimento conversas={[PAUSADA]} />);

    expect(screen.getByText(/o bot volta 10\/08, 16:00/)).toBeTruthy();
  });

  it("assumir pede pausa; devolver pede retomada", async () => {
    render(<ConversasAtendimento conversas={[ATIVA, PAUSADA]} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Assumir conversa" }));
    });
    expect(definirPausaConversa).toHaveBeenCalledWith(ATIVA.remoteJid, true);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Devolver ao bot" }));
    });
    expect(definirPausaConversa).toHaveBeenCalledWith(PAUSADA.remoteJid, false);
  });

  it("erro do servidor aparece na tela em vez de sumir", async () => {
    definirPausaConversa.mockResolvedValue({ erro: "Falhou aqui." });

    render(<ConversasAtendimento conversas={[ATIVA]} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Assumir conversa" }));
    });

    expect(screen.getByText("Falhou aqui.")).toBeTruthy();
  });
});
