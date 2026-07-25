-- btree_gist é obrigatório para misturar `uuid with =` e um range `with &&` no
-- mesmo índice GiST — exatamente o que a constraint EXCLUDE de agendamentos faz.
-- Instalado no schema `extensions` (convenção do Supabase); a opclass é
-- referenciada de forma qualificada na migration de agendamentos para não
-- depender do search_path da sessão.
create extension if not exists btree_gist with schema extensions;
