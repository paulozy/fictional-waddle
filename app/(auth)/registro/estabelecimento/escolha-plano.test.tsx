// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PLANOS } from "@/lib/plano";
import { EscolhaPlano } from "./escolha-plano";

/**
 * O que este arquivo protege é o **contrato com o FormData**, não a aparência.
 *
 * O jsdom não tem engine de layout: `min-h-11` aqui é string opaca, e afirmar que
 * a classe existe não afirma que o alvo tem 44px. Tamanho de toque e o estado
 * visual de `has-[:checked]` só se verificam em navegador.
 *
 * O que dá para verificar, e que quebraria em silêncio: o `name` que a Server
 * Action lê, os valores que o CHECK do banco aceita, e qual opção nasce marcada —
 * um `defaultChecked` errado faria a tela reentrante mostrar o plano que a pessoa
 * não escolheu, e o reenvio gravaria justamente esse.
 */

afterEach(cleanup);

function radios(): HTMLInputElement[] {
  return screen.getAllByRole("radio");
}

describe("EscolhaPlano", () => {
  it("oferece um radio por plano, todos sob o mesmo name", () => {
    render(<EscolhaPlano planoInicial="basico" />);

    expect(radios()).toHaveLength(PLANOS.length);
    for (const radio of radios()) {
      expect(radio.name).toBe("plano");
    }
  });

  /**
   * Os valores são os do banco (`basico`/`sinal`), nunca os nomes de venda. Um
   * `value="garantido"` seria recusado pelo CHECK e cairia no Essencial pelo
   * `catch` do schema — o dono escolheria o Garantido e receberia o outro, sem
   * erro em lugar nenhum.
   */
  it("manda o valor do banco, não o nome comercial", () => {
    render(<EscolhaPlano planoInicial="basico" />);

    expect(radios().map((r) => r.value).sort()).toEqual(["basico", "sinal"]);
  });

  it.each(["basico", "sinal"])(
    "marca %s quando é o plano atual do perfil",
    (plano) => {
      render(<EscolhaPlano planoInicial={plano} />);

      const marcados = radios().filter((r) => r.checked);

      expect(marcados).toHaveLength(1);
      expect(marcados[0].value).toBe(plano);
    },
  );

  /**
   * Valor desconhecido no banco não pode deixar o grupo sem marcação: um radio
   * group vazio envia `plano` ausente, e o cadastro seguiria sem a escolha
   * aparecer na tela como pendente.
   */
  it("não deixa o grupo sem nenhuma opção marcada", () => {
    render(<EscolhaPlano planoInicial="basico" />);

    expect(radios().some((r) => r.checked)).toBe(true);
  });

  it("mostra o preço de cada plano junto do nome", () => {
    render(<EscolhaPlano planoInicial="basico" />);

    for (const plano of PLANOS) {
      expect(screen.getByText(plano.nome)).toBeDefined();
      expect(screen.getByText(`R$ ${plano.preco}/mês`)).toBeDefined();
    }
  });

  /**
   * A exigência do Mercado Pago aparece junto da escolha, e não só na tela de
   * conexão: descobrir depois de assinar que precisa abrir conta em outro lugar é
   * a pior hora possível. É a mesma regra que `/precos` segue.
   */
  it("avisa da conta do Mercado Pago no cartão que a exige", () => {
    render(<EscolhaPlano planoInicial="basico" />);

    expect(screen.getByText(/Mercado Pago/)).toBeDefined();
  });
});
