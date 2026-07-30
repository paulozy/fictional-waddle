-- Cancelamento de agendamento: quem cancelou, quando e por quê.
--
-- `status` já aceitava 'cancelado' desde `20260725120300_clientes_agendamentos.sql`,
-- mas nenhuma linha de código gravava esse valor — e a consequência não era
-- cosmética. A constraint `agendamentos_sem_sobreposicao` é parcial em
-- `status = 'confirmado'` e a disponibilidade do bot filtra pelo mesmo valor, então
-- um agendamento que todos sabem que morreu bloqueava aquele horário PARA SEMPRE:
-- o cliente seguinte ouvia "não tem vaga" e o dono não tinha como liberar.
--
-- Ou seja: liberar o slot não exige delete nem coluna nova. O que faltava era o
-- caminho de escrita, e é o que esta migration instrumenta.
--
-- As colunas nascem servindo às DUAS frentes (painel do dono e bot do cliente) de
-- propósito: com `cancelado_por` aceitando 'cliente' desde já, o cancelamento pelo
-- WhatsApp não precisa de migration nenhuma depois.

-- ---------------------------------------------------------------------------
-- 1. Colunas.
-- ---------------------------------------------------------------------------
alter table agendamentos
  -- Carimbo do cancelamento. `created_at` é a criação e não serve; sem isto não há
  -- como distinguir "cancelou com três dias" de "cancelou 20 minutos antes", que é
  -- justamente o dado do relatório de ocupação/no-show da V2.
  add column cancelado_em timestamptz,

  -- Quem cancelou.
  --
  -- Coluna separada, e NÃO dois valores de `status` ('cancelado_cliente' /
  -- 'cancelado_dono'): `status` participa da EXCLUDE parcial e de três filtros
  -- `.eq("status","confirmado")` no app, então dois valores de "cancelado"
  -- obrigariam todo lugar que pergunta "está cancelado?" a conhecer os dois — e o
  -- primeiro que esquecesse um reintroduziria o slot bloqueado.
  --
  -- Também é o que mantém a porta aberta para reagendamento: uma coluna
  -- `remarcado_para` futura conviveria mal com um `status` sobrecarregado.
  add column cancelado_por text
    check (cancelado_por in ('cliente', 'dono')),

  -- Motivo, em vocabulário fechado.
  --
  -- Enum administrativo, sem nenhum termo clínico, e isso é decisão de privacidade:
  -- num contexto de clínica um campo aberto capturaria dado de saúde, que é dado
  -- sensível (LGPD Art. 11) com base legal que o controlador provavelmente não tem
  -- para esta finalidade — e que nós, operadores, não podemos suprir.
  --
  -- CHECK e não `create type ... as enum`: é o idioma de todo o schema (`status`,
  -- `tipo`, `status_assinatura`), e acrescentar valor depois é uma troca de
  -- constraint em vez de `alter type`.
  --
  -- 'outro' é a válvula que permite adiar decisões de taxonomia sem travar
  -- ninguém. 'agendamento_errado' cobre duplicado/teste, que é real e frequente
  -- com bot. 'cliente_vai_remarcar' é também o gancho de reagendamento.
  add column cancelamento_motivo text
    check (cancelamento_motivo in (
      'cliente_pediu',
      'cliente_vai_remarcar',
      'estabelecimento_indisponivel',
      'agendamento_errado',
      'outro'
    )),

  -- Nota interna do dono, opcional.
  --
  -- NUNCA é enviada ao cliente — nem no aviso de cancelamento, nem em lugar
  -- nenhum. É por isso que o campo pode existir apesar do risco do parágrafo
  -- acima: texto livre que sai para o titular seria um canal de saída para o que o
  -- dono digitou, inclusive um deslize. Aqui ele só volta para quem escreveu.
  --
  -- O teto de 200 é o mesmo do formulário: sem ele, "nota" viraria prontuário.
  add column cancelamento_observacao text
    check (length(cancelamento_observacao) <= 200);

-- ---------------------------------------------------------------------------
-- 2. Coerência: cancelamento do dono exige motivo.
-- ---------------------------------------------------------------------------
-- O cancelamento do CLIENTE é legitimamente sem motivo: não perguntamos (custaria
-- +1 mensagem numa etapa onde ele já decidiu sair, e a resposta seria texto livre
-- do titular — o pior caso de dado sensível, agora coletado sem consciência).
-- Então `not null` puro é impossível, e sem esta CHECK um caminho futuro gravaria
-- cancelamento do dono sem motivo e o relatório nasceria cego.
--
-- `is distinct from` e não `<>`: com `cancelado_por` nulo (todo agendamento vivo),
-- `cancelado_por <> 'dono'` avalia para NULL, e uma CHECK que devolve NULL passa —
-- funcionaria por acidente aqui, mas é a forma que quebra na primeira vez que
-- alguém inverte a condição. `is distinct from` é total.
--
-- Seguro aplicar agora sem backfill: nada gravava 'cancelado' até hoje, então não
-- existe nenhuma linha cancelada para violar a regra.
alter table agendamentos
  add constraint cancelamento_do_dono_tem_motivo check (
    cancelado_por is distinct from 'dono' or cancelamento_motivo is not null
  );

comment on constraint cancelamento_do_dono_tem_motivo on agendamentos is
  'O dono escolhe o motivo num radio obrigatório; o cliente cancela pelo bot sem ser perguntado. A assimetria é deliberada.';

-- ---------------------------------------------------------------------------
-- 3. Grants por coluna — sem isto a Server Action leva 42501 em produção.
-- ---------------------------------------------------------------------------
-- `20260725121300_correcoes_privilegios.sql` REVOGOU `update` na tabela e concedeu
-- lista explícita de colunas. `status` está lá, mas coluna nova NÃO entra sozinha:
-- ela nasce sem privilégio de update para `authenticated`, e o erro aparece só em
-- runtime, só com usuário logado, com mensagem genérica de permissão.
--
-- `service_role` não precisa de nada: tem `grant all` em `20260725121100_grants.sql`,
-- que é o caminho do webhook (cancelamento pelo cliente).
grant update (
  cancelado_em,
  cancelado_por,
  cancelamento_motivo,
  cancelamento_observacao
) on public.agendamentos to authenticated;
