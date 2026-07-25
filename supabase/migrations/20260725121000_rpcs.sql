-- Duas operações que precisam de atomicidade real. O query builder do
-- supabase-js não tem transação client-side (o PostgREST auto-commita cada
-- statement), mas `rpc()` roda dentro de uma transação — por isso são funções.
--
-- Ambas são `security invoker`, não definer: a service role (webhook/cron)
-- ignora RLS de qualquer forma, e para um usuário autenticado a RLS continua
-- valendo. Uma versão `definer` que recebe `p_usuario_id` como parâmetro seria
-- escalada de privilégio — qualquer autenticado escreveria no tenant alheio.

-- Regrava a ordem de todas as etapas de uma vez, na sequência dos ids
-- recebidos. Índices densos regravados em bloco em vez de ranks fracionários
-- (LexoRank): são ~10 linhas por usuário, então uma ida ao banco resolve e o
-- resultado é sempre canônico, sem código de rebalanceamento.
create or replace function public.reordenar_fluxo_etapas(p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
  v_total int;
  v_afetadas int;
begin
  if v_usuario is null then
    raise exception 'nao autenticado' using errcode = '42501';
  end if;

  select count(*) into v_total
    from public.fluxo_etapas
   where usuario_id = v_usuario;

  -- Reordenação parcial deixaria o fluxo com ordens ambíguas.
  if v_total <> coalesce(array_length(p_ids, 1), 0) then
    raise exception
      'reordenacao precisa conter todas as % etapas do fluxo', v_total
      using errcode = '22023';
  end if;

  with novo as (
    select id, pos::int as pos
      from unnest(p_ids) with ordinality as t(id, pos)
  )
  update public.fluxo_etapas e
     set ordem = novo.pos
    from novo
   where e.id = novo.id
     and e.usuario_id = v_usuario;

  get diagnostics v_afetadas = row_count;

  -- Pega id de outro tenant ou id inexistente na lista.
  if v_afetadas <> v_total then
    raise exception 'a lista contem etapa que nao pertence ao fluxo'
      using errcode = '22023';
  end if;
end;
$$;

-- Fecha o agendamento ao fim da conversa: garante o cliente e cria o
-- agendamento numa única transação. Sem isso, uma falha no segundo insert
-- deixaria um cliente órfão.
--
-- `data_hora_fim` é omitida de propósito: o trigger
-- `agendamentos_preencher_fim` a deriva de data_hora + duracao_minutos.
--
-- A violação da constraint anti-sobreposição (SQLSTATE 23P01) propaga de
-- propósito: quem trata é a engine, reapresentando a etapa de horário.
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

revoke all on function public.reordenar_fluxo_etapas(uuid[]) from anon;
revoke all on function public.confirmar_agendamento(
  uuid, text, text, text, uuid, timestamptz, int, jsonb
) from anon;
