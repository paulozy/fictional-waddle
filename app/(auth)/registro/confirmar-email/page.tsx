import type { Metadata } from "next";
import Link from "next/link";
import { MailCheckIcon } from "lucide-react";
import { ROBOTS_PRIVADO } from "@/lib/site";
import { ROTA_LOGIN } from "@/lib/supabase/proxy";
import { Cabecalho, LinhaDeApoio } from "../../pecas";
import { emailSomenteSchema } from "../../schema";
import { Passos } from "../passos";

export const metadata: Metadata = {
  title: "Confirme seu e-mail",
  robots: ROBOTS_PRIVADO,
};

/**
 * A emenda do cadastro em três passos.
 *
 * Esta tela **não está no design**: o design assume que os três passos correm
 * seguidos, o que só vale com a confirmação de e-mail desligada. Com ela ligada,
 * `signUp` não devolve sessão e os passos 2 e 3 — que escrevem em `perfis` e
 * criam instância na Evolution — não têm em nome de quem escrever. Sem uma tela
 * aqui, o dono era jogado de volta ao login pelo proxy, sem explicação nenhuma.
 *
 * Segue `Passos atual={1}`: o passo 1 não terminou até o e-mail ser confirmado.
 */
export default async function ConfirmarEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  /**
   * Validado antes de ir para a tela, mesmo vindo do nosso próprio redirect: o
   * parâmetro é editável na barra de endereço, e um texto arbitrário renderizado
   * ao lado da nossa marca é injeção de conteúdo. Não passando, a frase perde o
   * endereço e continua correta.
   */
  const verificado = emailSomenteSchema.safeParse({ email });
  const endereco = verificado.success ? verificado.data.email : null;

  return (
    <>
      <Passos atual={1} />

      <Cabecalho titulo="Confirme seu e-mail" className="mt-6 lg:mt-6">
        {endereco ? (
          <>
            Mandamos um link para <strong className="font-medium text-foreground">{endereco}</strong>. Abrir
            esse link é o que libera os próximos dois passos.
          </>
        ) : (
          <>
            Mandamos um link para o e-mail que você cadastrou. Abrir esse link é o
            que libera os próximos dois passos.
          </>
        )}
      </Cabecalho>

      <div className="mt-7 flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-sm">
        <MailCheckIcon
          aria-hidden
          className="mt-0.5 size-5 shrink-0 text-muted-foreground"
        />
        <div className="text-muted-foreground">
          <p className="font-medium text-foreground">Não chegou?</p>
          <p className="mt-1 leading-relaxed">
            Confira a caixa de spam e o lixo eletrônico. O link vale uma vez só e
            expira — se der erro ao abrir, volte aqui e cadastre-se de novo com o
            mesmo e-mail.
          </p>
        </div>
      </div>

      <LinhaDeApoio>
        Já confirmou?{" "}
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
