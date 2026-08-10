"use client";

import Link from "next/link";
import { useActionState } from "react";
import { DIAS_TRIAL } from "@/lib/plano";
import { ROTA_LOGIN } from "@/lib/supabase/proxy";
import { criarConta } from "../actions";
import {
  BotaoPrincipal,
  Cabecalho,
  Campo,
  LinhaDeApoio,
  Recado,
} from "../pecas";
import type { EstadoAuth } from "../schema";
import { Passos } from "./passos";

/** Passo 1 de 3: as credenciais. */
export function FormularioRegistro() {
  const [estado, acao, criando] = useActionState<EstadoAuth, FormData>(
    criarConta,
    undefined,
  );

  return (
    <>
      <Passos atual={1} />

      <Cabecalho titulo="Criar sua conta" className="mt-6 lg:mt-6">
        {DIAS_TRIAL} dias de teste, sem cartão. Você configura tudo antes de
        decidir.
      </Cabecalho>

      {estado?.erro && <Recado tom="erro">{estado.erro}</Recado>}

      <form action={acao} className="mt-8 flex flex-col gap-5">
        <Campo
          id="email"
          name="email"
          rotulo="E-mail"
          type="email"
          required
          autoComplete="email"
          enterKeyHint="next"
          placeholder="voce@barbearia.com.br"
        />

        <Campo
          id="senha"
          name="senha"
          rotulo="Senha"
          type="password"
          required
          minLength={8}
          /**
           * `new-password`, e agora sem empate: com o login em tela própria, o
           * gerenciador de senha pode sugerir uma senha gerada aqui sem deixar de
           * oferecer a senha salva a quem só quer entrar.
           */
          autoComplete="new-password"
          enterKeyHint="go"
          placeholder="Mínimo de 8 caracteres"
        />

        <BotaoPrincipal type="submit" disabled={criando} className="mt-3">
          {criando ? "Criando conta…" : "Continuar"}
        </BotaoPrincipal>
      </form>

      <LinhaDeApoio>
        Já tem conta?{" "}
        <Link
          href={ROTA_LOGIN}
          className="text-primary underline underline-offset-[3px]"
        >
          Entrar
        </Link>
      </LinhaDeApoio>
    </>
  );
}
