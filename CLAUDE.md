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

**`perfis.trial_expira_em` tem default `now() + 14 dias`, e nulo significa isenção.** A migration adiciona a coluna sem default, faz backfill por `created_at` e só então fixa o default — nessa ordem, quem já estava cadastrado conta os 14 dias do próprio signup em vez de ganhar 14 dias novos. Nulo é VIP/isenção manual: o trial nunca expira. `status_assinatura` tem check `in ('trial','ativo','cancelado')` porque **o controle é manual nesta fase** (sem gateway de pagamento): o valor é digitado à mão, e um typo cairia no default da regra — que é bloquear — deixando um cliente pagante sem bot, em silêncio.

### Gate de assinatura

`lib/assinatura.ts` é a **fonte única** da resposta "esta assinatura está válida?". Função pura, sem Supabase, porque os três consumidores leem o perfil por caminhos diferentes: o layout do dashboard com o client que respeita RLS, o webhook e o cron com o client admin. `ativo` libera; `cancelado` bloqueia; `trial` vale se dentro do prazo ou isento; **perfil ausente ou status desconhecido bloqueiam (fail-safe)** — a falha aceitável é "cliente reclama que parou", não "todo mundo usa de graça sem ninguém ver".

Três pontos de aplicação, com comportamentos deliberadamente diferentes:

- **`app/(dashboard)/layout.tsx` — soft.** Renderiza `components/banner-assinatura.tsx` e não bloqueia navegação: bloquear esconderia o próprio CTA de assinar, e o dono ainda precisa ver a agenda já marcada.
- **`app/api/webhook/whatsapp/[instance]/route.ts` — o bot silencia.** Não responde nada ao cliente final. Mandar "o estabelecimento não pagou" exporia problema comercial nosso na frente do cliente dele. O gate fica **depois** do tratamento de `qrcode`/`conexao`, para o painel não passar a mentir sobre a conexão justamente para quem precisa resolver a pendência.
- **`app/api/cron/enviar-lembretes/route.ts` — pula o tenant**, contando em `pulados_assinatura`, antes de qualquer query e fora do `try/catch` de isolamento (não é falha, é decisão).

O CTA do banner aponta para `wa.me` via `WHATSAPP_CONTATO`; sem a env var o banner aparece sem botão. Não propor gateway de pagamento, checkout ou webhook de cobrança sem pedido explícito.

### Um trial por número de WhatsApp

O gate acima responde "este trial acabou?", mas não impedia recomeçar: o único custo de criar conta é um e-mail novo, e e-mail é infinito e grátis. A chave de unicidade escolhida é **o número de WhatsApp que o dono pareia por QR code**, não o e-mail. Dois motivos: o pareamento é prova de posse mais forte que um OTP (exige a conta logada num aparelho com slot de dispositivo livre), e o trial só tem **valor** no número real do negócio — o que os clientes já têm salvo. Um chip pré-pago novo compra um número mas não compra tráfego: ninguém manda mensagem para ele. "Um trial por número" equivale na prática a "um trial por negócio real", com atrito zero para quem é honesto. Foi rejeitado, por desproporcional nesta fase: fingerprinting de dispositivo, bloqueio por IP (CGNAT móvel brasileiro), CPF/CNPJ e OTP por SMS.

**O número do dono já chegava no webhook e era descartado.** A Evolution manda em `data.wuid` no `CONNECTION_UPDATE` com `state: "open"` (já sem sufixo de dispositivo) e no `sender` de topo de todo webhook. `extrairNumeroDono` em `lib/bot/webhook-payload.ts` lê os dois, nessa ordem de preferência.

**O livro-caixa `trials_numero_whatsapp` fica deliberadamente FORA do `on delete cascade` de `auth.users` — sem FK nenhuma.** Toda outra FK do produto cascateia por LGPD, e um livro-caixa que cascateia é um livro-caixa que o abusador apaga sozinho: bastaria excluir a conta e recadastrar. Um `usuario_id` órfão aqui é o comportamento desejado. RLS habilitada com **zero policies**: nem para debug o dono precisa disso.

