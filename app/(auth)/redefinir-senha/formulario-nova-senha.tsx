"use client";

import { useActionState } from "react";
import { redefinirSenha } from "../actions";
import { BotaoPrincipal, Cabecalho, Campo, Recado } from "../pecas";
import type { EstadoAuth } from "../schema";

export function FormularioNovaSenha() {
  const [estado, acao, salvando] = useActionState<EstadoAuth, FormData>(
    redefinirSenha,
    undefined,
  );

  return (
    <>
      <Cabecalho titulo="Criar uma senha nova">
        Depois de salvar, você entra direto no painel — não precisa digitar a senha
        de novo agora.
      </Cabecalho>

      {estado?.erro && <Recado tom="erro">{estado.erro}</Recado>}

      <form action={acao} className="mt-8 flex flex-col gap-5">
        <Campo
          id="senha"
          name="senha"
          rotulo="Nova senha"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          enterKeyHint="next"
          placeholder="Mínimo de 8 caracteres"
        />

        {/**
         * A confirmação existe porque o campo é mascarado e esta é a última
         * chance: um typo aqui tranca a conta até o dono pedir outro link. É o
         * mesmo motivo pelo qual o login **não** tem confirmação — lá, errar
         * custa uma tentativa.
         */}
        <Campo
          id="confirmacao"
          name="confirmacao"
          rotulo="Repita a senha"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          enterKeyHint="go"
          placeholder="A mesma senha"
        />

        <BotaoPrincipal type="submit" disabled={salvando} className="mt-1">
          {salvando ? "Salvando…" : "Salvar e entrar"}
        </BotaoPrincipal>
      </form>
    </>
  );
}
