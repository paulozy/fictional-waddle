-- Estado da conversa do bot, por instância e por interlocutor.
-- A Evolution API só transporta mensagens: ela não sabe em que ponto da conversa
-- um cliente está. Esse estado é responsabilidade exclusiva da aplicação.
create table conversas_estado (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users on delete cascade,

  -- Identificador cru recebido no webhook (`data.key.remoteJid`), não um
  -- telefone parseado. O WhatsApp está migrando para Linked IDs, e o JID pode
  -- chegar como `154417159582282@lid`, sem telefone nenhum. Reconstruir número
  -- (9º dígito, DDI) é fonte de bug: responde-se ao JID que chegou.
  remote_jid text not null,
  -- Best-effort, apenas quando dá para extrair do JID. Pode ser nulo.
  telefone_cliente text,

  -- Etapa corrente dentro de `fluxo_snapshot`. Sem FK para fluxo_etapas de
  -- propósito: a autoridade da conversa em andamento é o snapshot, e um
  -- ON DELETE SET NULL faria a conversa parecer nova se o dono editasse o fluxo.
  etapa_atual_id uuid,

  -- Cópia das etapas ativas, ordenadas, no momento em que a conversa começou.
  -- É o que protege conversas em andamento de uma reordenação/exclusão feita
  -- pelo dono no meio do caminho: conversas em voo terminam na versão em que
  -- começaram, novas pegam a versão nova.
  fluxo_snapshot jsonb not null default '[]',

  -- Acumula as respostas conforme a conversa avança. Chaves internas da engine
  -- usam prefixo `__` para nunca colidir com um campo_destino do dono.
  dados_temporarios jsonb not null default '{}',

  -- Idempotência: a Evolution reenvia webhook em retry e o Baileys reemite
  -- mensagem. Mesmo `data.key.id` duas vezes não pode avançar a conversa.
  ultima_mensagem_id text,

  -- Compare-and-set. O supabase-js não tem transação client-side nem
  -- SELECT ... FOR UPDATE (o PostgREST auto-commita cada statement), então a
  -- proteção contra duas mensagens quase simultâneas é um UPDATE condicional
  -- em `versao`: zero linhas afetadas significa que outra requisição ganhou.
  versao int not null default 0,

  atualizado_em timestamptz not null default now(),
  unique (usuario_id, remote_jid)
);

comment on column conversas_estado.atualizado_em is
  'Conversa com atualizado_em mais antigo que 6h é tratada como nova na leitura — expiração sem precisar de cron.';
