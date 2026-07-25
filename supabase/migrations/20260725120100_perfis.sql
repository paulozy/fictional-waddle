-- Estende auth.users com os dados do estabelecimento.
create table perfis (
  id uuid primary key references auth.users on delete cascade,
  nome_estabelecimento text,

  -- Nome da instância na Evolution API. Igual ao id do usuário, para que o
  -- webhook resolva o tenant a partir da URL sem ambiguidade.
  evolution_instance_name text unique,
  status_conexao_whatsapp text not null default 'desconectado'
    check (status_conexao_whatsapp in ('desconectado', 'conectado', 'erro')),

  -- Fuso do negócio. `horarios_disponiveis.hora_inicio` é hora de parede e só
  -- pode ser convertida para instante com esta informação. O runtime da Vercel
  -- roda em UTC, então o fuso do processo nunca serve como referência.
  fuso_horario text not null default 'America/Sao_Paulo',

  -- Grade de oferta de horários: de quantos em quantos minutos um slot começa.
  -- Independente da duração do serviço (uma janela 09:00-12:00 com serviço de
  -- 45min e passo 30 oferece 09:00, 09:30, 10:00...).
  passo_slot_minutos int not null default 30
    check (passo_slot_minutos between 5 and 240),

  -- Evita oferecer horário para "daqui a 3 minutos".
  antecedencia_minima_minutos int not null default 60
    check (antecedencia_minima_minutos >= 0),
  -- Limita o horizonte de busca de disponibilidade.
  antecedencia_maxima_dias int not null default 30
    check (antecedencia_maxima_dias between 1 and 365),

  plano text not null default 'trial',
  status_assinatura text not null default 'trial',
  created_at timestamptz not null default now()
);

comment on column perfis.status_conexao_whatsapp is
  'Fonte de verdade: webhook CONNECTION_UPDATE. Toda função que envia mensagem verifica isto antes.';
