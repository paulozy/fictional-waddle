import { describe, expect, it } from "vitest";
import { IDENTIFICACAO_LEGAL, MARCADOR_PENDENTE } from "./site";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ESTE TESTE FALHA DE PROPÓSITO. NÃO É BUG, E NÃO DEVE SER PULADO.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ele é o portão que impede `/sobre` e `/privacidade` de ir ao ar com
 * `[RAZÃO SOCIAL]` no lugar do controlador dos dados. A LGPD (Art. 9º, I) dá ao
 * titular o direito de saber quem controla os dados dele, e aqui os dados são o
 * cadastro dos clientes de um terceiro — o dono do salão está confiando isso a
 * alguém que ele precisa poder identificar e acionar.
 *
 * **Para apagar a falha:** preencher os três campos de `IDENTIFICACAO_LEGAL` em
 * `lib/site.ts` com a razão social, o CNPJ e o e-mail de contato reais. Nada mais
 * precisa mudar — as páginas e o `Organization` do JSON-LD leem de lá, e o
 * `noindex` dessas páginas cai sozinho quando `identificacaoPendente()` deixa de
 * ser verdadeiro.
 *
 * Não trocar por `it.skip` nem por `it.todo`: os dois passam, e passar é
 * exatamente o que não pode acontecer enquanto a informação não existir.
 */
describe("identificação do controlador dos dados", () => {
  it.each(Object.entries(IDENTIFICACAO_LEGAL))(
    "%s está preenchido com o valor real",
    (campo, valor) => {
      expect(
        MARCADOR_PENDENTE.test(valor),
        `\n\n  PENDÊNCIA: "${campo}" ainda está como marcador (${valor}).\n` +
          `  Preencha IDENTIFICACAO_LEGAL em lib/site.ts antes de publicar\n` +
          `  /sobre e /privacidade — hoje elas exibem este texto ao visitante.\n`,
      ).toBe(false);
    },
  );
});
