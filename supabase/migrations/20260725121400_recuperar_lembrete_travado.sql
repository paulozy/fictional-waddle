-- Recuperação de lembrete travado em `pendente`.
--
-- A reserva-antes-de-enviar resolve o envio duplicado, mas criava um estado
-- absorvente: se a execução do cron morresse entre a reserva e o envio (limite
-- de duração da função, deploy no meio, timeout da Evolution), a linha ficava
-- `pendente` para sempre. Na execução seguinte o `on conflict do nothing`
-- devolvia null e o cron contava como "já cuidado" — o cliente nunca receberia
-- o lembrete e o log mentiria sobre isso.
--
-- Agora a função também reivindica reservas paradas há mais de 15 minutos. O
-- update condicional é atômico, então duas execuções concorrentes não podem
-- reivindicar a mesma linha.
--
-- Assinatura mantida de propósito: um parâmetro novo com default criaria uma
-- segunda função em vez de substituir esta, e a chamada ficaria ambígua.
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

  if v_id is not null then
    return v_id;
  end if;

  -- Reserva existente. Só é reivindicável se ficou pendente tempo demais:
  -- 'enviado' e 'erro' são finais e não voltam.
  update public.log_envio
     set data_envio = now()
   where agendamento_id = p_agendamento_id
     and usuario_id = p_usuario_id
     and tipo = 'lembrete'
     and status_entrega = 'pendente'
     and data_envio < now() - interval '15 minutes'
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.registrar_lembrete_pendente(uuid, uuid) from public;
grant execute on function public.registrar_lembrete_pendente(uuid, uuid)
  to service_role;
