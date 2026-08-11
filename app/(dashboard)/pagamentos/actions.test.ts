import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O prazo do sinal, e por que ele merece teste próprio.
 *
 * Este número decide se o Pix nasce **pagável**. Medido contra a API de produção
 * do Mercado Pago em 2026-08-11: com 2 minutos o MP aceita criar o pagamento sem
 * reclamar, e a recusa acontece no app do banco do cliente, na hora de pagar
 * (`PIXPP02 — conta destino não pode receber esse Pix no momento`). Ou seja, um
 * piso errado não produz erro nenhum do nosso lado — produz um cliente achando
 * que a conta do salão está quebrada.
 *
 * O `<input type="number">` tem `min`/`max`, mas isso é só o navegador: um POST
 * direto, um formulário sem JS ou um valor colado passam por cima. O clamp aqui é
 * a única garantia real.
 */

const escrita = vi.hoisted(() => ({
  tabela: null as string | null,
  operacao: null as "update" | "upsert" | "delete" | null,
  valores: null as Record<string, unknown> | null,
  filtros: [] as [string, unknown][],
  erro: null as { code: string } | null,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  exigirUsuario: async () => "dono-1",
  criarClienteServidor: async () => ({
    from: (tabela: string) => {
      escrita.tabela = tabela;
      const builder: Record<string, unknown> = {
        update: (valores: Record<string, unknown>) => {
          escrita.operacao = "update";
          escrita.valores = valores;
          return builder;
        },
        upsert: (valores: Record<string, unknown>) => {
          escrita.operacao = "upsert";
          escrita.valores = valores;
          return builder;
        },
        delete: () => {
          escrita.operacao = "delete";
          return builder;
        },
        eq: (coluna: string, valor: unknown) => {
          escrita.filtros.push([coluna, valor]);
          return builder;
        },
        then: (resolver: (v: { error: unknown }) => unknown) =>
          Promise.resolve({ error: escrita.erro }).then(resolver),
      };
      return builder;
    },
  }),
}));

const { salvarMensagemSinal, salvarPrazoSinal } = await import("./actions");

function enviar(minutos: unknown) {
  const dados = new FormData();
  dados.set("minutos", String(minutos));
  return salvarPrazoSinal(dados);
}

beforeEach(() => {
  escrita.tabela = null;
  escrita.operacao = null;
  escrita.valores = null;
  escrita.filtros = [];
  escrita.erro = null;
});

describe("salvarPrazoSinal", () => {
  it("grava o valor pedido quando está na faixa", async () => {
    await enviar(15);
    expect(escrita.valores).toEqual({ sinal_minutos_validade: 15 });

    await enviar(45);
    expect(escrita.valores).toEqual({ sinal_minutos_validade: 45 });
  });

  /**
   * O caso que motivou o teste: 2 minutos gerou um QR que o banco do cliente
   * recusou. Abaixo do piso, sobe para o piso em vez de gravar o que veio.
   */
  it("sobe para 15 o que vier abaixo do piso", async () => {
    for (const entrada of [2, 14, 1, 0, -30]) {
      await enviar(entrada);
      expect(escrita.valores, String(entrada)).toEqual({
        sinal_minutos_validade: 15,
      });
    }
  });

  it("limita em 1440 (um dia)", async () => {
    await enviar(99999);
    expect(escrita.valores).toEqual({ sinal_minutos_validade: 1440 });
  });

  it("arredonda fracionário — a coluna é int", async () => {
    await enviar(20.6);
    expect(escrita.valores).toEqual({ sinal_minutos_validade: 21 });
  });

  /** Valor não numérico não grava nada: o formulário volta com o atual. */
  it("ignora entrada que não é número", async () => {
    for (const entrada of ["", "abc", "  "]) {
      await enviar(entrada);
      expect(escrita.valores, JSON.stringify(entrada)).toBeNull();
    }
  });

  it("escreve apenas na coluna do prazo, e só no próprio tenant", async () => {
    await enviar(30);

    expect(Object.keys(escrita.valores ?? {})).toEqual([
      "sinal_minutos_validade",
    ]);
    expect(escrita.filtros).toEqual([["id", "dono-1"]]);
  });

  it("erro do banco não propaga", async () => {
    escrita.erro = { code: "42501" };
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(enviar(30)).resolves.toBeUndefined();
  });
});

