import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { envObrigatoria } from "@/lib/config";
import type { Database } from "./tipos-banco";

/**
 * Client Supabase para Server Components, Server Actions e Route Handlers
 * autenticados. Respeita RLS: usa a anon key e a sessão do usuário vinda dos
 * cookies.
 *
 * Sempre criar um client novo por render — nunca compartilhar entre requests.
 */
export async function criarClienteServidor() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    envObrigatoria("NEXT_PUBLIC_SUPABASE_URL"),
    envObrigatoria("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesParaDefinir) {
          try {
            for (const { name, value, options } of cookiesParaDefinir) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components não podem escrever cookies. O refresh de token
            // é responsabilidade do `proxy.ts`, então ignorar aqui é seguro.
          }
        },
      },
    },
  );
}

/**
 * Devolve as claims verificadas do JWT, ou null se não houver sessão válida.
 *
 * Usa `getClaims()` e não `getSession()`: a doc do auth-js é explícita que o
 * objeto de usuário devolvido por `getSession()` vem de um meio inseguro
 * (cookies) e **não deve ser confiado** para estabelecer identidade.
 */
export async function obterClaims() {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.auth.getClaims();
  if (error) return null;
  return data?.claims ?? null;
}

/**
 * Guard para Server Actions e Server Components: devolve o `usuario_id` ou
 * lança.
 *
 * Necessário porque o `proxy.ts` **não** cobre Server Actions — a doc do Next 16
 * avisa: "Server Functions are not separate routes... Always verify
 * authentication and authorization inside each Server Function rather than
 * relying on Proxy alone" (docs/01-app/01-getting-started/16-proxy.md).
 */
export async function exigirUsuario(): Promise<string> {
  const claims = await obterClaims();
  const usuarioId = claims?.sub;
  if (!usuarioId || typeof usuarioId !== "string") {
    throw new Error("Não autenticado");
  }
  return usuarioId;
}
