import {
  DESCRICAO_PADRAO,
  IDENTIFICACAO_LEGAL,
  NOME_SITE,
  PERFIS_EXTERNOS,
  identificacaoPendente,
  urlAbsoluta,
} from "./site";

/**
 * Dados estruturados da home.
 *
 * Este é o único lever **documentado** para o objetivo declarado — ser
 * encontrado pelo nome. O `WebSite` é o que o Google lê para decidir o nome do
 * site na SERP, e a restrição é literal: *"The WebSite structured data must be
 * on the home page of a site"*
 * (https://developers.google.com/search/docs/appearance/site-names). Não
 * funciona em subdiretório, e é um nome por domínio.
 *
 * O `Organization` alimenta o logo na busca e o knowledge panel
 * (https://developers.google.com/search/docs/appearance/structured-data/organization,
 * que não exige nenhuma propriedade). O campo que de fato desambigua a entidade
 * é o `sameAs` — e ele só passa a valer quando os perfis externos existirem.
 *
 * Três tipos ficaram **deliberadamente fora**, e a razão é que emitir qualquer
 * um deles hoje seria trabalho morto ou desonestidade:
 *
 * - **`potentialAction`/`SearchAction`**: o sitelinks searchbox foi removido em
 *   2024-11-21 (https://developers.google.com/search/blog/2024/10/sitelinks-search-box).
 * - **`FAQPage`**: deixou de aparecer na busca em 2026-05-07 e a documentação
 *   saiu em 2026-06-15 (https://developers.google.com/search/updates). Mover o
 *   FAQ para o HTML continua valendo muito; o markup, não.
 * - **`SoftwareApplication`**: exige `offers.price` **e** (`aggregateRating` ou
 *   `review`) (https://developers.google.com/search/docs/appearance/structured-data/software-app).
 *   Sem avaliação real é inelegível ao rich result, e inventar rating contradiz
 *   uma decisão já registrada no CLAUDE.md. Entra quando houver review de piloto.
 */

/**
 * Identificador da organização dentro do grafo. Nó nomeado para que o `WebSite`
 * possa apontar `publisher` para ele em vez de repetir os dados.
 */
const ID_ORGANIZACAO = urlAbsoluta("/#organizacao");
const ID_SITE = urlAbsoluta("/#site");

export function jsonLdHome({
  telefoneContato,
}: { telefoneContato?: string } = {}) {
  const organizacao: Record<string, unknown> = {
    "@type": "Organization",
    "@id": ID_ORGANIZACAO,
    name: NOME_SITE,
    url: urlAbsoluta("/"),
    description: DESCRICAO_PADRAO,
    // `/icon/512` é gerado por `app/icon.tsx`. A doc pede no mínimo 112×112.
    logo: urlAbsoluta("/icon/512"),
  };

  /**
   * Razão social e CNPJ vêm de `IDENTIFICACAO_LEGAL` **direto**, e não por
   * parâmetro.
   *
   * Antes eram parâmetros e a home nunca os passava: os campos existiam, tinham
   * teste, e jamais saíam no HTML. Perdia-se exatamente o sinal de entidade que
   * motivou este arquivo — uma organização com CNPJ é muito mais desambiguável
   * que um nome solto.
   *
   * O `identificacaoPendente()` evita o efeito oposto: publicar
   * `"legalName": "[RAZÃO SOCIAL]"` seria pior que campo ausente, porque o
   * Google leria o marcador como sendo o nome.
   */
  if (!identificacaoPendente()) {
    organizacao.legalName = IDENTIFICACAO_LEGAL.razaoSocial;
    organizacao.taxID = IDENTIFICACAO_LEGAL.cnpj;
    organizacao.email = IDENTIFICACAO_LEGAL.emailContato;
  }

  /**
   * `WHATSAPP_CONTATO` é documentada como "só dígitos", mas o
   * `app/(dashboard)/layout.tsx` normaliza com `replace(/\D/g, "")` justamente
   * porque ninguém garante isso. Sem o mesmo tratamento aqui, um
   * `+55 11 99999-8888` viraria `"++55 11 99999-8888"` — e sairia **assado no
   * HTML estático**, gerado em build.
   */
  const digitos = telefoneContato?.replace(/\D/g, "");
  if (digitos) {
    organizacao.contactPoint = {
      "@type": "ContactPoint",
      contactType: "customer support",
      telephone: `+${digitos}`,
      availableLanguage: "pt-BR",
    };
  }

  /**
   * Lista vazia é omitida em vez de emitida. `sameAs: []` não informa nada e dá
   * a impressão de que alguém mantém o campo — o valor está justamente em ele
   * ficar visivelmente ausente até que os perfis existam.
   */
  if (PERFIS_EXTERNOS.length > 0) organizacao.sameAs = PERFIS_EXTERNOS;

  return {
    "@context": "https://schema.org",
    "@graph": [
      organizacao,
      {
        "@type": "WebSite",
        "@id": ID_SITE,
        name: NOME_SITE,
        url: urlAbsoluta("/"),
        inLanguage: "pt-BR",
        publisher: { "@id": ID_ORGANIZACAO },
      },
    ],
  };
}

/**
 * Serializa para dentro de `<script type="application/ld+json">`.
 *
 * O escape de `<` é obrigatório: uma sequência `</script>` dentro de qualquer
 * string fecharia a tag no meio do JSON. Hoje nenhum texto tem isso, mas o dado
 * passa a incluir razão social e telefone digitados por gente.
 */
export function serializarJsonLd(dados: unknown): string {
  return JSON.stringify(dados).replace(/</g, "\\u003c");
}
