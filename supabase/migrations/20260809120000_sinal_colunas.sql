-- Cobrança de sinal por Pix: as colunas.
--
-- O bot passa a poder segurar o horário até um sinal cair. A decisão de desenho
-- que governa este arquivo inteiro é NÃO criar um `status = 'aguardando_sinal'`.
--
-- `20260730025014_cancelamento_agendamento.sql` já argumentou o caso, e ele vale
-- igual aqui: `status` participa da EXCLUDE parcial `agendamentos_sem_sobreposicao`
-- e de três filtros `.eq("status","confirmado")` no app. Um valor novo obrigaria
-- todo lugar que pergunta "este horário está ocupado?" a conhecer dois valores, e
-- o primeiro que esquecesse um reintroduziria o slot bloqueado para sempre — ou,
-- pior, ofereceria a mesma vaga a dois clientes.
--
-- Então o agendamento com sinal nasce `confirmado`, e portanto BLOQUEIA o slot
-- desde o primeiro instante, pela constraint que já existe e não é tocada aqui. O
-- sinal vive em colunas próprias. Vencido sem pagamento, o agendamento é
-- CANCELADO pelo caminho de cancelamento que já existe e já é testado — o que
-- libera o slot sem nenhuma regra nova.

-- ---------------------------------------------------------------------------
-- 1. O sinal, em `agendamentos`.
-- ---------------------------------------------------------------------------
alter table agendamentos
  -- Eixo separado de `status`, pelo motivo do cabeçalho.
  --
  -- 'nao_exigido' é o default porque é o que vale para todo agendamento que já
  -- existe e para todo tenant sem a capacidade — que na data desta migration é
  -- 100% deles. Sem default not-null, cada leitura precisaria tratar nulo, e
  -- "nulo" e "não exigido" são a mesma coisa dita de duas formas.
  add column sinal_status text not null default 'nao_exigido'
    check (sinal_status in (
      'nao_exigido',
      'aguardando',
      'pago',
      -- 'expirado' e o `status = 'cancelado'` que o acompanha são fatos
      -- diferentes e os dois precisam ser graváveis: o primeiro diz por que o
      -- segundo aconteceu. Sem ele, um agendamento cancelado por falta de
      -- pagamento ficaria eternamente 'aguardando' — e a varredura o
      -- reprocessaria a cada passagem, porque é esse o valor que ela procura.
      'expirado',
      'estornado'
    )),

  -- Prazo do sinal. É o que a varredura preguiçosa compara com `now()`.
  --
  -- Instante absoluto e não "minutos a partir de created_at": o prazo é calculado
  -- uma vez, na criação da cobrança, com o valor de `perfis.sinal_minutos_validade`
  -- vigente naquele momento. Se o dono mudar a configuração no meio, quem já está
  -- pagando não tem o próprio prazo encurtado por baixo.
  add column sinal_expira_em timestamptz;

-- Todo agendamento que exige sinal tem prazo registrado.
--
-- Sem isto, um `sinal_status = 'aguardando'` com prazo nulo nunca venceria: a
-- varredura compara `sinal_expira_em < now()`, e `null < now()` é NULL, que não
-- é verdadeiro. O agendamento ficaria segurando o slot para sempre, esperando um
-- pagamento que ninguém mais cobra — exatamente o bug que a migration de
-- cancelamento existiu para eliminar.
--
-- `nao_exigido` é o único estado sem prazo. 'pago' e 'estornado' preservam o
-- prazo original de propósito: é o registro de sob qual janela aquele dinheiro
-- entrou, e some se for zerado na transição.
alter table agendamentos
  add constraint sinal_aguardando_tem_prazo check (
    sinal_status = 'nao_exigido' or sinal_expira_em is not null
  );

comment on constraint sinal_aguardando_tem_prazo on agendamentos is
  'Prazo nulo com sinal exigido nunca venceria (null < now() é NULL), e o slot ficaria bloqueado para sempre.';

-- ---------------------------------------------------------------------------
-- 2. Quem cancela quando o sinal vence.
-- ---------------------------------------------------------------------------
-- `cancelado_por` aceitava 'cliente' e 'dono'. A expiração não é nenhum dos dois:
-- ninguém decidiu nada, o prazo passou. Registrar como 'dono' seria mentira no
-- relatório de ocupação da V2 (o dono levaria a culpa por desmarcação que não
-- fez) e como 'cliente' seria mentira do mesmo tamanho.
--
-- CHECK e não enum, e por isso acrescentar valor é troca de constraint — o
-- idioma está registrado na própria migration de cancelamento.
-- `if exists` porque o nome é o que o Postgres gera para um CHECK declarado
-- inline na coluna (`{tabela}_{coluna}_check`). É estável, mas se algum
-- ambiente tiver a constraint com outro nome, o `drop` cru abortaria a
-- migration inteira no meio — e o que vem depois é aditivo e desejável.
alter table agendamentos
  drop constraint if exists agendamentos_cancelado_por_check;

alter table agendamentos
  add constraint agendamentos_cancelado_por_check
    check (cancelado_por in ('cliente', 'dono', 'sistema'));

alter table agendamentos
  drop constraint if exists agendamentos_cancelamento_motivo_check;

alter table agendamentos
  add constraint agendamentos_cancelamento_motivo_check
    check (cancelamento_motivo in (
      'cliente_pediu',
      'cliente_vai_remarcar',
      'estabelecimento_indisponivel',
      'agendamento_errado',
      -- Novo: o prazo do sinal venceu sem pagamento.
      'sinal_nao_pago',
      'outro'
    ));

