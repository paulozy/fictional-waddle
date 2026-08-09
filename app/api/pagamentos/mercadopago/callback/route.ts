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

/** Volta para o painel com um código de resultado legível pela página. */
function voltar(base: string, resultado: string) {
  return Response.redirect(`${base}/pagamentos?conexao=${resultado}`, 303);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = url.origin;

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

  if (!user) return Response.redirect(`${base}/login`, 303);

  const erroDoProvedor = url.searchParams.get("error");
  if (erroDoProvedor) {
    // O dono clicou em "cancelar" na tela do MP. Caminho normal, não falha.
    console.info("autorização recusada no Mercado Pago", {
      usuario_id: user.id,
      erro: erroDoProvedor,
    });
    return voltar(base, "recusada");
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
    return voltar(base, "state_invalido");
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

    return voltar(base, "ok");
  } catch (erro) {
    console.error("falha ao concluir OAuth do Mercado Pago", {
      usuario_id: user.id,
      erro: erro instanceof Error ? erro.message : String(erro),
    });
    return voltar(base, "falhou");
  }
}

/** Comparação em tempo constante, tolerante a tamanhos diferentes. */
function iguais(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");

  if (bufA.length !== bufB.length) return false;

  return timingSafeEqual(bufA, bufB);
}
