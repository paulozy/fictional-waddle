# Spike: receber Pix na conta do dono (Mercado Pago OAuth)

**Descartável. Não merge em `main`.** Nada aqui é importado por `app/` ou `lib/`, e
os arquivos são `.mjs` de propósito: ficam fora do `include` do Vitest
(`**/*.{test,spec}.{ts,tsx}`) e fora do typecheck do `next build`, então o spike não
consegue quebrar a suíte nem o build.

O entregável é a **tabela de resultados** abaixo, preenchida com evidência, terminando
em GO/NO-GO. Os scripts são meio, não fim.

**Inércia verificada em 2026-07-29**, com a pasta já no lugar: `npm test` dá
27 arquivos / 453 testes passando e 3 / 56 skipped — idêntico ao estado da branch antes
do spike; `npm run lint` limpo; `npm run build` passa e nenhuma rota nova aparece na
saída. A única alteração fora desta pasta é o `.gitignore`.

## Por que este spike existe

Queremos avaliar cobrar o **cliente final** (sinal de agendamento) por Pix gerado pela
Encaixaria, como capacidade de um tier acima do plano único. Hoje o produto declara
publicamente o contrário — `lib/plano.ts:48` e `app/(marketing)/termos/page.tsx:59` — e
o CLAUDE.md lista pagamento como fora de escopo.

O eixo decisivo é **regulatório, não técnico**: se o dinheiro passar pela nossa conta e
for repassado ao dono, isso é subadquirência, e a Res. BCB 522/2025 (publicada
2025-11-10) tornou a liquidação centralizada obrigatória a partir de 11/05/2026, com
assinatura JWS via ICP-Brasil, envio D+1 à Núclea e estrutura de PLD/FT — programa de
compliance, não sprint. O único caminho viável para dev solo é **nunca custodiar**: o
dono conecta a própria conta e o Pix pousa lá.

Este spike existe porque isso ainda deixa incerteza técnica alta demais para
comprometer schema. **Se Q3 falhar, o desenho todo cai** — e é melhor descobrir aqui.

## Decisões de produto já tomadas (não são escopo deste spike)

Registradas para a implementação real, se houver GO:

- **Nunca custodiar.** Monetização só pela assinatura; sem comissão sobre a transação
  do dono. Consequência boa: não precisamos de split, que é a parte do MP que fala em
  gerente comercial.
- **Confirma e só pede o sinal.** O agendamento entra confirmado e o Pix vai depois.
  Não travar slot: um hold com expiração briga com a constraint
  `agendamentos_sem_sobreposicao` (um agendamento `'pendente'` ou bloqueia o slot ou
  não, e as duas opções estão erradas de formas diferentes).
- **Tier como add-on de capacidade**, booleano, lido de `perfis.plano` — que **já
  existe** (`supabase/migrations/20260725120100_perfis.sql:30`, sem CHECK) e é lida por
  zero linhas de aplicação. Não precificar por transação nem por agendamento: mataria a
  promessa "não contamos cadeira, cliente nem mensagem" (`lib/plano.ts:31`).
- **Integração no bot é pós-confirmação**, em `executarEfeito`
  (`app/api/webhook/whatsapp/[instance]/route.ts:460`), não um tipo novo em
  `fluxo_etapas`. A RPC `confirmar_agendamento` já retorna o uuid do agendamento e a
  rota descarta hoje (linha 469, `const { error } = …`); `enviarComTolerancia`
  (linha 378) já itera um array de mensagens. Assim `decidir()` não é tocada e não há
  shim de `fluxo_snapshot` para conversas em voo.

## Pré-requisitos

1. **Aplicação no Mercado Pago** — painel → Suas integrações → Criar aplicação. Anotar
   `Client ID`, `Client Secret` e o access token da própria conta, cadastrar a
   *Redirect URL* e o *segredo de webhook*. **Feito em 2026-07-29** → ver Q1.
2. **Uma conta de vendedor separada da conta da aplicação — obrigatório, não
   conveniência.** Se o vendedor for a mesma conta que criou a aplicação, o
   `collector_id` é igual ao nosso `user_id` **por construção**, e Q3 fica verde sem
   significar nada: não haveria como distinguir "o dinheiro foi para o vendedor" de
   "o dinheiro veio para nós".

   Criar em **Suas integrações → sua aplicação → Contas de teste → "+ Criar conta de
   teste"**, tipo **Vendedor**. Até 15 simultâneas, sem exclusão; **uma já nasce junto
   com a aplicação**, então confira antes de criar outra.

   **Não** existe caminho por API para isso: `POST /users/test_user` responde
   `403 PA_UNAUTHORIZED_RESULT_FROM_POLICIES` / `blocked_by: PolicyAgent` (medido
   2026-07-29). Um script para isso foi escrito e removido — a doc atual manda pelo
   painel, e um script que não funciona é armadilha para quem vier depois.
