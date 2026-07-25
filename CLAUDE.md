# CLAUDE.md

Este arquivo orienta o Claude Code (e qualquer instância do Claude) ao trabalhar neste repositório. Leia por completo antes de gerar ou alterar código.

## Visão geral do produto

**Nome de trabalho:** (definir — provisoriamente "AgendaZap")
**O que é:** SaaS de nicho que automatiza agendamento e triagem via WhatsApp para negócios de serviço com horário marcado (salões, clínicas, barbearias, esteticistas). O bot responde **pelo próprio número de WhatsApp do estabelecimento**, mostra horários disponíveis, confirma agendamento e envia lembrete automático.

**Problema que resolve:** o dono/atendente perde agendamento porque não consegue responder mensagem na hora (está atendendo outro cliente), e o cliente desiste e procura concorrente. Também reduz falta (no-show) via lembrete automático.

**Modelo de negócio:** assinatura mensal (R$20-40/mês, testar com os primeiros usuários — ticket pode ser mais alto do que produtos de nicho similares, já que reduz falta = dinheiro direto no bolso do dono).

**Diferencial competitivo:** roda 100% dentro do WhatsApp que o cliente final já usa — sem exigir download de app separado (diferente de concorrentes como Booksy/Trinks). Deixar isso explícito na landing page.

**Não é escopo deste produto (evitar scope creep):**
- Não é um CRM completo de clientes.
- Não faz cobrança/pagamento — esse produto trata apenas de agendamento e triagem via WhatsApp.
- Na v0, não usa IA/NLP para entender linguagem natural — o fluxo é máquina de estados com menu numerado.

---

## Diferença arquitetural crítica: multi-instância

Este produto é **multi-tenant de verdade no nível do WhatsApp**: cada usuário (dono do salão) precisa da **própria instância conectada ao seu próprio número de WhatsApp**, e não a um número único compartilhado pelo SaaS. Isso existe porque o cliente final já tem o número do estabelecimento salvo e espera resposta dele — um número genérico quebraria a experiência.

Essa diferença afeta o desenho de dados, onboarding e o roteamento de webhooks — está detalhado nas seções abaixo. Não simplificar para "instância única" sem essa ser uma decisão explícita do usuário.

---

## Stack técnica (decisões já tomadas — não revisitar sem motivo explícito)

| Camada | Tecnologia | Motivo da escolha |
|---|---|---|
| Framework | **Next.js** (App Router) | Server Components e Server Actions como BFF — nenhuma chamada ao Supabase visível no navegador |
| Hospedagem | **Vercel** | Necessário para Vercel Cron Jobs nativo |
| Banco de dados | **Supabase (Postgres)** | RLS habilitado em todas as tabelas de dado de usuário |
| Auth | **Supabase Auth** via `@supabase/ssr` | Sessão sincronizada via cookies, compatível com RLS |
| WhatsApp | **Evolution API** (self-hosted), **modelo multi-instância** | Uma instância por usuário/estabelecimento, cada uma conectada ao número de WhatsApp real do negócio via QR code (protocolo Baileys/WhatsApp Web) |
| Scheduler | **Vercel Cron Jobs** | Dispara 1x/dia um Route Handler pra verificar agendamentos do dia seguinte e enviar lembretes |

**Importante:** não sugerir trocar Supabase, nem propor backend Express separado, nem migrar pra API oficial da Meta sem pedido explícito — essas decisões já foram avaliadas e fechadas para a fase atual.

---

## Princípios de arquitetura (regras rígidas)

1. **Nenhuma chamada ao Supabase pode ser visível no client** — Server Components/Actions para tudo, service role key isolada no servidor, nunca em variável `NEXT_PUBLIC_`.

2. **RLS é a camada de segurança real.** Toda tabela de usuário com política `usuario_id = auth.uid()`. CRUD comum roda com client autenticado respeitando RLS; a service role key é reservada para o cron e para o processamento de webhooks (que chegam sem sessão de usuário logado, então precisam mapear `usuario_id` a partir do nome da instância).

3. **Uma instância Evolution API por usuário.**
   - Nome da instância = `usuario_id` (UUID do Supabase), para mapeamento direto e sem ambiguidade.
   - Nunca compartilhar instância entre dois usuários, mesmo em teste.

4. **Estado de conversa é responsabilidade da aplicação, não da Evolution API.**
   - A Evolution API só transporta mensagens — ela não sabe "em que ponto da conversa" um cliente está.
   - Toda lógica de máquina de estados vive na tabela `conversas_estado` e no processamento do webhook.

