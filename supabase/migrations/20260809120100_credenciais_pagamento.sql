-- Credenciais do PSP do dono (Mercado Pago, via OAuth).
--
-- O modelo do produto é NUNCA CUSTODIAR: o dono autoriza a própria conta e o Pix
-- pousa direto nela. Não há dinheiro nosso em trânsito, e é o que mantém a
-- Encaixaria do lado de "software" em vez de "conta bolsão", vedada pelo art. 90-A
-- do Regulamento do Pix (Res. BCB 269/2022).
--
-- A consequência é esta tabela: guardamos um `access_token` que MOVIMENTA CONTA
-- BANCÁRIA DE TERCEIRO. É o segredo mais sensível que já passou por este
-- repositório, acima da `EVOLUTION_API_ADMIN_KEY` — aquela derruba o bot, esta
-- alcança dinheiro. Tudo abaixo decorre disso.

create table credenciais_pagamento (
  -- Uma conexão por tenant, então o `usuario_id` é a própria PK — não há caso de
  -- dois PSPs simultâneos, e uma PK sintética só criaria a possibilidade de duas
  -- linhas para o mesmo dono, com o app tendo de escolher entre elas.
  --
  -- `on delete cascade`, ao contrário de `trials_numero_whatsapp`. Aquela é
  -- livro-caixa antiabuso e fica fora do cascade de propósito; esta é o oposto:
  -- token órfão depois de a conta sumir é credencial viva sem dono, que ninguém
  -- revoga porque ninguém sabe que existe.
  usuario_id uuid primary key references auth.users(id) on delete cascade,

  -- Preparado para um segundo PSP sem migration de dados, mas com vocabulário
  -- fechado: um valor livre aqui faria o app despachar para um provedor que não
  -- existe e falhar só em runtime.
  provedor text not null default 'mercado_pago'
    check (provedor in ('mercado_pago')),

  -- CIFRADOS com AES-256-GCM (`lib/cripto.ts`), nunca em claro.
  --
  -- RLS e grants já impedem `authenticated` de ler esta tabela, então a cifra
  -- protege contra o que aquelas camadas não alcançam: dump de banco, backup,
  -- log de replicação, e um bug futuro que exponha a service role. Hash não
  -- serve — diferente de `trials_numero_whatsapp`, aqui o valor precisa VOLTAR,
  -- porque é ele que assina a chamada ao PSP.
  --
  -- A chave vive em `PAGAMENTO_CRYPTO_KEY`, em env var, e nunca no banco:
  -- guardar chave junto do que ela cifra é guardar o cofre aberto. Trocar a
  -- chave invalida todas as conexões, e cada dono precisa reautorizar.
  access_token_cifrado text not null,

  -- O refresh ROTACIONA a cada uso — medido contra o MP em 2026-07-29 (Q2 do
  -- spike). Quem grava tem de gravar o par novo na MESMA operação em que renova:
  -- perder a regravação mata a conexão daquele tenant em silêncio, e o sintoma
  -- chega como "o bot parou de mandar o Pix", dias depois, sem erro em lugar
  -- nenhum.
  refresh_token_cifrado text not null,

  -- Quando o access token vence (o MP devolve 180 dias). Serve para renovar
  -- ANTES de falhar, em vez de descobrir por um 401 no meio de uma conversa com
  -- cliente esperando o Pix.
  expira_em timestamptz not null,

  -- `user_id` do dono no PSP. É o que permite conferir que o `collector_id` de
  -- uma cobrança é mesmo ele — ou seja, que o dinheiro foi para o lugar certo.
  -- Sem guardar isto, "nunca custodiar" vira afirmação não verificável.
  conta_externa_id text not null,

  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table credenciais_pagamento is
  'Tokens OAuth do PSP do dono, cifrados. RLS com ZERO policies: nem para debug o dono lê daqui. Quem usa é só o webhook e as Server Actions, via service role.';

-- ---------------------------------------------------------------------------
-- RLS habilitada com ZERO policies.
-- ---------------------------------------------------------------------------
-- Idioma de `trials_numero_whatsapp`: RLS ligada sem nenhuma policy nega tudo
-- para `authenticated`. E aqui não há sequer o argumento de debug — o dado que o
-- dono precisa ("estou conectado?") já está denormalizado em
-- `perfis.pagamento_conectado_em`, exatamente para que esta tabela nunca precise
-- ser lida por um JWT de usuário.
alter table credenciais_pagamento enable row level security;

-- O revoke NÃO é redundante com a RLS, e nesta tabela é mais grave que na outra.
--
-- O `alter default privileges` do projeto Supabase concede a `anon` e
-- `authenticated`, em toda tabela nova de `public`, o conjunto `Dxtm` —
-- TRUNCATE, REFERENCES, TRIGGER e MAINTAIN. **TRUNCATE não passa por RLS**: uma
-- policy filtra linha lida, e TRUNCATE não lê nenhuma. Ou seja, sem este revoke
-- qualquer dono logado poderia apagar as credenciais de TODOS os tenants com uma
-- chamada, derrubando a cobrança de sinal do produto inteiro e obrigando cada
-- cliente a reautorizar. Conferir com `\dp credenciais_pagamento`: `anon` e
-- `authenticated` não devem aparecer.
revoke all on public.credenciais_pagamento from anon, authenticated;

-- A service role ignora RLS, mas ainda precisa do privilégio de tabela.
grant all on public.credenciais_pagamento to service_role;
