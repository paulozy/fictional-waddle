# CLAUDE.md

Este arquivo orienta o Claude Code (e qualquer instância do Claude) ao trabalhar neste repositório. Leia por completo antes de gerar ou alterar código.

## Visão geral do produto

**Nome:** **Encaixaria** (`encaixaria.com.br`). O nome anterior, "AgendaZap", foi abandonado por um motivo que não é estético: **10+ produtos homônimos no mesmo nicho** no Brasil (`agendezap.com.br`, `agendazap.me`, `appagendazap.com`, `agendazap.app`, `agendazap.top`, `agenda-zap.com`, `minhaagendazap.com`, e um `agendazap-ai.vercel.app` já indexado), todos de agendamento por WhatsApp para salão/barbearia/clínica. Buscar a marca era uma consulta ambígua que o Google resolve por sinais de entidade — domínio de correspondência exata, links, menções — e não por markup, então nenhum esforço de SEO técnico tornaria o produto encontrável pelo nome. "Encaixaria" foi escolhido por ter busca exata **sem nenhuma entidade comercial** (só verbetes de dicionário), `.com.br` e `.com` livres, e significado transparente para o dono ("onde se dá encaixe", com a terminação de barbearia/padaria). **Evitar o sufixo `-zap` em qualquer nome derivado**: é onde mora a saturação. Uma busca de anterioridade no INPI (classes 42 e 35) segue pendente — não foi possível consultar o portal. **O `.com.br` ainda NÃO foi registrado** (situação em 2026-08-11). O endereço em produção é **`https://encaixaria.newgensoftware.xyz`**, subdomínio do domínio da empresa, e é esse o valor de `SITE_URL` — que **precisa estar definida na Vercel**, senão `canonical`, `og:url` e sitemap voltam a anunciar o alias `*.vercel.app` em silêncio. Se o `.com.br` for registrado depois, é só esse valor que muda, mas todo material de divulgação já publicado carrega o endereço escrito à mão e precisa ser revisto no mesmo dia.
**O que é:** SaaS de nicho que automatiza agendamento e triagem via WhatsApp para negócios de serviço com horário marcado (salões, clínicas, barbearias, esteticistas). O bot responde **pelo próprio número de WhatsApp do estabelecimento**, mostra horários disponíveis, confirma agendamento e envia lembrete automático.

**Problema que resolve:** o dono/atendente perde agendamento porque não consegue responder mensagem na hora (está atendendo outro cliente), e o cliente desiste e procura concorrente. Também reduz falta (no-show) via lembrete automático.

**Modelo de negócio:** assinatura mensal em **duas faixas** — **Essencial R$ 49,90** e **Garantido R$ 64,90** (`lib/plano.ts` é a fonte única: landing, `/precos`, `/termos`, a FAQ, as páginas de comparação e a tela da Conta leem daí, e nenhum preço é escrito à mão em página nenhuma).

**Os nomes são comerciais; o banco não mudou.** `perfis.plano` continua valendo `basico` e `sinal`, que é o que `lib/pagamentos/capacidade.ts` e a constraint `perfis_plano_valido` leem. `nomeDoPlano`/`precoDoPlano` fazem a ponte. Renomear a coluna para acompanhar o nome de venda custaria uma migration e um gate de capacidade em troca de nada. **Nenhum nome cita Pix nem Mercado Pago**, de propósito: o PSP é decisão de implementação (três alternativas foram descartadas, ver a seção do sinal), e um plano chamado "Pix" obrigaria a renomear o produto no dia em que o provedor mudar.

O número tem ancoragem medida, e mexer nele sem refazer a pesquisa desfaz o raciocínio. A mediana do nicho "bot que **agenda** por WhatsApp" é ~R$ 90: RobotiZap R$ 89,90 (plano único, API oficial da Meta), AgendeZap Profissional R$ 89,90, agendazap.me Básico R$ 99,90. Abaixo disso o mercado só tem tier de lembrete-só (AgendeZap Start R$ 39,90) ou teto de volume (R$ 29,90/100 créditos; R$ 49,99/150 agendamentos). No grupo estabelecido: Trinks R$ 76 (1-2 profissionais), AppBarber R$ 79,90, Avec R$ 88,90, Booksy R$ 99,99, Belasis R$ 99.

Três consequências que não são óbvias:

- **Não empatar com a mediana.** A R$ 89,90 o comprador compara feature por feature, e aí a Encaixaria perde em quase toda linha (sem API oficial, sem financeiro, sem comissão, sem cobrança de sinal, sem multi-profissional, sem prova social). A R$ 49,90 a pergunta muda de "qual é melhor" para "eu preciso de tudo aquilo?", que é a pergunta que a Encaixaria ganha.
- **Não descer para R$ 39,90.** É exatamente o tier de lembrete-só do AgendeZap: precificar ali comunica "sou ferramenta de lembrete", e o bot que agenda é justamente o que existe aqui.
- **Os R$ 19,90 anteriores estavam abaixo do piso da categoria inteira.** O argumento decisivo para subir não é infra (o socket Baileys custa uns R$ 2-4/tenant) — é que **sem gateway cada conversão é uma conversa de ~20 min no WhatsApp mais suporte recorrente**, e vinte reais não pagam isso. Subir depois, sem gateway, é uma conversa individual com cada cliente: a janela barata é antes dos pilotos converterem.

**Duas faixas, e o eixo é capacidade — nunca tamanho.** O argumento contra escalonar por porte continua valendo inteiro: o único eixo que o mercado usa é número de profissionais, e o produto é declaradamente "um estabelecimento, um número", então cobrar por cadeira exigiria prometer multi-profissional, que não existe. "Não conto cadeira, cliente nem mensagem" segue sendo frase que só a Encaixaria diz no nicho, e vale nos **dois** planos. O que justifica a segunda faixa é que a cobrança de sinal passou a existir de fato e **não é grátis para nós** — cada tenant com ela ligada é uma conexão OAuth para renovar, um webhook de pagamento para atender e um caminho de devolução para suportar. Embutir isso na faixa de quem não cobra sinal faria a maioria pagar pela minoria.

Duas consequências de redação que não são óbvias, e desfazê-las custa cliente:

- **O Essencial é apresentado como completo, não como versão reduzida.** Ele resolve inteiro o problema que o produto existe para resolver; o Garantido resolve um segundo problema, que não é de todo mundo. Uma página que empurra o plano de cima faz o dono de salão pequeno pagar por uma conta de Mercado Pago que ele nunca vai conectar — e quem assinou o plano errado cancela.
- **A exigência de conta no Mercado Pago aparece junto do preço, nunca só na tela de conexão.** Descobrir depois de assinar que precisa abrir conta em outro lugar é a pior hora possível. Por isso o cartão do Garantido diz isso e linka `/precos#mercado-pago`, que é a seção que explica o motivo sem citar norma nenhuma (ver `MERCADO_PAGO_PORQUE` em `lib/plano.ts`).

Mais faixas continuam fora: cada uma é trabalho manual permanente num campo digitado à mão, onde typo = cliente pagante sem bot.

**ROI, com fonte.** Corte a R$ 50-65 na maior parte do país, então **uma falta evitada paga o mês**. A base defensável para o efeito de lembrete é Cochrane CD007458 (comparecimento 67,8% → 78,6%) e meta-análise de SMS (RR 0,77, ~23% menos falta) — evidência de **saúde**, não de barbearia: usar como ordem de grandeza, nunca como promessa. Os "20-30% de falta caem para 3%" que aparecem em toda busca são material de venda de fornecedor, sem metodologia; **não citar**.

**Trial de 14 dias é ativo, e era usado como detalhe.** É o dobro dos 7 dias do RobotiZap, AgendeZap, agendazap.me e Booksy. Não passar a pedir cartão: sem gateway não haveria como cobrar depois, e o trial-por-número já resolve o abuso.

**Diferencial competitivo:** roda 100% dentro do WhatsApp que o cliente final já usa — sem exigir download de app separado (diferente de concorrentes como Booksy/Trinks). Deixar isso explícito na landing page.

**Mas "sem app" não é exclusivo, e isso importa na redação.** O **RobotiZap** (R$ 89,90, plano único) tem o mesmo pitch quase palavra por palavra — *"Seu cliente já está no WhatsApp. Por que pedir pra ele baixar mais um app?"* — usa **API oficial da Meta** em vez de Baileys, e **ataca o QR code na própria FAQ**, dizendo que é *"um pouco mais instável"*. Consequências: o argumento "sem app" vale contra Booksy/Trinks/AppBarber, **não** contra o nicho; e a fragilidade da conexão deve ser dita por nós primeiro (o painel avisa, reconecta em um minuto) — dita pelo concorrente antes, soa como algo que escondemos. Também não vender IA: metade do nicho vende, aqui é menu numerado, e o menu é virtude real (funciona com cliente de qualquer idade e internet ruim).

**Não é escopo deste produto (evitar scope creep):**
- Não é um CRM completo de clientes.
- Não recebe o pagamento do serviço. **Cobrar sinal por Pix existe no plano Garantido** (ver a seção própria), e mesmo nela o dinheiro nunca passa por nós: o dono conecta a conta dele e o Pix pousa lá. Financeiro, comissão e controle de caixa continuam fora.
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
| Pagamento (plano Garantido) | **Mercado Pago via OAuth**, modelo *nunca custodiar* | O dono autoriza a própria conta; a cobrança é criada com o token dele e o Pix cai direto nele. Pix a 0%, aceita CPF. Alternativas foram investigadas e descartadas com motivo — ver a seção de sinal |

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
| `log_envio` | Registro de lembretes enviados. O CHECK aceita `tipo = 'confirmacao'`, mas **nada escreve esse valor**: o único escritor é o cron, sempre com `'lembrete'`. A confirmação sai pelo webhook e não é registrada |
| `log_conexao` | Histórico append-only de transições de conexão e de motivo de queda. Único escritor é o webhook |
| `credenciais_pagamento` | Tokens OAuth do PSP do dono, **cifrados**. RLS com zero policies |
| `cobrancas_sinal` | Rastro de cada Pix de sinal: id no provedor, valor, prazo, desfecho |

`conversas_estado` também guarda `pausado_ate` — ver "Pausa para atendimento humano".

### Decisões de schema que não são óbvias

Estas existem por um motivo concreto. Mexer nelas sem entender o motivo reintroduz o bug que elas resolvem.

**`perfis` guarda a configuração de agenda.** `fuso_horario` (default `America/Sao_Paulo`) é obrigatório porque `horarios_disponiveis.hora_inicio` é hora de parede e só converte para instante com o fuso do negócio — o runtime da Vercel roda em UTC e nunca serve de referência. `passo_slot_minutos` define de quantos em quantos minutos um slot começa, independente da duração do serviço. `antecedencia_minima_minutos` evita oferecer horário para "daqui a 3 minutos"; `antecedencia_maxima_dias` limita o horizonte de busca.

**`agendamentos` guarda `duracao_minutos` e `data_hora_fim` como colunas.** A duração é snapshot: se o dono editar o serviço depois, o histórico e o cálculo de disponibilidade continuam corretos. `data_hora_fim` é coluna real e não `generated` porque `timestamptz + interval` é STABLE, não IMMUTABLE — o Postgres rejeita a expressão em generated column e em expressão de índice, e a constraint EXCLUDE precisa dela. Quem preenche é o trigger `agendamentos_preencher_fim`, então o app pode omitir a coluna.

**Double-booking é resolvido no banco, não na aplicação.** "Consultar disponibilidade e depois inserir" sempre perde quando dois clientes escolhem o mesmo slot no mesmo segundo. A constraint `agendamentos_sem_sobreposicao` (`exclude using gist`, parcial em `status = 'confirmado'`, exige a extensão `btree_gist`) é a única garantia real. Violação levanta **SQLSTATE 23P01**, que é caminho de UX e não erro genérico: a engine reapresenta a etapa de horário com a lista recalculada.

**A identidade do cliente final é o `remote_jid`, não o telefone.** O WhatsApp está migrando para Linked IDs: o JID pode chegar como `154417159582282@lid`, sem telefone nenhum. Por isso `clientes_finais.remote_jid` e `conversas_estado.remote_jid` são `not null` e carregam o unique, enquanto `telefone` é best-effort e pode ser nulo. Nunca reconstruir número (DDI, 9º dígito): responder sempre ao JID que chegou, e mandar o lembrete para o JID guardado no primeiro contato.

**`conversas_estado` tem quatro colunas que a spec original não previa.** `fluxo_snapshot` guarda as etapas ativas ordenadas no momento em que a conversa começou — é o que protege conversas em andamento de uma reordenação feita pelo dono no meio do caminho (conversas em voo terminam na versão em que começaram). `etapa_atual_id` **não** tem FK para `fluxo_etapas` de propósito: a autoridade é o snapshot, e um `on delete set null` faria a conversa parecer nova. `ultima_mensagem_id` dá idempotência contra retry de webhook e reemissão do Baileys. `versao` permite compare-and-set: o supabase-js não tem transação client-side nem `select ... for update` (o PostgREST auto-commita cada statement), então a proteção contra duas mensagens quase simultâneas é um `update ... where versao = $lida` — zero linhas afetadas significa que outra requisição ganhou. Um único statement resolve idempotência e corrida juntas.

