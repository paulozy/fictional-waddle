-- Criação de perfil e seed do fluxo padrão ao nascer o usuário.
--
-- No banco e não no app de propósito: se o perfil dependesse de uma chamada da
-- aplicação, um signup por magic link, OAuth ou pelo painel do Supabase criaria
-- um auth.users sem perfil. E sem o seed das 3 etapas de sistema, o fluxo
-- ficaria vazio — o primeiro cliente mandaria mensagem e o bot não responderia.
--
-- `security definer` porque a trigger roda no contexto do insert em auth.users;
-- `set search_path = ''` é a recomendação de segurança do Supabase para definer,
-- e obriga a qualificar todo nome.
create or replace function public.criar_perfil_e_fluxo_padrao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfis (id, evolution_instance_name)
  values (new.id, new.id::text);

  insert into public.fluxo_etapas (usuario_id, ordem, tipo, pergunta_texto)
  values
    (new.id, 1, 'servico',
     'Olá! Qual serviço você gostaria de agendar?'),
    (new.id, 2, 'horario',
     'Estes são os horários livres. Qual deles fica melhor para você?'),
    (new.id, 3, 'confirmacao',
     'Confira os dados do seu agendamento:');

  return new;
end;
$$;

create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil_e_fluxo_padrao();
