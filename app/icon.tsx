import { ImageResponse } from "next/og";

/**
 * Ícone do aplicativo, gerado em build pelo `ImageResponse` do `next/og`.
 *
 * Gerado e não commitado como PNG por dois motivos: não entra binário no
 * repositório, e a cor sai do mesmo lugar que o resto do tema — trocar a
 * primária em `app/globals.css` e esquecer de reexportar o ícone é o tipo de
 * divergência que ninguém percebe até ver o ícone antigo na tela inicial de um
 * cliente. `next/og` já vem no Next; não é dependência nova.
 *
 * O desenho é um monograma, de propósito. Um ícone bonito é trabalho de
 * designer e pode substituir este arquivo a qualquer momento — mas um produto
 * sem ícone nenhum aparece como um retângulo cinza na tela inicial, que é pior
 * do que simples.
 *
 * O `A` ocupa ~56% do quadro. Isso não é preciosismo de composição: a máscara
 * adaptativa do Android recorta até 20% de cada borda, e o manifesto declara
 * este mesmo arquivo como `maskable` — sem a margem, a letra sairia cortada em
 * ícone redondo.
 */

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // #1E7266 — a primária do tema claro, em hex porque o motor do
          // ImageResponse não resolve `oklch()` nem variável CSS.
          background: "#1E7266",
          color: "#FFFFFF",
          fontSize: 288,
          fontWeight: 700,
          letterSpacing: "-0.04em",
        }}
      >
        A
      </div>
    ),
    size,
  );
}
