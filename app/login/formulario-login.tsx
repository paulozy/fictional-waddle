"use client";

import { useActionState } from "react";
import { criarConta, entrar } from "./actions";
import type { EstadoLogin } from "./schema";

const CAMPO =
  "mt-1 h-11 w-full rounded-md border border-input bg-transparent px-3 outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function FormularioLogin() {
  const [estadoEntrar, acaoEntrar, entrando] = useActionState<
    EstadoLogin,
    FormData
  >(entrar, undefined);
  const [estadoCriar, acaoCriar, criando] = useActionState<
    EstadoLogin,
    FormData
  >(criarConta, undefined);

  const erro = estadoEntrar?.erro ?? estadoCriar?.erro;
  const ocupado = entrando || criando;

  return (
    <form className="w-full max-w-sm">
      <label className="block text-sm font-medium" htmlFor="email">
        E-mail
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className={CAMPO}
        />
      </label>

      <label className="mt-4 block text-sm font-medium" htmlFor="senha">
        Senha
        <input
          id="senha"
          name="senha"
          type="password"
          required
          minLength={8}
          autoComplete="current-password"
          className={CAMPO}
        />
      </label>

      {erro && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {erro}
        </p>
      )}

      <button
        type="submit"
        formAction={acaoEntrar}
        disabled={ocupado}
        className="mt-6 h-11 w-full rounded-md bg-primary font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {entrando ? "Entrando…" : "Entrar"}
      </button>

      <button
        type="submit"
        formAction={acaoCriar}
        disabled={ocupado}
        className="mt-3 h-11 w-full rounded-md border border-input font-medium transition-colors hover:bg-muted disabled:opacity-60"
      >
        {criando ? "Criando conta…" : "Criar conta"}
      </button>
    </form>
  );
}
