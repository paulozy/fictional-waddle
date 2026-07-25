-- GRANT e RLS são camadas independentes: uma policy de RLS não concede
-- privilégio de tabela, ela apenas filtra linhas DEPOIS de o privilégio existir.
-- Sem os grants abaixo, todo acesso do usuário logado morre em 42501
-- (permission denied) antes de a policy ser sequer avaliada.
--
-- Declarados explicitamente em vez de depender do ALTER DEFAULT PRIVILEGES do
-- Supabase: assim o menor privilégio fica legível no próprio schema e não muda
-- por baixo se o default do projeto mudar.

-- `anon` não recebe nada: nenhuma tabela deste produto é pública.

-- Perfil: o dono lê e edita a própria configuração. Não cria (trigger faz) nem
-- exclui (excluir perfil sem excluir a conta deixaria estado inválido).
grant select, update on public.perfis to authenticated;

grant select, insert, update, delete on public.servicos to authenticated;
grant select, insert, update, delete on public.horarios_disponiveis to authenticated;
grant select, insert, update, delete on public.clientes_finais to authenticated;
grant select, insert, update, delete on public.agendamentos to authenticated;
grant select, insert, update, delete on public.fluxo_etapas to authenticated;

-- Menor privilégio: quem escreve estado de conversa e log de envio é sempre o
-- webhook ou o cron, via service role. O dono só lê, para debug no dashboard.
grant select on public.conversas_estado to authenticated;
grant select on public.log_envio to authenticated;

-- A service role ignora RLS, mas ainda precisa do privilégio de tabela.
grant all on public.perfis to service_role;
grant all on public.servicos to service_role;
grant all on public.horarios_disponiveis to service_role;
grant all on public.clientes_finais to service_role;
grant all on public.agendamentos to service_role;
grant all on public.fluxo_etapas to service_role;
grant all on public.conversas_estado to service_role;
grant all on public.log_envio to service_role;
