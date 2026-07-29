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
    name: "Encaixaria — agendamento pelo WhatsApp",
    short_name: "Encaixaria",
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
    /**
     * `any` e `maskable` são **arquivos diferentes**, não o mesmo declarado
     * duas vezes.
     *
     * As margens ideais dos dois papéis são opostas. O web.dev recomenda
     * desenhar o `any` "como o favicon do site, com regiões transparentes e
     * sem padding extra"; o `maskable` precisa do contrário — fundo opaco
     * preenchendo o quadro e o desenho recuado para dentro da safe zone,
     * porque o Android recorta a borda e compõe a transparência sobre uma cor
     * que ele escolhe. Um arquivo só serve bem a um papel só.
     *
     * (A spec aceita `purpose: "any maskable"` numa entrada, mas o tipo do
     * Next aceita um valor por entrada — o que aqui é indiferente, já que os
     * `src` são distintos mesmo.)
     */
    icons: [
      // Gerados por `app/icon.tsx`, transparentes.
      { src: "/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        // Gerado por `app/icone-mascara/route.tsx`, com fundo opaco.
        src: "/icone-mascara",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
