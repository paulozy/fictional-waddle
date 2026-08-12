-- ---------------------------------------------------------------------------
-- A política de cancelamento do sinal, declarada pelo dono.
-- ---------------------------------------------------------------------------
-- O bot pedia R$ 20 e **não dizia nada** sobre o que acontece com aquele dinheiro
-- se o cliente desmarcar ou não aparecer. `MODELO_PADRAO_COBRANCA` falava do
-- prazo para pagar, e só. Os Termos jogam a política de cancelamento para o
-- estabelecimento, o que resolve entre nós e o dono — e não resolve nada com o
-- **cliente final**, que é quem paga, é consumidor, e nunca leu os nossos Termos.
--
-- Esta coluna é a correção, e ela é de produto e não de texto: sem uma política
-- declarada, a cobrança **não liga**. O gate vive em `lib/pagamentos/capacidade.ts`
-- junto das outras duas condições.
--
-- **Por que uma coluna em `perfis` e não uma chave em `mensagens_tenant`.** Aquela
-- tabela guarda personalização opcional: campo vazio cai num padrão nosso, e é
-- exatamente esse comportamento que aqui seria errado. Um padrão de fábrica
-- ("devolvemos em até X dias") seria **nós** decidindo a política comercial de
-- terceiro e afirmando isso ao cliente dele em nome dele. O dono tem de escrever a
-- dele, e a ausência tem de bloquear, não cair em default.
--
-- Além disso o gate já lê `perfis` em todos os caminhos (painel com RLS, bot com
-- admin), então a condição sai de graça no `select` que já existia — enquanto
-- `mensagens_tenant` exigiria um join no caminho quente de toda mensagem.
alter table perfis add column politica_sinal text;

comment on column perfis.politica_sinal is
  'Política de cancelamento/devolução do sinal, escrita pelo dono. Vai colada na mensagem que antecede o código Pix. Nulo = cobrança de sinal desligada, mesmo com plano e conta conectada — ver lib/pagamentos/capacidade.ts.';

-- O piso de 20 caracteres não é burocracia: o campo existe para **informar**, e
-- "ok" ou um ponto satisfariam um `not null` sem informar nada — com o efeito
-- colateral de nos deixar afirmar que houve divulgação. O teto de 400 existe
-- porque isto entra em toda cobrança, e mensagem longa no WhatsApp é truncada com
-- "Ler mais" justamente na parte que precisa ser lida antes de pagar.
--
-- `btrim` no CHECK, e não só no app: espaço em branco é a forma mais fácil de
-- satisfazer um mínimo de comprimento sem escrever nada.
alter table perfis
  add constraint perfis_politica_sinal_tamanho
  check (
    politica_sinal is null
    or char_length(btrim(politica_sinal)) between 20 and 400
  );

-- Diferente de `plano` e de `pagamento_conectado_em`, esta coluna **entra** no
-- grant por coluna de `authenticated`, e a distinção é a que já governa o resto da
-- tabela: aqueles dois são afirmações sobre dinheiro e direito (quem os
-- escrevesse se autoconcederia capacidade), este é **conteúdo autoral do dono** —
-- mesma categoria de `nome_estabelecimento`.
--
-- Vale notar que preencher aqui *habilita* a cobrança, o que à primeira vista
-- parece autoconcessão. Não é: a capacidade continua exigindo `plano = 'sinal'` e
-- conta conectada, que ele não pode escrever. O que esta coluna libera é o dever
-- de informar, e não faria sentido algum protegê-la de quem tem o dever.
grant update (politica_sinal) on public.perfis to authenticated;
