/**
 * Preferências de layout guardadas em cookie. Módulo **puro**, sem `"use client"`.
 *
 * O nome do cookie mora aqui, e não junto do componente que o escreve, por um
 * motivo que custou uma medição em navegador: `components/barra-lateral.tsx` é
 * `"use client"`, e um Server Component que importa uma constante de um módulo
 * de cliente **não recebe o valor** — recebe a referência de cliente que o Next
 * põe no lugar dos exports daquele módulo. O `cookies().get(...)` do layout
 * então procurava por algo que não era a string, achava `undefined`, e o menu
 * voltava expandido a cada recarregamento sem erro nenhum no console.
 *
 * Cookie e não `localStorage` porque a primeira pintura precisa já sair na
 * largura certa: o layout do painel é RSC, e decidir isso num efeito faria o
 * conteúdo saltar 188px em toda navegação.
 */

export const COOKIE_SIDEBAR_RECOLHIDA = "sidebar_recolhida";

/** Um ano: é preferência de layout, não sessão. */
export const VALIDADE_PREFERENCIA_SEGUNDOS = 60 * 60 * 24 * 365;
