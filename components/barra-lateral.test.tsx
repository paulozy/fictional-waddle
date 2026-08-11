// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import {
  BarraLateral,
  type GrupoNavegacao,
} from "@/components/barra-lateral";
import { COOKIE_SIDEBAR_RECOLHIDA } from "@/lib/preferencias-ui";
import type { ItemNavegacao } from "@/components/navegacao-dashboard";
import type { EstadoConexao } from "@/lib/tipos";

/**
 * O que dá para afirmar aqui, e o que não dá.
 *
 * O jsdom não tem engine de layout nem cascata CSS, então nada neste arquivo
 * prova que a lateral aparece a partir de `md` (isso é `md:flex` aplicando, e
 * só um navegador responde) nem que recolhida ela mede 64px. `toHaveClass`
 * afirmaria que a classe foi escrita, não que o pixel existe.
 *
 * O que **é** verificável é o contrato que quebraria em silêncio: quem se
 * declara página atual, se o menu recolhido continua tendo nome acessível em
 * todo destino, e se o estado recolhido sobrevive ao recarregamento — que é
 * justamente o que o cookie existe para resolver.
 */

const AGENDAMENTOS: ItemNavegacao = {
  href: "/agendamentos",
  rotulo: "Agendamentos",
  icone: "agenda",
};
const SERVICOS: ItemNavegacao = {
  href: "/servicos",
  rotulo: "Serviços",
  icone: "servicos",
};
const WHATSAPP: ItemNavegacao = {
  href: "/conexao-whatsapp",
  rotulo: "WhatsApp",
  icone: "whatsapp",
};
const CONTA: ItemNavegacao = { href: "/conta", rotulo: "Conta", icone: "conta" };

const GRUPOS: GrupoNavegacao[] = [
  { titulo: "Operação", itens: [AGENDAMENTOS] },
  { titulo: "Configuração", itens: [SERVICOS, WHATSAPP] },
];

const caminhoAtual = vi.hoisted(() => ({ valor: "/agendamentos" }));

vi.mock("next/navigation", () => ({
  usePathname: () => caminhoAtual.valor,
}));

// `AlternarTema` usa `next-themes`, que precisa de provedor. O tema não é o
// assunto deste arquivo.
vi.mock("@/components/alternar-tema", () => ({
  AlternarTema: () => <button type="button">Alternar tema</button>,
}));

function montar({
  caminho = "/agendamentos",
  recolhidaInicial = false,
  estadoConexao = "conectado",
  linkUpgrade = null,
}: {
  caminho?: string;
  recolhidaInicial?: boolean;
  estadoConexao?: EstadoConexao;
  linkUpgrade?: string | null;
} = {}) {
  caminhoAtual.valor = caminho;
  return render(
    <BarraLateral
      grupos={GRUPOS}
      itemConta={CONTA}
      estadoConexao={estadoConexao}
      recolhidaInicial={recolhidaInicial}
      linkUpgrade={linkUpgrade}
      aoSair={() => {}}
    />,
  );
}

function navegacao() {
  return screen.getByRole("navigation", { name: "Seções do painel" });
}

function botaoRecolher() {
  return screen.getByRole("button", { name: /menu/i });
}

beforeEach(() => {
  // Cada teste começa sem cookie: `document.cookie` é global e persiste entre
  // eles no mesmo arquivo.
  document.cookie = `${COOKIE_SIDEBAR_RECOLHIDA}=; path=/; max-age=0`;
});

afterEach(cleanup);

describe("BarraLateral", () => {
  it("marca como página atual apenas o destino aberto", () => {
    montar({ caminho: "/servicos" });

    const nav = navegacao();
    expect(
      within(nav)
        .getByRole("link", { name: /Serviços/ })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      within(nav)
        .getByRole("link", { name: /Agendamentos/ })
        .getAttribute("aria-current"),
    ).toBeNull();
  });

  it("acende o destino em sub-rota, mas não em prefixo parcial", () => {
    montar({ caminho: "/servicos/123" });
    expect(
      within(navegacao())
        .getByRole("link", { name: /Serviços/ })
        .getAttribute("aria-current"),
    ).toBe("page");

    cleanup();

    montar({ caminho: "/servicos-antigos" });
    expect(
      within(navegacao())
        .getByRole("link", { name: /Serviços/ })
        .getAttribute("aria-current"),
    ).toBeNull();
  });

  it("mantém o nome acessível de todo destino com o menu recolhido", () => {
    montar({ recolhidaInicial: true });

    /**
     * Recolhida, o rótulo vira `sr-only` — se alguém trocar por `hidden` para
     * "simplificar", o link fica com nome vazio, porque o ícone é `aria-hidden`
     * e o símbolo da marca também. É a falha que este teste existe para pegar.
     */
    for (const { rotulo } of [AGENDAMENTOS, SERVICOS, WHATSAPP, CONTA]) {
      expect(
        screen.getByRole("link", { name: new RegExp(rotulo) }),
      ).toBeTruthy();
    }
    expect(screen.getByRole("link", { name: "Encaixaria" })).toBeTruthy();
  });

  it("declara e grava o estado recolhido ao alternar", () => {
    montar();

    const botao = botaoRecolher();
    expect(botao.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(botao);

    expect(botaoRecolher().getAttribute("aria-expanded")).toBe("false");
    // Sem o cookie, recarregar abriria o menu largo de novo e o conteúdo
    // saltaria 196px na primeira pintura.
    expect(document.cookie).toContain(`${COOKIE_SIDEBAR_RECOLHIDA}=1`);
  });

  it("anuncia o estado da conexão em texto, não só em cor", () => {
    montar({ estadoConexao: "conectado" });
    expect(
      within(navegacao()).getByRole("link", { name: /WhatsApp, conectado/ }),
    ).toBeTruthy();

    cleanup();

    /**
     * `conectando` é estado transitório do socket Baileys e **não** significa
     * que alguém leu o QR — no painel ele não pode aparecer como conectado.
     */
    montar({ estadoConexao: "conectando" });
    expect(
      within(navegacao()).getByRole("link", { name: /WhatsApp, desconectado/ }),
    ).toBeTruthy();
  });
});

/**
 * O CTA de upgrade. Quem decide se ele aparece é `app/(dashboard)/layout.tsx`
 * (só no Essencial e só sem bloqueio de assinatura); aqui o que se trava é que a
 * peça obedece ao `href` e some sem ele — sem `WHATSAPP_CONTATO` o link seria um
 * botão para lugar nenhum.
 */
describe("CTA de upgrade", () => {
  function cta() {
    return screen.queryByRole("link", { name: /fazer upgrade/i });
  }

  it("não aparece quando não há link", () => {
    montar({ linkUpgrade: null });

    expect(cta()).toBeNull();
  });

  it("aparece no rodapé, apontando para o WhatsApp", () => {
    montar({ linkUpgrade: "https://wa.me/5511999998888?text=oi" });

    expect(cta()?.getAttribute("href")).toBe(
      "https://wa.me/5511999998888?text=oi",
    );
  });

  /**
   * Recolhida, o rótulo vive só para leitor de tela — mas precisa continuar
   * existindo, senão o link fica sem nome acessível. É o mesmo arranjo de
   * `ItemLateral`.
   */
  it("mantém nome acessível com o menu recolhido", () => {
    montar({
      linkUpgrade: "https://wa.me/5511999998888",
      recolhidaInicial: true,
    });

    expect(cta()).not.toBeNull();
  });
});
