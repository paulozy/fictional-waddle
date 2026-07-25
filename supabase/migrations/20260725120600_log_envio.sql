create table log_envio (
  id uuid primary key default gen_random_uuid(),
  agendamento_id uuid references agendamentos on delete cascade,
  usuario_id uuid not null references auth.users on delete cascade,
  tipo text not null check (tipo in ('confirmacao', 'lembrete')),
  data_envio timestamptz not null default now(),
  status_entrega text not null default 'pendente'
    check (status_entrega in ('pendente', 'enviado', 'erro')),
  erro_detalhe text
);

-- Idempotência do lembrete: se o cron rodar duas vezes (redeploy, retry da
-- Vercel), o cliente não pode receber dois lembretes. O fluxo é inserir aqui
-- ANTES de enviar, com `on conflict do nothing`: se o insert não criou linha,
-- alguém já enviou. Confirmações não entram no índice porque um agendamento
-- pode legitimamente gerar mais de uma ao longo da vida.
create unique index log_envio_lembrete_unico
  on log_envio (agendamento_id, tipo)
  where tipo = 'lembrete';
