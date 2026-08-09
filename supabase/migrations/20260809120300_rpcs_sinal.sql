-- As duas operações de sinal que precisam de transação real.
--
-- O query builder do supabase-js não abre transação (o PostgREST auto-commita
-- cada statement), então "ler, decidir e escrever" em três chamadas perde para
-- qualquer concorrência. `rpc()` roda dentro de uma. É o mesmo motivo de
-- `confirmar_agendamento` e `reivindicar_numero_trial` existirem.
--
-- Ambas `security invoker`, nunca `definer`: uma versão definer que recebe
-- `p_usuario_id` como parâmetro seria escalada de privilégio — qualquer chamador
-- passaria o UUID de outro tenant.

-- ---------------------------------------------------------------------------
-- 1. Expiração preguiçosa.
-- ---------------------------------------------------------------------------
-- NÃO existe cron de minuto a minuto, e não é omissão: o plano Hobby da Vercel
-- permite 1 execução por dia, grosso demais para um prazo de 30 minutos.
--
-- O idioma que o projeto já usa é expirar NA LEITURA — `conversas_estado` trata
-- `atualizado_em` mais velho que 6h como conversa nova, sem cron nenhum. Aqui é o
-- mesmo raciocínio, com uma vantagem: o único momento em que um slot indevidamente
-- bloqueado causa dano é quando alguém tenta agendar. Chamar isto no início do
-- cálculo de disponibilidade cobre exatamente esse instante.
--
-- O cron diário chama a mesma função como faxineiro, para tenants sem tráfego.
--
-- Escopada por tenant de propósito: uma varredura global rodaria no caminho
-- quente de toda mensagem de todo mundo, e o `where usuario_id` é o que permite
-- usar o índice em vez de varrer a tabela inteira.
create or replace function public.expirar_sinais_vencidos(p_usuario_id uuid)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_expirados int;
begin
  /**
   * A cobrança vem PRIMEIRO, e a ordem não é estética: é a mesma de
   * `confirmar_sinal_pago`, que trava `cobrancas_sinal` e só então
   * `agendamentos`.
   *
   * Na ordem inversa, as duas funções travariam o mesmo par de linhas em
   * sentidos opostos — ABBA — e o Postgres abortaria uma com 40P01. E elas foram
   * DESENHADAS para correr juntas: esta roda no caminho quente de toda mensagem,
   * e um Pix que cai rente ao prazo é o caso central do desenho. Se o abortado
   * fosse o webhook, a notificação viraria falha transitória e dependeria de
   * reentrega para não perder um pagamento real.
   *
   * Cobre os dois motivos de uma cobrança pendente morrer: o prazo venceu, ou o
   * agendamento foi cancelado por outro caminho (dono no painel, cliente pelo
   * bot) — nenhum dos dois toca em `sinal_status`, e sem esta cláusula a linha
   * ficaria `pendente` para sempre, com o Pix ainda vivo no PSP.
   */
  update public.cobrancas_sinal c
     set status = 'expirado'
   where c.usuario_id = p_usuario_id
     and c.status = 'pendente'
     and exists (
       select 1
         from public.agendamentos a
        where a.id = c.agendamento_id
          and a.sinal_status = 'aguardando'
          and (a.status = 'cancelado' or a.sinal_expira_em < now())
     );

  -- Cancelar é o que LIBERA o slot: a EXCLUDE é parcial em `status = 'confirmado'`,
  -- então sair desse valor devolve o horário ao mercado. É o caminho que a
  -- migration de cancelamento já instrumentou e que já é testado — nenhuma regra
  -- nova de disponibilidade precisou existir para o sinal.
  update public.agendamentos
     set status = 'cancelado',
         sinal_status = 'expirado',
         cancelado_em = now(),
         -- Nem 'cliente' nem 'dono': ninguém decidiu, o prazo passou. Atribuir a
         -- um dos dois mentiria no relatório de ocupação da V2.
         cancelado_por = 'sistema',
         cancelamento_motivo = 'sinal_nao_pago'
   where usuario_id = p_usuario_id
     and status = 'confirmado'
     and sinal_status = 'aguardando'
     and sinal_expira_em < now();

  -- O retorno conta o que foi LIBERADO, que é a única métrica com consequência
  -- para a agenda. Reconciliação de rótulo não entra na conta.
  get diagnostics v_expirados = row_count;

  /**
   * Reconciliação do eixo de sinal em agendamento já cancelado.
   *
   * O cancelamento pelo dono (`agendamentos/actions.ts`) e pelo cliente
   * (webhook do bot) gravam `status = 'cancelado'` e não sabem nada sobre sinal.
   * Sem esta linha, a agenda mostraria "Aguardando sinal" ao lado de um horário
   * cancelado — dois rótulos se contradizendo na mesma linha.
   *
   * Não vira `'estornado'`: ninguém devolveu nada. Se o cliente pagar depois,
   * `confirmar_sinal_pago` recusa ressuscitar (o cancelamento não foi nosso) e
   * marca estorno pendente, que é o desfecho correto.
   */
  update public.agendamentos
     set sinal_status = 'expirado'
   where usuario_id = p_usuario_id
     and status = 'cancelado'
     and sinal_status = 'aguardando';

  return v_expirados;
end;
$$;

comment on function public.expirar_sinais_vencidos(uuid) is
  'Libera slots cujo sinal venceu sem pagamento. Chamada no cálculo de disponibilidade (caminho quente) e pelo cron diário (faxina de tenant sem tráfego).';

