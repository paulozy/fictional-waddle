"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { desconectarMercadoPago, estornarSinal } from "./actions";

/**
 * Ilha de cliente da tela de pagamentos.
 *
 * A página em volta segue Server Component: só os botões precisam de estado de
 * envio. Mesmo recorte de `navegacao-dashboard.tsx` — hidratar o mínimo.
 */

export function BotaoRevogar() {
  const [enviando, iniciar] = useTransition();
  const [confirmando, setConfirmando] = useState(false);

  function revogar() {
    iniciar(async () => {
      const { erro } = await desconectarMercadoPago();
      setConfirmando(false);

      if (erro) {
        toast.error(erro);
        return;
      }

      toast.success("Conta desconectada");
    });
  }

  /**
   * Confirmação em dois passos, sem diálogo.
   *
   * Revogar interrompe a cobrança de todo agendamento novo, e o dono não tem
   * como perceber sozinho — o efeito só aparece depois, como sinal que ninguém
   * pagou. Um clique acidental é fácil demais.
   *
   * O texto de confirmação vive fora do cartão verde (a página o renderiza
   * abaixo), porque dentro dele a linha empurrava o layout do banner a cada
   * clique.
   */
  if (!confirmando) {
    return (
      <Button
        variant="outline"
        onClick={() => setConfirmando(true)}
        /* Sobre o fundo `confirmado`, o `outline` padrão (borda `input`, fundo
           transparente) sumia. Borda e fundo do próprio par de tokens. */
        className="border-confirmado-borda bg-card text-confirmado-tinta hover:bg-secondary"
      >
        Revogar
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="destructive" onClick={revogar} disabled={enviando}>
        {enviando ? "Revogando…" : "Sim, revogar"}
      </Button>
      <Button
        variant="ghost"
        onClick={() => setConfirmando(false)}
        className="text-confirmado-tinta hover:bg-card"
      >
        Cancelar
      </Button>
    </div>
  );
}

/** Verdadeiro enquanto o dono está confirmando — a página usa para o recado. */
export function BotaoEstornar({ cobrancaId }: { cobrancaId: string }) {
  const [enviando, iniciar] = useTransition();

  function estornar() {
    iniciar(async () => {
      const { erro } = await estornarSinal(cobrancaId);

      if (erro) {
        toast.error(erro);
        return;
      }

      toast.success("Estorno enviado ao Mercado Pago");
    });
  }

  return (
    <Button size="sm" onClick={estornar} disabled={enviando}>
      {enviando ? "Devolvendo…" : "Devolver"}
    </Button>
  );
}
