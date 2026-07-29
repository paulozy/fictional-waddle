import type { MetadataRoute } from "next";
import { urlAbsoluta } from "@/lib/site";

/**
 * `/robots.txt`.
 *
 * O detalhe que não é óbvio: **o dashboard e o `/login` não entram no
 * `disallow`**, embora sejam justamente as páginas que não devem aparecer na
 * busca. Elas usam `noindex` no metadata, e a doc do Google é explícita de que
 * as duas coisas se cancelam — *"For the noindex rule to be effective, the page
 * must not be blocked by a robots.txt file, and it has to be otherwise
 * accessible to the crawler"*
 * (https://developers.google.com/search/docs/crawling-indexing/block-indexing).
 * Bloquear aqui impediria o Google de **ler** o `noindex`, e a URL poderia ser
 * indexada sem conteúdo — o pior dos dois mundos.
 *
 * `/api/` entra porque ali não há nada para indexar e cada crawl custa execução:
 * são o webhook e o cron, que respondem a máquina, não a leitor.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/"],
    },
    sitemap: urlAbsoluta("/sitemap.xml"),
  };
}
