import { ImageResponse } from "next/og";
import { FUNDO_OPACO, OCUPACAO } from "@/lib/marca";
import {
  MarcaRecortada,
  lerFonteDisplay,
  lerPngDaMarca,
} from "@/lib/marca-servidor";
import { NOME_SITE } from "@/lib/site";

/**
 * Imagem de compartilhamento (`og:image`), 1200×630.
 *
 * Vale mais aqui que na média dos produtos: a distribuição deste é o WhatsApp.
 * O dono vai colar o link em conversa e em grupo, e sem `og:image` o WhatsApp
 * mostra um retângulo cinza com a URL. Antes disto o HTML saía com zero tag
 * `og:`, então todo compartilhamento era esse retângulo.
 *
 * As cores são hexadecimais literais porque o Satori não tem cascata de CSS nem
 * variável — `var(--foreground)` resolveria para nada. São os valores do tema
 * claro de `app/globals.css` (linhas 109-130); divergir aqui faz a prévia do
 * link não parecer o site.
 */

export const alt = "Encaixaria — agendamento pelo WhatsApp";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Gerada em build, como os ícones: nada aqui depende do request, e assim o
 * `process.cwd()` de `lerPngDaMarca`/`lerFonteDisplay` aponta para a raiz do
 * repositório em vez de para dentro de uma função serverless.
 */
export const dynamic = "force-static";

/** #1B2422 e #55635F: `--foreground` e `--muted-foreground` do tema claro. */
const TINTA = "#1B2422";
const TINTA_SUAVE = "#55635F";

/**
 * O quadro da marca é **quadrado e de lado fixo**.
 *
 * `MarcaRecortada` foi escrita para os ícones: usa `width/height: 100%` e um
 * `lado` único para os dois eixos. Solta na raiz de um canvas 1200×630 ela
 * esticaria o recorte contra o retângulo inteiro e o desenho sairia deformado.
 */
const LADO_MARCA = 196;

export default async function OpengraphImage() {
  const [png, fonte] = await Promise.all([lerPngDaMarca(), lerFonteDisplay()]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: FUNDO_OPACO,
          padding: "0 88px",
          fontFamily: "Bricolage Grotesque",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <div style={{ display: "flex", width: LADO_MARCA, height: LADO_MARCA }}>
            <MarcaRecortada
              lado={LADO_MARCA}
              ocupacao={OCUPACAO.app}
              png={png}
            />
          </div>
          <div style={{ fontSize: 116, letterSpacing: -4, color: TINTA }}>
            {NOME_SITE}
          </div>
        </div>

        <div
          style={{
            marginTop: 40,
            fontSize: 46,
            lineHeight: 1.28,
            letterSpacing: -1,
            color: TINTA_SUAVE,
          }}
        >
          Seu cliente agenda pelo WhatsApp do seu estabelecimento, sem baixar
          app.
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "Bricolage Grotesque",
          data: fonte,
          weight: 600,
          style: "normal",
        },
      ],
    },
  );
}
