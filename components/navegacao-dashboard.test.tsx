// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import {
  NavegacaoDashboard,
  type ItemNavegacao,
} from "@/components/navegacao-dashboard";

/**
 * O que dá para afirmar aqui, e o que não dá.
 *
 * O jsdom não tem engine de layout nem cascata CSS: `getBoundingClientRect()`
 * devolve zero e classe do Tailwind é string opaca. Então nada neste arquivo
 * prova que a barra inferior aparece no celular e some no desktop — isso é
 * `md:hidden` aplicando de verdade, e só um navegador responde.
 *
 * O que **é** verificável é o contrato de acessibilidade, que é justamente o
 * que estava faltando antes: qual destino se declara como a página atual, e se
 * o que foi para dentro do "Mais" continua alcançável.
 *
 * Sem `@testing-library/jest-dom` e sem `user-event`: nenhum dos dois está no
 * projeto, e um teste não é motivo para acrescentar dependência. `fireEvent` e
 * asserção sobre atributo dão conta.
 */

const ABAS: ItemNavegacao[] = [
  {
    href: "/agendamentos",
    rotulo: "Agendamentos",
    rotuloCurto: "Agenda",
    icone: "agenda",
  },
  { href: "/servicos", rotulo: "Serviços", icone: "servicos" },
  { href: "/horarios", rotulo: "Horários", icone: "horarios" },
];

const EXTRAS: ItemNavegacao[] = [
  { href: "/fluxo-conversa", rotulo: "Fluxo da conversa", icone: "fluxo" },
  { href: "/conexao-whatsapp", rotulo: "WhatsApp", icone: "whatsapp" },
];

const caminhoAtual = vi.hoisted(() => ({ valor: "/agendamentos" }));

vi.mock("next/navigation", () => ({
  usePathname: () => caminhoAtual.valor,
}));

function montar(caminho: string) {
  caminhoAtual.valor = caminho;
  return render(
    <NavegacaoDashboard abas={ABAS} itensExtras={EXTRAS} aoSair={() => {}} />,
  );
}

/** A barra inferior; o header (`hidden md:flex`) repete os mesmos destinos. */
function barraInferior() {
  return screen.getByRole("navigation", { name: "Navegação principal" });
}

function paginaAtual(elemento: HTMLElement): boolean {
  return elemento.getAttribute("aria-current") === "page";
}

afterEach(cleanup);

describe("NavegacaoDashboard", () => {
  it("marca como página atual apenas o destino aberto", () => {
    montar("/servicos");

    const barra = barraInferior();
    expect(
      paginaAtual(within(barra).getByRole("link", { name: "Serviços" })),
    ).toBe(true);
    expect(
      paginaAtual(within(barra).getByRole("link", { name: "Agenda" })),
    ).toBe(false);
  });

  it("acende a aba em sub-rota, mas não em prefixo parcial", () => {
    montar("/servicos/123");
    expect(
      paginaAtual(
        within(barraInferior()).getByRole("link", { name: "Serviços" }),
      ),
    ).toBe(true);

    cleanup();

    // `/horarios-antigos` não pode acender "Horários": o corte é na barra.
    montar("/horarios-antigos");
    expect(
      paginaAtual(
        within(barraInferior()).getByRole("link", { name: "Horários" }),
      ),
    ).toBe(false);
  });

  it("acende o 'Mais' quando a página aberta está dentro dele", () => {
    montar("/conexao-whatsapp");

    // Sem isto o dono em "WhatsApp" veria a barra inteira apagada.
    expect(
      paginaAtual(within(barraInferior()).getByRole("button", { name: /Mais/ })),
    ).toBe(true);
  });

  it("alcança os destinos de overflow pelo 'Mais'", async () => {
    montar("/agendamentos");

    // Antes de abrir, o Sheet nem existe no DOM — é o clique que precisa
    // trazer os dois destinos de volta ao alcance.
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(
      within(barraInferior()).getByRole("button", { name: /Mais/ }),
    );

    const painel = await screen.findByRole("dialog");
    expect(
      within(painel).getByRole("link", { name: "Fluxo da conversa" }),
    ).toHaveProperty("pathname", "/fluxo-conversa");
    expect(
      within(painel).getByRole("link", { name: "WhatsApp" }),
    ).toHaveProperty("pathname", "/conexao-whatsapp");
    expect(within(painel).getByRole("button", { name: "Sair" })).toBeTruthy();
  });

  it("mostra todos os cinco destinos na navegação de desktop", () => {
    montar("/agendamentos");

    // O header não some do DOM em tela estreita — é `hidden md:flex`, decidido
    // por CSS. Ele existe sempre, e é onde ficam os cinco rótulos completos.
    const cabecalho = screen.getAllByRole("navigation")[0];
    for (const { rotulo } of [...ABAS, ...EXTRAS]) {
      expect(within(cabecalho).getByRole("link", { name: rotulo })).toBeTruthy();
    }
  });
});
