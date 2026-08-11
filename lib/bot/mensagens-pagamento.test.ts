import { describe, expect, it } from "vitest";

import {
  MODELO_PADRAO_COBRANCA,
  MODELO_PADRAO_RECEBIDO,
  formatarValor,
  montarTextoCobrancaSinal,
  montarTextoCodigoPix,
  montarTextoSinalExpirado,
  montarTextoSinalRecebido,
  montarTextoSinalSemHorario,
} from "./mensagens-pagamento";
import { validarModelo } from "./modelo-mensagem";

const FUSO = "America/Sao_Paulo";
const COPIA_E_COLA =
  "00020126580014br.gov.bcb.pix0136a629532e-7693-4846-b028-f142082d7b075204000053039865802BR5913Fulano6008BRASILIA62070503***63041D3D";

describe("formatarValor", () => {
  it("formata centavos em reais", () => {
    //   é o espaço não-quebrável que o Intl usa entre "R$" e o número.
    expect(formatarValor(2000)).toBe("R$ 20,00");
    expect(formatarValor(1999)).toBe("R$ 19,99");
    expect(formatarValor(500)).toBe("R$ 5,00");
  });
});

describe("montarTextoCobrancaSinal", () => {
  const dados = {
    valorCentavos: 2000,
    // 17:30 UTC = 14:30 em São Paulo.
    expiraEm: new Date("2026-08-09T17:30:00.000Z"),
    fusoHorario: FUSO,
    servicoNome: "Corte masculino",
    // 12:30 UTC = 09:30 em São Paulo. Só alimenta o `{quando}` do modelo do dono;
    // o texto padrão não cita o horário do agendamento.
    dataHora: "2026-08-10T12:30:00.000Z",
  };

  it("diz valor, prazo e serviço", () => {
    const texto = montarTextoCobrancaSinal(dados);

    expect(texto).toContain("R$ 20,00");
    expect(texto).toContain("Corte masculino");
    expect(texto).toContain("14:30");
  });

  it("usa o fuso do estabelecimento, não UTC", () => {
    const texto = montarTextoCobrancaSinal(dados);
    expect(texto).toContain("14:30");
    expect(texto).not.toContain("17:30");
  });

  it("avisa que o horário volta a ficar disponível", () => {
    // Sem isso o cliente não tem como saber que o prazo tem consequência, e a
    // expiração vira reclamação.
    expect(montarTextoCobrancaSinal(dados)).toMatch(/volta a ficar disponível/i);
  });

  it("NÃO contém o código Pix", () => {
    // O copia-e-cola vai numa mensagem própria: no WhatsApp o cliente segura
    // para copiar, e texto em volta entra na cópia e faz o banco recusar.
    expect(montarTextoCobrancaSinal(dados)).not.toContain(COPIA_E_COLA);
  });
});

describe("montarTextoCodigoPix", () => {
  it("devolve o payload SOZINHO, sem nada em volta", () => {
    const texto = montarTextoCodigoPix(COPIA_E_COLA);
    expect(texto).toBe(COPIA_E_COLA);
  });

  it("não acrescenta espaço nem quebra de linha", () => {
    const texto = montarTextoCodigoPix(COPIA_E_COLA);
    expect(texto).toBe(texto.trim());
    expect(texto).not.toContain("\n");
  });
});

describe("montarTextoSinalRecebido", () => {
  it("confirma com valor, serviço e horário", () => {
    const texto = montarTextoSinalRecebido({
      valorCentavos: 2000,
      servicoNome: "Corte",
      quando: "sex 14/08 às 09:00",
    });

    expect(texto).toContain("R$ 20,00");
    expect(texto).toContain("Corte");
    expect(texto).toContain("sex 14/08 às 09:00");
    expect(texto).toMatch(/confirmado/i);
  });
});

describe("montarTextoSinalSemHorario", () => {
  const texto = montarTextoSinalSemHorario("Barbearia do Zé");

  it("diz com todas as letras que nada foi marcado", () => {
    expect(texto).toMatch(/nada foi marcado/i);
  });

  it("manda o cliente resolver com o estabelecimento", () => {
    // O dinheiro está na conta do dono, nunca na nossa: quem devolve é ele.
    expect(texto).toContain("Barbearia do Zé");
  });

  it("NÃO promete prazo de devolução", () => {
    // Contestação de Pix bloqueia por até 7 dias, e a decisão de devolver é do
    // estabelecimento — qualquer prazo aqui é promessa que não controlamos.
    expect(texto).not.toMatch(/\d+\s*(dia|hora|minuto)/i);
    expect(texto).not.toMatch(/imediat|na hora|agora mesmo/i);
  });

  it("não culpa o cliente", () => {
    expect(texto).not.toMatch(/você (demorou|atrasou|perdeu)/i);
  });
});

