-- Toda coluna usada em policy de RLS precisa de índice: sem ele o Postgres faz
-- seq scan e reavalia a policy linha a linha. A doc do Supabase mede mais de
-- 100x de diferença em tabelas grandes.
--
-- Ausentes de propósito por já existirem:
--   perfis.id                      → primary key
--   clientes_finais(usuario_id, …) → unique (usuario_id, remote_jid)
--   conversas_estado(usuario_id,…) → unique (usuario_id, remote_jid)

create index servicos_usuario_id_idx on servicos (usuario_id);

-- Cobre a leitura mais comum: as etapas de um usuário na ordem do fluxo.
create index fluxo_etapas_usuario_ordem_idx on fluxo_etapas (usuario_id, ordem);

-- Cobre a grade semanal por dia, usada no cálculo de disponibilidade.
create index horarios_disponiveis_usuario_dia_idx
  on horarios_disponiveis (usuario_id, dia_semana);

-- Cobre tanto a RLS quanto as duas leituras quentes: agendamentos de um dia
-- (calendário) e do dia seguinte (cron de lembretes).
create index agendamentos_usuario_data_idx on agendamentos (usuario_id, data_hora);
create index agendamentos_cliente_id_idx on agendamentos (cliente_id);
create index agendamentos_servico_id_idx on agendamentos (servico_id);

create index log_envio_usuario_id_idx on log_envio (usuario_id);
create index log_envio_agendamento_id_idx on log_envio (agendamento_id);
