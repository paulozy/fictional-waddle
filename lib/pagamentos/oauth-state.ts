/**
 * Nome do cookie que carrega o `state` do OAuth entre a ida e a volta.
 *
 * Mora aqui, e não em `pagamentos/actions.ts`, por uma regra do Next: **arquivo
 * `"use server"` só pode exportar função async**. Uma constante exportada de lá
 * não vira erro de tipo — vira um módulo sem exports nenhum em tempo de build, e
 * o sintoma é `Export ... doesn't exist in target module` apontando para quem
 * importa. Mesma razão pela qual `mensagens-cancelamento.ts` existe separado do
 * arquivo de actions.
 */
export const COOKIE_STATE = "mp_oauth_state";