5. **Scheduler vive fora do runtime request-driven do Next.js**, disparado via Vercel Cron.

6. **LGPD desde o início.** Dados de clientes finais (nome, telefone) pertencem exclusivamente ao usuário (dono do estabelecimento) dono da conta. Cascade delete ao excluir conta. Evitar logar telefone/nome em texto plano além do necessário para debug pontual.

---

## Modelo de dados

**Fonte de verdade: `supabase/migrations/`.** O schema abaixo descreve as tabelas e as invariantes; o SQL executável (com todos os `check`, índices e comentários) vive nas migrations. Ao alterar schema, criar migration nova via `supabase migration new` — nunca editar migration já aplicada.

| Tabela | Papel |
|---|---|
| `perfis` | Estende `auth.users` com dados do estabelecimento, config de agenda e status da instância WhatsApp |
| `servicos` | Catálogo de serviços, com `duracao_minutos` |
| `horarios_disponiveis` | Grade semanal fixa, em **hora de parede** (`time`). Múltiplas linhas no mesmo dia modelam intervalo de almoço |
| `clientes_finais` | Cliente final, identificado pelo **JID** do WhatsApp |
| `agendamentos` | O agendamento, com snapshot de duração e proteção anti-sobreposição |
| `fluxo_etapas` | Roteiro de perguntas do bot, montado pelo dono |
| `conversas_estado` | Estado da conversa por instância + interlocutor |
| `log_envio` | Registro de confirmações e lembretes enviados |

### Decisões de schema que não são óbvias

Estas existem por um motivo concreto. Mexer nelas sem entender o motivo reintroduz o bug que elas resolvem.

**`perfis` guarda a configuração de agenda.** `fuso_horario` (default `America/Sao_Paulo`) é obrigatório porque `horarios_disponiveis.hora_inicio` é hora de parede e só converte para instante com o fuso do negócio — o runtime da Vercel roda em UTC e nunca serve de referência. `passo_slot_minutos` define de quantos em quantos minutos um slot começa, independente da duração do serviço. `antecedencia_minima_minutos` evita oferecer horário para "daqui a 3 minutos"; `antecedencia_maxima_dias` limita o horizonte de busca.

**`agendamentos` guarda `duracao_minutos` e `data_hora_fim` como colunas.** A duração é snapshot: se o dono editar o serviço depois, o histórico e o cálculo de disponibilidade continuam corretos. `data_hora_fim` é coluna real e não `generated` porque `timestamptz + interval` é STABLE, não IMMUTABLE — o Postgres rejeita a expressão em generated column e em expressão de índice, e a constraint EXCLUDE precisa dela. Quem preenche é o trigger `agendamentos_preencher_fim`, então o app pode omitir a coluna.

**Double-booking é resolvido no banco, não na aplicação.** "Consultar disponibilidade e depois inserir" sempre perde quando dois clientes escolhem o mesmo slot no mesmo segundo. A constraint `agendamentos_sem_sobreposicao` (`exclude using gist`, parcial em `status = 'confirmado'`, exige a extensão `btree_gist`) é a única garantia real. Violação levanta **SQLSTATE 23P01**, que é caminho de UX e não erro genérico: a engine reapresenta a etapa de horário com a lista recalculada.

**A identidade do cliente final é o `remote_jid`, não o telefone.** O WhatsApp está migrando para Linked IDs: o JID pode chegar como `154417159582282@lid`, sem telefone nenhum. Por isso `clientes_finais.remote_jid` e `conversas_estado.remote_jid` são `not null` e carregam o unique, enquanto `telefone` é best-effort e pode ser nulo. Nunca reconstruir número (DDI, 9º dígito): responder sempre ao JID que chegou, e mandar o lembrete para o JID guardado no primeiro contato.

**`conversas_estado` tem quatro colunas que a spec original não previa.** `fluxo_snapshot` guarda as etapas ativas ordenadas no momento em que a conversa começou — é o que protege conversas em andamento de uma reordenação feita pelo dono no meio do caminho (conversas em voo terminam na versão em que começaram). `etapa_atual_id` **não** tem FK para `fluxo_etapas` de propósito: a autoridade é o snapshot, e um `on delete set null` faria a conversa parecer nova. `ultima_mensagem_id` dá idempotência contra retry de webhook e reemissão do Baileys. `versao` permite compare-and-set: o supabase-js não tem transação client-side nem `select ... for update` (o PostgREST auto-commita cada statement), então a proteção contra duas mensagens quase simultâneas é um `update ... where versao = $lida` — zero linhas afetadas significa que outra requisição ganhou. Um único statement resolve idempotência e corrida juntas.