-- `cancelamento_do_dono_tem_motivo` NÃO precisa mudar: ela exige motivo quando
-- `cancelado_por = 'dono'`, e 'sistema' passa por `is distinct from 'dono'`. A
-- varredura grava motivo mesmo assim — sem ele, o relatório não distinguiria
-- "sinal não pago" de "cancelou por outro caminho".

-- ---------------------------------------------------------------------------
-- 3. Grants: as colunas de sinal são deliberadamente NÃO escrevíveis pelo dono.
-- ---------------------------------------------------------------------------
-- `20260725121300_correcoes_privilegios.sql` revogou `update` na tabela e
-- concedeu lista explícita de colunas a `authenticated`. Coluna nova nasce sem
-- privilégio, e aqui isso é a feature, não um esquecimento:
--
-- `sinal_status` é a afirmação de que dinheiro entrou. Se o dono pudesse
-- escrevê-la com a anon key e o próprio JWT, sem passar pelo app, "pago" viraria
-- um campo de texto — e o registro deixaria de valer como prova para qualquer
-- disputa com o cliente final. Quem escreve é sempre o webhook de pagamento, via
-- service role, e só depois de reconsultar o PSP.
--
-- Ou seja: nenhum `grant update` aqui. É intencional. Não "corrigir".

comment on column agendamentos.sinal_status is
  'Escrito exclusivamente pelo webhook de pagamento (service role), nunca pelo dono. Ver grants em 20260725121300.';

-- ---------------------------------------------------------------------------
-- 4. Quanto cobrar, em `servicos`.
-- ---------------------------------------------------------------------------
-- Por serviço e não por estabelecimento: sinal de corte e sinal de progressiva
-- não são o mesmo número, e um valor único obrigaria o dono a escolher entre
-- afastar cliente do serviço barato ou não proteger o caro.
--
-- Nulo = este serviço não cobra sinal, e é o default para tudo que já existe.
-- Molde da coluna `preco` em `20260725120200_servicos_horarios.sql`.
alter table servicos
  add column valor_sinal numeric(10, 2) check (valor_sinal >= 0);

comment on column servicos.valor_sinal is
  'Nulo ou zero = serviço sem sinal. Só tem efeito se o tenant tiver a capacidade (perfis.plano) e a conta de pagamento conectada.';

-- `servicos` tem `grant ... update` na TABELA inteira (20260725121100_grants.sql),
-- não lista de colunas, então esta coluna já nasce escrevível pelo dono — que é o
-- correto: o valor do sinal é configuração dele.

-- ---------------------------------------------------------------------------
-- 5. Configuração do tenant, em `perfis`.
-- ---------------------------------------------------------------------------
alter table perfis
  -- Denormaliza "existe conta de pagamento conectada?".
  --
  -- Mesmo idioma de `trial_bloqueado_em`: a resposta mora em `perfis` para que o
  -- gate continue sendo função pura e sem rede, e para que `authenticated` nunca
  -- precise de `select` na tabela de credenciais — que guarda token capaz de
  -- movimentar conta bancária de terceiro.
  add column pagamento_conectado_em timestamptz,

  -- Janela para pagar o sinal.
  --
  -- 30 min é o default porque é o prazo que ainda segura o slot sem estrangular
  -- quem foi pagar em outro aparelho. Configurável porque a barbearia de bairro e
  -- a clínica não têm a mesma tolerância.
  add column sinal_minutos_validade int not null default 30
    check (sinal_minutos_validade > 0);

comment on column perfis.pagamento_conectado_em is
  'Instante em que o dono autorizou a conta do PSP. Nulo = não conectado. Escrito só pelo callback OAuth (service role); ver grants abaixo.';

-- O dono configura o prazo; NÃO carimba "estou conectado".
--
-- `pagamento_conectado_em` fora da lista pelo mesmo motivo que
-- `status_conexao_whatsapp` está fora: é fato observado pelo sistema, e um dono
-- que pudesse afirmá-lo sozinho ligaria a capacidade sem token nenhum — o bot
-- prometeria um Pix que não existe e o cliente ficaria esperando.
grant update (sinal_minutos_validade) on public.perfis to authenticated;

-- ---------------------------------------------------------------------------
-- 6. `plano` deixa de ser coluna morta e vira a capacidade.
-- ---------------------------------------------------------------------------
-- A coluna existe desde `20260725120100_perfis.sql` com default 'trial', SEM
-- CHECK, e é lida por zero linhas de aplicação. O sinal é o primeiro consumidor.
--
-- O default 'trial' confundia dois eixos: "que capacidades tem" (aqui) e "está
-- pagando" (`status_assinatura`, que já tem 'trial' e é onde a pergunta mora). Um
-- tenant em trial precisa poder testar a capacidade, então os dois eixos têm de
-- ser independentes.
--
-- A ordem dos três passos importa, e é a mesma de `20260725121500_trial_assinatura.sql`:
-- backfill ANTES do CHECK, senão a constraint é rejeitada pelas linhas existentes
-- (todas em 'trial', que não está no vocabulário novo).
update perfis set plano = 'basico' where plano is distinct from 'sinal';

alter table perfis alter column plano set default 'basico';

alter table perfis
  add constraint perfis_plano_valido check (plano in ('basico', 'sinal'));

comment on column perfis.plano is
  'Capacidades do tenant, eixo independente de status_assinatura. Digitado à MÃO nesta fase (não há gateway): typo aqui = cliente pagante sem a capacidade, em silêncio. O CHECK existe para que o typo vire erro em vez de valor desconhecido, que o gate trata como bloqueado.';

-- `plano` continua FORA do `grant update` de `perfis` — quem pudesse escrevê-lo
-- se autoconcederia a capacidade. É a mesma razão de `status_assinatura` estar
-- fora desde `20260725121300_correcoes_privilegios.sql`.