**Conversa expira na leitura, sem cron.** `atualizado_em` mais antigo que 6h é tratado como conversa nova.

**`log_envio` tem índice único parcial em `(agendamento_id, tipo) where tipo = 'lembrete'`.** O cron insere **antes** de enviar, com `on conflict do nothing`: se o insert não criou linha, alguém já enviou. Sem isso, um redeploy ou retry manda dois lembretes ao cliente.

**`log_conexao` grava transição, não evento — e são duas linhas independentes, não uma enriquecida.** `perfis.status_conexao_whatsapp` é estado atual e sobrescrito: uma sessão que cai e volta não deixava rastro nenhum, e "o bot funcionou mais ou menos" ficava indistinguível de "o WhatsApp caiu na terça" — que é a hipótese mais provável, porque o QR code é a fragilidade conhecida da stack. Três coisas que mexer nelas reintroduz o bug que elas resolvem:

- **A dedup é a feature.** O webhook compara com `perfil.status_conexao_whatsapp` (que já vem no `select` do topo, sem query nova) e só grava quando muda. `CONNECTION_UPDATE` chega várias vezes, e durante o pareamento cada tick de `connecting` colapsa para `desconectado`: sem a comparação seria uma linha a cada 2-5s, afogando o sinal. Com ela, um pareamento inteiro é **uma** linha e cada oscilação são duas.
- **`estado` usa o vocabulário de 2 valores de `perfis`, não os 3 de `traduzirEstado`.** Persistir `conectando` já foi bug uma vez.
- **`motivo_codigo` vem em linha separada porque chega em outro webhook.** `disconnectionReasonCode` viaja só no `STATUS_INSTANCE`, e a Evolution não garante ordem contra o `CONNECTION_UPDATE`. Fazer o segundo evento atualizar "a última transição" custaria uma leitura extra e assumiria uma ordenação que não existe. Log é sequência de observações; quem lê correlaciona por tempo. Há três pontos de escrita, e o terceiro é o caminho de recuperação por mensagem — sem ele, um `CONNECTION_UPDATE` perdido apareceria como conexão que caiu e nunca voltou.

Diferente de `trials_numero_whatsapp`, esta tabela **cascateia** com `auth.users`: é dado operacional do próprio tenant, sem nada a proteger contra ele. A escrita é fail-open (erro só vira `console.error`) — trocar a atualização de `status_conexao_whatsapp` por uma linha de log seria o negócio errado. Ainda **não** existe retenção; a mitigação, quando incomodar, é um `delete` por idade no cron.

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

### Cobrança de sinal por Pix (plano Garantido)

O bot pode pedir um sinal antes de fechar o agendamento, segurando o horário até
o Pix cair. Desligada por padrão: exige `perfis.plano = 'sinal'` **e** a conta do
PSP conectada. O gate é `lib/pagamentos/capacidade.ts`, função pura no molde de
`lib/assinatura.ts`, com os dois campos **obrigatórios** no tipo pelo mesmo
motivo de `trial_bloqueado_em` — o TypeScript quebra no `select` incompleto em
vez de deixar o gate cego.

**O eixo é regulatório, não técnico.** O art. 90-A do Regulamento do Pix
(Res. BCB 269/2022) veda a "conta bolsão": ninguém pode receber Pix por meio de
conta transacional provida por terceiro. Logo o dinheiro **tem** de pousar numa
conta do próprio dono, e o único modelo viável para dev solo é *nunca custodiar*
— ele autoriza a conta dele por OAuth, a cobrança é criada com o token dele, e o
`collector_id` é ele por construção. **Não passar `application_fee` e não propor
split** é o que mantém isso verdadeiro. (O spike citava a Res. 522/2025; aquela
trata de *subcredenciador*, figura de arranjo de **cartão**, e é a citação errada
para Pix.)

**Três provedores foram descartados com motivo, e reabrir custa a mesma
pesquisa.** "Sem conta para o dono" **não existe** — é norma, não limitação de
PSP. **AbacatePay** é carteira: os Termos só permitem saque "para contas de mesma
titularidade", então não há como pagar o dono, e o split está "em
desenvolvimento" sem data. **Stripe** tem Pix *invite-only* no Brasil, exigindo
**60 dias de pagamentos já processados** (pré-requisito circular para quem é
pré-receita), e o Brasil está fora dos cross-border payouts, o que fecha o
Connect. **Asaas/Iugu/Pagar.me** oferecem onboarding embutido de verdade, mas
exigem **CNPJ nosso**, movem o atrito em vez de removê-lo (selfie e documento
passam a ser coletados por nós, contra a linha de LGPD do projeto) e custam
R$ 1,99 fixo ou preço não público — 10% de um sinal de R$ 20.

#### Decisões de schema que não são óbvias

**Não existe `status = 'aguardando_sinal'`, e criar um reintroduz um bug já
resolvido.** O agendamento nasce `confirmado` e portanto **bloqueia o slot desde
o primeiro instante**, pela `agendamentos_sem_sobreposicao` que já existia; o
sinal vive em `sinal_status`/`sinal_expira_em`. O argumento está escrito em
`20260730025014_cancelamento_agendamento.sql`: `status` participa da EXCLUDE
parcial e de três `.eq("status","confirmado")` no app, então um valor a mais
obrigaria todo lugar que pergunta "está ocupado?" a conhecer os dois — e o
primeiro que esquecesse um reofereceria vaga já reservada. Vencido o prazo, o
agendamento é **cancelado** pela máquina que já existe, o que libera o slot sem
nenhuma regra nova.

**`sinal_aguardando_tem_prazo` existe porque `null < now()` é NULL, não falso.**
Um sinal exigido com prazo nulo nunca venceria, e o horário ficaria bloqueado
para sempre — exatamente o bug que a migration de cancelamento existiu para
eliminar.

**`cancelado_por` ganhou `'sistema'`.** A expiração não é decisão de ninguém;
atribuí-la a `'dono'` faria o relatório de ocupação da V2 culpar quem não
desmarcou.

**As colunas de sinal ficam FORA do `grant update` de `authenticated`, e isso é a
feature.** `sinal_status` é a afirmação de que dinheiro entrou: se o dono pudesse
escrevê-la com a anon key e o próprio JWT, o registro deixaria de valer como
prova numa disputa. Quem escreve é sempre o webhook de pagamento, via service
role, e só depois de reconsultar o PSP. Pelo mesmo motivo `plano` e
`pagamento_conectado_em` continuam fora — quem os escrevesse se autoconcederia a
capacidade.

**`credenciais_pagamento` e `cobrancas_sinal` levam `revoke all from anon,
authenticated` antes do grant.** O `alter default privileges` do Supabase concede
`Dxtm` em toda tabela nova, e **TRUNCATE não passa por RLS** — sem o revoke,
qualquer dono logado apagaria o registro financeiro de todos os tenants. É o
mesmo raciocínio de `trials_numero_whatsapp`.

**O token é cifrado com AES-256-GCM (`lib/cripto.ts`), não hasheado**: diferente
do trial por número, aqui o valor precisa **voltar** para assinar a chamada. GCM
e não CBC porque adulterar o texto cifrado tem de **lançar**, não devolver bytes
diferentes — um token trocado no banco significaria emitir cobrança para a conta
errada. A chave vive em `PAGAMENTO_CRYPTO_KEY` e **trocá-la invalida todas as
conexões**.

#### O plano é escolhido no cadastro; a troca é manual

O trial pode nascer **no Garantido**: o passo 2 do cadastro
(`app/(auth)/registro/estabelecimento/escolha-plano.tsx`) mostra os dois cartões
lidos de `PLANOS`, e a escolha vai para `perfis.plano`. Antes disso, quem clicava
no cartão do Garantido em `/precos` caía num trial Essencial sem nenhum caminho na
interface para dizer o que queria.

**O `grant update` de `plano` continua fechado — nada foi afrouxado.** Quem escreve
é `escolher_plano_trial(p_plano)`, e a guarda tem quatro condições porque **três
estados diferentes mantêm `status_assinatura = 'trial'`**. Verificado contra o banco
local, uma conta por estado:

| estado do perfil | desfecho |
|---|---|
| trial em curso | `trocado` |
| **VIP/isento** (`trial_expira_em is null`) | `nao_permitido` |
| trial vencido | `nao_permitido` |
| número bloqueado | `nao_permitido` |
| pagante (`ativo`) | `nao_permitido` |

O VIP é o vazamento que custaria caro e o menos óbvio: isenção manual é
`trial_expira_em = null` com status `'trial'`, `lib/assinatura.ts` a trata como
válida **para sempre**, e sem a condição `trial_expira_em is not null` toda conta de
cortesia se autoconcederia o Garantido vitalício. Corolário contraintuitivo:
**chamar `assinaturaValida` aqui seria o bug** — ela devolve `true` para `'ativo'` e
para o VIP, os dois estados que não podem escolher. A guarda é estritamente mais
forte que ela.

O contrato textual existe porque `update ... where <guarda>` **não devolve erro** no
supabase-js: devolve sucesso com zero linhas, e a tela afirmaria ter salvo. O
chamador (`salvarEstabelecimento`) registra a recusa e **segue para o passo 3** —
travar o cadastro na escolha de faixa perderia a conta inteira pelo item mais barato
de consertar depois.

**Ativar assinatura é um `update` de DUAS colunas, sempre.** Como os dois eixos são
independentes por decisão da migration do sinal, um trial que escolheu Garantido e é
promovido só com `status_assinatura = 'ativo'` fica com a capacidade **pagando preço
de Essencial**, e nada no sistema reclama:

```sql
-- Nunca só o status. O plano é o que o cliente combinou pagar.
update perfis set status_assinatura = 'ativo', plano = '<basico|sinal>' where id = '<uuid>';

-- Fila de conversas que precisam acontecer ANTES de o trial acabar:
select id, trial_expira_em from perfis where plano = 'sinal' and status_assinatura = 'trial';
-- Quem deveria estar pagando a faixa de cima:
select id from perfis where plano = 'sinal' and status_assinatura = 'ativo';
```

**Durante o trial o sinal é dinheiro real, e isso é dito em voz alta.** Não existe
modo de simulação (o sandbox do MP não cobre este fluxo), então o que é gratuito são
os 14 dias da **nossa** mensalidade — o Pix do cliente final cai de verdade na conta
do dono desde o primeiro dia. Está escrito em `/termos`, na FAQ e em `/precos`:
"período de teste" se lê como "simulado" se ninguém disser o contrário, e a hora de
dizer é antes do primeiro Pix.

