import type { Metadata } from "next";
import Link from "next/link";
import { Marca } from "@/components/marca";
import { ROBOTS_PRIVADO } from "@/lib/site";
import { FormularioLogin } from "./formulario-login";

/**
 * `noindex` porque esta tela concorre com a landing pelas mesmas consultas de
 * marca e não tem nada a oferecer a quem chega da busca: é um formulário.
 *
 * Note que **não** há `Disallow` correspondente em `app/robots.ts`. O Google só
 * respeita o `noindex` se puder buscar a página — bloquear no robots.txt
 * impediria justamente a leitura desta diretiva.
 */
export const metadata: Metadata = {
  title: "Entrar",
  robots: ROBOTS_PRIVADO,
};

export default function LoginPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 sm:px-6 py-16">
      {/* Aqui a marca é o único elemento de identidade da tela, então respira
          mais que nos cabeçalhos. */}
      <Link
        href="/"
        className="flex min-h-11 flex-col items-center gap-2 font-heading text-sm font-semibold uppercase tracking-wide text-foreground"
      >
        <Marca tamanho={40} prioritaria />
        Encaixaria
      </Link>
      <h1 className="mt-4 mb-8 text-2xl font-semibold tracking-tight">
        Entrar na sua conta
      </h1>
      <FormularioLogin />
    </div>
  );
}
