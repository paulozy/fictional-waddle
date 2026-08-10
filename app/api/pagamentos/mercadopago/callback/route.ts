import { timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

import { COOKIE_STATE } from "@/lib/pagamentos/oauth-state";
import { envObrigatoria } from "@/lib/config";
import { salvarCredenciais } from "@/lib/pagamentos/credenciais";
import { trocarCodigoPorToken } from "@/lib/pagamentos/mercado-pago";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Volta do OAuth do Mercado Pago.
 *
 * Roda **com sessão** (o dono está logado e foi redirecionado de volta), ao
 * contrário dos webhooks. Isso importa: é a sessão que diz de quem é a conta que
 * está sendo conectada — nunca um parâmetro da URL, que o atacante controla.
 */

/**
 * Redirect com `Location` **relativo**, sem inferir origem nenhuma.
 *
 * A versão anterior montava o destino a partir de `url.origin`, e isso quebrava
 * atrás de proxy: com o app exposto por túnel, o `Host` chega como
 * `localhost:3000` e o `x-forwarded-proto` como `https`, então a origem
 * reconstruída virava `https://localhost:3000` — e o navegador tentava TLS
 * contra um servidor de desenvolvimento em HTTP puro, resultando em
 * `ERR_SSL_PROTOCOL_ERROR`.
 *
 * `Response.redirect()` exige URL absoluta, então a resposta é montada à mão:
 * `Location` relativo é válido (RFC 7231 §7.1.2) e o navegador resolve contra a
 * URL da requisição, que é sempre a origem certa — seja localhost, túnel ou
 * produção. Nenhuma configuração nova, nenhuma adivinhação.
 */
function redirecionar(caminho: string) {
  return new Response(null, { status: 303, headers: { Location: caminho } });
}

/** Volta para o painel com um código de resultado legível pela página. */
function voltar(resultado: string) {
  return redirecionar(`/pagamentos?conexao=${resultado}`);
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  /**
   * A sessão é a primeira coisa, e é o que amarra o token a um dono.
   *
   * Sem sessão não há a quem atribuir a conexão. Um `usuario_id` vindo da query
   * string resolveria "tecnicamente" e seria a falha inteira: bastaria induzir o
   * dono a abrir a URL com o id de outra pessoa.
   */
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /**
   * Sem sessão, o mais provável não é "deslogou": é o app ter sido navegado
   * numa origem e o provedor ter devolvido em outra (localhost vs. túnel).
   * Cookie não atravessa origem, então o callback chega anônimo. O aviso na
   * página de login dá o nome disso — sem ele, o sintoma é um logout
   * inexplicável no meio da conexão.
   */
  if (!user) {
    console.warn("callback do Mercado Pago sem sessão", {
      host: url.host,
      dica: "o app precisa ser navegado na MESMA origem do redirect_uri",
    });
    return redirecionar("/login?motivo=sessao_perdida_no_oauth");
  }

  const erroDoProvedor = url.searchParams.get("error");
  if (erroDoProvedor) {
    // O dono clicou em "cancelar" na tela do MP. Caminho normal, não falha.
    console.info("autorização recusada no Mercado Pago", {
      usuario_id: user.id,
      erro: erroDoProvedor,
    });
    return voltar("recusada");
  }

  const codigo = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const jar = await cookies();
  const stateEsperado = jar.get(COOKIE_STATE)?.value ?? null;

  // Consome o cookie de qualquer jeito: um `state` reutilizável derrota o
  // propósito de existir.
  jar.delete(COOKIE_STATE);

  if (!codigo || !state || !stateEsperado || !iguais(state, stateEsperado)) {
    console.warn("callback do Mercado Pago com state inválido", {
      usuario_id: user.id,
    });
    return voltar("state_invalido");
  }

  try {
    const tokens = await trocarCodigoPorToken(
      codigo,
      envObrigatoria("MERCADO_PAGO_REDIRECT_URI"),
    );

    /**
     * Client admin, e não o que respeita RLS: `credenciais_pagamento` tem RLS
     * com zero policies e nenhum grant para `authenticated` — não existe caminho
     * de escrita com JWT de usuário, de propósito.
     */
    await salvarCredenciais(criarClienteAdmin(), user.id, tokens);

    return voltar("ok");
  } catch (erro) {
    console.error("falha ao concluir OAuth do Mercado Pago", {
      usuario_id: user.id,
      erro: erro instanceof Error ? erro.message : String(erro),
    });
    return voltar("falhou");
  }
}

/** Comparação em tempo constante, tolerante a tamanhos diferentes. */
function iguais(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");

  if (bufA.length !== bufB.length) return false;

  return timingSafeEqual(bufA, bufB);
}