describe("montarTextoSinalExpirado", () => {
  it("explica e reabre o caminho", () => {
    const texto = montarTextoSinalExpirado();
    expect(texto).toMatch(/prazo/i);
    expect(texto).toMatch(/mensagem/i);
  });
});

/**
 * Modelo personalizado do dono (`mensagens_tenant`).
 *
 * O que se prende aqui é o fallback e a fronteira: sem modelo, o texto padrão
 * intacto; com modelo, os placeholders resolvidos no fuso do estabelecimento. E o
 * copia-e-cola continua fora, sempre — é a garantia que faz o Pix ser colável.
 */
describe("modelo personalizado", () => {
  const base = {
    valorCentavos: 2000,
    expiraEm: new Date("2026-08-09T17:30:00.000Z"),
    fusoHorario: FUSO,
    servicoNome: "Corte masculino",
    dataHora: "2026-08-10T12:30:00.000Z",
  };

  it("sem modelo, mantém o texto padrão", () => {
    expect(montarTextoCobrancaSinal({ ...base, modelo: null })).toBe(
      montarTextoCobrancaSinal(base),
    );
  });

  it("resolve valor, serviço, prazo e horário do agendamento", () => {
    const texto = montarTextoCobrancaSinal({
      ...base,
      modelo: "{servico} em {quando}: {valor} até {prazo}",
    });

    expect(texto).toContain("Corte masculino");
    // `\s?` porque o Intl separa símbolo e número com espaço NÃO-QUEBRÁVEL, não
    // com espaço comum — mesmo idioma dos testes da engine.
    expect(texto).toMatch(/R\$\s?20,00/);
    // Prazo às 14:30 e agendamento às 09:30, os dois no fuso do negócio.
    expect(texto).toContain("14:30");
    expect(texto).toContain("09:30");
    expect(texto).not.toContain("17:30");
  });

  it("a confirmação também aceita modelo, com fallback", () => {
    const dadosRecebido = {
      valorCentavos: 500,
      servicoNome: "Barba",
      quando: "10/08 às 09:30",
    };

    expect(montarTextoSinalRecebido({ ...dadosRecebido, modelo: "  " })).toBe(
      montarTextoSinalRecebido(dadosRecebido),
    );
    expect(
      montarTextoSinalRecebido({ ...dadosRecebido, modelo: "Caiu {valor}!" }),
    ).toMatch(/^Caiu R\$\s?5,00!$/);
  });
});

/**
 * A sugestão que o painel mostra e a mensagem que o cliente recebe são a MESMA
 * string, uma crua e a outra renderizada.
 *
 * Estes testes existem porque por um instante houve duas cópias — uma no módulo e
 * outra na tela — e duas cópias divergem no primeiro ajuste, com o painel
 * prometendo um texto e o WhatsApp entregando outro. Agora a tela exibe
 * `MODELO_PADRAO_*` e o bot renderiza a mesma constante; o que segue prende essa
 * equivalência.
 */
describe("modelo padrão é a fonte do texto enviado", () => {
  it("a cobrança padrão é o modelo renderizado", () => {
    const dados = {
      valorCentavos: 2000,
      expiraEm: new Date("2026-08-09T17:30:00.000Z"),
      fusoHorario: FUSO,
      servicoNome: "Corte masculino",
      dataHora: "2026-08-10T12:30:00.000Z",
    };

    expect(montarTextoCobrancaSinal(dados)).toBe(
      montarTextoCobrancaSinal({ ...dados, modelo: MODELO_PADRAO_COBRANCA }),
    );
  });

  it("a confirmação padrão é o modelo renderizado", () => {
    const dados = {
      valorCentavos: 500,
      servicoNome: "Barba",
      quando: "10/08 às 09:30",
    };

    expect(montarTextoSinalRecebido(dados)).toBe(
      montarTextoSinalRecebido({ ...dados, modelo: MODELO_PADRAO_RECEBIDO }),
    );
  });

  /**
   * E os modelos precisam passar na própria validação: um `{prazo}` esquecido no
   * padrão faria a tela sugerir um texto que o dono não consegue salvar.
   */
  it("os modelos padrão passam na validação que a tela aplica", () => {
    expect(validarModelo("sinal_cobranca", MODELO_PADRAO_COBRANCA).ok).toBe(true);
    expect(validarModelo("sinal_recebido", MODELO_PADRAO_RECEBIDO).ok).toBe(true);
  });
});