**Guarda `hmac_sha256(numero, TRIAL_HASH_PEPPER)`, nunca o número** (`lib/trial-numero.ts`). SHA-256 puro não bastaria: o espaço de telefones brasileiros é ~10¹¹, varrível. O pepper vive em env var e nunca no banco, então um dump da tabela não revela número nenhum — pseudonimiza, atende minimização (LGPD Art. 6º, III) e permite declarar finalidade única sob Art. 11, II, "g". **Trocar o pepper invalida o livro-caixa inteiro.**

**A decisão é denormalizada em `perfis.trial_bloqueado_em`**, não consultada no livro-caixa: os três gates já leem `perfis` por caminhos diferentes, e assim `lib/assinatura.ts` continua pura e sem rede. `trial_bloqueado_em` entra em `PerfilAssinatura` como campo **obrigatório**, de propósito — o TypeScript quebra em todo `select` que esquecer a coluna, em vez de deixar um gate cego.

`reivindicar_numero_trial(p_usuario_id, p_numero_hash)` é RPC e não query builder porque insert-condicional, leitura do dono e update do perfil precisam ser uma transação. Idempotente (`CONNECTION_UPDATE open` chega várias vezes) e tolerante a uma conta trocar de número. Duas propriedades que não são óbvias:

- **O bloqueio é grudento.** O caminho `'liberado'` **não** limpa `trial_bloqueado_em`: se limpasse, bastaria parear um chip novo para se auto-desbloquear.
- **Sinais manuais vencem o automático.** `status_assinatura = 'ativo'` e `trial_expira_em is null` (VIP) liberam mesmo bloqueado — um cliente que pagou nunca pode ser barrado por já ter testado, e aquele nulo só é gravado à mão.

#### Runbook de desbloqueio (falso-positivo legítimo)

Salão vendido, número trocado, conta recriada de boa-fé. É para esses casos que o banner tem texto próprio (`numero_ja_usou_trial`) dizendo a regra em voz alta: quem foi barrado por engano precisa querer nos procurar.

**Limpar só `trial_bloqueado_em` não resolve, e o sintoma volta sozinho.** A RPC roda a cada `CONNECTION_UPDATE` com `open`, e enquanto a linha do livro-caixa apontar para a outra conta ela regrava o bloqueio — o `where trial_bloqueado_em is null` que preserva o primeiro instante é exatamente o que torna o campo limpo elegível de novo. Na prática: o suporte limpa, o banner some, o bot volta, e à noite o celular do dono reconecta e tudo silencia outra vez, com um `console.warn` idêntico ao de abuso real. **Os dois passos são obrigatórios, nesta ordem:**

```sh
# 1. Hash do número (mesmo pepper da produção; o formato é só dígitos, com DDI)
TRIAL_HASH_PEPPER=<pepper> node -e "console.log(require('node:crypto').createHmac('sha256', process.env.TRIAL_HASH_PEPPER).update('5511999998888').digest('hex'))"
```
```sql
-- 2. Apagar a reivindicação ANTES de limpar a flag: na ordem inversa, uma
--    reconexão na janela entre os dois comandos rebloqueia na hora.
delete from trials_numero_whatsapp where numero_hash = '<hash-do-passo-1>';
update perfis set trial_bloqueado_em = null where id = '<uuid-do-dono>';
```

Feito isso, a próxima reconexão reivindica o número para a conta nova e ela volta a contar os 14 dias do próprio signup. A alternativa de um passo é `status_assinatura = 'ativo'`, que também é durável — mas só use se a pessoa realmente pagou, porque marca como pagante quem não é. Não use `trial_expira_em = null` para isso: aquilo é isenção VIP permanente, não correção de engano.

