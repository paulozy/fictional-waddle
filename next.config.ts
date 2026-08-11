import type { NextConfig } from "next";

/**
 * Origens extras aceitas em Server Action, para desenvolvimento atrás de túnel.
 *
 * O Next faz uma checagem de CSRF em toda Server Action: compara o `Origin` da
 * requisição com o `Host` (ou `X-Forwarded-Host`) e **rejeita quando divergem**
 * — está escrito assim em `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`.
 *
 * Com o app exposto por ngrok/cloudflared, é exatamente o que acontece: o
 * navegador manda `Origin: https://algo.ngrok-free.app` e o servidor local se vê
 * como `localhost:3000`. Toda Server Action passa a falhar — inclusive **o
 * login e o botão de conectar o Mercado Pago**, que é o laço em que se cai ao
 * tentar rodar o OAuth localmente: a tela devolve para o login, o login também é
 * Server Action, e o erro só aparece no console do navegador.
 *
 * Vem de env var, e não fixo no arquivo, por dois motivos: o domínio do ngrok
 * gratuito muda a cada restart, e afrouxar CSRF é coisa de desenvolvimento —
 * cravar aqui levaria a config para produção sem ninguém decidir isso. Vazia (o
 * default), nada muda.
 */
const origensExtras = (process.env.SERVER_ACTIONS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origem) => origem.trim())
  .filter(Boolean);

/**
 * A MESMA lista serve o `allowedDevOrigins`, e a segunda metade custou uma tarde.
 *
 * O dev server bloqueia cross-origin para os recursos de `/_next/*` — o log diz
 * `Blocked cross-origin request to Next.js dev resource /_next/webpack-hmr`. Sem
 * os chunks o cliente **não hidrata**, e o sintoma não se parece com nada disso:
 * o `<form>` da tela de conexão cai no submit nativo, o navegador recarrega a
 * página com `?numero=…` na query, e nenhum QR code aparece. Nada de erro na
 * tela, nada de erro no terminal fora daquele aviso.
 *
 * Reusar a variável em vez de criar uma segunda é decisão, não preguiça: aqui as
 * duas exigências são **idênticas** (a origem pela qual o navegador abre o app),
 * ao contrário de `WEBHOOK_BASE_URL`/`APP_PUBLIC_URL`, que foram separadas
 * justamente porque as exigências eram opostas. Duas variáveis com o mesmo valor
 * obrigatório são duas chances de divergirem em silêncio.
 *
 * `allowedDevOrigins` é ignorado em produção, então não há config de
 * desenvolvimento vazando para o build.
 */
const nextConfig: NextConfig = {
  ...(origensExtras.length > 0 && {
    experimental: { serverActions: { allowedOrigins: origensExtras } },
    allowedDevOrigins: origensExtras,
  }),
};

export default nextConfig;