**Conversa expira na leitura, sem cron.** `atualizado_em` mais antigo que 6h é tratado como conversa nova.

**`log_envio` tem índice único parcial em `(agendamento_id, tipo) where tipo = 'lembrete'`.** O cron insere **antes** de enviar, com `on conflict do nothing`: se o insert não criou linha, alguém já enviou. Sem isso, um redeploy ou retry manda dois lembretes ao cliente.

**`fluxo_etapas` tem as regras do builder como constraints**, não só como validação de UI: `campo_destino` único por usuário (índice parcial), no máximo uma etapa de cada tipo de sistema (índice parcial em `tipo in ('servico','horario','confirmacao')`), coerência entre `tipo` e `campo_destino`, e proibição do prefixo `__` em `campo_destino` — reservado para chaves internas da engine em `dados_temporarios`, para nunca colidir com resposta do cliente. **Não** existe unique em `(usuario_id, ordem)`: a reordenação regrava todas as linhas de uma vez e colidiria transitoriamente.

**Perfil e fluxo padrão nascem no banco, não no app.** O trigger `ao_criar_usuario` (`after insert on auth.users`, `security definer`, `search_path = ''`) cria a linha em `perfis` e semeia as 3 etapas de sistema. Se dependesse de uma chamada da aplicação, um signup por OAuth, magic link ou pelo painel do Supabase criaria um `auth.users` sem perfil — e sem o seed, o primeiro cliente mandaria mensagem e o bot não responderia.

**Cascade em todas as FKs para `auth.users`** (LGPD: excluir a conta apaga os dados do tenant). `agendamentos.servico_id` também é cascade, e não restrict, para que a exclusão de conta não trave em FK — a UI nunca exclui serviço, usa `ativo = false`.

### RPCs

Duas operações precisam de atomicidade real. O query builder do supabase-js não abre transação, mas `rpc()` roda dentro de uma. Ambas são `security invoker`, **não** `definer`: uma versão definer que recebe `p_usuario_id` como parâmetro seria escalada de privilégio.

- `reordenar_fluxo_etapas(p_ids uuid[])` — regrava `ordem` na sequência dos ids via `unnest ... with ordinality`. Índices densos regravados em bloco em vez de ranks fracionários (LexoRank): são ~10 linhas por usuário. Rejeita lista parcial e id de outro tenant.
- `confirmar_agendamento(...)` — garante o cliente (upsert por `remote_jid`, sem sobrescrever nome conhecido com `null`) e cria o agendamento na mesma transação. Deixa o `23P01` propagar.

### RLS

Todas as 8 tabelas com RLS habilitada. O padrão está em `supabase/migrations/*_rls_policies.sql`, com três detalhes que importam:

1. **`(select auth.uid())`, nunca `auth.uid()` solto** — o subselect faz o planner avaliar a função uma vez e cachear, em vez de chamá-la por linha (a doc de performance de RLS do Supabase mede 179ms → 9ms).
2. **`to authenticated` em toda policy** — descarta a role `anon` sem custo de avaliação.
3. **Índice em toda coluna usada em policy** — sem ele o Postgres faz seq scan e reavalia a policy linha a linha.

`conversas_estado` e `log_envio` seguem menor privilégio: o dono só tem `select` (para debug no dashboard); quem escreve é sempre o webhook ou o cron via service role.

**A service role ignora RLS por completo.** No webhook e no cron o `.eq("usuario_id", ...)` explícito deixa de ser otimização e passa a ser a **única** barreira entre tenants — tratar como código crítico.

---

## Estrutura de pastas esperada

```
/app
  /(marketing)
    page.tsx
  /(dashboard)
    layout.tsx                      → verifica sessão, redireciona se ausente
    conexao-whatsapp/page.tsx        → exibe QR code, status da instância
    servicos/page.tsx
    horarios/page.tsx
    agendamentos/page.tsx             → dashboard com visão de calendário dos agendamentos
    fluxo-conversa/page.tsx           → builder: dono monta/reordena as etapas da conversa do bot
  /api
    /cron
      enviar-lembretes/route.ts      → chamado 1x/dia pelo Vercel Cron
    /webhook
      whatsapp/[instance]/route.ts   → recebe mensagens da Evolution API, processa conversas_estado
/lib
  supabase/
    server.ts                        → client respeitando RLS
    admin.ts                          → client com service role key
  evolution-api.ts                    → funções: criar instância, gerar QR code, enviar mensagem, checar status
  bot/
    engine-fluxo.ts                   → lê `fluxo_etapas` ordenadas e avança a conversa etapa a etapa (genérico, dirigido por configuração, não hardcoded)
    disponibilidade.ts                → calcula horários livres (horarios_disponiveis - agendamentos existentes)
/vercel.json
```

