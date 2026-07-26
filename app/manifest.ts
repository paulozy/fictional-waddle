import type { MetadataRoute } from "next";

/**
 * Manifesto de aplicativo web.
 *
 * O que isto entrega, com honestidade: **ícone na tela inicial e abertura sem
 * a barra do navegador**. O dono abre a agenda todo dia, muitas vezes por dia,
 * e hoje o caminho é lembrar a URL ou caçar a aba — atrito diário que um
 * toque no ícone resolve.
 *
 * O que isto **não** entrega: offline e notificação push. Os dois exigem
 * service worker, que o Next não gera, e nenhum dos dois é o que trava a
 * validação da V0. Quando lembrete por push virar requisito, é aqui que a
 * conversa recomeça.
 *
 * No iOS não há prompt de instalação: o dono precisa passar por Compartilhar →
 * Adicionar à Tela de Início. Vale explicar isso no onboarding em vez de
 * esperar que ele descubra.
 *
 * As cores repetem `--background` de `app/globals.css` e o `themeColor` de
 * `app/layout.tsx`. Divergir faz a tela de abertura piscar numa cor e a
 * aplicação abrir em outra.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AgendaZap — agendamento pelo WhatsApp",
    short_name: "AgendaZap",
    description:
      "Agenda do seu estabelecimento: horários, serviços e lembretes automáticos pelo WhatsApp.",
    lang: "pt-BR",
    dir: "ltr",
    /**
     * Abre direto na agenda, não na landing. Quem instalou já é cliente — cair
     * na página de vendas seria um toque a mais toda vez. Sem sessão, o
     * `proxy.ts` redireciona para o login.
     */
    start_url: "/agendamentos",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FDFBF7",
    theme_color: "#FDFBF7",
    categories: ["business", "productivity"],
    icons: [
      /**
       * O mesmo arquivo declarado duas vezes, com propósitos diferentes.
       *
       * A spec aceita `purpose: "any maskable"` numa entrada só, mas o tipo
       * `MetadataRoute.Manifest` do Next aceita apenas um valor por entrada —
       * duas entradas produzem o mesmo resultado sem `as`.
       *
       * Servir o mesmo desenho nos dois papéis só é honesto porque ele tem
       * margem própria: o Android recorta até 20% de cada borda na máscara
       * adaptativa, e um monograma encostado na borda sairia decapitado.
       */
      {
        // `app/icon.tsx` gera este PNG em build; ver o comentário de lá.
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
