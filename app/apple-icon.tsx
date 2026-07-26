import { ImageResponse } from "next/og";

/**
 * Ícone para "Adicionar à Tela de Início" no iOS.
 *
 * Existe separado de `app/icon.tsx` porque o iOS ignora o `icons` do
 * manifesto e lê a tag `apple-touch-icon`, no tamanho canônico de 180px. Sem
 * este arquivo o Safari faz um screenshot da página e usa como ícone — que é
 * exatamente a aparência amadora que ter um ícone deveria evitar.
 *
 * O iOS também não aplica máscara: o recorte é o mesmo para todo mundo, então
 * aqui a letra pode ocupar mais do quadro do que no `icon.tsx`, que precisa da
 * margem de segurança do Android.
 */

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1E7266",
          color: "#FFFFFF",
          fontSize: 116,
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
