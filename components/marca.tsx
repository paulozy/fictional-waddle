import Image from "next/image";
import { OCUPACAO, tamanhoParaOcupacao } from "@/lib/marca";
import { cn } from "@/lib/utils";

/**
 * O símbolo da Encaixaria, recortado.
 *
 * **Este é o único lugar do projeto com o recorte.** O arquivo de origem tem
 * ~24% de margem transparente em cada lado (ver `lib/marca.ts`), então um
 * `<Image width={28}>` cru pinta o desenho a 14,5px — metade do pedido. A
 * correção é ampliar e cortar o excedente, e ela precisa morar num componente:
 * espalhada como `overflow-hidden` mais margem negativa por quatro layouts,
 * vira o tipo de CSS que alguém "limpa" depois e quebra sem ninguém notar.
 *
 * `next/image` e não `<img>`: o PNG tem 87 KB e 500×500. Sem otimização o
 * navegador baixaria tudo isso para pintar 28px; com `width`/`height`
 * declarados, a Vercel serve ~1–2 KB em AVIF ou WebP.
 *
 * `alt=""` porque o símbolo é decorativo — quem carrega o nome acessível é a
 * palavra "Encaixaria" ao lado. Se em algum lugar ele aparecer sozinho, o texto
 * precisa vir junto em `sr-only`.
 */
export function Marca({
  tamanho,
  prioritaria = false,
  className,
}: {
  /** Lado do quadro visível, em px. */
  tamanho: number;
  /**
   * Desliga o lazy loading. Vale no header `sticky` da landing: não porque o
   * logo seja o LCP (o `<h1>` do hero é o candidato), mas porque carregar
   * atrasado num elemento fixo no topo produz um pop visível no primeiro
   * paint.
   */
  prioritaria?: boolean;
  className?: string;
}) {
  // Ocupação de app: a mesma dos ícones de 192/512, para o símbolo ter o mesmo
  // "peso" dentro do quadro na aba, na tela inicial e no header.
  const renderizado = tamanhoParaOcupacao(tamanho, OCUPACAO.app);

  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden",
        className,
      )}
      style={{ width: tamanho, height: tamanho }}
    >
      <Image
        src="/encaixaria-icon.png"
        alt=""
        width={renderizado}
        height={renderizado}
        priority={prioritaria}
        // `max-w-none` é obrigatório: o reset do Tailwind põe `max-width: 100%`
        // em imagem, o que encolheria a imagem ampliada de volta ao tamanho do
        // contêiner e anularia o recorte.
        className="max-w-none shrink-0"
      />
    </span>
  );
}
