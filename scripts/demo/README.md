# Vídeo de demonstração para prospecção

Gera dois mp4 — vertical (WhatsApp) e desktop (site/e-mail) — mostrando a
conversa do cliente com o bot e o agendamento aparecendo na agenda do dono.

```sh
supabase start          # a stack local precisa estar no ar
npm run demo:video      # semeia, grava e converte
```

Saída em `scripts/demo/saida/` (fora do versionamento).

## Por que assim

**Nunca grave contra produção.** O `.env` do projeto aponta para o Supabase real.
`semear.mjs` **recusa** qualquer URL que não seja `localhost`/`127.0.0.1`, e
`gravar.mjs` passa as variáveis locais explicitamente para o `next dev` que ele
sobe na porta 3100. Sem isso, gravar criaria conta e agendamentos falsos no banco
que atende os pilotos, e o vídeo poderia expor nome de cliente real.

**O Playwright não desenha o cursor do mouse.** Verificado extraindo frames: sem
o cursor injetado por `SCRIPT_PAGINA`, os cliques acontecem sem causa visível na
tela. O cursor segue os eventos `mousemove` reais que o Playwright dispara via
CDP, então o script não precisa mover duas coisas em paralelo. `pointer-events:
none` é obrigatório — sem ele o cursor intercepta o próprio clique.

**O Playwright grava VP8 em WebM**, que o WhatsApp não toca como vídeo e o
iOS/Safari também não. `converter.mjs` é etapa obrigatória, não conveniência.

**`next dev`, não `next build && next start`.** O build inlinaria a URL do
Supabase local dentro de `.next`, e um `npm run start` posterior falaria com
localhost achando que fala com produção. O custo é pré-aquecer as rotas antes de
gravar, para nenhuma compilação aparecer no vídeo.

**As datas da conversa são reescritas.** `components/conversa-demo.tsx` tem datas
fixas ("sex 15/08") porque a landing é estática. O roteiro troca pelas datas que
o seed realmente gravou, no mesmo formato que `formatarSlot` produz — senão a
conversa marca um dia e a agenda mostra outro. **Se o formato da engine mudar,
`rotuloDoDia` em `gravar.mjs` precisa acompanhar**, ou o vídeo passa a mentir
sobre ser transcrição literal.

**O seed deixa 09:00 e 10:30 livres de propósito.** São as outras duas opções que
o bot oferece na conversa. Ocupá-las seria o bot oferecendo vaga que a agenda, dois
segundos depois, diz estar tomada.

**O tenant nasce com `status_assinatura = 'ativo'`.** Em `trial` o
`components/banner-assinatura.tsx` apareceria no topo de todas as telas e o vídeo
mostraria uma cobrança nossa para o lead.

## O que o roteiro não pode dizer

`roteiro.mjs` concentra o texto para ser revisável. Duas regras:

- **Nada de número de redução de falta.** A base defensável (Cochrane CD007458) é
  evidência de saúde, não de barbearia. Os "20-30% caem para 3%" que circulam são
  material de venda de fornecedor, sem metodologia.
- **Nada de IA.** O fluxo é menu numerado, e isso é virtude — funciona com cliente
  de qualquer idade e internet ruim. `/como-funciona` afirma em público que não há
  interpretação de texto livre.

## Ajustes

- Ritmo das falas: `RITMO` em `roteiro.mjs`.
- Legendas: `LEGENDAS` em `roteiro.mjs`.
- Formatos e zoom do cartão: `FORMATOS` em `gravar.mjs`.
