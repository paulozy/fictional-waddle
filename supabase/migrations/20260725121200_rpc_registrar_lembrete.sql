-- Reserva o lembrete de um agendamento, de forma idempotente.
--
-- Precisa ser função e não um upsert do query builder: o índice
-- `log_envio_lembrete_unico` é PARCIAL (`where tipo = 'lembrete'`), e o Postgres
-- só infere índice parcial em ON CONFLICT se o predicado for repetido na
-- cláusula — algo que o PostgREST não tem como expressar. Um
-- `.upsert({ onConflict: "agendamento_id,tipo" })` falha com 42P10.
--
-- Contrato para o cron: chamar ANTES de enviar.
--   retorna uuid  → a reserva é sua, envie e depois atualize status_entrega
--   retorna null  → outra execução já reservou; não envie (evita lembrete duplo
--                   em redeploy ou retry da Vercel)
create or replace function public.registrar_lembrete_pendente(
  p_agendamento_id uuid,
  p_usuario_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.log_envio
    (agendamento_id, usuario_id, tipo, status_entrega)
  values
    (p_agendamento_id, p_usuario_id, 'lembrete', 'pendente')
  on conflict (agendamento_id, tipo) where tipo = 'lembrete'
    do nothing
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.registrar_lembrete_pendente(uuid, uuid) from anon;
