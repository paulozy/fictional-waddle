-- A cobrança do sinal.
--
-- Uma linha por Pix emitido. Existe separada de `agendamentos` por dois motivos
-- que não são organização de código:
--
-- 1. `agendamentos.sinal_status` responde "este horário está pago?" — pergunta do
--    dono, lida em toda renderização da agenda. Aqui mora o RASTRO do dinheiro:
--    id no PSP, valor, prazo, quando caiu. São leituras com frequência e público
--    diferentes, e juntar as duas engordaria a query da agenda com colunas que
--    ela nunca usa.
-- 2. `provedor_pagamento_id` precisa de UNIQUE para dar idempotência ao webhook,
--    e um unique dessa natureza não cabe numa tabela cujo PK é o agendamento.

create table cobrancas_sinal (
  id uuid primary key default gen_random_uuid(),

  -- Redundante com `agendamentos.usuario_id`, e de propósito.
  --
  -- O webhook de pagamento chega SEM sessão e resolve o tenant a partir daqui,
  -- antes de tocar em agendamento nenhum. Sem esta coluna, resolver o dono
  -- exigiria um join — e o `.eq("usuario_id", ...)` que é a única barreira entre
  -- tenants no caminho da service role não teria onde se apoiar.
  usuario_id uuid not null references auth.users(id) on delete cascade,

  agendamento_id uuid not null references agendamentos(id) on delete cascade,

  provedor text not null default 'mercado_pago'
    check (provedor in ('mercado_pago')),

  -- Id do pagamento no PSP. É a CHAVE DE IDEMPOTÊNCIA do webhook.
  --
  -- O Mercado Pago reentrega notificação: a mesma cobrança chega várias vezes, e
  -- também chega para mudanças que não são "pagou". Sem o unique, uma reentrega
  -- promoveria o agendamento duas vezes e — pior — dispararia duas mensagens de
  -- "sinal recebido" ao cliente.
  provedor_pagamento_id text not null unique,

  -- Centavos inteiros, nunca `numeric` nem float.
  --
  -- É o valor que foi efetivamente enviado ao PSP, e é comparado com o que o PSP
  -- devolve na reconsulta. Arredondamento binário num número que representa
  -- dinheiro de terceiro é a classe de bug que só aparece na conciliação, meses
  -- depois. `servicos.valor_sinal` é `numeric(10,2)` porque é campo de formulário;
  -- aqui já é transação.
  valor_centavos int not null check (valor_centavos > 0),

  status text not null default 'pendente'
    check (status in ('pendente', 'pago', 'expirado', 'estornado')),

  -- O copia-e-cola EMV devolvido PELO PSP para a conta autenticada.
  --
  -- Nunca fabricado por nós a partir de uma chave guardada: um payload montado
  -- aqui é dinheiro indo para o lugar errado, e o erro é silencioso do nosso lado
  -- (o cliente paga, alguém recebe, e não é o dono). Guardado para poder
  -- reenviar sem emitir cobrança nova.
  --
  -- A imagem do QR NÃO é guardada: o WhatsApp precisa do texto, e um base64 de
  -- imagem por agendamento engordaria a tabela sem ninguém ler.
  qr_code text not null,

  -- Cópia do prazo que também vai para `agendamentos.sinal_expira_em`.
  --
  -- Duplicação deliberada: o webhook de pagamento decide o que fazer olhando a
  -- cobrança, e o cálculo de disponibilidade olha o agendamento. Cada um lê o
  -- prazo sem join. Os dois são gravados na mesma transação e nunca divergem.
  expira_em timestamptz not null,

  criado_em timestamptz not null default now(),
  pago_em timestamptz,

  -- Marca o caso em que o cliente PAGOU e mesmo assim ficou sem horário.
  --
  -- Acontece quando o Pix cai depois do prazo, o agendamento já foi cancelado e o
  -- slot foi tomado por outra pessoa. É dinheiro real na conta do dono sem
  -- contrapartida, e sem esta coluna o fato existiria apenas como uma linha de
  -- log que ninguém lê — enquanto o cliente cobra o dono por WhatsApp.
  --
  -- O estorno em si é ação MANUAL do dono no painel, nunca automática: é a conta
  -- dele, e a contestação bate nela.
  estorno_pendente boolean not null default false,
  estornado_em timestamptz,

  -- Um sinal por agendamento. Reenviar o Pix reusa esta linha; um agendamento
  -- novo (depois de cancelar) é outra linha, porque é outro `agendamento_id`.
  unique (agendamento_id)
);

comment on table cobrancas_sinal is
  'Rastro do Pix de sinal. Escrita só por service role (bot e webhook de pagamento); o dono lê para ver o status na agenda.';

comment on column cobrancas_sinal.estorno_pendente is
  'Cliente pagou mas ficou sem horário (Pix após o prazo, slot já tomado). Exige ação manual do dono. Nunca estornamos por conta própria: é a conta dele.';

-- Serve à coluna da policy (regra da casa: toda coluna usada em RLS precisa de
-- índice, senão o Postgres faz seq scan e reavalia a policy linha a linha) e à
-- leitura natural do painel, que é "cobranças deste tenant, mais recentes
-- primeiro". `provedor_pagamento_id` já é indexado pelo UNIQUE.
create index cobrancas_sinal_usuario_criado_idx
  on cobrancas_sinal (usuario_id, criado_em desc);

-- Menor privilégio, como `conversas_estado`, `log_envio` e `log_conexao`: o dono
-- só LÊ. Quem escreve é sempre o bot ou o webhook de pagamento, via service role.
--
-- `insert`/`update` para `authenticated` seria o dono podendo declarar "pago" com
-- a anon key e o próprio JWT, sem passar pelo app — o mesmo motivo pelo qual
-- `agendamentos.sinal_status` ficou fora dos grants de coluna.
alter table cobrancas_sinal enable row level security;

create policy "dono le suas cobrancas de sinal"
  on cobrancas_sinal for select to authenticated
  using ((select auth.uid()) = usuario_id);

-- O revoke ANTES do grant não é cerimônia: sem ele esta tabela nasce com
-- `TRUNCATE` para `anon` e `authenticated`.
--
-- O `alter default privileges` do projeto Supabase concede o conjunto `Dxtm`
-- (TRUNCATE, REFERENCES, TRIGGER, MAINTAIN) em toda tabela nova de `public`, e
-- **TRUNCATE não passa por RLS** — uma policy filtra linha lida, e TRUNCATE não
-- lê nenhuma. Ou seja, qualquer dono logado poderia apagar o registro financeiro
-- de TODOS os tenants com uma chamada, e o rastro do dinheiro de outra pessoa
-- sumiria sem deixar log. É o mesmo raciocínio que `trials_numero_whatsapp`
-- documentou; aqui o que está em jogo é prova de pagamento.
--
-- Conferir com `\dp cobrancas_sinal`: `anon` não deve aparecer, e
-- `authenticated` só com `r` (SELECT).
revoke all on public.cobrancas_sinal from anon, authenticated;

grant select on public.cobrancas_sinal to authenticated;
grant all on public.cobrancas_sinal to service_role;
