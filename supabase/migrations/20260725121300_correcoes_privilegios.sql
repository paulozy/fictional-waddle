-- Correções de privilégio e de integridade encontradas em revisão.

-- ---------------------------------------------------------------------------
-- 1. O trigger que deriva data_hora_fim precisa valer para QUALQUER update.
--
-- Um trigger com lista de colunas (`update of data_hora, duracao_minutos`) só
-- dispara quando uma delas aparece no SET. Como `authenticated` tinha update na
-- tabela inteira, um PATCH gravando só `data_hora_fim` não disparava o trigger,
-- passava o check `fim > inicio` e ENCOLHIA o tstzrange que a constraint EXCLUDE
-- indexa — contornando a proteção anti-double-booking.
-- ---------------------------------------------------------------------------
drop trigger if exists agendamentos_preencher_fim on agendamentos;

create trigger agendamentos_preencher_fim
  before insert or update on agendamentos
  for each row execute function public.preencher_fim_do_agendamento();

-- E a coluna deixa de ser escrevível: ela é derivada, não informada.
revoke update on public.agendamentos from authenticated;
grant update (data_hora, duracao_minutos, status, respostas_extras, cliente_id, servico_id)
  on public.agendamentos to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Grants por coluna em `perfis`.
--
-- RLS não tem granularidade de coluna: a policy autoriza o dono a reescrever
-- QUALQUER coluna da própria linha, com a anon key e o JWT dele, sem passar pelo
-- app. Isso permitia: virar `plano`/`status_assinatura` (bypass de cobrança),
-- mentir `status_conexao_whatsapp`, e — o pior — trocar
-- `evolution_instance_name` para o UUID recém-liberado de outro tenant e passar
-- a receber as conversas dos clientes dele.
-- ---------------------------------------------------------------------------
revoke update on public.perfis from authenticated;
grant update (
  nome_estabelecimento,
  fuso_horario,
  passo_slot_minutos,
  antecedencia_minima_minutos,
  antecedencia_maxima_dias
) on public.perfis to authenticated;

-- ---------------------------------------------------------------------------
-- 3. `revoke ... from anon` não removia nada.
--
-- Funções recebem EXECUTE para PUBLIC por default, e revogar de um role
-- específico não mexe no grant de PUBLIC — o comentário anterior afirmava uma
-- proteção que não existia. Revogar de PUBLIC e conceder só a quem chama.
-- ---------------------------------------------------------------------------
revoke execute on function public.reordenar_fluxo_etapas(uuid[]) from public;
grant execute on function public.reordenar_fluxo_etapas(uuid[]) to authenticated;

revoke execute on function public.confirmar_agendamento(
  uuid, text, text, text, uuid, timestamptz, int, jsonb
) from public;
grant execute on function public.confirmar_agendamento(
  uuid, text, text, text, uuid, timestamptz, int, jsonb
) to service_role;

revoke execute on function public.registrar_lembrete_pendente(uuid, uuid) from public;
grant execute on function public.registrar_lembrete_pendente(uuid, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. `confirmar_agendamento` passa a exigir que o serviço seja do tenant.
--
-- A FK só garantia que o serviço existe, não de quem é. Com um UUID de serviço
-- alheio, o agendamento era criado no tenant correto mas apontando para fora —
-- e o cron, que roda como service role e ignora RLS, montava o lembrete com
-- `servicos(nome)`, vazando o nome do serviço do outro estabelecimento no texto
-- enviado ao cliente.
-- ---------------------------------------------------------------------------
create or replace function public.confirmar_agendamento(
  p_usuario_id uuid,
  p_remote_jid text,
  p_telefone text,
  p_nome_cliente text,
  p_servico_id uuid,
  p_data_hora timestamptz,
  p_duracao_minutos int,
  p_respostas_extras jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cliente_id uuid;
  v_agendamento_id uuid;
begin
  if not exists (
    select 1 from public.servicos
     where id = p_servico_id and usuario_id = p_usuario_id
  ) then
    raise exception 'servico nao pertence ao estabelecimento'
      using errcode = '42501';
  end if;

  insert into public.clientes_finais as c
    (usuario_id, remote_jid, telefone, nome)
  values
    (p_usuario_id, p_remote_jid, p_telefone, p_nome_cliente)
  on conflict (usuario_id, remote_jid) do update
     -- Nunca apagar um nome já conhecido com um pushName ausente.
     set nome = coalesce(excluded.nome, c.nome),
         telefone = coalesce(excluded.telefone, c.telefone)
  returning c.id into v_cliente_id;

  insert into public.agendamentos
    (usuario_id, cliente_id, servico_id, data_hora, duracao_minutos,
     respostas_extras)
  values
    (p_usuario_id, v_cliente_id, p_servico_id, p_data_hora, p_duracao_minutos,
     coalesce(p_respostas_extras, '{}'::jsonb))
  returning id into v_agendamento_id;

  return v_agendamento_id;
end;
$$;

revoke execute on function public.confirmar_agendamento(
  uuid, text, text, text, uuid, timestamptz, int, jsonb
) from public;
grant execute on function public.confirmar_agendamento(
  uuid, text, text, text, uuid, timestamptz, int, jsonb
) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Grade semanal sem faixas sobrepostas.
--
-- A validação na Server Action é check-then-insert e perde sob dois submits
-- simultâneos. Duas janelas sobrepostas fazem o gerador de slots produzir o
-- mesmo horário duas vezes, consumindo posições do menu numerado.
--
-- `time` não tem range type nativo, então criamos um. Faixas que apenas se
-- encostam (09:00-12:00 e 12:00-18:00) continuam válidas: é assim que se modela
-- o intervalo de almoço.
-- ---------------------------------------------------------------------------
create type public.faixa_horaria as range (subtype = time);

alter table horarios_disponiveis
  add constraint horarios_sem_sobreposicao
  exclude using gist (
    usuario_id extensions.gist_uuid_ops with =,
    dia_semana extensions.gist_int4_ops with =,
    public.faixa_horaria(hora_inicio, hora_fim) with &&
  );

-- ---------------------------------------------------------------------------
-- 6. Índice para a recuperação de lembretes travados em `pendente`.
--
-- Sem um caminho de recuperação, uma execução do cron interrompida no meio
-- deixaria reservas `pendente` para sempre e os clientes nunca receberiam o
-- lembrete, com o log dizendo "já cuidado".
-- ---------------------------------------------------------------------------
create index log_envio_pendentes_idx
  on log_envio (usuario_id, data_envio)
  where status_entrega = 'pendente';
