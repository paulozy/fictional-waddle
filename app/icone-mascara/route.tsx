import { ImageResponse } from "next/og";
import { MarcaRecortada, lerPngDaMarca } from "@/lib/marca-servidor";
import { FUNDO_OPACO, OCUPACAO } from "@/lib/marca";

/**
 * Ícone **maskable** do Android, referenciado só por `app/manifest.ts`.
 *
 * Por que não é mais um item de `generateImageMetadata` em `app/icon.tsx`:
 * cada item de lá vira uma `<link rel="icon">` no `<head>`, e esta variante
 * tem fundo cheio — não deve concorrer a favicon de aba.
 *
 * **Fundo opaco é exigência da spec, não escolha.** O Web App Manifest diz que
 * se o ícone tem pixels transparentes o user agent "MUST composite the icon
 * onto a solid fill of the user agent's choice" — e o `background_color` do
 * manifesto **não** é consultado nessa composição. Ou seja: com fundo
 * transparente, a cor do disco atrás do desenho é escolha do sistema, não sua.
 *
 * A ocupação de 66% sai da geometria da safe zone: ela é um círculo de raio
 * 2/5 (40%) do lado, e as plataformas podem recortar até 10% da borda. Com o
 * desenho centrado a 66% de largura, o raio efetivo fica em ~33% — dentro da
 * zona, com folga.
 *
 * `force-static`: nada aqui lê o request, então é gerado uma vez em build.
 */

export const dynamic = "force-static";

const LADO = 512;

export async function GET() {
  return new ImageResponse(
    <MarcaRecortada
      lado={LADO}
      ocupacao={OCUPACAO.maskable}
      fundo={FUNDO_OPACO}
      png={await lerPngDaMarca()}
    />,
    { width: LADO, height: LADO },
  );
}
