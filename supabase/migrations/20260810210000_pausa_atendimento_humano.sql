-- Pausa do bot para atendimento humano, por conversa.
--
-- O problema: com o bot ligado, o dono não tinha NENHUMA forma de assumir a
-- conversa. Ele digita no celular, o bot responde por cima na mensagem seguinte
-- do cliente, e os dois falam ao mesmo tempo — que é o oposto do que o produto
-- promete a quem paga.
--
-- A granularidade é por conversa, não por tenant: o dono atendendo um cliente à
-- mão não é motivo para o bot parar de atender os outros seis. A chave dessa
-- granularidade já existe e é o unique (usuario_id, remote_jid) desta tabela,
-- então não há tabela nova — só uma coluna.
--
-- Medido contra a Evolution 2.3.7 em 2026-08-10 (o que torna a detecção viável, e
-- é registrado aqui porque é a premissa que a coluna serve): mensagem que o dono
-- digita no aparelho chega como `messages.upsert` com `key.fromMe: true`,
-- enquanto o que NÓS enviamos por `sendText` chega como `send.message` — evento
-- que `NOME_EVENTOS_WEBHOOK` não assina. Logo `messages.upsert` + `fromMe` é
-- sempre o dono. `data.source` NÃO serve para isso: o dono pelo WhatsApp Web e o
-- nosso próprio envio dão os dois `web`.

-- ---------------------------------------------------------------------------
-- 1. A coluna.
-- ---------------------------------------------------------------------------
alter table conversas_estado
  -- Instante em que o bot volta a atender ESTA conversa. Nulo = bot ativo.
  --
  -- Guarda o fim da janela, e não o começo (`pausado_em` + TTL em outro lugar),
  -- porque quem lê é o webhook em todo evento de mensagem: um `pausado_ate >
  -- now()` responde a pergunta inteira sem o leitor precisar conhecer o TTL. É
  -- também o que permite o dono forçar a retomada no painel gravando `null`, e
  -- forçar a pausa gravando um instante distante, sem coluna de "modo".
  --
  -- `timestamptz` e comparação contra `now()`: diferente da grade de horários,
  -- aqui não há hora de parede nenhuma envolvida, então o fuso do negócio não
  -- entra — é duração a partir de um instante.
  add column pausado_ate timestamptz;

comment on column conversas_estado.pausado_ate is
  'Instante em que o bot volta a atender esta conversa. Nulo = ativo. Escrito pelo webhook ao detectar mensagem do dono (fromMe) e pelo painel; lido em todo messages.upsert.';

-- ---------------------------------------------------------------------------
-- 2. Privilégio, no nível da COLUNA.
-- ---------------------------------------------------------------------------
-- A tabela segue em menor privilégio: o dono só tinha `select`, porque quem
-- escreve estado de conversa é sempre o webhook ou o cron via service role. O
-- painel precisa de "Pausar"/"Retomar agora", e isso é escrita — mas um
-- `grant update` de tabela abriria `dados_temporarios`, `etapa_atual_id` e
-- `fluxo_snapshot` para o cliente autenticado, ou seja, deixaria o dono
-- reescrever à mão o estado de uma conversa em voo (e, com um cliente
-- comprometido, escrever qualquer coisa lá).
--
-- Grant de coluna resolve exatamente isso: RLS decide QUAIS linhas, o grant
-- decide QUAIS colunas. As duas metades são necessárias — sem o grant, a policy
-- não basta; sem a policy, o grant não basta.
grant update (pausado_ate) on public.conversas_estado to authenticated;

create policy "dono pausa e retoma suas conversas"
  on conversas_estado for update to authenticated
  -- `(select auth.uid())` e não `auth.uid()` solto: o subselect faz o planner
  -- avaliar a função uma vez em vez de por linha (padrão de todas as policies
  -- do projeto).
  using ((select auth.uid()) = usuario_id)
  -- O `with check` não é simetria decorativa: sem ele, um update poderia mover a
  -- linha para outro `usuario_id` e vazar a conversa para outro tenant.
  with check ((select auth.uid()) = usuario_id);

-- Sem índice novo, de propósito. O webhook lê por (usuario_id, remote_jid), que
-- é o unique já existente, e a listagem do painel filtra por `usuario_id` — a
-- coluna líder do mesmo unique. Um índice em `pausado_ate` serviria a uma
-- consulta que ninguém faz (ninguém pergunta "quais conversas de TODOS os
-- tenants estão pausadas").
