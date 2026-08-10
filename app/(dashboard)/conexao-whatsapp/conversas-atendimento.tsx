"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { definirPausaConversa } from "./actions";

export type ConversaAtendimento = {
  remoteJid: string;
  /** Nome do cliente quando conhecido; senão telefone; senão o identificador. */
  rotulo: string;
  /** Já formatado no fuso do negócio pelo Server Component. */
  pausadoAte: string | null;
  ultimaAtividade: string;
};

/**
 * Atendimento automático por conversa: ver quais estão em atendimento humano e
 * ligar/desligar o bot em cada uma.
 *
 * Ilha de cliente pequena dentro de uma página RSC, pelo mesmo motivo da
 * navegação: o único estado real aqui é "qual linha está em voo", e isso não
 * atravessa a fronteira RSC. Tudo que é dado — rótulo do cliente, horário no fuso
 * do negócio — chega **já formatado** do servidor, para não haver uma segunda
 * noção de fuso no navegador (o runtime da Vercel é UTC, o navegador do dono não).
 *
 * O caminho normal de pausar **não é este botão**: é o dono digitar na conversa,
 * que o webhook detecta. Esta tela existe porque o inverso não tinha caminho
 * nenhum — quem pausou por engano, ou resolveu em dois minutos, ficava esperando a
 * janela de uma hora vencer sozinha.
 */
export function ConversasAtendimento({
  conversas,
}: {
  conversas: ConversaAtendimento[];
}) {
  const [emVoo, setEmVoo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [, iniciarTransicao] = useTransition();

  function alternar(conversa: ConversaAtendimento) {
    setEmVoo(conversa.remoteJid);
    setErro(null);

    iniciarTransicao(async () => {
      const { erro } = await definirPausaConversa(
        conversa.remoteJid,
        conversa.pausadoAte === null,
      );

      setEmVoo(null);
      if (erro) setErro(erro);
    });
  }

  if (conversas.length === 0) return null;

  return (
    <section className="mt-9 max-w-2xl">
      <h2 className="text-base font-medium">Atendimento por conversa</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Quando você responde direto no WhatsApp, o bot para de responder naquela
        conversa por uma hora, para não falar por cima de você. Aqui dá para
        devolver o atendimento ao bot antes disso, ou silenciá-lo antes de assumir.
      </p>

      {erro && (
        <p className="mt-3 rounded-lg border border-aviso/40 bg-aviso-suave p-3 text-sm text-aviso">
          {erro}
        </p>
      )}

      <ul className="mt-4">
        {conversas.map((conversa) => {
          const pausada = conversa.pausadoAte !== null;

          return (
            <li
              key={conversa.remoteJid}
              className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-3.5 last:border-b"
            >
              <div className="min-w-0 text-sm">
                <p className="truncate font-medium">{conversa.rotulo}</p>
                <p className="mt-0.5 text-muted-foreground">
                  {pausada
                    ? `Você está atendendo — o bot volta ${conversa.pausadoAte}`
                    : `Bot atendendo — última mensagem ${conversa.ultimaAtividade}`}
                </p>
              </div>

              <Button
                type="button"
                size="sm"
                variant={pausada ? "default" : "outline"}
                disabled={emVoo === conversa.remoteJid}
                onClick={() => alternar(conversa)}
              >
                {emVoo === conversa.remoteJid
                  ? "Salvando…"
                  : pausada
                    ? "Devolver ao bot"
                    : "Assumir conversa"}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
