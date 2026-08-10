import { NextResponse, type NextRequest } from "next/server";
import {
  ROTA_LOGIN,
  ROTA_PADRAO_LOGADO,
  atualizarSessao,
  exigeSessao,
  somenteAnonimo,
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

  /**
   * Resgate do link de e-mail que aterrissou na raiz.
   *
   * O Site URL do projeto Supabase é o **destino padrão** quando o `redirectTo`
   * não vale (doc: "The Site URL … defines the default redirect URL when no
   * `redirectTo` is specified in the code"), e é para lá que o link vai quando a
   * URL de retorno não está na allowlist de Redirect URLs. Aconteceu em produção:
   * o dono confirmava o e-mail e caía em `/?code=…`, na landing, com o cadastro
   * pela metade e nenhuma indicação do que fazer.
   *
   * A configuração é o conserto de verdade, mas depender dela para o fluxo
   * funcionar é frágil demais — um link já enviado não se corrige, e a allowlist
   * é editada num painel que este repositório não vê. Aqui o `code` é encaminhado
   * a quem sabe trocá-lo por sessão.
   *
   * **Só na raiz, de propósito.** `?code=` é parâmetro de OAuth em geral: um
   * callback de gateway de pagamento usa o mesmo nome, e capturar em qualquer
   * caminho quebraria aquele fluxo. A raiz é o único destino que o fallback do
   * Supabase usa.
   */
  if (pathname === "/" && ehRetornoDeEmail(request)) {
    return redirecionarPreservandoCookies(
      request,
      response,
      RETORNO_EMAIL,
      request.nextUrl.search,
    );
  }

  if (!claims && exigeSessao(pathname)) {
    return redirecionarPreservandoCookies(request, response, ROTA_LOGIN);
  }

  if (claims && somenteAnonimo(pathname)) {
    return redirecionarPreservandoCookies(
      request,
      response,
      ROTA_PADRAO_LOGADO,
    );
  }

  return response;
}

/** Onde os links de e-mail do Supabase são trocados por sessão. */
const RETORNO_EMAIL = "/auth/confirmar";

/**
 * A requisição carrega credencial de link de e-mail?
 *
 * Os dois formatos que `/auth/confirmar` aceita: `code` (templates padrão, via
 * `redirectTo`) e `token_hash` + `type` (templates personalizados). O `type` é
 * exigido junto porque `token_hash` sozinho não diz o que verificar.
 */
export function ehRetornoDeEmail(request: NextRequest): boolean {
  const busca = request.nextUrl.searchParams;
  return (
    busca.has("code") || (busca.has("token_hash") && busca.has("type"))
  );
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
  /**
   * A query é descartada por padrão, e isso é o certo nos redirects de sessão: o
   * `?dia=` de uma tela de agenda não faz sentido no login. O resgate de link de
   * e-mail é a exceção — ali a query **é** a credencial.
   */
  busca = "",
) {
  const url = request.nextUrl.clone();
  url.pathname = destino;
  url.search = busca;

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
     *  - **as rotas de metadata**: `robots.txt`, `sitemap.xml`,
     *    `opengraph-image`, os três `icon/*`, `apple-icon`, `icone-mascara` e
     *    `manifest.webmanifest`. Todas geradas em build, todas pedidas em toda
     *    visita, nenhuma coberta pela lista de extensões acima — as de ícone não
     *    têm extensão na URL, e `.txt`/`.xml` não estavam na lista.
     *
     *    O ganho óbvio é contagem de invocação. O que importa mais é o caso da
     *    requisição **com** cookie: um pedido de `/icon/512` disparado em
     *    paralelo com a navegação faria `atualizarSessao` rotacionar o refresh
     *    token — que no Supabase é de uso único — num subrecurso. É a receita
     *    conhecida de logout aleatório. (Sem cookie, `getClaims()` não vai à
     *    rede e nada disso acontece; por isso o problema é o pedido autenticado,
     *    não o do crawler.)
     */
    "/((?!api/webhook|api/cron|_next/static|_next/image|favicon.ico|robots\\.txt|sitemap\\.xml|opengraph-image|icon/|apple-icon|icone-mascara|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