---

## Onboarding de nova instância (fluxo)

1. Ao criar a conta, o backend chama a API administrativa da Evolution API para criar uma instância nova, nomeada com o `usuario_id`.
2. A tela `conexao-whatsapp` no dashboard solicita o QR code gerado pela instância e exibe pro usuário.
3. Usuário escaneia com o WhatsApp do próprio estabelecimento.
4. Webhook de status de conexão da Evolution API atualiza `perfis.status_conexao_whatsapp` para `conectado`.
5. Se a sessão cair (deslogada, chip trocado, etc.), o mesmo webhook de status marca como `desconectado` — o dashboard deve exibir aviso claro pedindo pra reconectar via novo QR code.

**Nunca assumir que a instância está sempre conectada** — toda função que dispara mensagem deve verificar `status_conexao_whatsapp` antes e falhar de forma clara (registrando em `log_envio` com erro) se estiver desconectada.

---

## Builder de fluxo de conversa (configurável pelo dono)

O dono do estabelecimento **monta o roteiro de perguntas do bot** na tela `fluxo-conversa`, em vez de um fluxo hardcoded no código. Isso é feito via a tabela `fluxo_etapas`, onde cada linha representa uma etapa da conversa, com uma `ordem` que define a sequência.

**Tipos de etapa:**
- `servico` — etapa de sistema: popula automaticamente as opções a partir de `servicos` ativos do usuário. Obrigatória, não pode ser removida pelo dono (necessária para calcular disponibilidade).
- `horario` — etapa de sistema: popula automaticamente os horários livres via `lib/bot/disponibilidade.ts`, usando a duração do serviço escolhido na etapa `servico`. Obrigatória, não pode ser removida.
- `escolha_unica` — etapa customizada: o dono define `pergunta_texto` e as `opcoes` (ex: "Primeira vez aqui? [1] Sim [2] Não"). Resposta salva em `dados_temporarios` sob a chave de `campo_destino`.
- `texto_livre` — etapa customizada: pergunta aberta (ex: "Alguma observação?"), resposta salva como texto em `campo_destino`.
- `confirmacao` — etapa de sistema final: exibe resumo de tudo que foi respondido e pede confirmação antes de gravar o `agendamento`.

**Regras de construção que a UI do builder deve impor:**
- A etapa `servico` deve vir antes da etapa `horario` (a disponibilidade depende da duração do serviço escolhido) — a UI não deve permitir reordenar isso.
- Deve sempre existir exatamente uma etapa `servico`, uma `horario` e uma `confirmacao` — o builder permite reordenar/editar texto dessas etapas de sistema, mas não excluí-las nem duplicá-las.
- Etapas `escolha_unica` e `texto_livre` são livres: o dono pode adicionar quantas quiser, em qualquer posição entre as etapas de sistema (antes de `servico`, entre `servico` e `horario`, ou depois de `horario` e antes de `confirmacao`).
- `campo_destino` de etapas customizadas deve ser único por usuário, para não sobrescrever respostas na hora de gravar em `agendamentos.respostas_extras`.

## Engine de execução do fluxo (`lib/bot/engine-fluxo.ts`)

Processado dentro de `/api/webhook/whatsapp/[instance]/route.ts`, chamado pela Evolution API a cada mensagem recebida. A engine é **genérica** — não tem lógica de negócio hardcoded sobre quantas etapas existem ou qual a ordem; ela sempre lê `fluxo_etapas` do `usuario_id` correspondente, ordenadas por `ordem`, e filtra apenas as `ativo = true`.

1. Resolver `usuario_id` a partir do `[instance]` da URL.
2. Buscar (ou criar) `conversas_estado` para esse `usuario_id` + telefone do remetente.
3. Se `etapa_atual_id` é nulo (conversa nova), buscar a primeira etapa ativa (menor `ordem`) e apresentá-la.
4. Se já há uma `etapa_atual_id`, processar a resposta recebida conforme o `tipo` dessa etapa:
   - **`servico` / `escolha_unica`:** validar que a resposta corresponde a uma opção válida (por índice numérico); se `tipo = 'servico'`, salvar `servico_id` em `dados_temporarios`; se `escolha_unica`, salvar o `valor` escolhido em `dados_temporarios[campo_destino]`.
   - **`horario`:** validar índice escolhido entre os horários calculados; salvar `data_hora` em `dados_temporarios`.
   - **`texto_livre`:** salvar o texto recebido diretamente em `dados_temporarios[campo_destino]`.
   - **`confirmacao`:** se resposta for afirmativa, criar o registro em `agendamentos` (usando `servico_id` e `data_hora` de `dados_temporarios`, e todo o restante das chaves customizadas em `respostas_extras`), responder confirmação final, e limpar `conversas_estado`.
