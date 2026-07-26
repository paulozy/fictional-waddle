import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tamanhoParaOcupacao } from "@/lib/marca";

/**
 * Composição da marca para os geradores de ícone. **Só servidor.**
 *
 * Vive fora de `app/icon.tsx` de propósito: aquele é arquivo de rota de
 * metadata, e o loader do Next tem expectativas sobre o que ele exporta
 * (`generateImageMetadata`, `size`, `contentType`, default). Pendurar um
 * componente compartilhado lá funciona por acidente, não por contrato.
 */

/**
 * Lê o PNG da marca.
 *
 * `readFile` de um caminho montado em runtime, e **nunca** `import` do PNG. A
 * doc do `ImageResponse` fixa um teto de 500 KB para o bundle e diz que ele
 * inclui as imagens — um `import` colocaria os 87 KB do arquivo dentro do
 * bundle de cada rota que o usa. É o mesmo padrão que a doc do Next usa para
 * carregar fonte local.
 *
 * `process.cwd()` é seguro aqui porque as três rotas de ícone não leem nada do
 * request e são geradas em build, quando o cwd é a raiz do repositório. Se
 * alguma passar a depender de request, deixa de ser: o file tracing da Vercel
 * pode não seguir um caminho computado para dentro da função.
 */
export function lerPngDaMarca(): Promise<Buffer> {
  return readFile(join(process.cwd(), "public", "agendazap-icon.png"));
}

/**
 * Desenho ampliado dentro de um quadro que recorta o excedente.
 *
 * A centralização é do próprio flex — imagem maior que o contêiner com
 * `overflow: hidden` sai recortada simetricamente, sem margem negativa. Dois
 * detalhes que não são decorativos:
 *
 * - `flexShrink: 0`. Sem ele o flexbox comprime a imagem para caber no
 *   contêiner e o "recorte" vira distorção.
 * - `width`/`height` em pixel, não `100%`: o Satori resolve porcentagem contra
 *   o contêiner, o que anularia a ampliação.
 */
export function MarcaRecortada({
  lado,
  ocupacao,
  png,
  fundo,
}: {
  lado: number;
  ocupacao: number;
  png: Buffer;
  /** Ausente = fundo transparente. */
  fundo?: string;
}) {
  const tamanho = tamanhoParaOcupacao(lado, ocupacao);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        ...(fundo ? { background: fundo } : {}),
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`data:image/png;base64,${png.toString("base64")}`}
        alt=""
        width={tamanho}
        height={tamanho}
        style={{ flexShrink: 0 }}
      />
    </div>
  );
}
