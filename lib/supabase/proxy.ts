import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { envObrigatoria } from "@/lib/config";
import type { Database } from "./tipos-banco";

export const ROTA_LOGIN = "/login";
export const ROTA_PADRAO_LOGADO = "/agendamentos";

/** Cadastro: passo 1 é anônimo, 2 e 3 já são dentro da conta. */
export const ROTA_REGISTRO = "/registro";
export const ROTA_REGISTRO_CONFIRMAR = "/registro/confirmar-email";
export const ROTA_REGISTRO_ESTABELECIMENTO = "/registro/estabelecimento";
export const ROTA_REGISTRO_WHATSAPP = "/registro/whatsapp";

export const ROTA_RECUPERAR_SENHA = "/recuperar-senha";
export const ROTA_REDEFINIR_SENHA = "/redefinir-senha";

/** Prefixos que exigem sessão. Fora daqui, acesso anônimo é permitido. */
export const ROTAS_PROTEGIDAS = [
  "/conexao-whatsapp",
  "/servicos",
  "/horarios",
  "/agendamentos",
  "/fluxo-conversa",
  "/conta",
  /**
   * Os passos 2 e 3 do cadastro escrevem em `perfis` e criam instância na
   * Evolution — os dois exigem sessão. Chegar aqui deslogado significa link de
   * e-mail expirado ou aba antiga, e o destino certo é o login.
   */
  ROTA_REGISTRO_ESTABELECIMENTO,
  ROTA_REGISTRO_WHATSAPP,
  /**
   * A redefinição também é rota de sessão: o link do e-mail passa por
   * `/auth/confirmar`, que troca o token por uma sessão de recuperação antes de
   * redirecionar para cá. Sem a sessão, `updateUser` não teria em quem gravar.
   */
  ROTA_REDEFINIR_SENHA,
] as const;

/**
 * Rotas que só fazem sentido deslogado.
 *
 * Antes isto era um `pathname === ROTA_LOGIN` cravado no `proxy.ts`. Com o
 * cadastro e a recuperação em telas próprias, quem já tem sessão caía num
 * formulário de criar conta — e o `signUp` de um usuário logado é erro sem
 * mensagem útil.
 *
 * **Comparação exata, não prefixo:** `/registro` está aqui e
 * `/registro/estabelecimento` está na lista de protegidas. Um `startsWith`
 * jogaria o passo 2 de volta para o painel no instante em que ele funcionasse.
 */
export const ROTAS_SOMENTE_ANONIMAS = [
  ROTA_LOGIN,
  ROTA_REGISTRO,
  ROTA_REGISTRO_CONFIRMAR,
  ROTA_RECUPERAR_SENHA,
] as const;

export function exigeSessao(pathname: string): boolean {
  return ROTAS_PROTEGIDAS.some(
    (rota) => pathname === rota || pathname.startsWith(`${rota}/`),
  );
}

export function somenteAnonimo(pathname: string): boolean {
  return ROTAS_SOMENTE_ANONIMAS.some((rota) => rota === pathname);
}

/**
 * Refresh de sessão no `proxy.ts`.
 *
 * Devolve a resposta com os cookies rotacionados e as claims verificadas.
 * Nunca redireciona — essa decisão fica no `proxy.ts`, que tem a visão da rota.
 */
export async function atualizarSessao(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    envObrigatoria("NEXT_PUBLIC_SUPABASE_URL"),
    envObrigatoria("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesParaDefinir, headers) {
          for (const { name, value } of cookiesParaDefinir) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesParaDefinir) {
            response.cookies.set(name, value, options);
          }
          // Obrigatório: o @supabase/ssr passa aqui os headers de no-store.
          // Sem eles, um CDN ou proxy reverso pode cachear a resposta que
          // carrega o cookie de sessão e servir o token de um usuário para
          // outro (ver o JSDoc de SetAllCookies em @supabase/ssr/types).
          for (const [chave, valor] of Object.entries(headers)) {
            response.headers.set(chave, valor);
          }
        },
      },
    },
  );

  // getClaims() e não getSession(): só o JWT verificado estabelece identidade.
  const { data, error } = await supabase.auth.getClaims();
  const claims = error ? null : (data?.claims ?? null);

  return { response, claims };
}
