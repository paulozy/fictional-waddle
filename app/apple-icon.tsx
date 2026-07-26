import { ImageResponse } from "next/og";
import { MarcaRecortada, lerPngDaMarca } from "@/lib/marca-servidor";
import { FUNDO_OPACO, OCUPACAO } from "@/lib/marca";

/**
 * Ícone para "Adicionar à Tela de Início" no iOS.
 *
 * Separado de `app/icon.tsx` porque o iOS ignora o `icons` do manifesto e lê a
 * tag `apple-touch-icon`, no tamanho canônico de 180px. Sem este arquivo o
 * Safari usa um screenshot da página como ícone.
 *
 * **O fundo opaco não é preferência estética.** O iOS compõe transparência em
 * **preto**, não em branco — um PNG transparente vira um quadrado preto na
 * tela inicial. A cor é a mesma do `background_color` do manifesto e do
 * `themeColor` claro do `app/layout.tsx`, para não haver emenda entre ícone,
 * splash e barra do navegador.
 *
 * Ocupação mais folgada que a do favicon: o iOS aplica a própria máscara
 * superelíptica **sem** recortar conteúdo, então 70% respira sem risco de
 * perder a borda do desenho.
 */

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  return new ImageResponse(
    <MarcaRecortada
      lado={size.width}
      ocupacao={OCUPACAO.apple}
      fundo={FUNDO_OPACO}
      png={await lerPngDaMarca()}
    />,
    size,
  );
}
