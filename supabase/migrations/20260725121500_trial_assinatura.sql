-- Gate de assinatura: expiração do trial.
--
-- `perfis` já nascia com `plano` e `status_assinatura` em 'trial', mas sem data
-- de expiração ninguém conseguia responder "este trial acabou?".

-- Adiciona sem default → backfill pelo `created_at` real de cada perfil → só
-- então fixa o default. Nesta ordem, quem já se cadastrou conta os 14 dias do
-- próprio signup, em vez de ganhar 14 dias novos a partir da migration.
alter table perfis add column trial_expira_em timestamptz;

update perfis set trial_expira_em = created_at + interval '14 days';

alter table perfis
  alter column trial_expira_em set default (now() + interval '14 days');

comment on column perfis.trial_expira_em is
  'Fim do período de teste. Nulo = isenção manual (VIP): o trial nunca expira.';

-- O controle de assinatura é manual nesta fase (sem gateway): o valor é virado
-- à mão, com `update perfis set status_assinatura = 'ativo'`. Um typo cairia no
-- `default` da regra de `lib/assinatura.ts`, que é bloquear — ou seja, um
-- cliente pagante ficaria sem bot em silêncio. O check transforma isso em erro
-- na hora do update.
alter table perfis add constraint perfis_status_assinatura_valido
  check (status_assinatura in ('trial', 'ativo', 'cancelado'));
