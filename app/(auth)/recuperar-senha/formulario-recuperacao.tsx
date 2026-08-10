"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ROTA_LOGIN } from "@/lib/supabase/proxy";
import { enviarLinkRecuperacao } from "../actions";
import {
  BotaoPrincipal,
  Cabecalho,
  Campo,
  LinhaDeApoio,
  Recado,
} from "../pecas";
import type { EstadoAuth } from "../schema";

/**
 * Esta tela não existe no design — o link "Esqueci a senha" de lá aponta para um
 * `#recuperar` sem destino. Ela é escrita no mesmo idioma (mesma moldura, mesma
 * escala tipográfica, mesmo espaçamento) porque até agora quem esquecia a senha
 * não tinha caminho nenhum no produto: precisava nos chamar no WhatsApp.
 */
export function FormularioRecuperacao() {
  const [estado, acao, enviando] = useActionState<EstadoAuth, FormData>(
    enviarLinkRecuperacao,
    undefined,
  );

  return (
    <>
      <Cabecalho titulo="Recuperar o acesso">
        Informe o e-mail da conta. Mandamos um link para você criar uma senha
        nova.
      </Cabecalho>

      {estado?.erro && <Recado tom="erro">{estado.erro}</Recado>}
      {estado?.aviso && <Recado tom="neutro">{estado.aviso}</Recado>}

      <form action={acao} className="mt-8 flex flex-col gap-5">
        <Campo
          id="email"
          name="email"
          rotulo="E-mail"
          type="email"
          required
          autoComplete="email"
          enterKeyHint="go"
          placeholder="voce@barbearia.com.br"
        />

        <BotaoPrincipal type="submit" disabled={enviando} className="mt-1">
          {enviando ? "Enviando…" : "Enviar link"}
        </BotaoPrincipal>
      </form>

      <LinhaDeApoio>
        Lembrou?{" "}
        <Link
          href={ROTA_LOGIN}
          className="text-primary underline underline-offset-[3px]"
        >
          Voltar para entrar
        </Link>
      </LinhaDeApoio>
    </>
  );
}
