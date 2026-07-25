-- Roteiro de perguntas do bot, montado pelo dono no dashboard.
-- A engine é dirigida por estes dados: nenhuma etapa é hardcoded no código.
create table fluxo_etapas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users on delete cascade,
  ordem int not null,
  tipo text not null check (
    tipo in ('servico', 'horario', 'escolha_unica', 'texto_livre', 'confirmacao')
  ),
  pergunta_texto text not null check (length(trim(pergunta_texto)) > 0),
  -- Só em escolha_unica: array de {label, valor}.
  opcoes jsonb,
  -- Chave usada para gravar a resposta em agendamentos.respostas_extras.
  campo_destino text,
  obrigatorio boolean not null default true,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),

  -- Etapas de sistema gravam em colunas próprias (servico_id, data_hora), logo
  -- não têm campo_destino. Etapas customizadas precisam de um.
  constraint campo_destino_coerente_com_tipo check (
    (tipo in ('servico', 'horario', 'confirmacao') and campo_destino is null)
    or (tipo in ('escolha_unica', 'texto_livre') and campo_destino is not null)
  ),
  constraint opcoes_apenas_em_escolha_unica check (
    tipo = 'escolha_unica' or opcoes is null
  ),
  -- Chaves com `__` são reservadas para dados internos da engine em
  -- dados_temporarios; proibir aqui evita colisão com resposta do cliente.
  constraint campo_destino_sem_prefixo_reservado check (
    campo_destino is null or campo_destino not like '\_\_%'
  )
);

-- Regra do builder: campo_destino único por usuário, senão uma etapa
-- sobrescreve a resposta da outra ao gravar respostas_extras.
create unique index fluxo_etapas_campo_destino_unico
  on fluxo_etapas (usuario_id, campo_destino)
  where campo_destino is not null;

-- Regra do builder: no máximo uma etapa de cada tipo de sistema. Combinado com
-- o seed do trigger de novo usuário, garante exatamente uma de cada.
create unique index fluxo_etapas_sistema_unico
  on fluxo_etapas (usuario_id, tipo)
  where tipo in ('servico', 'horario', 'confirmacao');

-- Nenhum unique em (usuario_id, ordem) de propósito: a reordenação regrava
-- todas as linhas de uma vez e colidiria transitoriamente.
