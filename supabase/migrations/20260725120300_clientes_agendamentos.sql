create table clientes_finais (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users on delete cascade,
  -- Vem de `data.pushName` do webhook (nome do perfil WhatsApp): a V0 não tem
  -- etapa que pergunte o nome, e sem isso o lembrete não teria como saudar.
  nome text,

  -- A identidade do cliente é o JID cru, pelo mesmo motivo de
  -- conversas_estado.remote_jid: um JID `@lid` não carrega telefone algum, e é
  -- para este JID que o cron manda o lembrete.
  remote_jid text not null,
  -- Best-effort, só quando o JID carrega telefone. Serve para exibição.
  telefone text,

  created_at timestamptz not null default now(),
  -- Sem isto, cada conversa nova criaria um cliente duplicado.
  unique (usuario_id, remote_jid)
);

comment on table clientes_finais is
  'Dado do cliente final pertence exclusivamente ao dono da conta (LGPD). Cascade ao excluir a conta.';

create table agendamentos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users on delete cascade,
  cliente_id uuid not null references clientes_finais on delete cascade,
  -- Cascade (e não restrict) para que a exclusão de conta não trave em FK. A UI
  -- nunca exclui serviço: usa `ativo = false`.
  servico_id uuid not null references servicos on delete cascade,

  data_hora timestamptz not null,
  -- Snapshot da duração no momento do agendamento: se o dono editar o serviço
  -- depois, o histórico e o cálculo de disponibilidade continuam corretos.
  duracao_minutos int not null check (duracao_minutos > 0),
  -- Coluna real, não GENERATED: `timestamptz + interval` é STABLE (não
  -- IMMUTABLE, porque depende do fuso da sessão), e o Postgres rejeita
  -- expressões não-imutáveis em generated columns e em expressões de índice —
  -- o que a constraint EXCLUDE abaixo exige. Preenchida pelo trigger.
  data_hora_fim timestamptz not null,

  status text not null default 'confirmado'
    check (status in ('confirmado', 'cancelado', 'concluido', 'falta')),
  -- Respostas das etapas customizadas do fluxo, chaveadas por campo_destino.
  respostas_extras jsonb not null default '{}',
  created_at timestamptz not null default now(),
  constraint agendamento_fim_depois_do_inicio check (data_hora_fim > data_hora)
);

-- Deriva data_hora_fim de data_hora + duracao_minutos.
-- BEFORE trigger roda antes da checagem de NOT NULL, então o app pode omitir a
-- coluna. Centralizar aqui remove uma classe inteira de bug de aplicação: um
-- data_hora_fim errado furaria silenciosamente a proteção anti-sobreposição.
create or replace function public.preencher_fim_do_agendamento()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.data_hora_fim :=
    new.data_hora + make_interval(mins => new.duracao_minutos);
  return new;
end;
$$;

create trigger agendamentos_preencher_fim
  before insert or update of data_hora, duracao_minutos on agendamentos
  for each row execute function public.preencher_fim_do_agendamento();

-- Double-booking é corrida, não validação: "consultar e depois inserir" sempre
-- perde quando dois clientes escolhem o mesmo slot no mesmo segundo. Só o banco
-- resolve. O parcial em `confirmado` deixa cancelados/faltas fora do bloqueio.
-- A opclass é qualificada porque btree_gist vive no schema `extensions`.
alter table agendamentos
  add constraint agendamentos_sem_sobreposicao
  exclude using gist (
    usuario_id extensions.gist_uuid_ops with =,
    tstzrange(data_hora, data_hora_fim) with &&
  ) where (status = 'confirmado');

comment on constraint agendamentos_sem_sobreposicao on agendamentos is
  'Violação levanta SQLSTATE 23P01. A engine trata como "horário acabou de ser reservado" e reapresenta a etapa de horário — é caminho de UX, não erro genérico.';
