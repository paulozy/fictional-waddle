-- Um trial por número de WhatsApp.
--
-- O gate de `20260725121500_trial_assinatura.sql` responde "este trial acabou?",
-- mas não impede recomeçar: o único custo de criar conta é um e-mail novo, e
-- e-mail é infinito e grátis (dots e `+tag` do Gmail, domínio descartável).
--
-- A chave de unicidade aqui é o número de WhatsApp que o dono pareia por QR
-- code, e não o e-mail, por dois motivos:
--
--  1. O pareamento é prova de posse mais forte que um OTP: exige a conta logada
--     num aparelho com slot de dispositivo vinculado livre.
--  2. O trial só tem VALOR no número real do negócio — o que os clientes já têm
--     salvo na agenda. Um chip pré-pago novo compra um número, mas não compra
--     tráfego: ninguém manda mensagem para ele. Um segundo trial em número novo
--     é um trial vazio. Ou seja, "um trial por número" equivale na prática a
--     "um trial por negócio real", sem impor atrito nenhum a quem é honesto.

-- ---------------------------------------------------------------------------
-- 1. O livro-caixa.
-- ---------------------------------------------------------------------------
create table trials_numero_whatsapp (
  -- `hmac_sha256(numero_normalizado, TRIAL_HASH_PEPPER)`, calculado na aplicação
  -- (`lib/trial-numero.ts`). Guardar o número em claro seria dado pessoal sem
  -- necessidade, e hash puro não bastaria: o espaço de telefones brasileiros é
  -- ~10^11, quebrável por força bruta. O pepper vive em env var e nunca no
  -- banco, então um dump desta tabela não revela número nenhum.
  --
  -- Trocar o pepper invalida o livro-caixa inteiro (todos os hashes mudam).
  numero_hash text primary key,

  -- Primeiro usuário a reivindicar este número.
  --
  -- SEM FK para auth.users de propósito. Toda outra FK do produto é
  -- `on delete cascade` por LGPD, e um livro-caixa que cascateia é um
  -- livro-caixa que o abusador apaga sozinho: bastaria excluir a conta e
  -- recadastrar para zerar o trial. Aqui um `usuario_id` órfão depois de uma
  -- exclusão de conta é o comportamento desejado — o registro precisa
  -- sobreviver justamente a quem quer apagá-lo.
  usuario_id uuid not null,

  criado_em timestamptz not null default now(),

  -- Defesa em profundidade. `hashNumeroWhatsapp` sempre produz 64 hex e
  -- `extrairNumeroDono` recusa string sem dígito, mas uma linha com hash vazio
  -- bloquearia TODA conta cujo cálculo de hash degradasse depois — e seria
  -- indistinguível de abuso real nos dados.
  constraint trials_numero_hash_formato check (numero_hash ~ '^[0-9a-f]{64}$')
);

comment on table trials_numero_whatsapp is
  'Livro-caixa de trials já consumidos, por número de WhatsApp (hash+pepper). Deliberadamente fora do cascade de auth.users. Para desbloquear um falso-positivo legítimo siga o runbook da seção "Um trial por número de WhatsApp" do CLAUDE.md — apagar linha daqui, isoladamente, NÃO desbloqueia ninguém.';

-- RLS habilitada com ZERO policies: `authenticated` não tem o que ver aqui nem
-- para debug — o dono veria apenas o hash do próprio número, e o dado que ele
-- precisa (estou bloqueado?) já está em `perfis.trial_bloqueado_em`. Quem lê e
-- escreve é sempre o webhook, via service role, que ignora RLS.
alter table trials_numero_whatsapp enable row level security;

-- RLS não é a única camada, e aqui o revoke não é redundante.
--
-- O `alter default privileges` do projeto Supabase concede a `anon` e
-- `authenticated`, em toda tabela nova de `public`, o conjunto `Dxtm` —
-- TRUNCATE, REFERENCES, TRIGGER e MAINTAIN. TRUNCATE **não passa por RLS**: uma
-- policy não filtra linha que nunca é lida. Nesta tabela específica isso
-- contradiz o motivo de ela existir (o abusador não pode apagar o próprio
-- registro), então o privilégio sai explicitamente. Verificar com
-- `\dp trials_numero_whatsapp`: as duas roles não devem aparecer.
revoke all on public.trials_numero_whatsapp from anon, authenticated;