3. **`.env.spike`** na pasta deste README, a partir de `.env.spike.example`. Já
   ignorado pelo padrão `.env*` do `.gitignore` da raiz.
4. **Túnel** (cloudflared/ngrok) — **obrigatório desde o passo 1**, não só no webhook.
   O campo do painel é descrito como "URLs (em https)", então `http://localhost` não
   serve. Ponha a URL pública em `MP_REDIRECT_URI` e aponte o túnel para `PORTA_LOCAL`.
5. **Ligar `offline_access`** nas permissões da aplicação. Sem isso o fluxo fecha mas
   **não vem `refresh_token`**, e Q2 falha por caixa desmarcada no painel — não por
   código.

Onde cada coisa fica: **Suas integrações → sua aplicação → Detalhes da aplicação →
"Editar dados"**. *Configurações básicas* tem **Setor** e **URL do site em produção**;
*Configurações avançadas* tem **"URLs de redirecionamento"**, as permissões
(`read` / `write` / `offline_access`) e o PKCE.

## As 7 perguntas

Ordenadas por "mata o desenho se for falso". O objetivo é um NO-GO barato, não
confirmar a hipótese.

| # | Pergunta | Mata o desenho se |
|---|---|---|
| Q1 | O OAuth do MP está disponível sem aprovação prévia, e sob que exigências? | Exigir aprovação comercial ou volume → provedor vira Asaas subcontas, que pede CNPJ e tem janela de avaliação de R$ 2.000/60 dias |
| Q2 | O refresh funciona **sem interação humana**, e o `refresh_token` rotaciona? | Refresh exigir o dono → cada tenant reautoriza a cada 180 dias à mão; feature morta na operação |
| Q3 | O Pix criado com o token do vendedor tem **ele** como `collector_id`? | Se o recebedor for a nossa conta, "nunca custodiar" é ficção e o problema regulatório volta inteiro |
| Q4 | O `qr_code` é um BR Code EMV válido e **pagável de fato**? | Test user não fechar Pix real → a prova exige pagamento real entre contas reais |
| Q5 | O webhook chega e o HMAC de `x-signature` valida? | Sem confirmação confiável sobra Pix estático (grátis, sem webhook) — produto bem menor |
| Q6 | A taxa real de Pix na conta do vendedor é 0%? | Taxa fixa mata sinal pequeno: R$ 1,99 sobre R$ 20 é 10%, e o dono percebe |
| Q7 | Que PII o MP devolve sobre o pagador? | Não mata nada; define a lista de descarte por LGPD antes de existir schema |

## Como rodar

O vendedor de teste é criado no painel (ver pré-requisito 2), não por script.

```sh
# Q1 + Q2 — autorização do vendedor (abrir a URL logado na conta do VENDEDOR)
node spikes/pagamentos-pix/1-oauth.mjs

# Q2 — refresh sem interação humana, e rotação do refresh_token
node spikes/pagamentos-pix/2-refresh.mjs

# Q3 + Q7 — cria Pix de R$ 0,01 e confere o collector_id
node spikes/pagamentos-pix/3-cobranca.mjs

# Q4 (metade offline) — TLV + CRC16 do payload, sem rede
node spikes/pagamentos-pix/decodificar-brcode.mjs

# Confere o decodificador contra vetores conhecidos (não precisa de credencial)
node spikes/pagamentos-pix/decodificar-brcode.mjs --autoteste

# Q5 — receptor de webhook (precisa de túnel); depois pagar a cobrança
node spikes/pagamentos-pix/4-webhook.mjs
```

Q6 não tem script: é ler o extrato da conta do vendedor depois do pagamento de Q4 e
conferir a taxa efetivamente descontada.

**São duas passadas, e a ordem economiza dinheiro.** A primeira usa test user e responde
Q1, Q2, Q3 e Q7 — inclusive **Q3, que é a que decide a arquitetura** — sem custo, porque
o `collector_id` volta na resposta mesmo em sandbox. Só depois de Q3 passar vale a
segunda passada, com duas contas reais e alguns centavos, para Q4 (liquida de verdade?),
Q5 (webhook) e Q6 (taxa em extrato). Se Q3 falhar, a segunda passada não acontece: é
NO-GO de arquitetura, e o dinheiro não teria comprado informação nenhuma.

