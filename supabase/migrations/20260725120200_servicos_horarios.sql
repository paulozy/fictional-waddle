create table servicos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  duracao_minutos int not null check (duracao_minutos > 0),
  preco numeric(10, 2) check (preco >= 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

comment on column servicos.ativo is
  'Desativar em vez de excluir: agendamentos históricos referenciam o serviço.';

-- Grade semanal fixa do estabelecimento, em hora de parede.
-- Múltiplas linhas no mesmo dia_semana modelam intervalo de almoço:
-- (1, 09:00, 12:00) e (1, 13:00, 18:00).
create table horarios_disponiveis (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users on delete cascade,
  dia_semana int not null check (dia_semana between 0 and 6), -- 0 = domingo
  hora_inicio time not null,
  hora_fim time not null,
  created_at timestamptz not null default now(),
  constraint horario_fim_depois_do_inicio check (hora_fim > hora_inicio)
);
