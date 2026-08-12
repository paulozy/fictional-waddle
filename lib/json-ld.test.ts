import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonLdHome, serializarJsonLd } from "./json-ld";

/**
 * Metade destes testes afirma **ausência**, e é de propósito.
 *
 * Markup obsoleto não dá erro em lugar nenhum: o build passa, a página abre, o
 * validador do schema.org aceita, e o Google simplesmente ignora. O único jeito
 * de `potentialAction` ou `FAQPage` não voltarem num "melhorei o SEO" futuro é
 * um teste que falhe quando voltarem, com o motivo escrito ao lado.
 */

beforeEach(() => {
  process.env.SITE_URL = "https://encaixaria.com.br";
});

afterEach(() => {
  delete process.env.SITE_URL;
});

describe("jsonLdHome", () => {
  it("declara WebSite e Organization ligados pelo publisher", () => {
    const grafo = jsonLdHome()["@graph"] as Record<string, unknown>[];
    const site = grafo.find((no) => no["@type"] === "WebSite")!;
    const organizacao = grafo.find((no) => no["@type"] === "Organization")!;

    expect(site.name).toBe("Encaixaria");
    expect(site.url).toBe("https://encaixaria.com.br/");
    expect(site.publisher).toEqual({ "@id": organizacao["@id"] });
  });

  it("aponta o logo para um ícone de pelo menos 112px", () => {
    const grafo = jsonLdHome()["@graph"] as Record<string, unknown>[];
    const organizacao = grafo.find((no) => no["@type"] === "Organization")!;

    expect(organizacao.logo).toBe("https://encaixaria.com.br/icon/512");
  });

  /**
   * Removido globalmente em 2024-11-21 ("Farewell, Sitelinks Search Box").
   * Emitir não quebra nada — é só código que ninguém lê, e que dá a impressão
   * de que o arquivo está atualizado.
   */
  it("não emite potentialAction: o sitelinks searchbox não existe mais", () => {
    expect(JSON.stringify(jsonLdHome())).not.toContain("potentialAction");
    expect(JSON.stringify(jsonLdHome())).not.toContain("SearchAction");
  });

  /** Deixou de aparecer na busca em 2026-05-07; doc removida em 2026-06-15. */
  it("não emite FAQPage: descontinuado pelo Google", () => {
    expect(JSON.stringify(jsonLdHome())).not.toContain("FAQPage");
  });

  /**
   * Exige `aggregateRating` ou `review`. Sem piloto avaliando de verdade, o
   * markup é inelegível ao rich result — e preencher rating no vazio seria
   * inventar prova social.
   */
  it("não emite SoftwareApplication sem avaliação real", () => {
    const serializado = JSON.stringify(jsonLdHome());

    expect(serializado).not.toContain("SoftwareApplication");
    expect(serializado).not.toContain("aggregateRating");
  });

  it("omite sameAs enquanto não houver perfil externo", () => {
    expect(JSON.stringify(jsonLdHome())).not.toContain("sameAs");
  });

  describe("contato", () => {
    it("normaliza o telefone antes de emitir", () => {
      const grafo = jsonLdHome({ telefoneContato: "5511999998888" })[
        "@graph"
      ] as Record<string, unknown>[];
      const organizacao = grafo.find((no) => no["@type"] === "Organization")!;

      expect(organizacao.contactPoint).toMatchObject({
        telephone: "+5511999998888",
        availableLanguage: "pt-BR",
      });
    });

    /**
     * `WHATSAPP_CONTATO` é documentada como "só dígitos" e ninguém garante isso —
     * `app/(dashboard)/layout.tsx` já normaliza a mesma variável. Sem o mesmo
     * tratamento, `"++55 11 99999-8888"` sairia assado no HTML estático.
     */
    it("aceita telefone formatado sem produzir dois sinais de mais", () => {
      const grafo = jsonLdHome({ telefoneContato: "+55 11 99999-8888" })[
        "@graph"
      ] as Record<string, unknown>[];
      const organizacao = grafo.find((no) => no["@type"] === "Organization")!;

      expect(organizacao.contactPoint).toMatchObject({
        telephone: "+5511999998888",
      });
    });

    /**
     * `WHATSAPP_CONTATO` pode estar vazia hoje (o banner de assinatura aparece
     * sem botão nesse caso). Um `telephone: "+undefined"` no grafo seria pior que
     * campo ausente.
     */
    it("omite o contato quando não há telefone", () => {
      expect(JSON.stringify(jsonLdHome())).not.toContain("contactPoint");
    });
  });

  describe("identificação do controlador", () => {
    /**
     * Antes desta rodada `legalName` e `taxID` eram parâmetros que a home nunca
     * passava — os campos existiam, tinham teste, e jamais saíam no HTML.
     * Perdia-se o sinal mais desambiguável que existe: uma organização com CNPJ.
     */
    it("emite razão social, CNPJ e e-mail", () => {
      const grafo = jsonLdHome()["@graph"] as Record<string, unknown>[];
      const organizacao = grafo.find((no) => no["@type"] === "Organization")!;

      expect(organizacao.legalName).toBeTruthy();
      expect(organizacao.taxID).toMatch(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/);
      expect(organizacao.email).toContain("@");
    });

    /**
     * O nome do site na SERP é o alvo de todo o trabalho de SEO aqui, e
     * `alternateName` é o campo que o Google usa como plano B para escolhê-lo.
     * O nome fantasia do CNPJ (New Gen Software) **não** pode aparecer nele: seria uma
     * segunda marca competindo com "Encaixaria" pela mesma consulta.
     */
    it("não deixa o nome fantasia competir com a marca", () => {
      const serializado = JSON.stringify(jsonLdHome());

      expect(serializado).not.toContain("alternateName");
      expect(serializado).not.toContain("New Gen Software");

      const grafo = jsonLdHome()["@graph"] as Record<string, unknown>[];
      for (const no of grafo) {
        if (no.name !== undefined) expect(no.name).toBe("Encaixaria");
      }
    });

    /**
     * O caminho pendente precisa de teste próprio agora que os dados são reais.
     * Publicar `"legalName": "[RAZÃO SOCIAL]"` é pior que campo ausente — o
     * Google leria o marcador como sendo o nome da empresa.
     */
    it("omite os campos legais enquanto forem marcador", async () => {
      vi.resetModules();
      vi.doMock("./site", async () => {
        const real = await vi.importActual<typeof import("./site")>("./site");
        return {
          ...real,
          IDENTIFICACAO_LEGAL: {
            razaoSocial: "[RAZÃO SOCIAL]",
            nomeFantasia: "[NOME FANTASIA]",
            cnpj: "[CNPJ]",
            emailContato: "[E-MAIL DE CONTATO]",
          },
          identificacaoPendente: () => true,
        };
      });

      const { jsonLdHome: comMarcador } = await import("./json-ld");
      const serializado = JSON.stringify(comMarcador());

      expect(serializado).not.toContain("legalName");
      expect(serializado).not.toContain("taxID");
      expect(serializado).not.toContain("[RAZÃO SOCIAL]");

      vi.doUnmock("./site");
      vi.resetModules();
    });
  });
});

describe("serializarJsonLd", () => {
  /**
   * Um `</script>` dentro de qualquer string fecharia a tag no meio do JSON e
   * jogaria o resto do grafo no corpo da página. O dado passa a incluir razão
   * social e telefone digitados por gente, então isto não é hipotético.
   */
  it("escapa `<` para não fechar a tag script", () => {
    const saida = serializarJsonLd({ nome: "</script><b>x</b>" });

    expect(saida).not.toContain("</script>");
    expect(saida).toContain("\\u003c");
  });

  it("continua sendo JSON válido depois do escape", () => {
    const saida = serializarJsonLd({ nome: "a < b" });

    expect(JSON.parse(saida)).toEqual({ nome: "a < b" });
  });
});