O one-liner acima duplica a lógica de `lib/trial-numero.ts`. `lib/trial-numero.test.ts` fixa o hash de um vetor conhecido justamente para que os dois não possam divergir em silêncio: se a implementação mudar, o teste quebra e este runbook precisa ser revisto.

**A reivindicação tem fail-safe permissivo, ao contrário do gate de assinatura.** Pepper ausente, `wuid` ausente ou RPC com erro registram e seguem. O inverso é intencional: a falha aqui é nossa (env var, versão da Evolution), e o custo de errar para o lado permissivo é um trial reciclável — errar para o lado restritivo bloquearia todo mundo que conecta, inclusive quem paga.

Ainda **não** implementado, e adiado de propósito: canonicalização de e-mail (dots e `+tag` do Gmail), bloqueio de domínio descartável e log de IP de signup via `before_user_created` hook. Com o trial atrelado ao número, N contas por e-mail rendem N trials **inúteis**, então aquilo deixa de proteger receita e passa a proteger só recurso (sockets Baileys). Fazer quando incomodar.

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

## Uso em celular e tablet

O dono opera isto **entre atendimentos, no celular, com uma mão**. O dashboard nasceu desktop-first, e as decisões abaixo existem para corrigir isso. Não desfazer sem entender o que cada uma resolve.

**O piso de toque mora em `components/ui/button.tsx`, não espalhado nas telas.** Este é o estilo `radix-nova`, muito mais compacto que o shadcn clássico: `default` é `h-8` (32px) e `sm` é `h-7` (28px). Cada `size` ganhou um `max-md:` — 44px nos principais, 40px no `sm` — para que o próximo botão do produto nasça certo sem ninguém lembrar da regra. `xs`/`icon-xs` ficaram de fora de propósito: são de contexto denso, e crescer quebraria o layout. Onde um alvo pequeno for inevitável, usar o idioma que já existe em `components/ui/switch.tsx`: `after:-inset-x-3 after:-inset-y-2` estende a área sem mexer no desenho. O piso de referência é o **mínimo AA de 24px** da WCAG 2.2 SC 2.5.8, incluindo o teste de espaçamento entre alvos vizinhos; 44px é a meta de conforto.

**Campo com fonte menor que 16px dá zoom no iOS e não desfaz.** O padrão é `text-base md:text-sm`, como em `components/ui/input.tsx`. Vale para `<input>`, `<select>` e `<textarea>` — a tela de horários tem dois selects por faixa, sete dias, e cada toque ampliava mais a página. **Não** resolver com `maximum-scale=1`: aquilo reprova a WCAG 1.4.4. Uma regra em `@layer base` também não resolve — utilitário do Tailwind fica numa camada posterior e vence.

**`viewportFit: "cover"` em `app/layout.tsx` é pré-requisito, não enfeite.** Sem ele `env(safe-area-inset-*)` resolve para **zero**, e a barra de abas inferior fica embaixo da barra de gestos do iPhone.

**A navegação é uma ilha de cliente dentro de um layout RSC.** `components/navegacao-dashboard.tsx` é o único `"use client"` do shell: `app/(dashboard)/layout.tsx` continua Server Component lendo sessão e perfil. Só a barra hidrata, porque marcar a página atual exige `usePathname`. São **quatro** abas e não cinco (`ABAS_PRINCIPAIS` / `ITENS_EXTRAS`): cinco destinos dariam ~65px cada em 375px, e eles não têm a mesma frequência — agenda é diária, fluxo é configuração inicial, WhatsApp só importa quando a conexão cai. O ícone vai por chave num mapa (`ICONES`), não por prop: componente React não atravessa a fronteira RSC → client.

