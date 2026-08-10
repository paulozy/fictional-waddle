import type { Metadata } from "next";
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

/**
 * Motivos que trazem alguém para cá com um recado, todos escritos por nós.
 *
 * Mapa fechado, e não texto vindo da query: `?erro=` renderizado direto seria
 * injeção de conteúdo — qualquer pessoa poderia mandar um link que exibe a frase
 * dela numa página com a nossa marca e um campo de senha ao lado.
 */
const RECADOS: Record<string, string> = {
  link_invalido:
    "Esse link não vale mais — eles expiram depois de um tempo e valem uma vez só. Peça outro abaixo.",
  sessao_expirada: "Sua sessão expirou. Entre de novo para continuar.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;

  return (
    <FormularioLogin
      recado={erro ? (RECADOS[erro] ?? null) : null}
    />
  );
}
