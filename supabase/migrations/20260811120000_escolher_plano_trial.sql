-- ---------------------------------------------------------------------------
-- O dono escolhe a faixa durante o trial.
-- ---------------------------------------------------------------------------
-- `perfis.plano` governa a capacidade de cobrar sinal por Pix e ficou FORA do
-- `grant update` de `authenticated` em `20260809120000_sinal_colunas.sql`, com
-- o motivo escrito lá: quem pudesse escrevê-lo se autoconcederia a capacidade.
-- Isso continua verdadeiro, e este arquivo **não** afrouxa aquele grant.
--
-- O que mudou é o produto: o site passou a vender duas faixas, e quem clica em
-- "Começar teste grátis" no cartão do Garantido caía num trial Essencial, sem
-- caminho nenhum na interface para dizer qual queria. A escolha precisa existir,
-- e precisa ser exatamente isto — **escolha de quem está num trial real** —, não
-- um `update` livre na coluna.
--
-- Por que função e não `grant update (plano)` com uma policy:
--
--   * Uma policy de UPDATE não consegue expressar "só enquanto o trial estiver
--     em curso" sem repetir a aritmética de prazo do `USING`, e ela ficaria
--     válida para qualquer outra escrita na coluna que aparecesse depois.
--   * Aqui a guarda mora ao lado do CHECK e do grant que definem a regra, em vez
--     de a um arquivo TypeScript de distância deles.
--   * Uma escrita, uma transação: sem o estado intermediário de "salvei o nome
--     mas não o plano" que duas chamadas do query builder produzem.
--
-- **`security definer` sem parâmetro de identidade.** O CLAUDE.md diz que as
-- RPCs do projeto são `security invoker` porque "uma versão definer que recebe
-- `p_usuario_id` como parâmetro seria escalada de privilégio" — e aquela objeção
-- é sobre o **parâmetro**, não sobre o `definer`. Esta função não aceita
-- identidade: o alvo é sempre `(select auth.uid())`, lido dentro dela. Não há
-- valor que o chamador possa passar para agir sobre outro tenant. É a mesma
-- forma de `reivindicar_numero_trial`, que também escreve coluna fora do grant
-- com a guarda dentro da função.
--
-- Contrato textual, no idioma de `confirmar_sinal_pago`: cada valor é um caminho
-- de UX distinto. Sem isso a chamada seria silenciosa — um `update` com a guarda
-- falhando **não** devolve erro no supabase-js, devolve sucesso com zero linhas,
-- e a tela afirmaria ter salvo o que não salvou.
--
--   'trocado'      → gravado
--   'sem_efeito'   → já era esse plano (recarregar o passo 2 é caso comum)
--   'nao_permitido'→ não está num trial real em curso; nada foi escrito
--   'invalido'     → valor fora de ('basico','sinal')
create or replace function public.escolher_plano_trial(p_plano text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
  v_atual text;
begin
  -- Sessão ausente nunca deve virar escrita. Com `security definer` e sem este
  -- teste, `auth.uid()` nulo faria o `update` casar zero linhas e devolver
  -- 'nao_permitido' — o desfecho certo por acidente, e não por decisão.
  if v_usuario is null then
    return 'nao_permitido';
  end if;

  -- Validar aqui, e não só confiar no CHECK da tabela: o CHECK levantaria
  -- exceção 23514, que chega no app como erro genérico de banco. O contrato
  -- textual existe para o chamador poder distinguir "você mandou lixo" de "você
  -- não pode agora".
  if p_plano is null or p_plano not in ('basico', 'sinal') then
    return 'invalido';
  end if;

  /*
    A guarda de quatro condições. As três últimas não são zelo: cada uma fecha um
    estado real em que `status_assinatura` continua sendo a string 'trial'.

      trial_expira_em is not null  → **o VIP.** Isenção manual é
        `trial_expira_em = null` com status 'trial', e `lib/assinatura.ts` a trata
        como válida para sempre. Sem esta linha, toda conta que marcamos como
        cortesia se autoconcederia o Garantido vitalício e de graça — e é a
        população que nós mesmos criamos, com o runbook do CLAUDE.md recomendando
        aquele nulo como ferramenta de suporte.

      trial_expira_em > now()      → trial vencido. O bloqueio é **derivado** em
        `lib/assinatura.ts` comparando o prazo; nada regrava `status_assinatura`,
        então a string segue 'trial' depois do vencimento. E `plano` é durável:
        sobrevive à promoção manual para 'ativo' que faríamos depois.

      trial_bloqueado_em is null   → número que já consumiu trial em outra conta.

    **Chamar `assinaturaValida` aqui seria o bug**, e vale dizer em voz alta
    porque é contraintuitivo: ela devolve `true` para 'ativo' e para o VIP, que
    são exatamente os dois estados que não podem escolher. Esta guarda é
    estritamente mais forte — "só quem está num trial real, em curso e não
    bloqueado escolhe capacidade". Um VIP que queira o Garantido continua sendo
    `update` nosso à mão, consistente com upgrade/downgrade ser manual.
  */
  select plano into v_atual
    from public.perfis
   where id = v_usuario
     and status_assinatura = 'trial'
     and trial_expira_em is not null
     and trial_expira_em > now()
     and trial_bloqueado_em is null
   for update;

  if not found then
    return 'nao_permitido';
  end if;

  -- Recarregar o passo 2 e reenviar o mesmo plano é caso comum, não erro: a tela
  -- é reentrante de propósito. Sair antes evita uma escrita inútil e devolve um
  -- desfecho que o chamador não precisa tratar como troca.
  if v_atual = p_plano then
    return 'sem_efeito';
  end if;

  update public.perfis
     set plano = p_plano
   where id = v_usuario;

  return 'trocado';
end;
$$;

comment on function public.escolher_plano_trial(text) is
  'Deixa o dono escolher a faixa (basico|sinal) enquanto o trial estiver em curso. Nunca aceita identidade por parâmetro: o alvo é auth.uid(). Recusa VIP (trial_expira_em nulo), trial vencido e número bloqueado — ver o comentário da migration.';

-- Funções recebem EXECUTE para PUBLIC por default, e revogar de um role
-- específico não mexe no grant de PUBLIC (item 3 de
-- `20260725121300_correcoes_privilegios.sql`). Quem chama é a Server Action do
-- passo 2 do cadastro, com a sessão do dono — daí `authenticated` e não
-- `service_role`.
revoke execute on function public.escolher_plano_trial(text) from public;
grant execute on function public.escolher_plano_trial(text) to authenticated;
