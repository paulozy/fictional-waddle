import "server-only";

import { criarClienteAdmin } from "@/lib/supabase/admin";
import { cobrancaSinalHabilitada, type PerfilCobranca } from "@/lib/pagamentos/capacidade";

/**
 * Varredura de holds de sinal vencidos no caminho de LEITURA do painel.
 *
 * ## Por que existe, se já havia duas varreduras
 *
 * `expirar_sinais_vencidos` roda em `montarContexto` (a cada mensagem do bot,
 * imediatamente antes de calcular disponibilidade) e no cron diário. Isso cobre
 * dois dos três danos possíveis:
 *
 *  - **horário bloqueado para outro cliente**: coberto — quem tenta agendar
 *    dispara a varredura antes de ver a lista, então é impossível ouvir "não tem
 *    vaga" por causa de um hold morto;
 *  - **lembrete enviado para agendamento que devia estar cancelado**: coberto — o
 *    cron expira antes de montar os lembretes.
 *
 * O terceiro não estava coberto: **a agenda do dono mostrando "aguardando sinal"
 * num horário que já venceu**. Quem abre o painel não dispara varredura nenhuma,
 * e o registro só se corrige quando alguém escrever para o bot ou o cron rodar —
 * o que, no plano Hobby, é 1x/dia. Medido em teste: prazo de 2 minutos vencido,
 * agendamento seguia `confirmado`/`aguardando` cinco minutos depois.
 *
 * ## Por que o client admin, e o que isso obriga
 *
 * A RPC é `security invoker` e o `execute` foi revogado de `public`, concedido só
 * a `service_role` — e é coerente: ela escreve em `cobrancas_sinal` e nas colunas
 * de sinal de `agendamentos`, que ficam de fora do `grant` de `authenticated` de
 * propósito (`sinal_status` é a afirmação de que dinheiro entrou; o dono não pode
 * escrevê-la com o próprio JWT, senão o registro perde valor como prova).
 *
 * Então esta é a **quarta** utilização da service role no projeto, ao lado do
 * webhook, do cron e de `encerrarConta`. A disciplina que a torna segura é a
 * mesma de `encerrarConta`: **o `usuarioId` vem sempre da sessão** (`exigirUsuario`
 * / `claims.sub`), nunca de `searchParams`, corpo de formulário ou props. Um id
 * vindo de entrada aqui transformaria uma tela de leitura em "expire os sinais de
 * qualquer tenant".
 *
 * ## Fail-open, sem exceção
 *
 * Erro só vira log. Esta varredura é higiene de dado, não conteúdo da página:
 * derrubar a agenda do dono porque a limpeza falhou seria trocar a função pelo
 * enfeite. Se falhar, a página mostra o estado antigo — exatamente o que mostrava
 * antes desta função existir.
 */
export async function expirarSinaisDoDono(
  usuarioId: string,
  perfil: PerfilCobranca | null | undefined,
): Promise<void> {
  /**
   * Só para quem cobra sinal.
   *
   * Sem a guarda, toda abertura de agenda de todo tenant faria uma escrita sem
   * nada para fazer — e a esmagadora maioria não usa a capacidade. Tenant que a
   * desligou com holds abertos continua sendo varrido pelo cron diário, que
   * deliberadamente ignora esta condição.
   */
  if (!cobrancaSinalHabilitada(perfil)) return;

  const admin = criarClienteAdmin();
  const { error } = await admin.rpc("expirar_sinais_vencidos", {
    p_usuario_id: usuarioId,
  });

  if (error) {
    console.error("painel: falha ao expirar sinais vencidos", {
      usuario_id: usuarioId,
      codigo: error.code,
    });
  }
}
