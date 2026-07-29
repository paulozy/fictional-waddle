import type { MetadataRoute } from "next";
import { identificacaoPendente, urlAbsoluta } from "@/lib/site";

/**
 * `/sitemap.xml`.
 *
 * Só rotas públicas e indexáveis. O dashboard e o `/login` ficam de fora por
 * definição: declarar no sitemap uma página marcada com `noindex` é mandar dois
 * sinais opostos ao mesmo tempo.
 *
 * Sem `changeFrequency` e sem `priority` de propósito — o Google diz há anos que
 * ignora os dois, e preenchê-los só cria a impressão de que alguém os mantém.
 * `lastModified` fica no instante do build, que é o melhor que este site sabe:
 * o conteúdo é estático e muda exatamente quando há deploy.
 */
const ROTAS_PUBLICAS = ["/", "/precos", "/como-funciona"];

/**
 * Exibem a identificação do controlador, então só entram quando ela for real.
 *
 * Enquanto houver marcador, essas páginas se marcam `noindex` (ver
 * `metadataPagina`) e ficam fora daqui — declarar no sitemap uma página com
 * `noindex` é mandar dois sinais opostos, além de convidar o Google a indexar
 * `[RAZÃO SOCIAL]`.
 *
 * As duas páginas de comparação também não estão em lista nenhuma: são rascunho
 * aguardando revisão humana, e estão `noindex` por isso.
 */
const ROTAS_COM_IDENTIFICACAO = ["/sobre", "/privacidade", "/termos"];

export default function sitemap(): MetadataRoute.Sitemap {
  const agora = new Date();
  const rotas = identificacaoPendente()
    ? ROTAS_PUBLICAS
    : [...ROTAS_PUBLICAS, ...ROTAS_COM_IDENTIFICACAO];

  return rotas.map((caminho) => ({
    url: urlAbsoluta(caminho),
    lastModified: agora,
  }));
}
