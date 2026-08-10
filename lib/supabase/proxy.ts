import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { envObrigatoria } from "@/lib/config";
import type { Database } from "./tipos-banco";

/** Prefixos que exigem sessão. Fora daqui, acesso anônimo é permitido. */
export const ROTAS_PROTEGIDAS = [
  "/conexao-whatsapp",
  "/servicos",
  "/horarios",
  "/agendamentos",
  "/fluxo-conversa",
  "/pagamentos",
] as const;

export const ROTA_LOGIN = "/login";
export const ROTA_PADRAO_LOGADO = "/agendamentos";

export function exigeSessao(pathname: string): boolean {
  return ROTAS_PROTEGIDAS.some(
    (rota) => pathname === rota || pathname.startsWith(`${rota}/`),
  );
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
