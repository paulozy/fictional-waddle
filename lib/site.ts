import type { Metadata } from "next";

/**
 * Identidade do site para buscador e compartilhamento.
 *
 * Existe porque três coisas precisavam da mesma URL e não podiam divergir:
 * `metadataBase`, o `canonical` de cada página e o `sitemap`. Um domínio
 * escrito à mão em três lugares é um domínio errado em pelo menos um.
 */

export const NOME_SITE = "Encaixaria";

export const TITULO_PADRAO = "Encaixaria — agendamento pelo WhatsApp";

export const DESCRICAO_PADRAO =
  "Seu cliente vê os horários livres e agenda pelo WhatsApp do seu estabelecimento, sem baixar app.";

/**
 * Identificação do controlador dos dados.
 *
 * **Os marcadores entre colchetes são pendência real, não estilo.** A LGPD (Art.
 * 9º, I) exige que o titular saiba quem controla os dados dele, e uma política de
 * privacidade sem controlador identificado não cumpre a função — nem a legal, nem
 * a de venda, porque o dono do salão está confiando o cadastro dos clientes dele
 * a alguém que ele precisa poder identificar.
 *
 * `lib/organizacao.test.ts` **falha de propósito** enquanto qualquer marcador
 * estiver aqui. Não é teste quebrado: é o portão que impede isto de ir ao ar em
 * branco. Preencher os três valores apaga a falha.
 */
export const IDENTIFICACAO_LEGAL = {
  razaoSocial: "Paulo Ricardo de Abreu Santana",
  /**
   * Nome fantasia do CNPJ. Aparece nas páginas legais, para identificar a
   * empresa, e **não** no JSON-LD.
   *
   * O campo natural para ele seria `Organization.alternateName` — que é
   * justamente o plano B que o Google usa para escolher o nome do site na SERP.
   * Declarar "PRTI" ali colocaria uma segunda marca competindo com "Encaixaria"
   * pela consulta de marca, que é o oposto do objetivo de todo o trabalho de SEO
   * deste repositório.
   */
  nomeFantasia: "PRTI",
  cnpj: "57.914.030/0001-20",
  emailContato: "dev.pa.aabreu18@gmail.com",
} as const;

/**
 * Marca de campo não preenchido, reconhecível por teste e por olho humano.
 *
 * Deliberadamente frouxo (`[^\]]+` e não `[A-Z…]+`): um marcador escrito em
 * minúsculas passaria por um padrão que exige caixa alta, e o portão existe
 * justamente para não depender de disciplina de quem preenche.
 */
export const MARCADOR_PENDENTE = /\[[^\]]+\]/;

/**
 * Há campo legal não preenchido?
 *
 * As páginas que exibem esses dados usam isto para se marcarem `noindex` e
 * saírem do sitemap enquanto a pendência existir. O teste em
 * `lib/organizacao.test.ts` quebra o CI, mas **deploy na Vercel não roda teste**
 * — derivar o comportamento do estado transforma o portão de "quebra no CI" em
 * "não vai ao ar", que é o que se queria de fato.
 */
export function identificacaoPendente(): boolean {
  return Object.values(IDENTIFICACAO_LEGAL).some((valor) =>
    MARCADOR_PENDENTE.test(valor),
  );
}

/**
 * Perfis externos da marca, para o `sameAs` do `Organization`.
 *
 * Está vazio, e a lista vazia é informação: **é o campo com maior retorno para
 * ser encontrado pelo nome, e o retorno só existe depois de uma ação humana.**
 * `sameAs` é o que liga este site às contas que falam dele em outro lugar
 * (Instagram, LinkedIn de empresa, GitHub, Product Hunt, diretórios), e é assim
 * que o Google decide que "Encaixaria" é uma entidade e não uma palavra.
 *
 * Preencher conforme cada perfil for criado — um por linha, URL completa.
 */
export const PERFIS_EXTERNOS: string[] = [];

/**
 * A URL pública do site.
 *
 * **Não** usa `envObrigatoria` de propósito. `metadataBase` é avaliado em tempo
 * de módulo de `app/layout.tsx`: lançar aqui quebraria o build inteiro em
 * qualquer ambiente sem a var — inclusive um `next build` local. A falha
 * aceitável é um canonical apontando para o lugar errado (visível, corrigível);
 * a inaceitável é não haver build.
 *
 * A ordem importa:
 *
 * - `SITE_URL` é a resposta certa e é o que se define quando o domínio próprio
 *   existir.
 * - `VERCEL_PROJECT_PRODUCTION_URL` é o alias **estável** do projeto. Note que
 *   não é `VERCEL_URL`: aquela muda a cada deploy, e usá-la faria o canonical e
 *   o sitemap apontarem para um deployment específico em vez de para o site
 *   (https://vercel.com/docs/environment-variables/system-environment-variables).
 * - `localhost` fecha o desenvolvimento.
 */
