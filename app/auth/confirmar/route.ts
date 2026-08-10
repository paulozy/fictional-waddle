import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import {
  ROTA_LOGIN,
  ROTA_PADRAO_LOGADO,
  ROTA_REDEFINIR_SENHA,
  ROTA_REGISTRO_ESTABELECIMENTO,
} from "@/lib/supabase/proxy";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Onde os links de e-mail do Supabase aterrissam.
 *
 * Duas coisas acontecem aqui, nesta ordem: o token do link é trocado por uma
 * sessão de verdade (cookies), e só então o dono é levado ao passo do fluxo que
 * pediu o e-mail. Antes disto não havia rota nenhuma — o link caía na raiz do
 * site com os tokens no **fragmento** da URL, que só JavaScript no navegador lê e
 * que o `@supabase/ssr` nunca vê. O resultado prático era o dono confirmar o
 * e-mail e aparecer deslogado na landing.
 *
 * ## Dois formatos de link, de propósito
 *
 * - `?token_hash=…&type=…` → `verifyOtp`. É o formato dos templates de e-mail
 *   personalizados (`{{ .TokenHash }}`), e o preferível: não depende de cookie
 *   nenhum do navegador que iniciou, então funciona quando o dono abre o link no
 *   celular tendo se cadastrado no computador.
 * - `?code=…` → `exchangeCodeForSession`. É o que os templates **padrão** do
 *   Supabase produzem, via `emailRedirectTo`/`redirectTo`. Aceitar este formato é
 *   o que faz o fluxo funcionar sem ninguém precisar editar template no painel.
 *
 * ## O destino é mapa fechado, nunca um `?next=`
 *
 * Um parâmetro de destino livre nesta rota seria redirect aberto pendurado
 * justamente no endereço que acabou de criar sessão: bastaria mandar
 * `/auth/confirmar?...&next=https://sitedele.com` para um dono recém-logado
 * pousar em página de terceiro achando que ainda está no produto. Aqui o destino
 * sai de `type`/`fluxo`, ambos comparados contra listas nossas, e o que não
 * casar cai no painel.
 */

/** Tipos de OTP de e-mail que este produto emite. Nada além disso é aceito. */
const TIPOS_ACEITOS = new Set<EmailOtpType>([
  "email",
  "signup",
  "recovery",
  "magiclink",
  "invite",
  "email_change",
]);

function ehTipoAceito(valor: string | null): valor is EmailOtpType {
  return valor !== null && TIPOS_ACEITOS.has(valor as EmailOtpType);
}

/**
 * `type` manda; `fluxo` é o plano B.
 *
 * O formato `?code=` não carrega `type` nenhum — a intenção viaja no `fluxo` que
 * nós mesmos escrevemos no `redirectTo` (ver `RETORNO_EMAIL` em
 * `app/(auth)/actions.ts`). Sem esse plano B, uma redefinição de senha com
 * template padrão levaria o dono ao passo 2 do cadastro em vez da tela de senha
 * nova.
 */
export function destinoDoLink(
  tipo: string | null,
  fluxo: string | null,
): string {
  if (tipo === "recovery" || fluxo === "recuperacao") {
    return ROTA_REDEFINIR_SENHA;
  }
  if (tipo === "signup" || tipo === "email" || fluxo === "cadastro") {
    return ROTA_REGISTRO_ESTABELECIMENTO;
  }
  return ROTA_PADRAO_LOGADO;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const tipo = searchParams.get("type");
  const codigo = searchParams.get("code");
  const fluxo = searchParams.get("fluxo");

  const supabase = await criarClienteServidor();

  let falhou = true;
  if (tokenHash && ehTipoAceito(tipo)) {
    const { error } = await supabase.auth.verifyOtp({
      type: tipo,
      token_hash: tokenHash,
    });
    falhou = Boolean(error);
    if (error) console.error("auth/confirmar: verifyOtp recusou", error.code);
  } else if (codigo) {
    const { error } = await supabase.auth.exchangeCodeForSession(codigo);
    falhou = Boolean(error);
    if (error) console.error("auth/confirmar: troca de código falhou", error.code);
  } else {
    console.error("auth/confirmar: link sem token_hash e sem code");
  }

  /**
   * Link morto vai para o login com recado, e **não** para uma página de erro.
   * O caso comum não é ataque: é link expirado, link já usado, ou o pré-visualizador
   * de link do próprio WhatsApp tendo aberto a URL antes do dono. Em todos, o que
   * a pessoa precisa é da tela de entrar com uma frase explicando.
   */
  const destino = request.nextUrl.clone();
  destino.search = "";
  if (falhou) {
    destino.pathname = ROTA_LOGIN;
    destino.searchParams.set("erro", "link_invalido");
  } else {
    destino.pathname = destinoDoLink(tipo, fluxo);
  }

  return NextResponse.redirect(destino);
}