## Resultados

Preencher com evidência — resposta crua do MP, ou link com data. `—` = não rodado.

| # | Veredito | Evidência / observação |
|---|---|---|
| Q1 | **✔** | Aplicação criada em 2026-07-29 com **CPF e conta pessoal**: nenhuma exigência de CNPJ e nenhuma aprovação comercial. Credenciais de **produção** pedem declarar segmento e URL do site (temos: `encaixaria.com.br`). Consequência: o bloqueio que fazia o Asaas ser problemático (subconta só com CNPJ) não se aplica ao MP, e o caminho serve a dev solo pré-receita. Resolvido também o ponto que a doc de OAuth deixava aberto: o campo do painel é "URLs (em https)", ou seja **HTTPS obrigatório** no `redirect_uri` — túnel é pré-requisito desde o passo 1. |
| Q2 | **✔** | Medido 2026-07-29. `scope` concedido: `offline_access payments read write`; `expires_in` 15552000s (180 dias). Refresh renovou **sem interação humana**, e **o `refresh_token` rotacionou** (digests antes/depois: `9878d0682641` → `02e373f24709`). Consequência para a produção: a gravação do par novo tem de ser a mesma operação que a chamada de refresh — perder a regravação mata a conexão daquele tenant em silêncio, e o sintoma só aparece como "o bot parou de mandar o Pix". |
| Q3 | **estrutural ✔, ponta a ponta pendente** | Não foi possível criar cobrança em sandbox — ver "O beco sem saída do sandbox". O que **está** medido: o token OAuth resolve, via `GET /users/me`, para o `user_id` do vendedor de teste (`TESTUSER…`, tag `test_user`), que é **diferente** do `user_id` da conta dona da aplicação — ou seja, **o token é identidade do vendedor, não nossa**. Como `collector_id` é por construção o dono das credenciais usadas, e não passamos `application_fee`, 100% vai para o vendedor. Falta a confirmação ponta a ponta, que sai junto com Q4/Q5/Q6 na passada real. |
| Q4 | **metade offline: ✔** | Decodificador validado em 2026-07-29 contra dois vetores independentes (`--autoteste`): o check value publicado do CRC-16/CCITT-FALSE (`123456789` → `29B1`) e um BR Code completo de referência com CRC `AD38`, que exercita os templates 26, 27, 62 e 80. Falta a metade que só um Pix real responde: se **liquida**. |
| Q5 | — | |
| Q6 | — | Blog do MP (2026-03-30) diz Pix 0% para a maioria, 0,49% só para novo CNPJ faturando ≥ R$ 15 mil/mês. Falta conferir no extrato. |
| Q7 | — | Depende de uma resposta de cobrança bem-sucedida. Já sabemos que o MP **valida o TLD do `payer.email`** (`@…test` é recusado com `payer.email must be a valid email`), o que por si só é sinal de que ele quer dado de pagador — daí a pergunta importar. |

### O beco sem saída do sandbox

Medido em 2026-07-29, na ordem em que apareceu. Fica registrado porque cada passo custou
uma rodada e o próximo a tentar merece não repetir:

1. `POST /users/test_user` → **403 `PA_UNAUTHORIZED_RESULT_FROM_POLICIES`**
   (`blocked_by: PolicyAgent`). Contas de teste hoje só pelo painel.
2. OAuth com as credenciais de **produção** da aplicação contra um vendedor de teste
   fecha e devolve token válido, mas com **`live_mode: true`**.
3. `POST /v1/payments` com esse token → **500 `user_allowed_only_in_test`**. O vendedor
   é conta de teste e o token está em modo produção: incompatíveis.
4. A saída seria um client_id/secret em modo teste. Não há: a doc diz que ao logar com
   conta de teste *"você não terá acesso a determinadas seções do Painel do
   desenvolvedor, como as **Credenciais de teste**"*.

**Conclusão prática: o sandbox do MP não cobre este fluxo sem uma segunda conta real,
e insistir nele não compra informação.** O que restava de Q3 e tudo de Q4/Q5/Q6 resolve
numa única passada real de centavos — e a contraparte real natural é **o primeiro salão
piloto**, não uma segunda conta comprada para o teste. Isso é coerente com o
sequenciamento do plano: a feature já dependia de piloto validado.

### GO / NO-GO

**GO parcial, com uma pendência que não é técnica.**