/**
 * Os textos do bot personalizados pelo dono.
 *
 * Diferente do prazo, aqui **recusar é o ponto**: um placeholder digitado errado
 * que passasse chegaria como `{valro}` no WhatsApp do cliente, e o dono
 * descobriria dias depois, por ele.
 */
describe("salvarMensagemSinal", () => {
  function enviar(chave: string, texto: string) {
    const dados = new FormData();
    dados.set("chave", chave);
    dados.set("texto", texto);
    return salvarMensagemSinal(undefined, dados);
  }

  it("grava o texto com upsert na chave do tenant", async () => {
    const estado = await enviar("sinal_cobranca", "Pague {valor} até {prazo}");

    expect(estado).toMatchObject({ ok: true, chave: "sinal_cobranca" });
    expect(escrita.tabela).toBe("mensagens_tenant");
    expect(escrita.operacao).toBe("upsert");
    expect(escrita.valores).toMatchObject({
      usuario_id: "dono-1",
      chave: "sinal_cobranca",
      texto: "Pague {valor} até {prazo}",
    });
  });

  /**
   * Campo em branco APAGA a linha. Gravar string vazia faria o bot enviar
   * mensagem em branco — a Evolution aceita e o cliente recebe a bolha vazia.
   */
  it("branco apaga a linha em vez de gravar vazio", async () => {
    const estado = await enviar("sinal_recebido", "   ");

    expect(estado).toMatchObject({ ok: true });
    expect(escrita.operacao).toBe("delete");
    expect(escrita.filtros).toEqual([
      ["usuario_id", "dono-1"],
      ["chave", "sinal_recebido"],
    ]);
  });

  /**
   * `restaurar` apaga a linha sem passar pela validação: o campo nasce preenchido
   * com o padrão, então "voltar atrás" não pode depender de o dono limpar o texto
   * à mão — e um texto inválido na tela não pode impedir a restauração.
   */
  it("restaurar apaga a linha mesmo com texto inválido no campo", async () => {
    const dados = new FormData();
    dados.set("chave", "sinal_cobranca");
    dados.set("texto", "sem placeholder nenhum");
    dados.set("acao", "restaurar");

    const estado = await salvarMensagemSinal(undefined, dados);

    expect(estado).toMatchObject({ ok: true, chave: "sinal_cobranca" });
    expect(escrita.operacao).toBe("delete");
  });

  it("recusa placeholder desconhecido, sem escrever nada", async () => {
    const estado = await enviar("sinal_cobranca", "Pague {valro}");

    expect(estado).toMatchObject({ chave: "sinal_cobranca" });
    if (!estado || !("erro" in estado)) throw new Error("esperava erro");
    expect(estado.erro).toContain("{valro}");
    expect(escrita.operacao).toBeNull();
  });

  /** `{prazo}` não existe na confirmação: o pagamento já caiu. */
  it("recusa placeholder de outra chave", async () => {
    const estado = await enviar("sinal_recebido", "Recebi {valor} em {prazo}");

    expect(estado && "erro" in estado).toBe(true);
    expect(escrita.operacao).toBeNull();
  });

  /** Só chega aqui com FormData forjado — a tela manda campo oculto fixo. */
  it("recusa chave fora do vocabulário", async () => {
    const estado = await enviar("sinal_inventado", "qualquer coisa");

    expect(estado).toEqual({ erro: "Mensagem desconhecida.", chave: null });
    expect(escrita.operacao).toBeNull();
  });

  it("erro do banco vira mensagem, com a chave para a tela saber onde mostrar", async () => {
    escrita.erro = { code: "23514" };
    vi.spyOn(console, "error").mockImplementation(() => {});

    // Com `{prazo}`: sem ele o texto para na validação e o teste mediria outra
    // coisa que não o erro do banco.
    const estado = await enviar("sinal_cobranca", "Pague {valor} até {prazo}");

    expect(estado).toEqual({
      erro: "Não foi possível salvar este texto.",
      chave: "sinal_cobranca",
    });
  });
});
