import { NextResponse, type NextRequest } from "next/server";
import {
  ROTA_LOGIN,
  ROTA_PADRAO_LOGADO,
  atualizarSessao,
  exigeSessao,
} from "@/lib/supabase/proxy";

/**
 * No Next 16 este arquivo se chama `proxy.ts` (era `middleware.ts`) e a função
 * exportada se chama `proxy` — ver
 * docs/01-app/02-guides/upgrading/version-16.md. O runtime é `nodejs` e não é
 * configurável, o que remove o atrito histórico do @supabase/ssr com Edge.
 *
 * Responsabilidade: refresh de token + redirect otimista. **Não** é a camada de
 * autorização — a doc é explícita que o matcher não cobre Server Actions, então
 * cada Server Action revalida auth por conta própria via `exigirUsuario()`.
 */
export async function proxy(request: NextRequest) {
  const { response, claims } = await atualizarSessao(request);
  const { pathname } = request.nextUrl;

  if (!claims && exigeSessao(pathname)) {
    return redirecionarPreservandoCookies(request, response, ROTA_LOGIN);
  }

  if (claims && pathname === ROTA_LOGIN) {
    return redirecionarPreservandoCookies(
      request,
      response,
      ROTA_PADRAO_LOGADO,
    );
  }

  return response;
}

/**
 * Um redirect novo descartaria os cookies rotacionados pelo refresh, causando
 * logout aleatório na próxima navegação. Copiar cookies e headers preserva o
 * refresh que acabou de acontecer.
 */
function redirecionarPreservandoCookies(
  request: NextRequest,
  origem: NextResponse,
  destino: string,
) {
  const url = request.nextUrl.clone();
  url.pathname = destino;
  url.search = "";

  const redirect = NextResponse.redirect(url);
  for (const cookie of origem.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  origem.headers.forEach((valor, chave) => {
    if (chave.toLowerCase() !== "location") {
      redirect.headers.set(chave, valor);
    }
  });
  return redirect;
}

export const config = {
  matcher: [
    /**
     * Tudo, exceto:
     *  - `/api/webhook/*` e `/api/cron/*`: chegam sem sessão de usuário (Evolution
     *    API e Vercel Cron). Passar por aqui só gastaria uma chamada de refresh
     *    inútil e poderia mexer em cookies de uma request que não tem dono.
     *  - assets estáticos e imagens otimizadas.
     */
    "/((?!api/webhook|api/cron|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