**A agenda tem duas visões da mesma query, escolhidas por CSS.** `md:hidden` / `hidden md:block` na página, **nunca** `matchMedia`: a decisão fica na folha de estilo, então não há client component, não há divergência de hidratação e a primeira pintura já vem certa. A grade de 7 colunas tem `min-w-[44rem]` e é impossível em tela estreita — a 375px mostra 46% dela, com a calha de horas saindo do campo de visão no primeiro arrasto. `lib/agenda-lista.ts` deriva a lista do dia do **mesmo `Calendario`** que a grade desenha, sem segunda query e sem refazer conversão de fuso. `?dia=` implica a semana que o contém, então não há dois parâmetros para manter sincronizados.

**Reordenar o fluxo é por botão; arrastar é o extra.** Ver `moverEtapa`/`podeMover` em `lib/validacao/fluxo.ts`. O arraste não funcionava em toque: a alça tinha ~20×14px e o `PointerSensor` com `distance` perdia o gesto para o scroll antes do limiar. As setas resolvem toque, teclado e leitor de tela de uma vez, e — diferente do drag — são testáveis fora de um navegador. A alça continua a partir de `sm`, com `touch-none` (a doc do dnd-kit é explícita: é a única forma de impedir o scroll em pointer events, e tem de ficar **só na alça**) e `activationConstraint: { delay: 250, tolerance: 5 }`.

**No celular o QR code é logicamente impossível** — o código está na mesma tela que precisaria fotografá-lo. Por isso `obterQrCode(instancia, numero?)` e `criarInstancia(usuarioId, numero?)` aceitam o número: sem ele o Baileys nunca chama `requestPairingCode` e `pairingCode` volta `null` (era o caso, e a UI de fallback do painel era código morto). Passar nos **dois** não é redundância: medido contra a 2.3.7, o controller só honra o `number` do `/instance/connect` quando o estado é `close`; em `connecting`/`open` devolve o QR em cache. Criar com `number` é o caminho que de fato produz o código no primeiro acesso. `lib/telefone.ts` normaliza o que o dono digita — e **não** serve para responder mensagem: a identidade do cliente final continua sendo o `remote_jid`.

**Os diálogos têm `max-h-[calc(100svh-2rem)] overflow-y-auto`.** Sem isso, com o teclado aberto num 375×667, o diálogo de editar serviço ficava cortado **e sem rolagem** — os botões Salvar/Cancelar não existiam para quem estava no celular. `svh` e não `dvh`: `dvh` é remedido a cada retração da barra do Safari e o diálogo mudaria de altura durante o scroll. Abaixo de `sm` ele ancora perto do rodapé, com folga em vez de rente — rente exigiria `pb` de safe-area, e o `-mb-4` do `DialogFooter` abriria uma fresta do tamanho do inset.

**O PWA para em ícone e standalone.** `app/manifest.ts` mais `app/icon.tsx` / `app/apple-icon.tsx`, gerados por `ImageResponse` (embutido no Next, sem binário no repositório e sem dependência nova). Não há offline nem push: os dois exigem service worker, que o Next não gera. `start_url` é `/agendamentos` e não `/` — quem instalou já é cliente.

---

## A marca

**Uma fonte, quatro recortes.** `public/agendazap-icon.png` é 500×500 com fundo transparente, e o desenho ocupa só **51,8%** do quadro (medido: bbox de 259px, ~24% de margem em cada lado). Essa margem atrapalha em todo destino, então `lib/marca.ts` guarda a fração e a conta de ampliar-e-recortar; `lib/marca-servidor.tsx` compõe para os geradores de ícone e `components/marca.tsx` para a UI. **Ao trocar o PNG, remedir `FRACAO_DESENHO`** — `lib/marca.test.ts` trava o valor justamente para isso não passar em silêncio.

**Ocupação por destino, e por quê:** favicon 94% (a 32px a margem é desperdício puro), ícone `any` 84% (o web.dev pede "sem padding extra"), `apple-icon` 70%, maskable 66%. As margens de `any` e `maskable` são **opostas** — por isso são arquivos diferentes, não o mesmo declarado duas vezes.

