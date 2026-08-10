"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  ROTA_RECUPERAR_SENHA,
  ROTA_REGISTRO,
} from "@/lib/supabase/proxy";
import { entrar } from "../actions";
import { BotaoPrincipal, Cabecalho, Campo, LinhaDeApoio, Recado } from "../pecas";
import type { EstadoAuth } from "../schema";

/**
 * Entrar — e **só** entrar.
 *
 * A versão anterior tinha dois botões de submit ("Entrar" e "Criar conta") no
 * mesmo formulário, dividindo um campo de senha. O custo aparecia num detalhe: o
 * campo declarava `autoComplete="current-password"`, que é certo para quem entra
 * todo dia e errado para quem está criando conta, e não havia como servir aos
 * dois. Com as telas separadas, cada uma declara a própria intenção — aqui
 * `current-password`, no cadastro `new-password`.
 */
export function FormularioLogin({ recado }: { recado: string | null }) {
  const [estado, acao, entrando] = useActionState<EstadoAuth, FormData>(
    entrar,
    undefined,
  );

  return (
    <>
      <Cabecalho titulo="Entrar na sua conta">
        A agenda da semana e a configuração do bot ficam aqui dentro.
      </Cabecalho>

      {estado?.erro ? (
        <Recado tom="erro">{estado.erro}</Recado>
      ) : (
        recado && <Recado tom="neutro">{recado}</Recado>
      )}

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
          autoComplete="current-password"
          enterKeyHint="go"
          placeholder="••••••••"
          rotuloExtra={
            /**
             * `-my-3.5 py-3.5` estende a área de toque sem mexer no desenho: o
             * texto tem 13px, e crescer a fonte desalinharia o rótulo ao lado. A
             * margem negativa devolve exatamente o que o padding acrescentou, então
             * a linha do rótulo não se move.
             *
             * Medido em Chromium: com `-my-2 py-2` o alvo dava 36px — passa o
             * mínimo AA de 24px (SC 2.5.8) e fica abaixo da meta de conforto de
             * 44px do projeto. Com 3.5 dá 48px.
             */
            <Link
              href={ROTA_RECUPERAR_SENHA}
              className="-my-3.5 py-3.5 text-[0.83rem] text-primary hover:underline"
            >
              Esqueci a senha
            </Link>
          }
        />

        <BotaoPrincipal type="submit" disabled={entrando} className="mt-3">
          {entrando ? "Entrando…" : "Entrar"}
        </BotaoPrincipal>
      </form>

      <LinhaDeApoio>
        Ainda não tem conta?{" "}
        <Link
          href={ROTA_REGISTRO}
          className="text-primary underline underline-offset-[3px]"
        >
          Criar conta
        </Link>
      </LinhaDeApoio>
    </>
  );
}