**Rebaixar de plano deixava uma autorização sem saída.** `SemPlano`, em
`/pagamentos`, é o único braço que um tenant vê depois de perder a capacidade — e
agora ele pode ter conectado o Mercado Pago durante o trial. O botão de revogar só
existia no braço de quem **tem** o plano, então a credencial ficava cifrada no banco
sem caminho de revogação pela nossa interface, contradizendo a promessa da política
de privacidade ("a qualquer momento, no painel da Encaixaria ou no do Mercado
Pago"). `SemPlano` passa a mostrar `BotaoRevogar` quando `pagamento_conectado_em`
existe.

#### Expiração é preguiçosa, e o cron é rede de segurança

`expirar_sinais_vencidos(p_usuario_id)` roda no **início de `montarContexto`**,
imediatamente antes do cálculo de disponibilidade — o único instante em que um
slot indevidamente travado causa dano. É o idioma das 6h de `conversas_estado`, e
existe porque o cron da Vercel no plano Hobby é 1x/dia, grosso demais para um
prazo de 30 minutos. Sequencial e **fora do `Promise.all`** de propósito: é uma
escrita que muda o resultado da leitura seguinte.

**O mesmo cron diário varre TODOS os tenants, e essa parte não é redundante.** A
varredura do bot só roda para quem tem a capacidade ligada; quem **desliga** —
desconectando a conta ou saindo do plano — deixaria de ser varrido para sempre,
com os holds abertos prendendo aqueles horários sem nenhum caminho de liberação.
O cron fica **acima do gate de assinatura** pelo mesmo motivo: liberar horário
não é entrega de feature, é higiene de dados.

A RPC também **reconcilia** agendamento cancelado por outro caminho (dono no
painel, cliente pelo bot): os dois gravam `status = 'cancelado'` e não sabem nada
sobre sinal, e sem isso a agenda mostraria "Aguardando sinal" ao lado de um
horário cancelado, com a cobrança `pendente` para sempre.

**O terceiro ponto de varredura é a LEITURA do painel** (`lib/pagamentos/expirar.ts`,
chamado por `/agendamentos` e `/pagamentos`), e existe porque os dois primeiros
cobriam dois dos três danos e não o terceiro. Horário bloqueado para outro cliente:
coberto, porque quem tenta agendar dispara a varredura antes de ver a lista.
Lembrete indevido: coberto, porque o cron expira antes de montar os lembretes.
**A agenda do dono mostrando "aguardando sinal" num horário que já venceu não
estava coberta** — quem abre o painel não disparava varredura nenhuma, e no plano
Hobby o registro só se corrigia 1x/dia. Medido: prazo de 2 min vencido, agendamento
seguia `confirmado`/`aguardando` cinco minutos depois.

Três detalhes desse ponto não são livres. É **service role**, porque a RPC é
`security invoker` com `execute` só para `service_role` — ela escreve nas colunas de
sinal, que ficam fora do `grant` de `authenticated` de propósito; logo o `usuarioId`
tem de vir **sempre da sessão**, nunca de `searchParams`, ou a tela viraria "expire
os sinais de qualquer tenant". É **sequencial e antes** da leitura dos agendamentos,
pelo mesmo motivo de `montarContexto`. E é **guardada por `cobrancaSinalHabilitada`**,
para não custar uma escrita a cada abertura de agenda da maioria que não cobra sinal
— quem desligou a capacidade com holds abertos segue coberto pelo cron, que ignora
essa condição de propósito. Não precisa de `export const dynamic`: as duas páginas
já são dinâmicas por usarem `cookies()`, o que o build confirma marcando as duas
com `ƒ`.

**A ordem de lock das duas RPCs é a mesma — `cobrancas_sinal` e só então
`agendamentos` — e inverter uma delas cria deadlock.** Elas foram desenhadas para
correr juntas: a varredura está no caminho quente de toda mensagem, e um Pix que
cai rente ao prazo é o caso central. Em ordens opostas o Postgres aborta uma com
40P01, e se a abortada for o webhook, um pagamento real depende de reentrega.

#### O webhook de pagamento

Três invariantes, e a terceira custou uma correção:

1. **A assinatura é o único portão**, validada **antes** de qualquer I/O — sem
   isso, uma lista de ids viraria amplificador de tráfego contra o nosso banco e
   a API do PSP. Fail-closed com segredo vazio.
2. **O corpo do POST não é confiável.** A assinatura cobre um manifesto montado
   com id, `x-request-id` e `ts` — **não** o payload. Um POST forjado com
   `status: "approved"` é idêntico a um legítimo, então o status vem sempre de
   `GET /v1/payments/{id}` com o token do dono. O valor comparado é o da
   reconsulta.
3. **Responder 200 e pedir reentrega são coisas diferentes.** 200 é para o que
   não muda tentando de novo (id desconhecido, reentrega já processada, valor
   divergente, pagamento não aprovado). Timeout, erro de RPC, falha de leitura e
   `/oauth/token` fora do ar devolvem **503**. Não há reconciliação em lugar
   nenhum — este endpoint é o único chamador de `consultarPagamento` —, então um
   200 por engano é confirmação perdida **para sempre**, com o cliente pagando e
   o agendamento sendo cancelado pela varredura minutos depois, sem sequer
   levantar `estorno_pendente`.

**Não há janela de validade sobre o `ts`, de propósito.** O PSP reentrega horas
depois, e uma janela apertada recusaria justamente a retentativa de um pagamento
que a primeira tentativa não registrou. O replay já é inócuo:
`confirmar_sinal_pago` é idempotente por `provedor_pagamento_id`.

**`confirmar_sinal_pago` nunca ressuscita agendamento cancelado pelo DONO nem
horário já vencido.** Reconfirmar por causa de um Pix atrasado desfaria uma
decisão humana pelas costas dele; e a EXCLUDE não barra passado, então sem a
guarda o agendamento voltaria vencido e o lembrete nunca sairia. Nos dois casos,
e no 23P01 (slot tomado na janela), o desfecho é `estorno_pendente`.

#### Falhar ao cobrar NÃO derruba o agendamento

Toda exceção de `cobrarSinal` é engolida e o horário fica de pé sem sinal. A
direção é **oposta** à do gate de assinatura: lá a falha aceitável é "cliente
reclama que parou"; aqui é "o dono não recebeu o sinal desta vez". Cancelar um
agendamento real porque o PSP estava fora do ar puniria o cliente por um problema
que não é dele — e o produto existe para não perder agendamento.

A guarda de `collector_id`, porém, falha **fechada**, inclusive quando o campo não
vem: não mandar o código custa um agendamento sem sinal; mandar custa o dinheiro
do cliente na conta errada.

#### Detalhes que custam um build ou uma cobrança

- **Arquivo `"use server"` só exporta função async.** Exportar uma constante de
  lá não vira erro de tipo — vira um módulo sem exports em tempo de build. É por
  isso que `COOKIE_STATE` mora em `lib/pagamentos/oauth-state.ts`.
- **O campo de sinal só é renderizado para quem pode cobrar**, então ele
  realmente não existe no FormData da maioria. `servicoSchema` usa `preprocess`
  para tolerar a ausência, e `criarServico`/`editarServico` só escrevem
  `valor_sinal` quando `formData.has("valorSinal")` — sem isso, editar o nome de
  um serviço com a capacidade desligada **zerava o valor do sinal em silêncio**.
- **O copia-e-cola Pix vai sozinho na mensagem.** No WhatsApp o cliente segura
  para copiar, e texto em volta entra na cópia — o banco recusa e ele não tem
  como saber por quê. Com sinal, a mensagem de "agendamento confirmado" **não**
  é enviada: as duas se contradiriam.
- **`date_of_expiration` vai com offset explícito**, nunca com o `Z` que
  `toISOString()` produz.
- **`X-Idempotency-Key` é o id da cobrança**, decidido por nós antes de falar com
  o PSP: sem um id estável, uma retentativa de rede criaria uma segunda cobrança
  e o cliente poderia pagar as duas.
- **Nunca colocar a resposta crua do `/oauth/token` num erro.** Quando falta só o
  `refresh_token` (o caso comum, `offline_access` desmarcado), aquele corpo ainda
  traz um `access_token` válido, e quem captura o erro costuma logar o objeto
  inteiro.
- **O `refresh_token` rotaciona.** A gravação do par novo é a mesma operação da
  renovação, com compare-and-set sobre `expira_em` — perder isso mata a conexão
  do tenant em silêncio, e o sintoma chega dias depois como "o bot parou de mandar
  o Pix".

#### A política de cancelamento é condição para cobrar

O bot pedia R$ 20 e **não dizia nada** sobre o que acontece com aquele dinheiro se
o cliente desmarcar ou não aparecer. Os Termos jogam a política de cancelamento
para o estabelecimento, o que resolve entre nós e o dono e **não resolve nada com o
cliente final** — que é quem paga, é consumidor, e nunca leu os nossos Termos.

`perfis.politica_sinal` é a correção, e ela é de produto e não de texto: sem
política declarada, `motivoSemCobranca` devolve `"sem_politica"` e a cobrança **não
acontece**. Quatro decisões que não são óbvias:

- **Não existe padrão de fábrica**, e isso é o ponto. Um texto nosso ("devolvemos
  em até X dias") seria a Encaixaria decidindo a política comercial de terceiro e
  anunciando ao cliente dele, em nome dele. A tela oferece um exemplo no
  `placeholder` — a versão menos arriscada, sinal abatido e devolvido com aviso
  prévio — que **não é gravado**. Reter por falta é decisão do dono, escrita por ele.
- **Coluna em `perfis`, não chave em `mensagens_tenant`.** Aquela tabela é
  personalização opcional, onde vazio cai num padrão nosso — exatamente o
  comportamento errado aqui. E o gate já lê `perfis` em todos os caminhos, então a
  condição sai de graça no `select` que já existia.
- **Entra no `grant update` de `authenticated`**, ao contrário de `plano` e
  `pagamento_conectado_em`. A distinção que governa a tabela inteira: aqueles são
  afirmações sobre dinheiro e direito, este é conteúdo autoral do dono, como
  `nome_estabelecimento`. Preencher aqui *habilita* a cobrança, mas não é
  autoconcessão — a capacidade continua exigindo os dois campos que ele não escreve.
- **O fecho da mensagem deixou de ser editável**, e isso reverte uma decisão
  anterior de propósito. `MODELO_PADRAO_COBRANCA` terminava com "Copie o código
  Pix…", e o JSDoc registrava que um modelo personalizado perdia esse aviso —
  "decisão do dono". Não vale mais: a ordem é fixa em **corpo → política → fecho →
  código**, porque a política só muda uma decisão se estiver imediatamente antes de
  a decisão ser tomada. Dita no começo é lida como termo de serviço e ignorada;
  depois do código, chega tarde. O dono segue dono do corpo, não da ordem das duas
  últimas coisas.

O CHECK exige entre 20 e 400 caracteres com `btrim`. O piso não é burocracia: o
campo existe para informar, e "ok" satisfaria um `not null` sem informar nada — com
o efeito colateral de nos deixar afirmar que houve divulgação. O teto existe porque
isto entra em toda cobrança, e o WhatsApp trunca com "Ler mais" justamente na parte
que precisa ser lida antes de pagar.

#### O que foi conscientemente adiado no jurídico, e os gatilhos

Sem verba e sem acesso a advogado, a triagem foi por **custo do erro**, não por
completude. O que segue vale enquanto a base for pequena — o risco de tudo aqui é
proporcional ao volume.

**Adiado, com razão registrada:**

- **"Somos participantes do arranjo Pix?"** O desenho já É a resposta conservadora:
  nunca custodiar, `collector_id` do dono, receita fixa sem relação com volume. Um
  parecer confirmaria, não mudaria. **Gatilho para reabrir: qualquer proposta de
  `application_fee` ou split.** Há teste em `lib/pagamentos/mercado-pago.test.ts`
  falhando com o motivo escrito, justamente porque documento não impede um PR.
- **Limitação de responsabilidade.** Ganhou "na máxima extensão permitida pela
  legislação aplicável". Se o CDC derrubar o teto, derruba com ou sem cláusula, e
  uma cláusula inválida não cria responsabilidade nova.
- **LGPD do fluxo de pagamento.** Os Termos ganharam a seção que os torna o
  instrumento de instruções do Art. 39 (dono é controlador, nós operadores). A
  parte substantiva já estava certa: minimização, nenhum dado de pagador, token
  cifrado.
- **"Não somos intermediários".** A frase saiu de todas as páginas — **não** porque
  é falsa, mas porque era autoqualificação jurídica, que alguém contesta. No lugar,
  a descrição do mecanismo: o dinheiro não passa por nós, a receita é mensalidade
  fixa. Fato é verificável e não envelhece.

**Não adiado, porque o conserto era código:** a política de cancelamento (seção
acima). Era o item de maior probabilidade de virar problema real, e o problema não
seria com um regulador — seria o cliente do nosso cliente, cobrando do salão, que
cobra de nós.

**Os termos de desenvolvedor do Mercado Pago foram lidos (2026-08-11).** Quatro
achados que dirigem código, e um que dirige expectativa:

- **O desenho está no caminho documentado.** O fluxo `authorization_code` é
  descrito por eles como o que "deve ser configurado quando for utilizar as
  credenciais para acessar um recurso em nome de terceiros, devendo contar com a
  intervenção do usuário (vendedor) para autorizar explicitamente". Não há
  credenciamento obrigatório — certificação é discricionária deles — e **nada
  condiciona operar em nome de terceiro a `application_fee`, split ou modo
  marketplace**, o que confirma que não usá-los não nos tira de um caminho
  suportado.
- **Cláusula 4.1 (marca)** exige deixar claro que o aplicativo **não pertence ao
  Mercado Pago**, e proíbe usar "mercado", "livre", "pago" e "shops" como palavra-
  chave. Daí o aviso de não-afiliação em `/sobre` e `/termos` cobrir os dois — Meta
  e Mercado Pago. Não usamos o logotipo deles, e não devemos passar a usar sem reler
  essa cláusula.
- **Cláusula 6.1** diz que o usuário que autoriza é Controlador e o desenvolvedor é
  Operador. É a mesma divisão de papéis que os nossos Termos declaram por causa do
  Art. 39 da LGPD — o contrato deles já a impõe, então as duas coisas concordam.
- **Cláusula 7.2 (a)** é a que merece atenção ao mudar o produto: proíbe
  "comercializar ou sublicenciar a API para o uso de e por terceiros" e "criar um
  Aplicativo que funcione substancialmente da mesma forma que a API e oferecer seu
  uso para e por terceiros". A leitura que nos mantém dentro: **não revendemos
  acesso à API** — cada tenant autoriza a própria conta, para uso próprio, e nós
  emitimos cobranças dele para ele. Expor um endpoint genérico de pagamento, ou
  atender um tenant com a credencial de outro, sairia disso.
- **Cláusula 15**: eles podem revogar o acesso "de forma imotivada e a qualquer
  tempo, independente de notificação". Não há mitigação contratual — a mitigação é
  de produto, e já existe: `cobrarSinal` é fail-open, então credencial morta vira
  agendamento sem sinal, e não agendamento perdido. Se um dia isso mudar para
  falhar fechado, esta cláusula é o motivo para não mudar.

**Fora do código, e pendente:** conferir o CNAE do CNPJ com o contador — é pergunta
de contador, não de advogado.

**Gatilhos para deixar de adiar:** a primeira contestação de Pix, o primeiro contato
de Procon, ou o dia em que o Garantido virar a maioria da base.

#### O que ainda não foi medido

O teste ponta a ponta (`tests/e2e/sinal-pix.test.ts`) valida a **nossa** lógica
contra stubs, não o comportamento do Mercado Pago. Continuam abertas, e **só uma
segunda conta real responde** — a candidata é o primeiro salão piloto:
liquidação de fato, webhook em produção, taxa efetiva no extrato, e o piso real
do `date_of_expiration` (hoje travado em 30 min por leitura de doc). O sandbox do
MP **não cobre este fluxo** (`user_allowed_only_in_test`); insistir nele não
compra informação. **Ir ao ar pede revisão jurídica** — GO técnico não é
autorização para enviar.

### RPCs

Duas operações precisam de atomicidade real. O query builder do supabase-js não abre transação, mas `rpc()` roda dentro de uma. Quase todas são `security invoker`, **não** `definer`: uma versão definer que recebe `p_usuario_id` como parâmetro seria escalada de privilégio.

**A exceção é `escolher_plano_trial`, e a diferença está no parâmetro, não no `definer`.** Ela é chamada com a sessão do dono, escreve uma coluna que `authenticated` não pode escrever, e **não aceita identidade**: o alvo é `(select auth.uid())` lido dentro dela, então não existe valor que o chamador passe para agir sobre outro tenant. É a mesma forma de `reivindicar_numero_trial`. Um `definer` que recebesse `p_usuario_id` continuaria sendo escalada — a regra original vale inteira.

- `reordenar_fluxo_etapas(p_ids uuid[])` — regrava `ordem` na sequência dos ids via `unnest ... with ordinality`. Índices densos regravados em bloco em vez de ranks fracionários (LexoRank): são ~10 linhas por usuário. Rejeita lista parcial e id de outro tenant.
- `confirmar_agendamento(...)` — garante o cliente (upsert por `remote_jid`, sem sobrescrever nome conhecido com `null`) e cria o agendamento na mesma transação. Deixa o `23P01` propagar. **O uuid devolvido deixou de ser descartado**: é o elo com a cobrança de sinal.
- `expirar_sinais_vencidos(p_usuario_id)` — libera slots de sinal vencido e reconcilia cancelamentos. Ver a seção de sinal para a ordem de lock, que não é livre.
- `confirmar_sinal_pago(p_provedor_pagamento_id, p_valor_centavos)` — promove o agendamento depois da reconsulta ao PSP. Idempotente, e devolve contrato textual: cada valor é um caminho de UX distinto no webhook.
- `escolher_plano_trial(p_plano)` — `security definer`, sem identidade por parâmetro. Deixa o dono escolher a faixa **enquanto o trial estiver em curso**. Ver a seção própria: a guarda de quatro condições não é zelo.

### RLS

Todas as 10 tabelas com RLS habilitada. O padrão está em `supabase/migrations/*_rls_policies.sql`, com três detalhes que importam:

1. **`(select auth.uid())`, nunca `auth.uid()` solto** — o subselect faz o planner avaliar a função uma vez e cachear, em vez de chamá-la por linha (a doc de performance de RLS do Supabase mede 179ms → 9ms).
2. **`to authenticated` em toda policy** — descarta a role `anon` sem custo de avaliação.
3. **Índice em toda coluna usada em policy** — sem ele o Postgres faz seq scan e reavalia a policy linha a linha.

`conversas_estado`, `log_envio` e `log_conexao` seguem menor privilégio: o dono só tem `select` (para debug no dashboard); quem escreve é sempre o webhook ou o cron via service role.

**A service role ignora RLS por completo.** No webhook e no cron o `.eq("usuario_id", ...)` explícito deixa de ser otimização e passa a ser a **única** barreira entre tenants — tratar como código crítico.

---

## Uso em celular e tablet

O dono opera isto **entre atendimentos, no celular, com uma mão**. O dashboard nasceu desktop-first, e as decisões abaixo existem para corrigir isso. Não desfazer sem entender o que cada uma resolve.

**O piso de toque mora em `components/ui/button.tsx`, não espalhado nas telas.** Este é o estilo `radix-nova`, muito mais compacto que o shadcn clássico: `default` é `h-8` (32px) e `sm` é `h-7` (28px). Cada `size` ganhou um `max-md:` — 44px nos principais, 40px no `sm` — para que o próximo botão do produto nasça certo sem ninguém lembrar da regra. `xs`/`icon-xs` ficaram de fora de propósito: são de contexto denso, e crescer quebraria o layout. Onde um alvo pequeno for inevitável, usar o idioma que já existe em `components/ui/switch.tsx`: `after:-inset-x-3 after:-inset-y-2` estende a área sem mexer no desenho. O piso de referência é o **mínimo AA de 24px** da WCAG 2.2 SC 2.5.8, incluindo o teste de espaçamento entre alvos vizinhos; 44px é a meta de conforto.

**Campo com fonte menor que 16px dá zoom no iOS e não desfaz.** O padrão é `text-base md:text-sm`, como em `components/ui/input.tsx`. Vale para `<input>`, `<select>` e `<textarea>` — a tela de horários tem dois selects por faixa, sete dias, e cada toque ampliava mais a página. **Não** resolver com `maximum-scale=1`: aquilo reprova a WCAG 1.4.4. Uma regra em `@layer base` também não resolve — utilitário do Tailwind fica numa camada posterior e vence.

**`viewportFit: "cover"` em `app/layout.tsx` é pré-requisito, não enfeite.** Sem ele `env(safe-area-inset-*)` resolve para **zero**, e a barra de abas inferior fica embaixo da barra de gestos do iPhone.

**A navegação são duas ilhas de cliente dentro de um layout RSC.** `components/navegacao-dashboard.tsx` (barra inferior, abaixo de `md`) e `components/barra-lateral.tsx` (menu lateral, `md`+) são os únicos `"use client"` do shell: `app/(dashboard)/layout.tsx` continua Server Component lendo sessão e perfil. Só elas hidratam, porque marcar a página atual exige `usePathname`. Os sete destinos são declarados **uma vez só** no layout e recortados de dois jeitos (`ABAS_PRINCIPAIS`/`ITENS_EXTRAS` para o celular, `GRUPOS_LATERAIS` para a lateral) — montar a lista dentro de cada componente faria um destino novo aparecer numa e não na outra. As duas importam `ICONES` e `ehAtivo` do mesmo módulo, para não haver duas noções de "página atual". O ícone vai por chave num mapa, não por prop: componente React não atravessa a fronteira RSC → client.

**Continuam sendo quatro abas no celular, agora com sete destinos.** Cinco abas dariam ~65px cada em 375px, e seis ~55px com rótulo de 9px; o corte é por frequência — agenda é diária, fluxo é configuração inicial, WhatsApp só importa quando a conexão cai, pagamentos é a conexão do Mercado Pago que se faz uma vez, conta é quase nunca. **A lateral não substitui a barra inferior**: uma gaveta custaria um toque a mais em toda navegação, e o dono opera isto com uma mão entre atendimentos.

**A lateral não tem token de cor próprio, e não deve ganhar um.** O design pinta a sidebar em `#F8F4EC` sobre papel `#FDFBF7`, item ativo branco e divisória `#E4DCCC` — que é exatamente `bg-secondary` / `bg-card` / `border-border` do `app/globals.css`. Reusar dispensa rodar o `verificar:contraste` de novo e dá o par escuro de graça.

**O estado recolhido vem de cookie, e o nome dele mora em `lib/preferencias-ui.ts` — não no componente.** As duas metades são armadilha medida em navegador. Cookie porque o layout é RSC e a primeira pintura precisa já sair na largura certa; num efeito, o menu abriria a 252px e encolheria para 64px, empurrando o conteúdo inteiro em toda navegação. E o nome sai do componente porque `barra-lateral.tsx` é `"use client"`: um Server Component que importa constante de módulo de cliente **não recebe o valor**, e sim a referência de cliente que o Next põe no lugar. O `cookies().get(...)` procurava por algo que não era a string, achava `undefined`, e o menu voltava expandido a cada recarregamento — sem erro nenhum no console, e invisível para o Vitest.

**A agenda tem duas visões da mesma query, escolhidas por CSS.** `md:hidden` / `hidden md:block` na página, **nunca** `matchMedia`: a decisão fica na folha de estilo, então não há client component, não há divergência de hidratação e a primeira pintura já vem certa. A grade de 7 colunas tem `min-w-[44rem]` e é impossível em tela estreita — a 375px mostra 46% dela, com a calha de horas saindo do campo de visão no primeiro arrasto. `lib/agenda-lista.ts` deriva a lista do dia do **mesmo `Calendario`** que a grade desenha, sem segunda query e sem refazer conversão de fuso. `?dia=` implica a semana que o contém, então não há dois parâmetros para manter sincronizados.

**Reordenar o fluxo é por botão; arrastar é o extra.** Ver `moverEtapa`/`podeMover` em `lib/validacao/fluxo.ts`. O arraste não funcionava em toque: a alça tinha ~20×14px e o `PointerSensor` com `distance` perdia o gesto para o scroll antes do limiar. As setas resolvem toque, teclado e leitor de tela de uma vez, e — diferente do drag — são testáveis fora de um navegador. A alça continua a partir de `sm`, com `touch-none` (a doc do dnd-kit é explícita: é a única forma de impedir o scroll em pointer events, e tem de ficar **só na alça**) e `activationConstraint: { delay: 250, tolerance: 5 }`.

**No celular o QR code é logicamente impossível** — o código está na mesma tela que precisaria fotografá-lo. Por isso `obterQrCode(instancia, numero?)` e `criarInstancia(usuarioId, numero?)` aceitam o número: sem ele o Baileys nunca chama `requestPairingCode` e `pairingCode` volta `null` (era o caso, e a UI de fallback do painel era código morto). Passar nos **dois** não é redundância: medido contra a 2.3.7, o controller só honra o `number` do `/instance/connect` quando o estado é `close`; em `connecting`/`open` devolve o QR em cache. Criar com `number` é o caminho que de fato produz o código no primeiro acesso. `lib/telefone.ts` normaliza o que o dono digita — e **não** serve para responder mensagem: a identidade do cliente final continua sendo o `remote_jid`.

**Os diálogos têm `max-h-[calc(100svh-2rem)] overflow-y-auto`.** Sem isso, com o teclado aberto num 375×667, o diálogo de editar serviço ficava cortado **e sem rolagem** — os botões Salvar/Cancelar não existiam para quem estava no celular. `svh` e não `dvh`: `dvh` é remedido a cada retração da barra do Safari e o diálogo mudaria de altura durante o scroll. Abaixo de `sm` ele ancora perto do rodapé, com folga em vez de rente — rente exigiria `pb` de safe-area, e o `-mb-4` do `DialogFooter` abriria uma fresta do tamanho do inset.

**O PWA para em ícone e standalone.** `app/manifest.ts` mais `app/icon.tsx` / `app/apple-icon.tsx`, gerados por `ImageResponse` (embutido no Next, sem binário no repositório e sem dependência nova). Não há offline nem push: os dois exigem service worker, que o Next não gera. `start_url` é `/agendamentos` e não `/` — quem instalou já é cliente.

---

## A marca

**Uma fonte, quatro recortes.** `public/encaixaria-icon.png` é 500×500 com fundo transparente, e o desenho ocupa só **51,8%** do quadro (medido: bbox de 259px, ~24% de margem em cada lado). Essa margem atrapalha em todo destino, então `lib/marca.ts` guarda a fração e a conta de ampliar-e-recortar; `lib/marca-servidor.tsx` compõe para os geradores de ícone e `components/marca.tsx` para a UI. **Ao trocar o PNG, remedir `FRACAO_DESENHO`** — `lib/marca.test.ts` trava o valor justamente para isso não passar em silêncio.

**Ocupação por destino, e por quê:** favicon 94% (a 32px a margem é desperdício puro), ícone `any` 84% (o web.dev pede "sem padding extra"), `apple-icon` 70%, maskable 66%. As margens de `any` e `maskable` são **opostas** — por isso são arquivos diferentes, não o mesmo declarado duas vezes.

**Fundo transparente quebra em dois lugares, e os dois foram corrigidos.** O iOS compõe `apple-touch-icon` sobre **preto**, então `app/apple-icon.tsx` tem fundo opaco. No Android, a spec do manifesto diz que o UA compõe sobre *"a solid fill of the user agent's choice"* — e **não** consulta o `background_color`; daí `app/icone-mascara/route.tsx`, com fundo opaco e o desenho a 66% (raio efetivo 33%, dentro da safe zone de 40%). Essa rota mora fora do `app/icon.tsx` de propósito: cada item de `generateImageMetadata` vira uma `<link rel="icon">` no `<head>`, e a variante de fundo cheio não deve concorrer a favicon de aba.

**Dois detalhes que custam um build para descobrir.** Em rota de metadata dinâmica, `id` chega como **Promise** — `handler({ params, id: idPromise })`; sem `await`, `Number(id)` é `NaN`. E no `components/marca.tsx` o `max-w-none` é obrigatório: o reset do Tailwind põe `max-width: 100%` em imagem, o que encolheria a imagem ampliada de volta ao contêiner e anularia o recorte.

**Ler o PNG com `readFile`, nunca `import`.** O `ImageResponse` tem teto de 500 KB de bundle e conta imagens; um `import` colocaria os 87 KB dentro do bundle de cada rota.

**Verde e roxo vivem na marca; a UI é teal.** O símbolo é verde `#0EC962` (2,13:1 no papel) e roxo `#7947E4` — nenhum dos dois existe em `app/globals.css`, e não deve passar a existir. Logotipo não é componente de UI: o SC 1.4.3 isenta texto de logo, e o SC 1.4.11 não alcança o símbolo porque ele não é *"required to understand the content"* — quem carrega o significado é a palavra "Encaixaria" ao lado. É por isso que `components/marca.tsx` usa `alt=""`, e é essa decoratividade que sustenta a isenção. **A isenção evapora se a cor virar funcional**: ícone de status, botão ou borda de foco em verde voltam a exigir 3:1 e reprovam.

A palavra ao lado do símbolo fica em `text-foreground`, não em `text-primary` — com o mark colorido, o teal na tipografia daria três famílias de cor no mesmo cabeçalho, e o teal precisa continuar significando "elemento interativo".

**Reserva conhecida, não bloqueante:** o relógio roxo do desenho some abaixo de ~24px e fica em 2,92:1 contra o card escuro. Se o mark for refeito um dia, o pedido certo é "remover o relógio, manter balão + calendário + raio" — três elementos, não quatro.

**O que só um navegador verifica.** O jsdom não tem engine de layout nem cascata CSS: `getBoundingClientRect()` devolve zero, `matchMedia` não existe e classe do Tailwind é string opaca. Um `toHaveClass("min-h-11")` afirma que a classe foi escrita, **não** que o pixel tem 44. Tamanho real de alvo, overflow, media query aplicando, zoom do iOS, safe area e teclado virtual pedem aparelho ou emulação de device — testar a 375×667 e 768×1024 ao mexer em layout. `@testing-library/jest-dom` e `user-event` **não** estão instalados: os testes de componente usam `fireEvent` e asserção sobre atributo.

**O Playwright roda Chromium de verdade, com layout e cascata**, então o parágrafo acima não é um beco sem saída: um `getBoundingClientRect()` ali mede pixel, não string de classe. Os números de responsividade abaixo saíram todos daí — Chromium a 375, 390 e 768px, medindo transbordo, tamanho de alvo, corpo de texto e caracteres por linha. **O medidor não está versionado** (fica fora do repositório por decisão), então ao mexer em layout de página pública o caminho é remedir num navegador, não confiar na memória destes valores.

Duas armadilhas descobertas ao construir aquela medição, que valem para qualquer nova tentativa: elemento com `overflow` diferente de `visible` **não** causa transbordo de página (o recorte da marca reportava 9px falsos em toda página), e a exceção "Inline" do SC 2.5.8 isenta link no meio de frase — exigir 24px de altura ali obrigaria a inflar a entrelinha do texto todo.

**O transbordo de 375px está fechado.** As páginas públicas rolavam na horizontal (`scrollWidth` 409 contra 375) porque o cabeçalho tinha **dois rótulos do mesmo destino** — "Entrar" e "Começar grátis" apontavam ambos para `/login`, na época em que havia uma tela só de autenticação — e juntos não caíam na largura. (Hoje os destinos são diferentes, `/login` e `/registro`, mas a decisão de esconder um deles abaixo de `sm` continua valendo pela largura.) "Entrar" saiu abaixo de `sm` e voltou dentro de `MenuSecoes`, com nome que quem já é cliente procura. Junto disso: 7 alvos de 20px de altura (nav do cabeçalho e do rodapé) que reprovavam o mínimo AA, e a medida de coluna, que **escala com o corpo do texto** — `36rem` dá ~75 caracteres a 16px e ~96 a 12px, daí a prosa usar `max-w-[36rem]` e a letra miúda `max-w-[28rem]`. `max-w-2xl` parecia confortável por uma conta errada de largura de caractere (a Instrument Sans a 16px mede ~7,7px, não ~8,4px).

**Corpo de texto de página pública é `text-base` no celular, não `text-sm`.** O idioma é o mesmo de `components/ui/input.tsx` (`text-base md:text-sm`): maior no celular, menor no desktop. Não é deslize — é a leitura de quem chega por link de WhatsApp ou Instagram, que é a maioria. A conversa da landing tem regra própria e um **teto**: 14px, porque a 15px as linhas de menu quebram na bolha (ver o JSDoc de `components/conversa-demo.tsx`).

**Prosa em três colunas só a partir de `lg`.** Com `sm:grid-cols-3` a grade virava três colunas já a 640px, e a 768px cada coluna dava ~24 caracteres por linha em 5 linhas — coluna de jornal estreita, em que o olho salta linha. Empilhado, o `max-w-[34rem]` no item impede o problema oposto.

---

## SEO e páginas públicas

O objetivo declarado era ser encontrado pesquisando o nome no Google. Isso dependia de duas coisas independentes: um nome inequívoco (ver "Nome", acima) e uma base de indexação que **não existia**. Medido no HTML pré-renderizado antes: zero `rel="canonical"`, zero tags `og:`, zero JSON-LD, sem `robots.txt`, sem `sitemap.xml`, sem `noindex` na área logada.

**`lib/site.ts` é a fonte única do domínio, e `metadataPagina` existe por duas armadilhas do App Router — as duas medidas no HTML do build, não deduzidas.**

1. **A mesclagem de metadata é superficial.** Uma página que declara `openGraph: { url }` **substitui o objeto inteiro** do layout: `siteName`, `locale` e `type` desaparecem sem aviso. Por isso o helper monta o objeto completo, e por isso `twitter.card` é repetido nele — declarar `twitter` na página apaga o do layout e a prévia volta ao cartão pequeno.
2. **`alternates.canonical` não pode morar no layout raiz.** Um `canonical: "/"` lá é herdado literalmente, e `/precos` passaria a se anunciar como cópia da home.
3. **O `og:image` do `opengraph-image` só é injetado em quem NÃO declara `openGraph`.** Consequência que apareceu no build: `/login` recebia a tag e a home não — a página que mais precisa da prévia era a única sem ela. Daí `IMAGEM_SOCIAL` ser declarada à mão, com `width`/`height`. O custo é perder o sufixo de hash que o Next usa para invalidar cache; não há como lê-lo do userland.

**`urlSite()` não usa `envObrigatoria`, de propósito.** `metadataBase` é avaliado em tempo de módulo de `app/layout.tsx`: lançar ali quebraria o build inteiro em qualquer ambiente sem `SITE_URL`. A cadeia é `SITE_URL` → `VERCEL_PROJECT_PRODUCTION_URL` → `localhost`. É `VERCEL_PROJECT_PRODUCTION_URL` e **não** `VERCEL_URL`: aquela muda a cada deploy e faria canonical e sitemap apontarem para um deployment específico.

**`noindex` sem `Disallow`, e isso é contraintuitivo.** Dashboard e `/login` usam `metadata.robots`, e `app/robots.ts` **não** os bloqueia. O Google só respeita `noindex` se puder buscar a página — `Disallow` impediria a leitura da diretiva e a URL poderia ser indexada sem conteúdo. A "correção" de adicionar `Disallow` aparece em todo tutorial e está travada por teste em `app/seo.test.ts`.

**O matcher do `proxy.ts` exclui `robots.txt`, `sitemap.xml` e `opengraph-image`.** Não era redirect (a decisão em `lib/supabase/proxy.ts` é allowlist), mas cada hit de crawler gastava um `getClaims()` e, quando o refresh rotaciona cookies, o `setAll` injeta `no-store` na resposta — desabilitando o cache de rotas que deveriam ser estáticas.

**O FAQ usa `<details name>` nativo, e voltar para o Radix quebra o SEO em silêncio.** O `AccordionPrimitive.Content` **desmonta o conteúdo fechado** e o Google não clica em nada. As 9 perguntas iam para o HTML e nenhuma das 9 respostas — medido: 649 → **1099 palavras** indexáveis na landing depois da troca. O `name` compartilhado dá "um aberto por vez" sem JavaScript, e o componente deixou de ser `"use client"`. `components/ui/accordion.tsx` segue existindo como primitivo, mas **não deve voltar para conteúdo que precise ser indexado**.

**JSON-LD só na home** (`lib/json-ld.ts`), porque a doc é literal: *"The WebSite structured data must be on the home page of a site"*. `WebSite` é o único lever documentado para o nome do site na SERP; `Organization` alimenta logo e knowledge panel. Três tipos ficam fora **de propósito**, e há teste afirmando a ausência de cada um, porque markup obsoleto não dá erro em lugar nenhum:

- **`FAQPage`** — deixou de aparecer em 2026-05-07, doc removida em 2026-06-15.
- **`potentialAction`/`SearchAction`** — sitelinks searchbox removido em 2024-11-21.
- **`SoftwareApplication`** — exige `aggregateRating` ou `review`; sem piloto avaliando é inelegível, e inventar rating contradiz a decisão de não fabricar prova social.

**`PERFIS_EXTERNOS` vazio é informação, não pendência esquecida.** `sameAs` é o campo com maior retorno para a consulta de marca, e o retorno só existe depois de ação humana (Instagram, LinkedIn de empresa, GitHub, Product Hunt). Preencher conforme cada perfil nascer.

**A fonte do `opengraph-image` é um `.ttf` no repositório, e isso foi obrigatório.** O Satori **não tem fonte padrão** — sem `fonts:`, texto sai em branco — e `next/font` não expõe o arquivo (nem o Satori lê `woff2`). A Bricolage Grotesque foi **instanciada** no peso 600 e reduzida aos glifos latinos com acento: 408 KB → 18 KB, licença OFL em `public/`. Se algum texto da imagem usar caractere fora do subset, ele sai **vazio e sem erro**. Também: `MarcaRecortada` assume quadro **quadrado**, então num canvas 1200×630 precisa ir dentro de um `<div>` de lado fixo.

**"Fora do sitemap" NÃO é "não indexável", e essa confusão custou uma correção.** Sitemap e links são vias de **descoberta**; um visitante com Chrome, um `Referer` em log público ou o link colado numa conversa bastam para o Googlebot chegar. Página que não deve aparecer na busca precisa de `noindex` — é o que o parâmetro `naoIndexar` de `metadataPagina` faz.

**`IDENTIFICACAO_LEGAL` está preenchida, e o mecanismo de pendência continua armado.** `lib/organizacao.test.ts` falha se qualquer campo voltar a ser marcador (não trocar por `skip` nem `todo` — os dois passam), e como **deploy na Vercel não roda teste**, `identificacaoPendente()` também dirige comportamento: com marcador, `/sobre`, `/privacidade` e `/termos` saem `noindex` e fora do sitemap, e o `Organization` omite `legalName`/`taxID`. Publicar `"legalName": "[RAZÃO SOCIAL]"` seria pior que campo ausente — o Google leria o marcador como o nome da empresa.

**O nome fantasia (`PRTI`) aparece nas páginas legais e NUNCA no JSON-LD.** O campo natural para ele seria `Organization.alternateName`, que é exatamente o plano B que o Google usa para escolher o nome do site na SERP — colocá-lo ali cria uma segunda marca competindo com "Encaixaria" pela consulta de marca, ou seja, desfaz o objetivo de todo o trabalho de SEO. `Organization.name` é sempre só "Encaixaria", e há teste afirmando a ausência de `alternateName`.

**As duas páginas de comparação são rascunho:** `noindex`, fora do sitemap e sem link, até revisão humana, porque afirmam preço e recurso de outra empresa. Regras que valem para elas: todo número com data e fonte (`NotaDeApuracao`), e uma seção dizendo onde o concorrente ganha — comparação em que o autor vence todas as linhas é lida como propaganda, e qualifica mal o lead. A afirmação sobre multa de fidelidade do Trinks foi deixada de fora por ser a de maior dano se estiver vencida.

**As páginas de texto descrevem o sistema real, e uma revisão pegou três desvios — o padrão vale para o futuro: o defeito não está no markup, está na afirmação que o código contradiz.** Os três: (a) a política dizia que o estado da conversa era "descartado depois de seis horas", mas **não existe `delete` em `conversas_estado`** — as 6h são expiração de leitura, e a linha só sai com a conta; (b) dizia que o nome do cliente era "informado na conversa", quando vem de `data.pushName` e a V0 não tem etapa que pergunte nome; (c) a FAQ prometia cancelar "sem falar com ninguém" enquanto `/termos` e `/precos` diziam o contrário — não há gateway, o cancelamento é por mensagem. **Ao mudar schema ou fluxo do bot, reler `/privacidade` e `/termos`.**

**`ROBOTS_PRIVADO` e `metadata: Metadata` andam juntos.** Sem a anotação de tipo, um typo (`robot`, `noindex: true`) compila, não emite tag nenhuma e a página fica indexável em silêncio. O teste em `app/seo.test.ts` cobre as duas metades: que o `robots.txt` **não** bloqueia e que o `noindex` **existe** — com só uma das duas, a página é indexável e nada falha.

## Estrutura de pastas esperada

```
/app
  layout.tsx                          → fontes, tema, `viewport` e a metadata raiz (metadataBase, title.template)
  manifest.ts                         → PWA: ícone na tela inicial e abertura em standalone
  icon.tsx / apple-icon.tsx           → ícones gerados por ImageResponse, sem binário no repo
  opengraph-image.tsx                 → prévia de link 1200×630 (WhatsApp, redes)
  robots.ts / sitemap.ts              → indexação; dashboard e as sete telas de auth ficam fora
  /(marketing)
    page.tsx                          → landing; é aqui que o JSON-LD vive
    perguntas.ts                      → dados do FAQ, módulo puro (é o texto indexável)
    perguntas-frequentes.tsx          → `<details>` nativo, NÃO Radix (ver seção de SEO)
    pagina-texto.tsx                  → moldura das páginas de texto corrido
    comparacao.tsx                    → peças das páginas de comparação (rascunho)
    precos/ como-funciona/ sobre/ privacidade/ termos/
    menu-secoes.tsx                   → Sheet com a navegação abaixo de `sm`
  /(auth)
    layout.tsx                        → moldura de duas colunas; o `aside` só existe a partir de `lg`
    pecas.tsx                         → Cabecalho, Campo, CampoSelecao, BotaoPrincipal, Recado
    schema.ts / actions.ts            → Zod e as Server Actions das sete telas (inclui `sair`)
    login/                            → entrar; é a única com `current-password`
    registro/                         → passo 1, `passos.tsx`, e confirmar-email/ estabelecimento/ whatsapp/
                                        o passo 2 traz `escolha-plano.tsx`: o trial nasce na faixa escolhida
    recuperar-senha/ redefinir-senha/ → pedir o link e definir a senha nova
  /auth
    confirmar/route.ts                → aterrissagem dos links de e-mail: verifyOtp / exchangeCodeForSession
  /(dashboard)
    layout.tsx                      → sessão, gate soft de assinatura, e a fonte única dos 7 destinos
    conexao-whatsapp/page.tsx        → QR code, estado da instância, as 3 métricas e o atendimento por conversa
    pagamentos/page.tsx               → conectar conta do PSP, prazo do sinal, devoluções pendentes
    servicos/page.tsx                 → lista + cartão "novo serviço", duas colunas em `lg`
    horarios/page.tsx
    agendamentos/page.tsx             → dashboard com visão de calendário dos agendamentos
    fluxo-conversa/page.tsx           → builder: dono monta/reordena as etapas da conversa do bot
    conta/page.tsx                    → assinatura, estabelecimento, acesso e encerrar conta
  /api
    /cron
      enviar-lembretes/route.ts      → chamado 1x/dia pelo Vercel Cron
    /webhook
      whatsapp/[instance]/route.ts   → recebe mensagens da Evolution API, processa conversas_estado
      pagamento/mercadopago/route.ts → confirma o sinal; reconsulta o pagamento antes de promover
    /pagamentos
      mercadopago/callback/route.ts  → volta do OAuth, valida `state`, cifra e grava o token
/components
  cta-upgrade.tsx                     → caminho para o Garantido; sem "use client", serve RSC e ilha
  navegacao-dashboard.tsx             → ilha de cliente: barra de abas, só abaixo de `md`
  barra-lateral.tsx                   → ilha de cliente: menu lateral colapsável, só a partir de `md`
  cartao-lateral.tsx                  → moldura da coluna de "adicionar" (serviços e fluxo)
  calendario-semana.tsx               → grade de 7 colunas, só a partir de `md`
  agenda-lista.tsx                    → lista do dia com seletor de data, abaixo de `md`
/lib
  supabase/
    server.ts                        → client respeitando RLS
    admin.ts                          → client com service role key
  site.ts                             → domínio, `metadataPagina`, identificação legal, perfis externos
  json-ld.ts                          → WebSite + Organization da home
  plano.ts                            → preço, trial e o que está/não está incluído
  preferencias-ui.ts                  → nome do cookie da lateral; puro, para o RSC poder importar
  metricas-whatsapp.ts                → janelas de "hoje"/"ontem" no fuso do negócio, e tempo relativo
  evolution-api.ts                    → funções: criar instância, gerar QR code, enviar mensagem, checar status
  cripto.ts                           → AES-256-GCM, chave por parâmetro (único uso: token do PSP)
  pagamentos/
    mercado-pago.ts                   → OAuth, criar Pix, consultar, estornar. Base URL sobrescrevível
    assinatura-webhook.ts             → HMAC do `x-signature` (puro)
    capacidade.ts                     → "este tenant pode cobrar sinal?" — plano + conta + política declarada
    credenciais.ts                    → guarda/recupera o token, com renovação e compare-and-set
    cobranca-sinal.ts                 → emite o Pix pós-confirmação e devolve as mensagens
    oauth-state.ts                    → só a constante do cookie (arquivo "use server" não exporta const)
  telefone.ts                         → normaliza o número do dono para o código de pareamento
  calendario.ts                       → layout da grade semanal (puro)
  agenda-lista.ts                     → deriva a lista de um dia do mesmo Calendario (puro)
  bot/
    pausa.ts                          → janela de atendimento humano (puro): `pausaAtiva`, `fimDaPausa`
    engine-fluxo.ts                   → lê `fluxo_etapas` ordenadas e avança a conversa etapa a etapa (genérico, dirigido por configuração, não hardcoded)
    disponibilidade.ts                → calcula horários livres (horarios_disponiveis - agendamentos existentes)
/vercel.json
```

---

## Autenticação

Sete telas em `app/(auth)/`, vindas do design `Encaixaria Painel.dc.html`. Antes era **uma** tela com dois botões de submit dividindo um campo de senha, sem nenhum caminho para senha esquecida e sem coletar nada no cadastro (`nome_estabelecimento` nascia nulo). O que não é óbvio:

**O cadastro em 3 passos se parte no meio, e a emenda é obrigatória.** Passo 1 (`/registro`) cria a conta; passos 2 e 3 escrevem em `perfis` e criam instância na Evolution, e **os dois exigem sessão**. Com confirmação de e-mail ligada, `signUp` não devolve sessão — daí `/registro/confirmar-email`, que o design não previa. Sem ela, o dono confirmava o e-mail e era jogado ao login pelo proxy, sem explicação. Com `enable_confirmations = false` (é o `config.toml` local) os três passos correm seguidos e a tela nem aparece.

**`/auth/confirmar` decide o destino por mapa fechado, nunca por `?next=`.** Um parâmetro de destino livre ali seria redirect aberto pendurado justamente no endereço que acabou de criar sessão. Aceita **dois** formatos de link de propósito: `?token_hash=&type=` (`verifyOtp`, dos templates personalizados, e o preferível — não depende de cookie do navegador que iniciou, então funciona quando o dono se cadastra no computador e abre o link no celular) e `?code=` (`exchangeCodeForSession`, o que os templates **padrão** produzem). Aceitar o segundo é o que faz o fluxo funcionar sem ninguém editar template no painel; a intenção viaja no `fluxo=` que nós mesmos escrevemos no `redirectTo`, porque aquele formato não carrega `type`.

**O `proxy.ts` resgata link de e-mail que caiu na raiz, e isso não é caso hipotético.** Quando o `redirectTo` não está na allowlist de Redirect URLs, o Supabase manda o link para o **Site URL** (a doc diz que ele é o destino padrão), e o dono aterrissa em `/?code=…` — na landing, com o cadastro pela metade e nenhuma pista do que fazer. O proxy encaminha `?code=` (ou `token_hash` + `type`) **só na raiz** para `/auth/confirmar`, com a query intacta: `?code=` é parâmetro de OAuth em geral, e capturar em qualquer caminho sequestraria um callback de gateway de pagamento. Nesse caminho degradado o `fluxo=` não sobrevive, então o destino sai do estado do perfil — sem `nome_estabelecimento`, volta para o passo 2; com ele, vai para o painel. Configurar a allowlist e o `SITE_URL` continua sendo o conserto de verdade; o resgate existe porque link já enviado não se corrige.

**`ROTAS_SOMENTE_ANONIMAS` compara caminho exato, e `ROTAS_PROTEGIDAS` compara prefixo.** `/registro` é anônima e `/registro/estabelecimento` exige sessão — um `startsWith` na primeira lista jogaria o passo 2 de volta ao painel exatamente quando ele fosse aberto, e o cadastro nunca terminaria. Há teste afirmando que as duas listas não se sobrepõem.

**Campo de auth é 16px em qualquer largura**, diferente do `text-base md:text-sm` que é o idioma do resto do projeto. Aquele idioma está certo onde está, mas resolve o zoom do iOS por **largura**, e o iPad em retrato reporta exatamente 768px — o começo do `md`. Medido em Chromium: os campos caíam para 14px a partir dali. Numa coluna de 380px com dois campos não há densidade a ganhar.

**O passo 3 não gera QR: redireciona para `/conexao-whatsapp?numero=&iniciar=1`.** Duplicar aquele painel custaria manter em dois lugares a expiração de 45s, a contagem de regeneração e o polling, todos medidos contra a Evolution 2.3.7. O `iniciar=1` dispara a primeira busca uma vez, com trava em `ref` — sem ela o Strict Mode do desenvolvimento abriria duas sessões Baileys. O número é **renormalizado** na página: a URL é editável e o valor vai direto para a Evolution.

**O "Voltar" do passo 2 ficou de fora, contra o design.** No design a conta ainda não existe naquele ponto, então voltar é editar o e-mail; no fluxo real a conta já foi criada e confirmada, e o passo 1 é um formulário que criaria uma segunda. O botão do navegador continua funcionando.

**"Começar grátis" aponta para `/registro`, "Entrar" para `/login`.** Os sete CTAs de marketing iam todos para a tela de login, que era o destino errado desde sempre — só não dava para consertar sem uma tela de cadastro.

**A verificação de responsividade é em navegador, e não está versionada.** Sete telas × 320/375/390/768/1280 + paisagem 667×375, medindo transbordo, altura de alvo, fonte de campo e o `aside`. Dois defeitos saíram daí e nenhum era visível no Vitest: os campos a 14px acima de 768px e o "Esqueci a senha" com 36px de alvo. Ao mexer nessas telas, remedir — `toHaveClass("min-h-11")` afirma que a classe foi escrita, não que o pixel tem 44.

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

**Trocar de número exige `logout` antes — e o motivo não é liberar o aparelho.** O controller da 2.3.7 **só honra o `number` do `/instance/connect` quando o estado é `close`**. Medido contra o servidor real, com instância descartável:

| estado antes | `connect?number=NOVO` devolve |
|---|---|
| `connecting` | o pairing code **antigo, em cache** (mesmo com número diferente) |
| `open` | nada — e a tela concluía "já pareado" e voltava ao cartão verde |
| `close` | código novo |

Era o bug de "Conectar outro número não gera QR": sem erro, sem código, sem pista. `desconectarInstancia` (`DELETE /instance/logout`) resolve, e é **logout e não delete** — preserva nome, token e config de webhook, e não abre a janela em que a instância não existe (se o create seguinte falhasse, o tenant ficaria sem instância nenhuma). Medido: idempotente (200 mesmo já em `close`) e 404 quando a instância não existe, que é o caminho do primeiro acesso.

**O `close` é assíncrono ao 200 do logout** (~2s), então `gerarQrCode` espera o estado sair de `conectado` antes de pedir o código. Pedir antes devolve o cache, que é o bug de volta.

**Só o pedido manual reinicia a sessão; a renovação automática nunca.** A renovação roda de dois em dois segundos com o QR na cara do dono — reiniciar ali derrubaria a sessão que ele está pareando naquele instante. Como efeito colateral desejado, o manual também é a saída da instância presa em `connecting` depois de estourar o `QRCODE_LIMIT`, de onde o connect nunca mais produz código novo.

**`GET /instance/connect` não regenera QR e não consome o `QRCODE_LIMIT`.** Numa instância em `connecting` ele devolve o código **em cache** — três chamadas em 9s deixaram `count` em 4. Quem roda o relógio é o servidor, a cada `qrTimeout` de 45s, com ou sem aba aberta. Consequência: uma contagem regressiva local que reinicia a cada busca acumula erro de fase e exibe código morto dizendo que vale. Por isso `lib/qr-pareamento.ts` decide pelo `count` do servidor, e não pelo relógio do cliente; a validade de 45s é só display.

**Estado transitório não se persiste.** `perfis.status_conexao_whatsapp` só tem `conectado`/`desconectado`, então gravar `conectando` virava `desconectado` — a cada 2-5s durante todo o pareamento, com corrida contra o `CONNECTION_UPDATE open` do webhook. `verificarConexao` agora só grava conclusão.

**`disconnectionReasonCode` viaja só no `STATUS_INSTANCE`**, que por isso está em `NOME_EVENTOS_WEBHOOK`. O `CONNECTION_UPDATE` de queda diz que caiu, nunca por quê — e a diferença importa: `401` (`loggedOut`) é o dono tendo desvinculado o aparelho e só re-parear resolve, o resto é transitório. Hoje o handler apenas registra; persistir para diferenciar o texto do box "WhatsApp desconectado" exigiria coluna nova. A assinatura só passa a valer depois de `configurarWebhook` rodar de novo na instância, o que `gerarQrCode` faz a cada chamada.

**Ao testar contra a Evolution, nunca tocar na instância de produção.** `logout`, `delete`, `restart` e `connect` na instância do dono derrubam o WhatsApp do negócio. Criar `zz-teste-…` descartável e apagar ao final, conferindo com `fetchInstances`.

### As três métricas do painel de WhatsApp

Lidas no Server Component com o client que respeita RLS — o dono tem `select` em `log_conexao`, `log_envio` e `conversas_estado`, então nenhuma precisa de service role. "Conectado desde" é a última transição para `conectado` em `log_conexao`; "lembretes enviados ontem" conta `log_envio` com `tipo = 'lembrete'`; "conversas atendidas hoje" e "última mensagem recebida" saem de `conversas_estado`.

**As janelas de "hoje" e "ontem" vivem em `lib/metricas-whatsapp.ts`, e não inline na página.** Elas só têm sentido no `fuso_horario` do negócio, e o runtime da Vercel roda em UTC: um lembrete enviado às 23h de ontem em São Paulo é 02h de hoje em UTC, some do número de ontem e aparece no de hoje. O erro seria **invisível em desenvolvimento** — a máquina do dono já está no fuso certo — e só apareceria em produção. O dia anterior é calculado sobre a data local e reconvertido, nunca subtraindo 24h: no dia que muda o relógio, o dia tem 23 ou 25 horas.

**Duas coisas do design ficaram de fora, com motivo.** O **número conectado** não pode ser exibido: o produto guarda apenas `hmac_sha256(numero, TRIAL_HASH_PEPPER)`, e é essa pseudonimização que sustenta a minimização de dados. **"Mensagens respondidas hoje"** não tem fonte — nada conta mensagem, e o número exigiria coluna nova; no lugar dela vai "conversas atendidas hoje", que é o que os dados de fato respondem. Não reintroduzir nenhuma das duas sem mudar o schema.

## A tela de Conta

Antes dela, `nome_estabelecimento` e `fuso_horario` só eram graváveis no passo 2 do cadastro: quem errasse o fuso ali ficava com a agenda inteira deslocada e sem caminho na interface para corrigir. A action nova reusa o `lerEstabelecimento` de `app/(auth)/schema.ts` — mesmos dois campos, mesmas regras — e chama `revalidatePath("/", "layout")`, porque o fuso decide o que "hoje" quer dizer em três telas.

**Trocar senha dispara `enviarLinkRecuperacao`, não um campo de senha nesta tela.** Um segundo caminho para definir senha significaria duas implementações da mesma regra de força — e a sessão do painel pode estar aberta há semanas num aparelho emprestado, prova de posse que o e-mail dá e ela não. Trocar de **e-mail** ficou de fora: exige reconfirmar o endereço novo, que é fluxo próprio.

**`encerrarConta` é um dos quatro pontos de uso da service role** (com o webhook, o cron e `lib/pagamentos/expirar.ts`), e um dos dois com sessão. Só `auth.admin.deleteUser` apaga `auth.users`, e é o cascade dela que leva os dados do tenant (LGPD). A ordem dos passos não é intercambiável e está no JSDoc da action; o que não pode cair:

- **O alvo é sempre `claims.sub`, nunca um id do `FormData`** — senão a action vira "apague a conta de qualquer um".
- **A instância da Evolution sai antes do banco.** Depois do `deleteUser` não há mais de onde ler `evolution_instance_name`, e a instância órfã deixa o socket Baileys aberto respondendo por um número cujo dono não tem mais painel.
- **A exclusão da instância é fail-open.** Serviço externo fora do ar não pode recusar um pedido de exclusão de dados; instância órfã é limpeza manual nossa.
- **`trials_numero_whatsapp` não cascateia**, e é o comportamento certo: um livro-caixa antiabuso que some com a conta é um livro-caixa que o abusador apaga sozinho.

O cartão de assinatura lê `resumoAssinatura` (`lib/assinatura.ts`) e o preço **do plano do tenant** via `precoDoPlano(perfil.plano)` — com duas faixas, o valor fixo diria "R$ 49,90" para quem paga 64,90, e esta é a tela onde o dono confere quanto paga. `linkAssinatura(intencao)` saiu do layout para `lib/assinatura.ts` porque agora tem vários consumidores; **só pode ser chamada no servidor**, já que `WHATSAPP_CONTATO` não tem prefixo `NEXT_PUBLIC_` e num bundle de cliente devolveria `null` em silêncio. A intenção (`"assinar"` | `"upgrade"`) muda a mensagem pré-escrita, e isso não é enfeite: sem gateway, cada troca de plano é uma conversa humana, e um texto genérico obriga uma pergunta de ida e volta antes de qualquer coisa acontecer.

**O CTA de upgrade aparece em quatro lugares e a condição é uma só**, decidida em `app/(dashboard)/layout.tsx`: `plano = 'basico'` **e** sem `motivoBloqueio`. `components/cta-upgrade.tsx` não tem `"use client"` de propósito — os consumidores estão dos dois lados da fronteira RSC (a barra lateral e a folha "Mais" são ilhas de cliente; `/conta` é Server Component), e um componente sem estado atravessa os dois sem virar duas peças que divergem. A segunda metade da condição evita competição: com o bot parado, o banner logo acima já pede "assine para voltar a atender", e um segundo CTA com outra oferta na mesma tela não ajuda ninguém a decidir. Vale **em trial e para pagante** — quem está testando é exatamente quem ainda decide a faixa. E ele existe na folha do celular porque a barra lateral só nasce a partir de `md`: sem isso, quem usa o painel no celular só encontraria o caminho em `/conta` e `/pagamentos`.

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
   - **`horario`:** validar índice escolhido entre os horários calculados; salvar `data_hora` em `dados_temporarios`. Esta etapa tem **três fases internas** e ações de navegação — ver a seção própria abaixo antes de mexer.
   - **`texto_livre`:** salvar o texto recebido diretamente em `dados_temporarios[campo_destino]`.
   - **`confirmacao`:** se resposta for afirmativa, criar o registro em `agendamentos` (usando `servico_id` e `data_hora` de `dados_temporarios`, e todo o restante das chaves customizadas em `respostas_extras`), responder confirmação final, e limpar `conversas_estado`.
5. Buscar a próxima etapa ativa (`ordem` seguinte) e apresentá-la, atualizando `etapa_atual_id`.
6. Qualquer resposta fora do esperado (número inválido, fora das opções) deve reapresentar a etapa atual sem avançar, nunca travar a conversa sem resposta.

`lib/bot/disponibilidade.ts` calcula horários livres cruzando `horarios_disponiveis` (grade fixa do estabelecimento) com `agendamentos` já existentes na mesma data, considerando a `duracao_minutos` do serviço escolhido para não sobrepor horários.

### A etapa `horario` tem três fases internas

**O problema que isso resolveu era pior do que "poucas opções": a etapa era um laço fechado.** `proximosSlots` devolve os `MAX_OPCOES_HORARIO` (8) horários **cronologicamente mais próximos**, o que numa grade cheia é um dia só — medido com os defaults e uma grade de barbearia: `09:00` a `13:30` de um único dia, de um horizonte de 30 dias com ~540 slots. E resposta fora da lista caía em `reapresentar`, que devolvia **a mesma lista**. Não havia "outro dia" nem "cancelar" (a `confirmacao` tem saída, a `horario` não tinha): as únicas saídas eram abandonar e esperar as 6h, ou o dono atender à mão — exatamente o custo que o produto existe para eliminar.

As fases são `proximos` (entrada, e o caminho de sempre) → `dias` → `dia`, em `dados_temporarios`:

| Chave | Papel |
|---|---|
| `__horario_fase` | Estado **explícito**. Derivar a fase do formato das strings em `__opcoes_oferecidas` seria type-tag implícita dentro de string |
| `__dia_escolhido` | `YYYY-MM-DD` no calendário do negócio. **Data, nunca instante** — é o que deixa a fase `dia` recompor os slots sem lógica de fuso nova |
| `__dias_desde` | Cursor de paginação de dias. **Cursor de data, não offset**: entre a mensagem e a resposta pode virar a meia-noite, e um offset escorregaria um dia |
| `__horas_desde` | Última hora **já mostrada** num dia longo. Limite exclusivo |
| `__horario_v` | Marcador de formato (`2`) — ver abaixo |

Decisões que não são óbvias:

- **O escape é opcional, não o caminho padrão.** Quem aceita horário próximo troca exatamente as mesmas mensagens de antes; só quem precisa de outro dia paga +2 idas e voltas. Trocar por "dia sempre primeiro" custaria +1 mensagem para todo mundo e esconderia a vaga imediata — caro num produto vendido por não perder cliente.
- **A linha de escape só aparece se existir outro dia com vaga.** Numa agenda que só tem hoje, ela levaria a um menu de uma opção.
- **O menu de dias lista só dias com vaga** (`diasComVaga`, não `datasNoHorizonte`). Dia fechado marcado como "sem vaga" gastaria posição do menu e levaria o cliente a uma parede.
- **`temMais` e o rodapé de teto.** `antecedencia_maxima_dias` existia sem nenhuma forma de o cliente descobrir: ele pediria "mais dias" até a opção sumir. A última página diz o teto em voz alta.
- **Fase `dia` vazia nunca encerra a conversa** — volta ao menu de dias. Uma regra cobre três casos: virou a meia-noite, o dia lotou durante a conversa, os horários já passaram.
- **Zero query nova e zero migration.** `montarContexto` já carrega grade e ocupados do horizonte inteiro em toda mensagem. As sub-fases são comportamento interno de uma etapa de sistema: `fluxo_etapas`, o builder e o seed não mudam.

**`__horario_v` existe porque `fluxo_snapshot` não cobre este caso.** O snapshot protege reordenação de etapas, não o comportamento interno de uma etapa, que é código. Uma conversa parada na etapa no instante do deploy tem só ISOs em `__opcoes_oferecidas` e nenhuma chave nova — sem o marcador, quem digitasse "9" cairia em "quero escolher outro dia" sem ter visto a linha. Ausente = engine antiga ⇒ interpreta como índice puro. **O shim pode sair no deploy seguinte**, porque toda conversa anterior já expirou pelas 6h.

**Duas invariantes que uma revisão pegou como bug real, e que o teste original chegou a assar:**

1. **Mostrar o menu de dias implica o estado dizer `fase: "dias"`.** `apresentar` é pura sobre `dados` e não conseguia corrigir a fase quando descobria, no meio do caminho, que o dia escolhido tinha esvaziado — o estado ficava dizendo `"dia"` com opções que eram datas. A escolha seguinte gravava `"2026-08-11"` em `__data_hora`: data **válida** para o `Date`, que vira meia-noite UTC e portanto **21:00 do dia anterior** em São Paulo. O cliente escolhia "ter 11/08" e o bot respondia "seg 10/08 21:00", criando agendamento no dia errado e fora do horário de funcionamento. O conserto é o campo `dados` de `Apresentacao`, um patch que `avancarPara` mescla (com `undefined` apagando a chave), emitido **incondicionalmente** por `apresentarMenuDeDias`.
2. **Nenhuma navegação pode ser porta de mão única.** A última página de dias não tinha "Ver mais dias" nem volta: quem paginava longe demais só saía abandonando — o defeito desta etapa, repetido em miniatura. Daí `ACAO_PRIMEIROS_DIAS`, oferecida a partir da segunda página.

**`ehInstanteDaEngine` é mais estrito que `Number.isFinite`, de propósito.** Toda opção de horário nasce de `slot.inicio.toISOString()`, então exigir ida e volta exata (`new Date(v).toISOString() === v`) rejeita data sem hora, sentinela e estado corrompido — coisas que `Number.isFinite` aceitava.

**Sentinela de navegação nunca pode virar valor.** As ações entram em `__opcoes_oferecidas` como `__acao:*`, e o ramo `horario` valida `Number.isFinite(new Date(escolha).getTime())` antes de gravar `__data_hora`. A guarda da `confirmacao` faz o mesmo. Sem isso, `formatarSlot(new Date("__acao:..."))` lança `RangeError` dentro de `decidir` e **antes** de `persistir`: a Evolution recebe 500 e entra em **retry do mesmo webhook indefinidamente**, com a conversa travada por 6h. E a checagem de passado logo abaixo compara `NaN < limite`, que é `false` — a data inválida atravessaria e criaria agendamento.

**A invariante que não pode cair em nenhuma fase:** a resposta é interpretada contra a lista **que foi apresentada** (`__opcoes_oferecidas`), nunca contra uma recalculada. É ela que impede o cliente de agendar um horário que não pediu quando alguém agenda no meio da conversa. Há um teste por fase.

### Botão e lista do WhatsApp estão fora, e não é escolha estética

Não reabrir sem migrar para a API oficial da Meta, que o CLAUDE.md fecha em outro lugar. Três motivos independentes, cada um suficiente:

- O **Baileys depreciou botões e listas de propósito** — o mantenedor escreveu que o gato e rato com a Meta era insustentável ([DEV](https://dev.to/purpshell/buttons-and-lists-get-deprecated-by-many-libraries-54h), [Baileys #2465](https://github.com/WhiskeySockets/Baileys/issues/2465)).
- A **2.3.7 especificamente está quebrada**: `TypeError: this.isZero is not a function` e HTTP 400 ([#2390](https://github.com/EvolutionAPI/evolution-api/issues/2390), fechada como *not planned*); `sendButtons` devolve 201 e a mensagem **nunca é entregue** ([#2404](https://github.com/evolution-foundation/evolution-api/issues/2404)).
- **Enquete também não serve**: o voto não chega pelo webhook de forma confiável ([#1644](https://github.com/EvolutionAPI/evolution-api/issues/1644), [Baileys #2228](https://github.com/WhiskeySockets/Baileys/issues/2228)).

Sobre o tamanho dos menus: **o 7±2 de Miller não se aplica** — ele é sobre recall, e menu no WhatsApp é reconhecimento, com a lista rolável no histórico ([NN/g](https://www.nngroup.com/videos/magical-number-7-ux/)). O teto emprestado que faz sentido é o da própria Meta, que limita a interactive list dela a [10 linhas](https://developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-list-messages/). `MAX_OPCOES_HORARIO_DO_DIA` **ainda precisa ser medido em aparelho**: se o WhatsApp truncar com "Ler mais" acima de N linhas em texto livre de sessão, é esse N que manda — não achei fonte para o limiar fora de template da Cloud API.

**Parse de data em texto ("20/08", "sexta") não entra.** A linha do projeto é léxico fechado de literais fixos (`AFIRMATIVAS`/`NEGATIVAS`), que não é NLP. Parse de data é generativo e ambíguo, e o modo de falha muda de "não entendi, aqui está o menu" para "entendi algo que você não quis dizer" — que é literalmente o que `/como-funciona` vende contra e afirma em público não existir. Com as três fases, o caminho numerado já alcança todo o horizonte, então um parser deixaria de resolver um problema.

---

## Pausa para atendimento humano

Com o bot ligado, o dono não tinha **nenhuma** forma de assumir a conversa: ele digitava no celular e o bot respondia por cima na mensagem seguinte do cliente, os dois falando ao mesmo tempo. A granularidade da pausa é **por conversa**, não por tenant — o dono atendendo um cliente à mão não é motivo para o bot parar de atender os outros seis —, e a chave dessa granularidade já existia: o unique `(usuario_id, remote_jid)` de `conversas_estado`. Por isso é **uma coluna** (`pausado_ate timestamptz`, nulo = ativo), não tabela nova. `lib/bot/pausa.ts` é a fonte única de "está pausada?", pura e sem Supabase, porque os consumidores leem a linha por caminhos diferentes (webhook com admin, painel com RLS).

**O sinal de que o dono assumiu já chegava no webhook e era descartado.** Medido contra a Evolution 2.3.7 em 2026-08-10, com instância descartável e número real:

| origem | evento | `key.fromMe` | `data.source` | `key.id` |
|---|---|---|---|---|
| cliente, celular dele | `messages.upsert` | `false` | `android` | `ACBBDAED…` |
| **dono, digitando no celular** | `messages.upsert` | **`true`** | `android` | `AC95918F…` |
| **dono, pelo WhatsApp Web** | `messages.upsert` | **`true`** | `web` | `3EB03BFB…` |
| **nós, por `sendText`** | **`send.message`** | `true` | `web` | `3EB02FBC…` |

A última linha é o que sustenta tudo: **envio por API nunca chega como `messages.upsert`**, só como `send.message` — evento que `NOME_EVENTOS_WEBHOOK` não assina (verificado buscando os ids enviados em todo o tráfego capturado: zero ocorrências). Logo, dentro daquele evento, `fromMe: true` é sempre o dono, e **não é preciso registrar os ids que enviamos** para se distinguir deles. **Assinar `SEND_MESSAGE` quebra isso em silêncio** — toda mensagem do bot pareceria o dono e pausaria o bot na própria conversa que ele atende, sem erro em lugar nenhum; há teste afirmando a *ausência* do evento na lista, no idioma dos testes de SEO. E **`data.source` não serve**: o dono pelo WhatsApp Web e o nosso envio dão os dois `web`, com id no mesmo formato `3EB0…` (é o `getDevice` do Baileys derivando dispositivo do formato do id).

Decisões que não são óbvias:

- **A mensagem do dono não precisa ter texto.** Áudio, foto e sticker contam como intervenção — exigir texto deixaria o bot atropelando o dono justamente quando ele responde por áudio, que é o mais comum aqui.
- **O gate não escreve nada.** Não zera `dados_temporarios` (o cliente pode estar no meio da etapa de horário), não grava `ultima_mensagem_id` (a mensagem não foi processada) e não avisa o cliente — anunciar "o atendimento automático está pausado" seria o bot se intrometendo na conversa que ele saiu da frente para permitir. `pausado_ate` entra no `select` que já existia, então o gate custa **zero query**.
- **`pausarPorAtendimentoHumano` é `upsert`, não `update`.** O dono abrir a conversa de um cliente que nunca falou com o bot e mandar a primeira mensagem é caso comum, não de borda. Não toca `atualizado_em`, que governa a expiração de 6h: rejuvenescer a conversa faria o cliente voltar semanas depois para uma etapa abandonada.
- **O fail-safe é o INVERSO do de assinatura, de propósito.** Data inválida em `pausado_ate` **libera** o bot. Lá o risco de errar é receita, então bloqueia; aqui é o cliente do dono esperando resposta para sempre, então solta.
- **A retomada não interpreta a mensagem que chegou.** `retomarConversa` reapresenta a etapa com um aviso. Durante a pausa o cliente conversou com uma pessoa, então a última lista que o bot apresentou pode estar dez mensagens atrás — ler um "1" daquele diálogo humano como opção de menu faria o bot avançar etapa por engano.
- **A janela é renovada, não somada** (`fimDaPausa` a cada mensagem do dono), e o TTL de 60 min é constante de módulo: configurável por tenant é mais um campo digitado à mão onde typo vira bot mudo.
- **O cron de lembrete ignora `pausado_ate`, e o webhook de pagamento também.** Os dois são sobre um agendamento que já existe, não sobre a conversa: o lembrete é o que reduz no-show (o ROI que paga o mês) e o "sinal recebido" é confirmação de dinheiro que entrou. Pausa é do fluxo de agendamento, e só dele.
- **O gate de pausa fica antes de `montarContexto`, que é onde a cobrança de sinal varre os holds vencidos — e isso parece bug até se ler a invariante do outro lado.** A varredura preguiçosa existe para rodar imediatamente antes de calcular disponibilidade, que é o único instante em que um slot indevidamente bloqueado causa dano. O caminho de pausa **nunca calcula disponibilidade**, então a garantia continua de pé: qualquer outra conversa do tenant varre antes do próprio cálculo, e um tenant cuja única mensagem caiu numa conversa pausada não tem ninguém agendando para prejudicar. Mover a varredura para antes do gate só compraria escrita no caminho quente de uma mensagem que o bot não vai responder.

**A saída pelo lado do cliente (`0` / "atendente") é léxico fechado com comparação exata, nunca `includes`.** Substring transformaria "vou levar uma pessoa comigo" numa etapa `texto_livre` em silêncio do bot, e o modo de falha mudaria de "não entendi, aqui está o menu" para "entendi algo que você não quis dizer" — que é o que `/como-funciona` afirma em público que este produto não faz. O `0` só vale em etapa de menu (nos menus é livre porque `lerIndice` é 1-based; numa `texto_livre` é resposta legítima), e o intercepto fica **antes de tudo** em `decidir`, para funcionar na primeira mensagem, no meio do fluxo e dentro do cancelamento. A linha que anuncia a opção é colada no fim da mensagem da etapa, e só no primeiro contato e nas reapresentações de erro — anunciar em toda etapa inflaria cada pergunta, e mensagem separada seria duas notificações no celular do cliente.

**O aviso ao dono usa o self-chat, e é o que impede a feature de ser pior que não existir** — sem ele, o cliente ouviria "avisei o pessoal", o bot silenciaria por uma hora e ninguém ficaria sabendo. Medido: `sendText` para o próprio número da instância entrega (`send.message` + `SERVER_ACK`, confirmado no aparelho). O número vem do `sender` do payload, **em memória**: `perfis` continua guardando só o HMAC, e é isso que sustenta a minimização de dados. O aviso identifica quem pediu (`pushName` → telefone → identificador do JID), senão o dono teria de abrir todas as conversas. Fail-open: falha de envio só vira log, porque a pausa já está gravada e um 500 faria a Evolution reentregar o webhook e o cliente receber a mesma mensagem várias vezes.

**No painel, o privilégio de escrita é de COLUNA.** `grant update (pausado_ate)` mais policy de update: RLS decide quais linhas, o grant decide quais colunas. Um `grant update` de tabela abriria `dados_temporarios`, `etapa_atual_id` e `fluxo_snapshot` para o cliente autenticado — ou seja, reescrever à mão o estado de uma conversa em voo. As duas metades são necessárias: sem o grant a policy não basta, sem a policy o grant não basta. A seção em `/conexao-whatsapp` existe porque **pausar já tinha caminho natural** (digitar no WhatsApp) e **retomar não tinha nenhum**: quem pausou por engano esperava a hora vencer sozinha. Os rótulos e horários chegam **já formatados no fuso do negócio** pelo Server Component — o runtime da Vercel é UTC e o navegador do dono pode estar em qualquer fuso.

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
WEBHOOK_BASE_URL=
APP_PUBLIC_URL=
CRON_SECRET=
MERCADO_PAGO_CLIENT_ID=
MERCADO_PAGO_CLIENT_SECRET=
MERCADO_PAGO_REDIRECT_URI=
MERCADO_PAGO_WEBHOOK_SECRET=
PAGAMENTO_CRYPTO_KEY=
```

O `.env.example` é a fonte com as explicações: cada variável documenta **o que
acontece quando ela está vazia**, que é a informação que falta na hora do
incidente.

**`WEBHOOK_BASE_URL` e `APP_PUBLIC_URL` são duas porque as exigências são
opostas, e por um tempo foram uma só.** A primeira é onde a **Evolution API**
alcança este app: com a Evolution em container na mesma máquina, o valor certo é
o gateway da rede dela (`172.20.0.1:3000`, de `docker exec <container> ip route`),
privado de propósito — assim o bot não passa a depender de um túnel de
desenvolvimento para responder. A segunda é o `notification_url` do Pix, ou seja,
por onde os **servidores do Mercado Pago** chamam de volta, e tem de ser roteável
da internet. Em produção as duas coincidem na URL da Vercel; em dev, a pública é a URL do
túnel apontando para a porta do app, e a outra segue privada.

Com uma variável só, consertar um lado quebrava o outro em silêncio — e o modo de
falha é o pior do produto: o cliente paga, a confirmação nunca chega, a varredura
de holds vencidos cancela o agendamento e, como o webhook nunca rodou, nem
`estorno_pendente` é levantado. Ninguém descobre que há dinheiro para devolver.
Por isso `urlDeNotificacao` **lança** quando o host resolvido é loopback ou RFC
1918, em vez de emitir um Pix impossível de confirmar: recusar custa um
agendamento sem sinal, emitir custa o dinheiro do cliente. É a mesma direção da
guarda de `collector_id`.

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

**Segunda faixa, já implementada (plano Garantido, R$ 64,90):**
- Cobrança de sinal por Pix (`perfis.plano = 'sinal'`), com a conta do dono
  conectada por OAuth. O trial pode nascer nesta faixa, escolhido no passo 2 do
  cadastro; a troca depois é manual. **Aguarda piloto real** para medir liquidação,
  webhook em produção e taxa — e revisão jurídica antes de ir ao ar.

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