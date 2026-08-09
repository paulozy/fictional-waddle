# Changelog

Mudanças com consequência para quem usa o produto ou para quem mexe no código.
Não registra refatoração interna sem efeito observável.

## [Não lançado]

### Cobrança de sinal por Pix (adicional)

O bot passa a poder pedir um **sinal por Pix** antes de fechar o agendamento,
segurando o horário até o pagamento cair. É **capacidade adicional**, desligada
por padrão: exige `perfis.plano = 'sinal'` e a conta do Mercado Pago do dono
conectada.

**O dinheiro nunca passa pela Encaixaria.** O dono autoriza a própria conta por
OAuth, e toda cobrança é criada com o token dele — o `collector_id` é ele por
construção, não há split nem comissão. Passar o dinheiro pela nossa conta seria
conta bolsão, vedada pelo art. 90-A do Regulamento do Pix (Res. BCB 269/2022).

#### Adicionado

- Tela **Pagamentos** no painel: conectar/desconectar a conta do Mercado Pago,
  configurar o prazo do sinal e devolver sinal de cliente que pagou e ficou sem
  horário.
- Campo **valor do sinal por serviço** — o dono pode cobrar na progressiva e
  deixar o corte livre. Vazio significa "este serviço não cobra".
- Duas mensagens no WhatsApp ao confirmar: o aviso com valor e prazo, e o
  **copia-e-cola Pix sozinho** numa mensagem própria (texto em volta entraria na
  cópia e o banco recusaria o código).
- Webhook `POST /api/webhook/pagamento/mercadopago`, com validação de HMAC do
  `x-signature` e **reconsulta obrigatória** do pagamento na API do provedor.
- Callback OAuth `GET /api/pagamentos/mercadopago/callback`, com `state` em
  cookie `httpOnly` contra CSRF.
- Rótulo de sinal na agenda (lista e grade), como eixo separado do status.
- Tabelas `credenciais_pagamento` (tokens cifrados com AES-256-GCM, RLS sem
  nenhuma policy) e `cobrancas_sinal`; colunas `sinal_status`/`sinal_expira_em`
  em `agendamentos`, `valor_sinal` em `servicos`, e
  `pagamento_conectado_em`/`sinal_minutos_validade` em `perfis`.
- RPCs `expirar_sinais_vencidos` e `confirmar_sinal_pago`.
- Teste ponta a ponta (`tests/e2e/sinal-pix.test.ts`) e fumaça HTTP contra o
  servidor real (`npm run e2e:fumaca`), ambos **sem ler nenhum `.env` do
  projeto**: provedores são stubs locais e todo segredo é inventado no teste.

#### Alterado

- **`perfis.plano` deixou de ser coluna morta.** Ganhou CHECK
  (`'basico' | 'sinal'`), default `'basico'` e backfill — o valor `'trial'`
  antigo confundia capacidade com estado de assinatura, que é
  `status_assinatura`. Continua **digitado à mão**, como o resto da cobrança
  nesta fase.
- `cancelado_por` aceita `'sistema'` e `cancelamento_motivo` aceita
  `'sinal_nao_pago'`: a expiração de prazo não é decisão de ninguém, e atribuí-la
  ao dono mentiria no relatório de ocupação.
- O cron diário agora também **varre sinais vencidos de todos os tenants**, e
  devolve `sinais_expirados` no resumo.
- Texto público atualizado em `/precos`, `/termos`, `/privacidade`, `/sobre`,
  FAQ e nas duas páginas de comparação. `lib/plano.ts` deixou de afirmar que o
  produto "não cobra sinal".

#### Decisões que vale conhecer antes de mexer

- **Não existe `status = 'aguardando_sinal'`.** O agendamento nasce `confirmado`
  e portanto bloqueia o slot desde o primeiro instante, pela constraint que já
  existia; o sinal vive em coluna própria. Um valor novo em `status` obrigaria
  todo lugar que pergunta "este horário está ocupado?" a conhecer dois valores, e
  o primeiro que esquecesse um reofereceria uma vaga já reservada.
- **A expiração é preguiçosa**, não agendada: roda no início do cálculo de
  disponibilidade, que é o único instante em que um slot travado causa dano. O
  cron da Vercel no plano Hobby é 1x/dia, grosso demais para um prazo de minutos.
- **Falhar ao cobrar não derruba o agendamento.** Se o provedor estiver fora do
  ar, o horário fica de pé sem sinal e o cliente ouve a confirmação normal.
  Direção oposta à do gate de assinatura, e de propósito.
- **Estorno é sempre manual.** É a conta do dono, e a contestação bate nela.

#### Limites conhecidos

- O teste ponta a ponta valida a **nossa** lógica, não o comportamento real do
  Mercado Pago. Liquidação, webhook em produção e taxa efetiva continuam sem
  medição — dependem de uma segunda conta real, e a candidata é o primeiro salão
  piloto (ver `spikes/pagamentos-pix/README.md`).
- O piso de 30 minutos para o prazo vem da documentação do provedor e **ainda não
  foi medido** contra o servidor real.
- **Ir ao ar pede revisão jurídica.** GO técnico não é autorização para enviar.
