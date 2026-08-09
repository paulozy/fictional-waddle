"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  desconectarMercadoPago,
  estornarSinal,
  iniciarConexaoMercadoPago,
} from "./actions";

/**
 * Ilha de cliente da tela de pagamentos.
 *
 * A página em volta segue Server Component: só os botões precisam de estado de
 * envio. Mesmo recorte de `navegacao-dashboard.tsx` — hidratar o mínimo.
 */

export function BotaoConectar() {
  const [enviando, iniciar] = useTransition();

  function conectar() {
    iniciar(async () => {
      const resultado = await iniciarConexaoMercadoPago();

      if (!resultado.url) {
        toast.error(resultado.erro);
        return;
      }

      /**
       * Navegação de página inteira, não `router.push`: o destino é o domínio do
       * Mercado Pago. Um push do Next tentaria resolver a rota internamente e
       * não sairia do lugar.
       */
      window.location.href = resultado.url;
    });
  }

  return (
    <Button onClick={conectar} disabled={enviando}>
      {enviando ? "Abrindo o Mercado Pago…" : "Conectar conta do Mercado Pago"}
    </Button>
  );
}

export function BotaoDesconectar() {
  const [enviando, iniciar] = useTransition();
  const [confirmando, setConfirmando] = useState(false);

  function desconectar() {
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
   * Desconectar interrompe a cobrança de todo agendamento novo, e o dono não tem
   * como perceber sozinho — o efeito só aparece depois, como sinal que ninguém
   * pagou. Um clique acidental num botão de "desconectar" ao lado de "conectar"
   * é fácil demais.
   */
  if (!confirmando) {
    return (
      <Button variant="outline" onClick={() => setConfirmando(true)}>
        Desconectar
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">
        Novos agendamentos deixam de cobrar sinal. Confirma?
      </span>
      <Button variant="destructive" onClick={desconectar} disabled={enviando}>
        {enviando ? "Desconectando…" : "Sim, desconectar"}
      </Button>
      <Button variant="ghost" onClick={() => setConfirmando(false)}>
        Cancelar
      </Button>
    </div>
  );
}

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
    <Button size="sm" variant="outline" onClick={estornar} disabled={enviando}>
      {enviando ? "Estornando…" : "Devolver sinal"}
    </Button>
  );
}