**Fundo transparente quebra em dois lugares, e os dois foram corrigidos.** O iOS compõe `apple-touch-icon` sobre **preto**, então `app/apple-icon.tsx` tem fundo opaco. No Android, a spec do manifesto diz que o UA compõe sobre *"a solid fill of the user agent's choice"* — e **não** consulta o `background_color`; daí `app/icone-mascara/route.tsx`, com fundo opaco e o desenho a 66% (raio efetivo 33%, dentro da safe zone de 40%). Essa rota mora fora do `app/icon.tsx` de propósito: cada item de `generateImageMetadata` vira uma `<link rel="icon">` no `<head>`, e a variante de fundo cheio não deve concorrer a favicon de aba.

**Dois detalhes que custam um build para descobrir.** Em rota de metadata dinâmica, `id` chega como **Promise** — `handler({ params, id: idPromise })`; sem `await`, `Number(id)` é `NaN`. E no `components/marca.tsx` o `max-w-none` é obrigatório: o reset do Tailwind põe `max-width: 100%` em imagem, o que encolheria a imagem ampliada de volta ao contêiner e anularia o recorte.

**Ler o PNG com `readFile`, nunca `import`.** O `ImageResponse` tem teto de 500 KB de bundle e conta imagens; um `import` colocaria os 87 KB dentro do bundle de cada rota.

**Verde e roxo vivem na marca; a UI é teal.** O símbolo é verde `#0EC962` (2,13:1 no papel) e roxo `#7947E4` — nenhum dos dois existe em `app/globals.css`, e não deve passar a existir. Logotipo não é componente de UI: o SC 1.4.3 isenta texto de logo, e o SC 1.4.11 não alcança o símbolo porque ele não é *"required to understand the content"* — quem carrega o significado é a palavra "AgendaZap" ao lado. É por isso que `components/marca.tsx` usa `alt=""`, e é essa decoratividade que sustenta a isenção. **A isenção evapora se a cor virar funcional**: ícone de status, botão ou borda de foco em verde voltam a exigir 3:1 e reprovam.

A palavra ao lado do símbolo fica em `text-foreground`, não em `text-primary` — com o mark colorido, o teal na tipografia daria três famílias de cor no mesmo cabeçalho, e o teal precisa continuar significando "elemento interativo".

**Reserva conhecida, não bloqueante:** o relógio roxo do desenho some abaixo de ~24px e fica em 2,92:1 contra o card escuro. Se o mark for refeito um dia, o pedido certo é "remover o relógio, manter balão + calendário + raio" — três elementos, não quatro.

**O que só um navegador verifica.** O jsdom não tem engine de layout nem cascata CSS: `getBoundingClientRect()` devolve zero, `matchMedia` não existe e classe do Tailwind é string opaca. Um `toHaveClass("min-h-11")` afirma que a classe foi escrita, **não** que o pixel tem 44. Tamanho real de alvo, overflow, media query aplicando, zoom do iOS, safe area e teclado virtual pedem aparelho ou emulação de device — testar a 375×667 e 768×1024 ao mexer em layout. `@testing-library/jest-dom` e `user-event` **não** estão instalados: os testes de componente usam `fireEvent` e asserção sobre atributo.

---

## Estrutura de pastas esperada

