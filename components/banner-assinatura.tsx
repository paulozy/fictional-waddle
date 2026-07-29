import type { MotivoBloqueio } from "@/lib/assinatura";
import { Button } from "@/components/ui/button";

/**
 * Mesmo padrão visual do box de "WhatsApp desconectado"
 * (`app/(dashboard)/conexao-whatsapp/page.tsx`): tokens `aviso`/`aviso-suave`,
 * que têm valor calibrado nos dois temas. Não copiar cor crua do easy-charge,
 * onde o banner é `text-coral` fixo e não existe tema escuro.
 *
 * A consequência descrita no corpo é a mesma do box de desconectado, e por
 * isso o texto ecoa o dele: para o dono, "não paguei" e "caiu a conexão"
 * produzem exatamente o mesmo sintoma — cliente sem resposta.
 */
const TEXTOS: Record<
  Exclude<MotivoBloqueio, null>,
  { titulo: string; corpo: string; rotuloCta: string }
> = {
  trial_expirado: {
    titulo: "Seu período de teste terminou",
    corpo:
      "Enquanto não houver uma assinatura ativa, o bot não responde aos clientes e os lembretes não são enviados. Assine um plano para voltar a atender pelo WhatsApp.",
    rotuloCta: "Assinar agora",
  },
  cancelado: {
    titulo: "Sua assinatura está cancelada",
    corpo:
      "Enquanto estiver assim, o bot não responde aos clientes e os lembretes não são enviados. Reative para voltar a atender pelo WhatsApp.",
    rotuloCta: "Reativar assinatura",
  },
  /**
   * Diz a regra em voz alta, em vez de apenas informar o bloqueio: o teste é um
   * por número de WhatsApp. Quem caiu aqui de boa-fé (comprou o salão, trocou o
   * número, recriou a conta) só resolve falando com a gente, e o texto precisa
   * fazer ele querer falar — o escape hatch é manual, como a assinatura desta
   * fase.
   */
  numero_ja_usou_trial: {
    titulo: "Este número de WhatsApp já usou o período de teste",
    corpo:
      "O teste gratuito é um por número de WhatsApp, e este número já testou a Encaixaria em outra conta. Assine um plano para atender por ele — ou fale com a gente se você acha que houve engano.",
    rotuloCta: "Falar com a gente",
  },
};

export function BannerAssinatura({
  motivo,
  href,
}: {
  motivo: Exclude<MotivoBloqueio, null>;
  href: string | null;
}) {
  const { titulo, corpo, rotuloCta } = TEXTOS[motivo];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 pt-6">
      <div className="flex flex-col gap-4 rounded-lg border border-aviso/40 bg-aviso-suave p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium text-aviso">{titulo}</p>
          <p className="mt-1 text-sm text-aviso">{corpo}</p>
        </div>
        {href && (
          <Button asChild size="lg" className="self-start sm:self-auto">
            {/**
             * `wa.me` é destino externo, então link cru em vez de `next/link`:
             * não há rota interna para pré-carregar.
             */}
            <a href={href} target="_blank" rel="noopener noreferrer">
              {rotuloCta}
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