O que o spike comprou: **Q1 ✔** (sem CNPJ, sem aprovação comercial — o caminho serve a
dev solo pré-receita), **Q2 ✔** (refresh sem interação humana, com rotação medida),
**Q4 offline ✔** (payload validado), **Q3 estrutural ✔** (o token é identidade do
vendedor, não nossa). Nenhum NO-GO apareceu.

O que falta — Q3 ponta a ponta, Q4 liquidação, Q5 webhook, Q6 taxa — depende de **uma
segunda conta real**, e a candidata certa é o primeiro salão piloto. Ou seja: a
incerteza que sobra não se resolve com mais código, e o spike terminou o que era dele
fazer.

**Isso não é autorização para implementar.** Os pré-requisitos de produto continuam de
pé: cancelamento/reagendamento pelo WhatsApp (V1) não existe, e sinal cria obrigação de
devolução. Ver "Ressalvas".

## Segurança e higiene

- **`.tokens.json` guarda o `access_token` de um vendedor**, que movimenta conta
  bancária de terceiro. É o segredo mais sensível que já passou por este repositório —
  acima da `EVOLUTION_API_ADMIN_KEY`. Gitignored explicitamente na raiz. Na
  implementação real isso exigiria tabela isolada com RLS **sem policies**, no idioma
  de `trials_numero_whatsapp`, e **nunca** em `perfis` (que o dono lê via RLS).
- **`cobranca.json` pode conter dados do pagador.** Também gitignored. A produção deve
  descartar CPF/nome — a identidade do cliente final no produto é o `remote_jid`.
- **O spike não fala com o WhatsApp.** Nenhum script toca a Evolution API, então a
  regra do CLAUDE.md de nunca mexer na instância de produção não corre risco aqui.
- **Nunca fabricar o payload Pix a partir de chave armazenada** — sempre usar o que o
  PSP devolveu para a conta autenticada. Um payload montado por nós é dinheiro indo
  para o lugar errado, e o erro é silencioso do nosso lado.
- **A notificação diz que algo mudou, não que pagou.** A produção precisa reconsultar
  `GET /v1/payments/{id}` e nunca confiar no status vindo no corpo.

## Ressalvas

- **Enquadramento regulatório não é conclusão deste spike.** Mesmo com GO técnico, ir
  ao ar pede revisão de advogado: MED 2.0 (obrigatório desde 2026-02-02) e a Res. BCB
  522/2025 são recentes o bastante para material de blog estar desatualizado.
- **Contestação bate na conta do dono** (bloqueio cautelar, análise até 7 dias,
  devolução até 11 dias). Nossa cópia nunca pode dizer "o dinheiro é seu na hora e
  ninguém tira".
- **Pré-requisito de produto que este spike não resolve:** sinal cria obrigação de
  devolução, e cancelamento/reagendamento pelo WhatsApp (V1) não existe. Cobrar sinal
  antes disso transforma cada desmarcação em conversa com o dono **mais** estorno
  manual — o oposto do que o produto faz. GO técnico aqui não é autorização para
  enviar.

## Fontes

Todas lidas em 2026-07-29, salvo indicação.

- [MP — OAuth: criação](https://www.mercadopago.com.br/developers/pt/docs/security/oauth/creation)
- [MP — OAuth: renovação](https://www.mercadopago.com.co/developers/pt/docs/security/oauth/renewal)
- [MP — OAuth: boas práticas](https://www.mercadopago.com.br/developers/pt/docs/security/oauth/best-practices)
- [MP — Quanto custa receber via Pix](https://www.mercadopago.com.br/blog/quanto-custa-receber-pagamentos-via-pix-e-codigo-qr) (publicado 2026-03-30)
- [MP — Split para serviços e beleza](https://www.mercadopago.com.br/blog/split-pagamento-marketplace-servicos-beleza)
- [BCB — Manual de Padrões para Iniciação do Pix](https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf)
- [BCB — Guia MED](https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Guia_MED.pdf)
- [NDM — Liquidação centralizada de subadquirente (Res. BCB 522/2025)](https://ndmadvogados.com.br/artigo/liquidacao-centralizada-subadquirente/)
- [Asaas — FAQ subcontas (janela de avaliação)](https://docs.asaas.com/docs/duvidas-frequentes-subcontas)
- [Trinks — FAQ pagamento antecipado](https://ajuda.trinks.com/faq-pagamento-antecipado-via-site) — no nicho, cobrança geralmente **não** é gate de plano superior
