-- Textos do bot personalizáveis pelo dono, começando pelos do sinal.
--
-- As mensagens de conversa já eram configuráveis: o dono monta `pergunta_texto`
-- em `fluxo_etapas`. As do sinal não são etapas — são **transacionais**,
-- disparadas por dinheiro entrando ou por prazo vencendo, não por posição no
-- roteiro. Enfiá-las em `fluxo_etapas` obrigaria a inventar tipos de etapa que a
-- engine nunca apresenta, e a engine já filtra por `ativo` e ordena por `ordem`:
-- uma etapa que não participa da conversa quebraria as duas suposições.
--
-- Tabela e não colunas em `perfis` por duas razões práticas: texto novo deixa de
-- pedir migration (é uma chave nova no CHECK, não uma coluna), e `perfis` já é o
-- registro mais lido do produto — cada coluna de texto ali entra em todo `select`
-- do webhook, do cron e do painel, para ser usada por um caminho só.

create table mensagens_tenant (
  -- Cascade por LGPD, como toda FK de dado do tenant: excluir a conta leva os
  -- textos. Diferente de `trials_numero_whatsapp`, aqui não há nada a proteger
  -- contra o próprio dono.
  usuario_id uuid not null references auth.users on delete cascade,

  /**
   * Qual texto do bot esta linha substitui.
   *
   * Vocabulário FECHADO, e o CHECK é a documentação executável de quais textos são
   * personalizáveis. Duas ausências são decisão, não esquecimento:
   *
   *  - **o copia-e-cola do Pix não entra.** Ele vai sozinho numa mensagem porque
   *    no WhatsApp o cliente segura para copiar e qualquer texto em volta entra na
   *    cópia — o banco recusa o código e ele não tem como saber por quê. Tornar
   *    aquilo editável seria dar ao dono um jeito de quebrar todo pagamento sem
   *    entender a causa;
   *  - **o "pagou e não há horário" não entra.** Aquele texto tem de continuar
   *    dizendo que quem devolve é o estabelecimento: o dinheiro cai na conta dele
   *    e nunca passa pela nossa. Um dono que apagasse essa frase deixaria o
   *    cliente sem saber com quem resolver um Pix já pago.
   */
  chave text not null check (
    chave in ('sinal_cobranca', 'sinal_recebido', 'sinal_expirado')
  ),

  /**
   * O texto, com placeholders no formato `{valor}`.
   *
   * `btrim` no CHECK porque só espaço em branco não é personalização — é o campo
   * esvaziado, e nesse caso a linha não deve existir (a aplicação apaga em vez de
   * gravar branco, senão o bot mandaria mensagem vazia).
   *
   * Teto de 900 caracteres: a mensagem do bot conta contra o limite do WhatsApp e
   * texto muito longo vira "Ler mais" no celular do cliente, escondendo justamente
   * o que vem depois — no caso da cobrança, o valor e o prazo.
   */
  texto text not null check (length(btrim(texto)) between 1 and 900),

  atualizado_em timestamptz not null default now(),

  -- PK natural: um texto por chave por tenant. Sem `id` surrogate, porque nada
  -- referencia esta linha e o upsert do painel é exatamente por este par.
  primary key (usuario_id, chave)
);

comment on table mensagens_tenant is
  'Textos do bot personalizados pelo dono. Ausência de linha = usa o texto padrão do código. Ver lib/bot/modelo-mensagem.ts.';

-- ---------------------------------------------------------------------------
-- RLS e privilégios
-- ---------------------------------------------------------------------------
-- Diferente das colunas de sinal em `agendamentos`, aqui o dono tem CRUD
-- completo: é conteúdo dele, não afirmação do sistema sobre dinheiro. Nada aqui
-- decide se uma cobrança existe ou foi paga — só como a frase é escrita.
alter table mensagens_tenant enable row level security;

create policy "dono le suas mensagens"
  on mensagens_tenant for select to authenticated
  using ((select auth.uid()) = usuario_id);

create policy "dono cria suas mensagens"
  on mensagens_tenant for insert to authenticated
  with check ((select auth.uid()) = usuario_id);

create policy "dono edita suas mensagens"
  on mensagens_tenant for update to authenticated
  using ((select auth.uid()) = usuario_id)
  -- Sem o `with check`, um update poderia mover a linha para outro tenant.
  with check ((select auth.uid()) = usuario_id);

create policy "dono apaga suas mensagens"
  on mensagens_tenant for delete to authenticated
  using ((select auth.uid()) = usuario_id);

-- `revoke` antes do grant, como em `credenciais_pagamento` e `cobrancas_sinal`:
-- o `alter default privileges` do Supabase concede `Dxtm` em toda tabela nova, e
-- **TRUNCATE não passa por RLS** — sem isto, qualquer dono logado apagaria os
-- textos de todos os tenants.
revoke all on public.mensagens_tenant from anon, authenticated;

grant select, insert, update, delete on public.mensagens_tenant to authenticated;
grant all on public.mensagens_tenant to service_role;

-- Índice na coluna da policy. A PK já começa por `usuario_id`, então ela serve
-- como índice de prefixo e não há índice novo a criar — registrado aqui para a
-- próxima pessoa não adicionar um redundante.
