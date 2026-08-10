"use client";

import { useActionState } from "react";
import { enviarLinkRecuperacao } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import type { EstadoAuth } from "@/app/(auth)/schema";

/**
 * Trocar senha por link no e-mail, e não por um campo aqui dentro.
 *
 * O fluxo de `/recuperar-senha` → `/auth/confirmar` → `/redefinir-senha` já
 * existe e já foi testado. Um segundo caminho para definir senha significaria
 * duas implementações da mesma regra de força de senha, e a sessão do painel
 * pode estar aberta há semanas num aparelho emprestado — o e-mail é a prova de
 * posse que ela não dá.
 */
export function BotaoTrocarSenha({ email }: { email: string }) {
  const [estado, acao, enviando] = useActionState<EstadoAuth, FormData>(
    enviarLinkRecuperacao,
    undefined,
  );

  return (
    <form action={acao}>
      <input type="hidden" name="email" value={email} />
      <Button type="submit" variant="outline" size="lg" disabled={enviando}>
        {enviando ? "Enviando…" : "Trocar senha"}
      </Button>

      {/* `enviarLinkRecuperacao` responde sempre igual, com ou sem conta no
          endereço, para não virar um verificador de e-mails cadastrados. Aqui
          o e-mail é o do próprio dono logado, então o texto genérico é só
          herança — e não vale duplicar a action para mudar uma frase. */}
      {estado?.aviso && (
        <p role="status" className="mt-2 text-sm text-muted-foreground">
          {estado.aviso}
        </p>
      )}
      {estado?.erro && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {estado.erro}
        </p>
      )}
    </form>
  );
}
