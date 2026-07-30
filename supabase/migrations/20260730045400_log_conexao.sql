-- Histórico de conexão do WhatsApp.
--
-- `perfis.status_conexao_whatsapp` é estado ATUAL, sobrescrito. Uma sessão que
-- cai às 14h e volta às 14h20 não deixa rastro nenhum: no fim do mês o relato
-- "o bot funcionou mais ou menos" fica indistinguível entre fluxo ruim e sessão
-- caída, e é justamente a segunda hipótese que o produto precisa saber medir —
-- o QR code (protocolo Baileys) é a fragilidade conhecida da stack.
--
-- O `disconnectionReasonCode` já chegava no `STATUS_INSTANCE` e morria num
-- `console.info` no webhook, com um comentário dizendo que persistir era o
-- "próximo passo natural, quando incomodar".
--
-- Também é o pré-requisito do item de V1 "alertas de reconexão de instância mais
-- visíveis": o alerta precisa exatamente do evento de transição, que hoje não
-- existe em lugar nenhum.

create table log_conexao (
  id uuid primary key default gen_random_uuid(),

  -- `on delete cascade`, ao contrário de `trials_numero_whatsapp`.
  --
  -- Aquela tabela é livro-caixa antiabuso e fica FORA do cascade de propósito
  -- (um livro-caixa que cascateia é um livro-caixa que o abusador apaga
  -- sozinho). Esta é dado operacional do próprio tenant, sem nada a proteger
  -- contra ele, então segue a regra geral do schema: excluir a conta apaga os
  -- dados (LGPD).
  usuario_id uuid not null references auth.users(id) on delete cascade,

  -- Discriminador EXPLÍCITO, e não inferido de qual coluna veio preenchida.
  --
  -- É o mesmo motivo de `__horario_fase` na engine de fluxo: derivar o tipo do
  -- formato do dado é type-tag implícita, e a primeira leitura que errar a
  -- inferência lê o log ao contrário sem levantar erro.
  tipo text not null check (tipo in ('transicao', 'motivo_queda')),

  -- Vocabulário de DOIS valores, igual ao de `perfis`, e não os três que
  -- `traduzirEstado` devolve. `conectando` é estado transitório do socket
  -- Baileys — emitido na abertura, antes de existir QR na tela — e persistir
  -- isso já foi bug uma vez: o valor não cabe no check de `perfis` e virava
  -- `desconectado` a cada 2-5s durante todo o pareamento.
  estado text check (estado in ('conectado', 'desconectado')),

  -- Motivo numérico da queda, quando a Evolution informa. `401` (`loggedOut`) é
  -- o dono tendo desvinculado o aparelho e só re-parear resolve; o resto é
  -- transitório e volta sozinho. Sem isto, o suporte não consegue distinguir os
  -- dois casos, e o box "WhatsApp desconectado" dá o mesmo conselho nos dois.
  motivo_codigo integer,

  em timestamptz not null default now(),

  -- Coerência entre `tipo` e a coluna que ele preenche, no mesmo idioma da
  -- coerência `tipo` ↔ `campo_destino` de `fluxo_etapas`: a regra vive no banco
  -- e não só na validação de quem escreve.
  constraint log_conexao_coerente check (
    (tipo = 'transicao'    and estado is not null and motivo_codigo is null) or
    (tipo = 'motivo_queda' and motivo_codigo is not null and estado is null)
  )
);

-- Duas linhas independentes, e NÃO uma linha de transição enriquecida com o
-- motivo: os dois fatos chegam em webhooks DIFERENTES (`CONNECTION_UPDATE` diz
-- que caiu, `STATUS_INSTANCE` diz por quê) e a Evolution não garante ordem entre
-- eles. Fazer o segundo evento atualizar "a última transição" custaria uma
-- leitura extra e assumiria uma ordenação que não existe. Log é sequência de
-- observações; quem lê correlaciona por tempo.
comment on table log_conexao is
  'Eventos de conexão da instância, append-only. Escrito só pelo webhook (service role).';

-- Serve à coluna da policy (regra da casa: toda coluna usada em RLS precisa de
-- índice, senão o Postgres faz seq scan e reavalia a policy linha a linha) e à
-- leitura natural, que é "últimos eventos deste tenant".
create index log_conexao_usuario_em_idx on log_conexao (usuario_id, em desc);

-- Menor privilégio, como `conversas_estado` e `log_envio`: quem escreve é sempre
-- o webhook via service role; o dono só lê, para debug.
alter table log_conexao enable row level security;

create policy "dono le seu log de conexao"
  on log_conexao for select to authenticated
  using ((select auth.uid()) = usuario_id);

-- GRANT e RLS são camadas independentes: sem o privilégio de tabela, o acesso
-- morre em 42501 antes de a policy ser avaliada.
grant select on public.log_conexao to authenticated;
grant all on public.log_conexao to service_role;
