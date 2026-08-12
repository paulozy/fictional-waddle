import "server-only";

import { envObrigatoria } from "@/lib/config";
import { cifrar, decifrar } from "@/lib/cripto";
import { renovarToken, type TokensDoDono } from "@/lib/pagamentos/mercado-pago";
import type { criarClienteAdmin } from "@/lib/supabase/admin";

type ClienteAdmin = ReturnType<typeof criarClienteAdmin>;

/**
 * Guarda e recupera o token do PSP do dono.
 *
 * Sempre com a service role: `credenciais_pagamento` tem RLS com ZERO policies e
 * nenhum grant para `authenticated`, então não existe caminho de leitura com JWT
 * de usuário — nem para debug. O dado que o painel precisa ("estou conectado?")
 * mora denormalizado em `perfis.pagamento_conectado_em`.
 */

/**
 * Margem para renovar antes de vencer.
 *
 * O token dura 180 dias, então 7 dias de folga é generoso — e é de propósito.
 * Renovar só no vencimento significa renovar durante uma conversa real, com um
 * cliente esperando o Pix: se a renovação falhar naquele instante (MP fora do ar,
 * rede), a cobrança não sai. Com a margem, a primeira tentativa acontece uma
 * semana antes e há muitas chances de sucesso antes de virar problema.
 */
const MARGEM_RENOVACAO_MS = 7 * 24 * 3_600_000;

function chaveDeCifra(): string {
  return envObrigatoria("PAGAMENTO_CRYPTO_KEY");
}

/**
 * Grava o par de tokens e carimba o perfil como conectado.
 *
 * As duas escritas juntas porque `perfis.pagamento_conectado_em` é a
 * denormalização de "existe linha aqui": deixá-las separadas permitiria um
 * estado em que o painel diz "conectado" e não há token, ou o contrário — e o
 * segundo caso é o bot prometendo um Pix que não tem como emitir.
 */
export async function salvarCredenciais(
  admin: ClienteAdmin,
  usuarioId: string,
  tokens: TokensDoDono,
): Promise<void> {
  const chave = chaveDeCifra();

  const { error } = await admin.from("credenciais_pagamento").upsert(
    {
      usuario_id: usuarioId,
      provedor: "mercado_pago",
      access_token_cifrado: cifrar(tokens.accessToken, chave),
      refresh_token_cifrado: cifrar(tokens.refreshToken, chave),
      expira_em: tokens.expiraEm.toISOString(),
      conta_externa_id: tokens.contaExternaId,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "usuario_id" },
  );

  if (error) throw error;

  const { error: erroPerfil } = await admin
    .from("perfis")
    .update({ pagamento_conectado_em: new Date().toISOString() })
    .eq("id", usuarioId);

  if (erroPerfil) throw erroPerfil;
}

/** Desconecta: apaga o token e limpa o carimbo, nessa ordem. */
export async function removerCredenciais(
  admin: ClienteAdmin,
  usuarioId: string,
): Promise<void> {
  // O delete vem primeiro porque a ordem inversa deixaria, numa falha no meio,
  // um token vivo com o painel dizendo "desconectado" — credencial que ninguém
  // sabe que existe é credencial que ninguém revoga.
  const { error } = await admin
    .from("credenciais_pagamento")
    .delete()
    .eq("usuario_id", usuarioId);

  if (error) throw error;

  await admin
    .from("perfis")
    .update({ pagamento_conectado_em: null })
    .eq("id", usuarioId);
}

export type CredencialDoDono = {
  accessToken: string;
  contaExternaId: string;
};

/**
 * Devolve o access token válido do dono, renovando se estiver perto de vencer.
 *
 * `null` quando não há conexão — caminho normal para tenant que nunca conectou,
 * e para quem desautorizou a aplicação no painel do MP.
 *
 * **A regravação do par rotacionado acontece aqui, na mesma operação da
 * renovação.** O `refresh_token` do MP rotaciona a cada uso (medido no spike): o
 * antigo deixa de valer no instante em que o novo é emitido. Se a renovação
 * desse certo e a gravação falhasse, ficaríamos com um refresh morto no banco e
 * a conexão daquele tenant morreria em silêncio — sintoma "o bot parou de mandar
 * o Pix", dias depois, sem erro em lugar nenhum. Por isso o erro de gravação
 * **propaga**, em vez de devolver o token novo e seguir: melhor a cobrança falhar
 * agora, alto, do que a conexão morrer calada.
 */
export async function obterCredencial(
  admin: ClienteAdmin,
  usuarioId: string,
): Promise<CredencialDoDono | null> {
  const { data, error } = await admin
    .from("credenciais_pagamento")
    .select("access_token_cifrado, refresh_token_cifrado, expira_em, conta_externa_id")
    .eq("usuario_id", usuarioId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const chave = chaveDeCifra();
  const venceEm = new Date(data.expira_em).getTime();

  if (venceEm - Date.now() > MARGEM_RENOVACAO_MS) {
    return {
      accessToken: decifrar(data.access_token_cifrado, chave),
      contaExternaId: data.conta_externa_id,
    };
  }

  const renovados = await renovarToken(decifrar(data.refresh_token_cifrado, chave));

  /**
   * Compare-and-set sobre `expira_em`, no idioma de `conversas_estado.versao`.
   *
   * Duas requisições dentro da janela de renovação leem o MESMO
   * `refresh_token` e disparam duas renovações. Como o refresh rotaciona, a
   * segunda normalmente leva 400 do MP e propaga — mas se as duas passarem, um
   * `update` incondicional deixaria a última escrita vencer, e ela pode ser a do
   * par mais VELHO. O resultado é um refresh morto no banco: a conexão daquele
   * tenant para de funcionar sem erro em lugar nenhum, exatamente o sintoma que
   * este módulo existe para evitar.
   *
   * Com a condição, quem chega depois não sobrescreve: relê e usa o par que já
   * está gravado.
   */
  const { data: gravado, error: erroGravacao } = await admin
    .from("credenciais_pagamento")
    .update({
      access_token_cifrado: cifrar(renovados.accessToken, chave),
      refresh_token_cifrado: cifrar(renovados.refreshToken, chave),
      expira_em: renovados.expiraEm.toISOString(),
      conta_externa_id: renovados.contaExternaId,
      atualizado_em: new Date().toISOString(),
    })
    .eq("usuario_id", usuarioId)
    .eq("expira_em", data.expira_em)
    .select("usuario_id");

  if (erroGravacao) throw erroGravacao;

  if (gravado?.length) {
    return {
      accessToken: renovados.accessToken,
      contaExternaId: renovados.contaExternaId,
    };
  }

  // Zero linhas: outra requisição renovou primeiro. O par que ela gravou é o
  // que o MP considera válido — o nosso pode já ter sido rotacionado por cima.
  const { data: atual, error: erroReleitura } = await admin
    .from("credenciais_pagamento")
    .select("access_token_cifrado, conta_externa_id")
    .eq("usuario_id", usuarioId)
    .maybeSingle();

  if (erroReleitura) throw erroReleitura;
  if (!atual) return null;

  return {
    accessToken: decifrar(atual.access_token_cifrado, chave),
    contaExternaId: atual.conta_externa_id,
  };
}