```
/app
  layout.tsx                          → fontes, tema, e o `viewport` (safe area, themeColor)
  manifest.ts                         → PWA: ícone na tela inicial e abertura em standalone
  icon.tsx / apple-icon.tsx           → ícones gerados por ImageResponse, sem binário no repo
  /(marketing)
    page.tsx
    menu-secoes.tsx                   → Sheet com as âncoras da landing abaixo de `sm`
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
/components
  navegacao-dashboard.tsx             → ilha de cliente: barra de abas no celular, header no desktop
  calendario-semana.tsx               → grade de 7 colunas, só a partir de `md`
  agenda-lista.tsx                    → lista do dia com seletor de data, abaixo de `md`
/lib
  supabase/
    server.ts                        → client respeitando RLS
    admin.ts                          → client com service role key
  evolution-api.ts                    → funções: criar instância, gerar QR code, enviar mensagem, checar status
  telefone.ts                         → normaliza o número do dono para o código de pareamento
  calendario.ts                       → layout da grade semanal (puro)
  agenda-lista.ts                     → deriva a lista de um dia do mesmo Calendario (puro)
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

### O que o estado da Evolution diz, e o que não diz

Estas quatro coisas foram medidas contra o servidor 2.3.7 real e contra o fonte da Evolution. Cada uma custou um bug.

**`connecting` NÃO significa que alguém leu o QR.** É o estado **inicial** do socket Baileys, emitido na abertura, antes de existir código na tela — o `CONNECTION_UPDATE` chega 327ms depois do create, e `/instance/connectionState` responde `connecting` por toda a sessão de pareamento, até virar `open`. O tipo do Baileys tem só três valores (`open`/`connecting`/`close`) e nenhum distingue "QR exibido" de "QR lido". O painel já tratou `connecting` como leitura e anunciava "Código lido" dois segundos depois de o QR aparecer, sem ninguém ter escaneado nada.

**Detectar a leitura não é possível nesta versão.** O Baileys emite `connection.update { isNewLogin: true }` no `pair-success` e `receivedPendingNotifications` no fim da sincronização, mas a Evolution desestrutura só `{ qr, connection, lastDisconnect }` e descarta os dois — nenhum endpoint, nenhum webhook. Entre a leitura e o `open` ela é literalmente muda: o WhatsApp força `restartRequired` (515) e o ramo de close reconecta sozinho sem emitir evento. **Não reintroduzir estado intermediário de "sincronizando" sem um sinal real.** Também não adianta inferir por `count` congelado (latência de ~50s, dispara quando já está `open` há um minuto) nem por `ownerJid`/`profileName` (gravados no mesmo update que `connectionStatus: 'open'`).

**`GET /instance/connect` não regenera QR e não consome o `QRCODE_LIMIT`.** Numa instância em `connecting` ele devolve o código **em cache** — três chamadas em 9s deixaram `count` em 4. Quem roda o relógio é o servidor, a cada `qrTimeout` de 45s, com ou sem aba aberta. Consequência: uma contagem regressiva local que reinicia a cada busca acumula erro de fase e exibe código morto dizendo que vale. Por isso `lib/qr-pareamento.ts` decide pelo `count` do servidor, e não pelo relógio do cliente; a validade de 45s é só display.

**Estado transitório não se persiste.** `perfis.status_conexao_whatsapp` só tem `conectado`/`desconectado`, então gravar `conectando` virava `desconectado` — a cada 2-5s durante todo o pareamento, com corrida contra o `CONNECTION_UPDATE open` do webhook. `verificarConexao` agora só grava conclusão.

**`disconnectionReasonCode` viaja só no `STATUS_INSTANCE`**, que por isso está em `NOME_EVENTOS_WEBHOOK`. O `CONNECTION_UPDATE` de queda diz que caiu, nunca por quê — e a diferença importa: `401` (`loggedOut`) é o dono tendo desvinculado o aparelho e só re-parear resolve, o resto é transitório. Hoje o handler apenas registra; persistir para diferenciar o texto do box "WhatsApp desconectado" exigiria coluna nova. A assinatura só passa a valer depois de `configurarWebhook` rodar de novo na instância, o que `gerarQrCode` faz a cada chamada.

**Ao testar contra a Evolution, nunca tocar na instância de produção.** `logout`, `delete`, `restart` e `connect` na instância do dono derrubam o WhatsApp do negócio. Criar `zz-teste-…` descartável e apagar ao final, conferindo com `fetchInstances`.

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