-- A service role ignora RLS, mas ainda precisa do privilégio de tabela.
grant all on public.trials_numero_whatsapp to service_role;

-- ---------------------------------------------------------------------------
-- 2. A decisão, denormalizada em `perfis`.
-- ---------------------------------------------------------------------------
-- Os três gates já leem `perfis` por caminhos diferentes (layout com o client
-- que respeita RLS, webhook e cron com o client admin). Gravar a decisão numa
-- coluna preserva `lib/assinatura.ts` como função pura e sem rede, e evita dar
-- `select` no livro-caixa para `authenticated`.
--
-- Sem backfill: o número nunca foi capturado até agora (o webhook lia só
-- `data.state` e descartava o resto do payload), então o livro-caixa nasce
-- vazio e cada conta existente reivindica o próprio número no próximo
-- CONNECTION_UPDATE com `open` — que é exatamente o que queremos.
alter table perfis add column trial_bloqueado_em timestamptz;

comment on column perfis.trial_bloqueado_em is
  'Instante em que este perfil pareou um número que já havia consumido trial em outra conta. Nulo = não bloqueado. Grudento: só ação manual ou status_assinatura = ''ativo'' levanta.';

-- ---------------------------------------------------------------------------
-- 3. A reivindicação, atômica.
-- ---------------------------------------------------------------------------
-- Precisa ser função e não query builder: insert-condicional, leitura do dono e
-- update do perfil têm de acontecer na mesma transação, e o `supabase-js` não
-- abre transação (o PostgREST auto-commita cada statement). Duas contas pareando
-- o mesmo número no mesmo segundo precisam que exatamente uma ganhe.
--
-- Contrato para o webhook:
--   'liberado'  → o número é desta conta (ou é a primeira vez que aparece)
--   'bloqueado' → outra conta já consumiu o trial neste número
create or replace function public.reivindicar_numero_trial(
  p_usuario_id uuid,
  p_numero_hash text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_dono uuid;
begin
  insert into public.trials_numero_whatsapp (numero_hash, usuario_id)
  values (p_numero_hash, p_usuario_id)
  on conflict (numero_hash) do nothing;

  select usuario_id into v_dono
    from public.trials_numero_whatsapp
   where numero_hash = p_numero_hash;

  -- Idempotente: CONNECTION_UPDATE com `open` chega várias vezes (reconexão,
  -- queda de sessão, redeploy). E cobre o caso legítimo de uma conta trocar de
  -- número ao longo do tempo — chip novo, aparelho novo — reivindicando mais de
  -- um hash sem se bloquear.
  --
  -- `v_dono is null` só acontece se a linha foi apagada entre o insert e o
  -- select — ou seja, exatamente durante o runbook de desbloqueio, se o telefone
  -- do dono reconectar no mesmo instante. Sem este teste, `null = uuid` daria
  -- `null`, o `if` não entraria, e o dono seria bloqueado de novo no meio da
  -- correção. Uma janela de milissegundos, mas o fail-safe deste caminho é
  -- permissivo por decisão, e não pode inverter aqui.
  if v_dono is null or v_dono = p_usuario_id then
    return 'liberado';
  end if;

  -- `where trial_bloqueado_em is null` preserva o instante do primeiro bloqueio.
  --
  -- E o bloqueio NÃO é limpo no caminho 'liberado' acima de propósito: se fosse,
  -- bastaria parear um chip novo depois de ser bloqueado para se
  -- auto-desbloquear. Só ação manual (ou status_assinatura = 'ativo') levanta.
  update public.perfis
     set trial_bloqueado_em = now()
   where id = p_usuario_id
     and trial_bloqueado_em is null;

  return 'bloqueado';
end;
$$;

-- Funções recebem EXECUTE para PUBLIC por default, e revogar de um role
-- específico não mexe no grant de PUBLIC (ver item 3 de
-- `20260725121300_correcoes_privilegios.sql`). Quem chama é só o webhook.
revoke execute on function public.reivindicar_numero_trial(uuid, text) from public;
grant execute on function public.reivindicar_numero_trial(uuid, text) to service_role;
