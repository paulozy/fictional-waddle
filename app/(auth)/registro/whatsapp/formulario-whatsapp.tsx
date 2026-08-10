"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ROTA_PADRAO_LOGADO } from "@/lib/supabase/proxy";
import { irParaPareamento } from "../../actions";
import { BotaoPrincipal, Cabecalho, Campo, Recado } from "../../pecas";
import type { EstadoAuth } from "../../schema";
import { Passos } from "../passos";

/**
 * Passo 3 de 3: o número do negócio.
 *
 * O QR não é gerado aqui — a action valida o número e manda para
 * `/conexao-whatsapp`, que é o painel de pareamento de sempre. Duplicar aquela
 * tela custaria manter em dois lugares a expiração de 45s, a contagem de
 * regeneração e o polling, todos medidos contra a Evolution 2.3.7.
 */
export function FormularioWhatsapp() {
  const [estado, acao, enviando] = useActionState<EstadoAuth, FormData>(
    irParaPareamento,
    undefined,
  );

  return (
    <>
      <Passos atual={3} />

      <Cabecalho titulo="Conectar o WhatsApp" className="mt-6 lg:mt-6">
        Use o número do negócio, não o pessoal: depois de conectado, quem escrever
        para ele recebe o menu de agendamento.
      </Cabecalho>

      {estado?.erro && <Recado tom="erro">{estado.erro}</Recado>}

      <form action={acao} className="mt-8 flex flex-col gap-5">
        <Campo
          id="numero"
          name="numero"
          rotulo="Número com DDD"
          type="tel"
          required
          /**
           * `inputMode="tel"` além do `type`: em Android o teclado numérico com
           * símbolos de telefone só aparece com ele, e o dono digita com máscara
           * (parênteses, hífen) — que `normalizarNumeroWhatsApp` descarta.
           */
          inputMode="tel"
          autoComplete="tel"
          enterKeyHint="go"
          placeholder="(11) 99999-8888"
        />

        <BotaoPrincipal type="submit" disabled={enviando} className="mt-1">
          {enviando ? "Preparando…" : "Gerar QR code"}
        </BotaoPrincipal>
      </form>

      {/**
       * A saída do passo 3. Conectar o WhatsApp é o que faz o produto funcionar,
       * mas exige o celular do negócio na mão — e quem está cadastrando às onze da
       * noite não tem. Sem esta linha, a única saída seria fechar a aba, e o dono
       * nunca veria o painel que acabou de assinar.
       */}
      <Link
        href={ROTA_PADRAO_LOGADO}
        className="mt-4 flex min-h-11 w-full items-center justify-center text-base text-muted-foreground underline underline-offset-4 md:text-[0.9rem]"
      >
        Conectar depois e ir para o painel
      </Link>
    </>
  );
}