5. Buscar a próxima etapa ativa (`ordem` seguinte) e apresentá-la, atualizando `etapa_atual_id`.
6. Qualquer resposta fora do esperado (número inválido, fora das opções) deve reapresentar a etapa atual sem avançar, nunca travar a conversa sem resposta.

`lib/bot/disponibilidade.ts` calcula horários livres cruzando `horarios_disponiveis` (grade fixa do estabelecimento) com `agendamentos` já existentes na mesma data, considerando a `duracao_minutos` do serviço escolhido para não sobrepor horários.

---

## Fluxo do cron de lembretes (`/api/cron/enviar-lembretes`)

1. Autenticar a chamada contra `CRON_SECRET` (variável de ambiente) — rejeitar chamadas sem esse segredo.
2. Usar client admin para buscar `agendamentos` com `data_hora` no dia seguinte e `status = 'confirmado'`.
3. Para cada agendamento, verificar `status_conexao_whatsapp` do usuário correspondente antes de enviar.
4. Montar mensagem de lembrete (nome do cliente, serviço, horário) e enviar via `lib/evolution-api.ts`, especificando a instância correta (`usuario_id`).
5. Registrar resultado em `log_envio` (`tipo = 'lembrete'`).

---

## Convenções de código

- TypeScript em todo o projeto.
- Nomes de tabelas/colunas em português, consistente com o domínio de negócio.
- Variáveis de ambiente sensíveis nunca commitadas — documentar em `.env.example` sem valores reais.
- Toda Server Action valida autenticação antes de escrita.
- Processamento de webhook não tem sessão de usuário — validar `instance` recebida contra `evolution_instance_name` cadastrado antes de processar qualquer coisa, para evitar processar webhook de instância desconhecida/forjada.
- Preferir Server Components para leitura; Client Components só onde há interatividade real.

## Variáveis de ambiente esperadas (`.env.example`)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
EVOLUTION_API_URL=
EVOLUTION_API_ADMIN_KEY=
CRON_SECRET=
```

---

## Roadmap (não implementar itens de fase futura antes da atual estar validada)

**V0 — validação (prioridade atual):**
- Onboarding com QR code funcional (uma instância por usuário).
- Cadastro manual de serviços e grade de horários.
- Builder de fluxo de conversa (`fluxo_etapas`): dono monta/reordena etapas customizadas em torno das etapas fixas de sistema (`servico`, `horario`, `confirmacao`).
- Engine de execução do fluxo configurável (`lib/bot/engine-fluxo.ts`), dirigida por configuração, não hardcoded.
- Dashboard completo de agendamentos com visão de calendário.
- Lembrete automático 1 dia antes via cron.
- Testar com 2-3 estabelecimentos reais antes de expandir.

**V1:**
- Cancelamento/reagendamento pelo próprio WhatsApp.
- Alertas de reconexão de instância mais visíveis (ex: notificação por e-mail se cair).
- Validações mais ricas no builder (ex: campo do tipo número/data com validação de formato).

**V2 (não implementar ainda):**
- Entendimento de linguagem natural (NLP/IA) no lugar do menu numerado.
- Integração com Google Calendar para sincronizar agenda externa.
- Relatórios de ocupação/no-show.

Ao receber uma tarefa, sempre confirmar em qual fase do roadmap ela se encaixa antes de expandir escopo além do pedido.

---

## O que perguntar antes de assumir

- Se a tarefa pertence à v0 ou está adiantando escopo de v1/v2.
- Se envolve alteração de schema, confirmar se precisa de migration versionada via Supabase CLI.
- Se envolve mudança na engine de execução do fluxo, confirmar o impacto antes de alterar `engine-fluxo.ts`, para não quebrar conversas em andamento de outros usuários (ex: alguém no meio de uma etapa customizada quando a estrutura de `fluxo_etapas` mudar).
- Se envolve o builder de fluxo, confirmar se a mudança respeita as regras de construção (ordem fixa de `servico` → `horario`, unicidade de `campo_destino`) antes de alterar a UI ou a validação.