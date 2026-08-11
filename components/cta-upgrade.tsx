import { ArrowUpCircleIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLANOS } from "@/lib/plano";

/**
 * O caminho para subir do Essencial para o Garantido.
 *
 * Sem gateway, upgrade é conversa — o mesmo `wa.me` do banner de assinatura, com
 * a mensagem já escrita. Daí `<a>` cru e não `next/link`: destino externo, igual
 * ao que `components/banner-assinatura.tsx` faz.
 *
 * **Sem `"use client"` de propósito.** Os três consumidores estão de lados
 * diferentes da fronteira — `barra-lateral.tsx` e `navegacao-dashboard.tsx` são
 * ilhas de cliente, `conta/page.tsx` é Server Component. Um componente sem estado
 * e sem hook atravessa os dois sem virar duas peças que divergem.
 *
 * Some quando `href` é nulo (sem `WHATSAPP_CONTATO`), mesma regra do banner: um
 * botão que leva a lugar nenhum é pior que nenhum botão.
 *
 * Quem decide **se** ele aparece é `app/(dashboard)/layout.tsx`, não esta peça:
 * só para `plano = 'basico'` e só quando não há bloqueio de assinatura, senão ele
 * competiria com o banner que pede "assine para o bot voltar" na mesma tela.
 */
export function CtaUpgrade({
  href,
  recolhida = false,
  className,
}: {
  href: string | null;
  /** Na lateral recolhida sobra o ícone; o rótulo vira `title` e `sr-only`. */
  recolhida?: boolean;
  className?: string;
}) {
  if (!href) return null;

  const nome = PLANOS.find((p) => p.destacado)?.nome ?? "Garantido";
  const rotulo = "Fazer upgrade";

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={recolhida ? `${rotulo} para o ${nome}` : undefined}
      className={cn(
        "flex min-h-10 items-center gap-2.5 rounded-lg text-sm font-medium text-primary transition-colors hover:bg-accent",
        recolhida ? "justify-center px-0" : "px-2",
        className,
      )}
    >
      <ArrowUpCircleIcon aria-hidden className="size-4 shrink-0" />
      <span className={cn("flex-1 text-left", recolhida && "sr-only")}>
        {rotulo}
      </span>
    </a>
  );
}