export function urlSite(): URL {
  const explicita = process.env.SITE_URL;
  if (explicita) return new URL(explicita);

  const aliasVercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (aliasVercel) return new URL(`https://${aliasVercel}`);

  return new URL("http://localhost:3000");
}

/** Absolutiza um caminho contra o domínio do site. */
export function urlAbsoluta(caminho: string): string {
  return new URL(caminho, urlSite()).href;
}

/**
 * Metadata de página que não deve aparecer na busca.
 *
 * Constante compartilhada, e não objeto escrito em cada arquivo, por dois
 * motivos: o valor fica testado uma vez, e `Metadata` como anotação de tipo faz
 * um typo (`robot`, `noindex: true`) virar erro de compilação. Sem a anotação, o
 * campo errado é simplesmente ignorado — nenhuma tag é emitida, nada falha, e a
 * página passa a ser indexável em silêncio.
 */
export const ROBOTS_PRIVADO = { index: false, follow: false } as const;

/**
 * Caminho da imagem social gerada por `app/opengraph-image.tsx`.
 *
 * Precisa ser declarado à mão, e isto é consequência direta da armadilha nº 1
 * acima — medido no HTML do build, não deduzido: o Next injeta o `og:image` do
 * arquivo `opengraph-image` só nas páginas que **não** declaram `openGraph`. O
 * `/login`, que não declara, recebia a tag; a home, que declara, ficava sem. Ou
 * seja, a página que mais precisa da prévia era a única sem ela.
 *
 * O que se perde ao declarar à mão é o sufixo de hash que o Next põe na URL
 * (`?180d9dac...`) para invalidar cache. Consequência real: ao trocar a arte, o
 * WhatsApp e o Facebook podem servir a antiga por um tempo — os dois cacheiam
 * agressivamente de qualquer forma, e não há como ler o hash do userland.
 *
 * As dimensões vão explícitas porque o convention as emitia e a declaração
 * manual não: com `width`/`height`, o cliente reserva o espaço e desenha a
 * prévia sem precisar baixar a imagem antes.
 */
const IMAGEM_SOCIAL = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: TITULO_PADRAO,
};
/**
 * Metadata de uma página pública.
 *
 * É um helper, e não metadata declarada em cada arquivo, por causa de duas
 * armadilhas do App Router:
 *
 * 1. **A mesclagem é superficial.** Se uma página declara `openGraph: { url }`,
 *    ela **substitui** o `openGraph` inteiro do layout — `siteName`, `locale` e
 *    `type` desaparecem sem aviso. Montar o objeto completo num só lugar é a
 *    única forma de isso não acontecer por esquecimento.
 * 2. **`canonical` não pode morar no layout raiz.** Um `canonical: "/"` lá é
 *    herdado literalmente por toda página que não declarar o seu, e `/precos`
 *    passaria a se anunciar como cópia da home.
 *
 * `titulo` omitido significa "use o título padrão do site" — é o caso da
 * landing, que não deve virar "Encaixaria — Encaixaria" pelo `title.template`.
 *
 * `naoIndexar` existe porque "não está no sitemap" **não** é o mesmo que "não é
 * indexável". O sitemap e os links são vias de descoberta; um visitante com
 * Chrome, um `Referer` em log público ou o link colado numa conversa bastam para
 * o Googlebot chegar. Página que não deve aparecer na busca precisa dizer isso.
 */
export function metadataPagina({
  titulo,
  descricao = DESCRICAO_PADRAO,
  caminho,
  naoIndexar = false,
}: {
  titulo?: string;
  descricao?: string;
  caminho: string;
  naoIndexar?: boolean;
}): Metadata {
  const tituloCompleto = titulo ? `${titulo} — ${NOME_SITE}` : TITULO_PADRAO;

  return {
    ...(naoIndexar ? { robots: ROBOTS_PRIVADO } : {}),
    // `absolute` porque `tituloCompleto` já traz o sufixo: sem isso o
    // `title.template` do layout raiz o aplicaria uma segunda vez.
    title: { absolute: tituloCompleto },
    description: descricao,
    alternates: { canonical: caminho },
    openGraph: {
      type: "website",
      locale: "pt_BR",
      siteName: NOME_SITE,
      url: caminho,
      title: tituloCompleto,
      description: descricao,
      images: [IMAGEM_SOCIAL],
    },
    // `card` repetido de propósito: declarar `twitter` aqui substitui o objeto
    // do layout raiz por inteiro, e sem esta linha a prévia voltaria a ser o
    // cartão pequeno.
    twitter: {
      card: "summary_large_image",
      title: tituloCompleto,
      description: descricao,
      images: [IMAGEM_SOCIAL],
    },
  };
}
