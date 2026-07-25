# AgendaZap

SaaS de agendamento e triagem via WhatsApp para negócios de horário marcado (salões, clínicas, barbearias, esteticistas). O bot responde **pelo próprio número do estabelecimento**, mostra horários livres, confirma o agendamento e manda lembrete no dia anterior.

A especificação de produto e as regras de arquitetura estão em [`CLAUDE.md`](./CLAUDE.md). Este arquivo cobre só como rodar.

## Stack

Next.js 16 (App Router) na Vercel · Supabase (Postgres + Auth via `@supabase/ssr`) · Evolution API self-hosted em modelo multi-instância · Vercel Cron.

## Pré-requisitos

- Node 20+
- Docker (para o Supabase local)
- [Supabase CLI](https://supabase.com/docs/guides/local-development)
- Uma instância da **Evolution API 2.3.7** acessível. A partir da 2.4.0 toda instância exige ativação de licença e os endpoints de negócio respondem `503 LICENSE_REQUIRED`.

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # preencha os valores
supabase start               # sobe Postgres, Auth e Studio
supabase db reset            # aplica todas as migrations do zero
npm run tipos:banco          # regenera lib/supabase/tipos-banco.ts
npm run dev
```

O `supabase start` imprime as chaves locais — use `API_URL` em `NEXT_PUBLIC_SUPABASE_URL`, `ANON_KEY` e `SERVICE_ROLE_KEY` nas respectivas variáveis.

### Webhook em desenvolvimento

`WEBHOOK_BASE_URL` é o endereço em que **a Evolution API alcança este app**, não a URL que você abre no navegador. O valor depende de onde ela roda:

- **Container Docker na mesma máquina** — `localhost` dentro do container é o próprio container. Use o gateway da rede dela:

  ```bash
  docker exec evolution_api ip route | grep default   # ex: 172.20.0.1
  # WEBHOOK_BASE_URL=http://172.20.0.1:3000
  ```

  Para não depender do IP da subrede, adicione `extra_hosts: ["host.docker.internal:host-gateway"]` ao serviço no compose e use `http://host.docker.internal:3000`.

- **Evolution em outra máquina** — aí sim precisa de túnel:

  ```bash
  cloudflared tunnel --url http://localhost:3000   # ou ngrok http 3000
  ```

`next dev` escuta em `0.0.0.0` por default, então não precisa de flag extra para aceitar a conexão vinda do container.

### Testando sem responder a contatos reais

O bot atende **qualquer** número que mandar mensagem privada para a instância pareada. Se você parear um WhatsApp pessoal, seus contatos entram no fluxo de agendamento.

Para evitar isso em desenvolvimento, preencha `BOT_JIDS_PERMITIDOS` com os números de teste — o webhook ignora todo o resto. Vazia (o default) atende todos, que é o comportamento de produção.

Duas coisas úteis de saber ao testar:

- **Mensagem que você manda para si mesmo não dispara o bot.** Ela chega com `fromMe: true` e é descartada de propósito: processá-la faria o bot responder à própria resposta em loop. Teste com um segundo número.
- Um JID no formato `@lid` não carrega telefone, então para liberá-lo na allowlist é preciso usar o próprio identificador `@lid`, não o número.

O `WEBHOOK_SECRET` é o que autentica o webhook de verdade — o UUID na URL da rota é o id do usuário, não um segredo.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm test` | Suíte completa (Vitest) |
| `npm run test:watch` | Vitest em modo watch |
| `npm run build` | Build de produção + type-check |
| `npm run tipos:banco` | Regenera os tipos do banco a partir do schema local |

### Testes

Rodam em duas camadas:

- **Unitários** (`lib/**/*.test.ts`) — módulos puros. É onde mora a lógica de risco: cálculo de disponibilidade, engine de fluxo, parsing de webhook, validações. Não precisam de banco nem de rede.
- **Integração** (`tests/integracao/`) — exigem `supabase start` rodando. Cobrem RLS, a constraint anti-double-booking, as RPCs, o webhook e o cron, com a Evolution API interceptada por `msw`. Se a stack local não estiver no ar, esses arquivos são **skipados** em vez de falhar.

Async Server Components não são testáveis por Vitest (limitação documentada do Next), e é por isso que a lógica vive em `lib/` e as páginas são fiação fina.

## Estrutura

```
app/
  (marketing)/          landing page
  (dashboard)/          telas autenticadas
  login/
  api/
    cron/enviar-lembretes/       chamado 1x/dia pelo Vercel Cron
    webhook/whatsapp/[instance]/ recebe mensagens da Evolution API
lib/
  bot/
    disponibilidade.ts   cálculo de horários livres (puro)
    engine-fluxo.ts      máquina de estados dirigida por dados (pura)
    webhook-payload.ts   leitura do payload da Evolution (puro)
  supabase/              clients: server (RLS) e admin (service role)
  validacao/             schemas Zod compartilhados UI ↔ Server Action
  evolution-api.ts       único ponto de acoplamento com a Evolution API
  calendario.ts          layout do grid de agendamentos (puro)
supabase/migrations/     schema versionado — fonte de verdade
proxy.ts                 refresh de sessão (no Next 16 substitui middleware.ts)
```

## Onboarding de um estabelecimento

1. Criar conta em `/login`. Um trigger no banco cria o perfil e semeia as três etapas de sistema do fluxo.
2. Cadastrar serviços em `/servicos` e a grade semanal em `/horarios`.
3. Em `/conexao-whatsapp`, gerar o QR code e ler com o WhatsApp do estabelecimento. A instância na Evolution API é criada na primeira solicitação de QR, nomeada com o `usuario_id`.
4. Opcionalmente montar perguntas extras em `/fluxo-conversa`.

## Deploy

1. Configure as 8 variáveis de `.env.example` no projeto da Vercel.
2. `supabase db push` para aplicar as migrations no projeto remoto.
3. O `vercel.json` já registra o cron diário às 12:00 UTC (09:00 BRT). No plano Hobby a Vercel permite **uma execução por dia**, o que atende a V0.
