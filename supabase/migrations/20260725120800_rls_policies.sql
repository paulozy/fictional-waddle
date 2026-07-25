-- RLS é a camada de segurança real deste produto. Três detalhes valem repetir:
--
-- 1. `(select auth.uid())` e não `auth.uid()`: o subselect faz o planner avaliar
--    a função uma vez e cachear o resultado, em vez de chamá-la por linha. A doc
--    de performance de RLS do Supabase mede 179ms → 9ms nesse ajuste.
-- 2. `to authenticated` em toda policy: descarta a role `anon` sem custo de
--    avaliação.
-- 3. Índice em toda coluna usada em policy — ver a migration de índices.
--
-- A service role (webhook e cron) IGNORA tudo isto. Nesses dois lugares o
-- `.eq("usuario_id", ...)` explícito é a única barreira entre tenants.

alter table perfis enable row level security;

create policy "dono le o proprio perfil"
  on perfis for select to authenticated
  using ((select auth.uid()) = id);

create policy "dono atualiza o proprio perfil"
  on perfis for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Sem policy de insert/delete: quem cria o perfil é o trigger em auth.users, e
-- excluir perfil sem excluir a conta deixaria o usuário em estado inválido.

alter table servicos enable row level security;

create policy "dono le seus servicos"
  on servicos for select to authenticated
  using ((select auth.uid()) = usuario_id);

create policy "dono cria servico para si"
  on servicos for insert to authenticated
  with check ((select auth.uid()) = usuario_id);

create policy "dono atualiza seus servicos"
  on servicos for update to authenticated
  using ((select auth.uid()) = usuario_id)
  with check ((select auth.uid()) = usuario_id);

create policy "dono exclui seus servicos"
  on servicos for delete to authenticated
  using ((select auth.uid()) = usuario_id);

alter table horarios_disponiveis enable row level security;

create policy "dono le seus horarios"
  on horarios_disponiveis for select to authenticated
  using ((select auth.uid()) = usuario_id);

create policy "dono cria horario para si"
  on horarios_disponiveis for insert to authenticated
  with check ((select auth.uid()) = usuario_id);

create policy "dono atualiza seus horarios"
  on horarios_disponiveis for update to authenticated
  using ((select auth.uid()) = usuario_id)
  with check ((select auth.uid()) = usuario_id);

create policy "dono exclui seus horarios"
  on horarios_disponiveis for delete to authenticated
  using ((select auth.uid()) = usuario_id);

alter table clientes_finais enable row level security;

create policy "dono le seus clientes"
  on clientes_finais for select to authenticated
  using ((select auth.uid()) = usuario_id);

create policy "dono cria cliente para si"
  on clientes_finais for insert to authenticated
  with check ((select auth.uid()) = usuario_id);

create policy "dono atualiza seus clientes"
  on clientes_finais for update to authenticated
  using ((select auth.uid()) = usuario_id)
  with check ((select auth.uid()) = usuario_id);

create policy "dono exclui seus clientes"
  on clientes_finais for delete to authenticated
  using ((select auth.uid()) = usuario_id);

alter table agendamentos enable row level security;

create policy "dono le seus agendamentos"
  on agendamentos for select to authenticated
  using ((select auth.uid()) = usuario_id);

create policy "dono cria agendamento para si"
  on agendamentos for insert to authenticated
  with check ((select auth.uid()) = usuario_id);

create policy "dono atualiza seus agendamentos"
  on agendamentos for update to authenticated
  using ((select auth.uid()) = usuario_id)
  with check ((select auth.uid()) = usuario_id);

create policy "dono exclui seus agendamentos"
  on agendamentos for delete to authenticated
  using ((select auth.uid()) = usuario_id);

alter table fluxo_etapas enable row level security;

create policy "dono le suas etapas"
  on fluxo_etapas for select to authenticated
  using ((select auth.uid()) = usuario_id);

create policy "dono cria etapa para si"
  on fluxo_etapas for insert to authenticated
  with check ((select auth.uid()) = usuario_id);

create policy "dono atualiza suas etapas"
  on fluxo_etapas for update to authenticated
  using ((select auth.uid()) = usuario_id)
  with check ((select auth.uid()) = usuario_id);

create policy "dono exclui suas etapas"
  on fluxo_etapas for delete to authenticated
  using ((select auth.uid()) = usuario_id);

-- conversas_estado e log_envio: menor privilégio. Quem escreve é sempre o
-- webhook ou o cron, via service role. O dono só lê, para debug no dashboard.

alter table conversas_estado enable row level security;

create policy "dono le suas conversas"
  on conversas_estado for select to authenticated
  using ((select auth.uid()) = usuario_id);

alter table log_envio enable row level security;

create policy "dono le seu log de envio"
  on log_envio for select to authenticated
  using ((select auth.uid()) = usuario_id);