revoke execute on function public.expirar_sinais_vencidos(uuid) from public;
grant execute on function public.expirar_sinais_vencidos(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Confirmação do pagamento.
-- ---------------------------------------------------------------------------
-- Chamada pelo webhook do PSP, DEPOIS de reconsultar o pagamento na API. A
-- notificação diz que algo mudou, nunca que pagou — confiar no corpo do webhook
-- é aceitar como verdade um POST que qualquer um pode forjar.
--
-- Contrato textual, no idioma de `reivindicar_numero_trial`. Cada valor é um
-- caminho de UX distinto no webhook, e não um detalhe de log:
--
--   'sem_cobranca'      → id desconhecido; provavelmente notificação de outra
--                         aplicação. Responder 200 e ignorar.
--   'ja_processado'     → reentrega. É o caso NORMAL, não erro: o MP reenvia a
--                         mesma notificação várias vezes.
--   'valor_divergente'  → pagou valor diferente do cobrado. Não promove.
--   'promovido'         → caminho feliz.
--   'reconfirmado'      → pagou depois do prazo, mas o horário ainda estava livre.
--   'estorno_pendente'  → pagou e NÃO há horário. Dinheiro na conta do dono sem
--                         contrapartida; exige ação manual dele.
create or replace function public.confirmar_sinal_pago(
  p_provedor_pagamento_id text,
  p_valor_centavos int
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cobranca public.cobrancas_sinal;
  v_status text;
  v_cancelado_por text;
  v_motivo text;
  v_data_hora timestamptz;
begin
  -- `for update` serializa reentregas simultâneas do MP. Sem ele, duas
  -- notificações do mesmo pagamento no mesmo instante passariam as duas pelo
  -- teste de 'ja_processado' e o cliente receberia duas mensagens de confirmação.
  select * into v_cobranca
    from public.cobrancas_sinal
   where provedor_pagamento_id = p_provedor_pagamento_id
   for update;

  if not found then
    return 'sem_cobranca';
  end if;

  if v_cobranca.status in ('pago', 'estornado') then
    return 'ja_processado';
  end if;

  -- O valor vem da RECONSULTA ao PSP, não do corpo do webhook. Divergência é
  -- pagamento parcial ou cobrança adulterada: nos dois casos o horário não pode
  -- ser liberado, e quem resolve é gente.
  if v_cobranca.valor_centavos <> p_valor_centavos then
    return 'valor_divergente';
  end if;

  select status, cancelado_por, cancelamento_motivo, data_hora
    into v_status, v_cancelado_por, v_motivo, v_data_hora
    from public.agendamentos
   where id = v_cobranca.agendamento_id
   for update;

  -- Caminho feliz: o prazo não venceu e o horário continua de pé.
  if v_status = 'confirmado' then
    update public.agendamentos
       set sinal_status = 'pago'
     where id = v_cobranca.agendamento_id;

    update public.cobrancas_sinal
       set status = 'pago', pago_em = now()
     where id = v_cobranca.id;

    return 'promovido';
  end if;

  -- Daqui para baixo, o agendamento não está mais de pé. Ressuscitar só é
  -- legítimo se quem o derrubou foi a NOSSA varredura de prazo.
  --
  -- A distinção não é cosmética: se o DONO cancelou (cliente sumiu, agenda
  -- mudou, estabelecimento fechou), reconfirmar por conta de um Pix atrasado
  -- desfaria uma decisão humana pelas costas dele e recolocaria na agenda um
  -- horário que ele já deu como perdido.
  if v_status <> 'cancelado'
     or v_cancelado_por is distinct from 'sistema'
     or v_motivo is distinct from 'sinal_nao_pago'
     -- E não adianta ressuscitar horário que já passou: o cliente pagou por um
     -- atendimento que não vai acontecer. A EXCLUDE não barra passado, então sem
     -- este teste o agendamento voltaria vencido, e o lembrete nunca sairia.
     or v_data_hora <= now() then
    update public.cobrancas_sinal
       set status = 'pago', pago_em = now(), estorno_pendente = true
     where id = v_cobranca.id;

    return 'estorno_pendente';
  end if;

  begin
    update public.agendamentos
       set status = 'confirmado',
           sinal_status = 'pago',
           cancelado_em = null,
           cancelado_por = null,
           cancelamento_motivo = null
     where id = v_cobranca.agendamento_id;

    update public.cobrancas_sinal
       set status = 'pago', pago_em = now()
     where id = v_cobranca.id;

    return 'reconfirmado';

  -- 23P01: outra pessoa fechou o horário na janela entre a expiração e o Pix
  -- cair. O bloco aninhado é o que permite tratar isso sem abortar a transação
  -- inteira — o `update` da cobrança abaixo precisa sobreviver ao rollback do
  -- savepoint implícito.
  exception when exclusion_violation then
    update public.cobrancas_sinal
       set status = 'pago', pago_em = now(), estorno_pendente = true
     where id = v_cobranca.id;

    return 'estorno_pendente';
  end;
end;
$$;

comment on function public.confirmar_sinal_pago(text, int) is
  'Promove o agendamento depois de o PSP confirmar o Pix. Idempotente por provedor_pagamento_id. Nunca ressuscita agendamento cancelado pelo DONO nem horário já vencido — nos dois casos marca estorno pendente.';

revoke execute on function public.confirmar_sinal_pago(text, int) from public;
grant execute on function public.confirmar_sinal_pago(text, int) to service_role;
