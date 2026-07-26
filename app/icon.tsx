import { ImageResponse } from "next/og";
import { MarcaRecortada, lerPngDaMarca } from "@/lib/marca-servidor";
import { OCUPACAO } from "@/lib/marca";

/**
 * Ícones do navegador, derivados de `public/agendazap-icon.png`.
 *
 * Gerados em build em vez de commitados como binários: assim existe **uma**
 * fonte (o PNG) e as regras de composição ficam em código versionado. Três
 * PNGs derivados no repositório seriam três arquivos que ninguém sabe regerar
 * quando o desenho mudar.
 *
 * Todos com fundo **transparente**. Esta é a variante `any`, e o web.dev
 * recomenda tratá-la como o favicon do site: "com regiões transparentes e sem
 * padding extra". O ícone de fundo cheio que o Android precisa é outro
 * arquivo, `app/icone-mascara/route.tsx`, e mora fora daqui de propósito —
 * cada item de `generateImageMetadata` vira uma `<link rel="icon">` no
 * `<head>`, e a variante mascarada não deve ser candidata a favicon de aba.
 */

export const contentType = "image/png";

/**
 * O `32` é o favicon de aba e leva recorte mais apertado que os outros: a
 * margem do arquivo de origem custa metade do quadro, e nesse tamanho o mark
 * já é limítrofe mesmo preenchendo tudo. Os de 192 e 512 são os que
 * `app/manifest.ts` referencia como `any`.
 */
export function generateImageMetadata() {
  return [
    { id: "32", size: { width: 32, height: 32 }, contentType },
    { id: "192", size: { width: 192, height: 192 }, contentType },
    { id: "512", size: { width: 512, height: 512 }, contentType },
  ];
}

/**
 * `id` chega como **Promise**, não como string.
 *
 * O wrapper que o Next gera para rotas de metadata dinâmica faz
 * `handler({ params: restParamsPromise, id: idPromise })`
 * (`next-metadata-route-loader.js`). Sem o `await`, `Number(id)` devolve `NaN`
 * e o build quebra em "Expected positive integer for width".
 */
export default async function Icon({ id }: { id: Promise<string> }) {
  const lado = Number(await id);

  return new ImageResponse(
    <MarcaRecortada
      lado={lado}
      ocupacao={lado <= 32 ? OCUPACAO.favicon : OCUPACAO.app}
      png={await lerPngDaMarca()}
    />,
    { width: lado, height: lado },
  );
}
