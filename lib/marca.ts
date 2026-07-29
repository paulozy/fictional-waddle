/**
 * Geometria da marca. Módulo **puro**.
 *
 * O arquivo de origem (`public/encaixaria-icon.png`) é um quadrado de 500×500
 * em que o desenho ocupa só o miolo: bounding box de 259×261 px, com ~120 px
 * de margem transparente em cada lado. Essa margem é do arquivo, não uma
 * escolha de layout — e ela atrapalha em todo destino:
 *
 * - No favicon de 32 px o desenho renderizaria a 16,6 px úteis, e um mark de
 *   quatro elementos nesse tamanho já é limítrofe sem desperdiçar metade do
 *   quadro.
 * - No `apple-touch-icon` o iOS não acrescenta padding nenhum, então a margem
 *   do arquivo vira o padding final — e fica pequeno demais.
 * - No ícone maskable do Android a margem se soma à safe zone e o desenho
 *   flutua num disco grande.
 * - No header, um `<Image width={28}>` pinta o desenho a 14,5 px, metade do
 *   pedido.
 *
 * A correção é a mesma nos quatro casos: renderizar a imagem **maior** que o
 * quadro visível e recortar o excedente. Este módulo tem só a conta disso, e
 * existe para que a fração medida não fique repetida em quatro arquivos —
 * trocar o PNG por outro com margem diferente quebra o teste aqui, em vez de
 * degradar os ícones em silêncio.
 */

/**
 * Fração do lado do quadro ocupada pelo desenho no arquivo de origem.
 *
 * Medido decodificando `public/encaixaria-icon.png`: bbox opaco de x 123..381
 * e y 124..384 num canvas de 500×500 → 259/500 = 0,518.
 *
 * **Ao trocar o PNG, remedir.** O valor não é convenção nem estimativa.
 */
export const FRACAO_DESENHO = 0.518;

/**
 * De que tamanho renderizar a imagem para o desenho ocupar `ocupacaoAlvo` do
 * quadro visível.
 *
 * `canvas` é o lado do quadro final em px; `ocupacaoAlvo` vai de 0 a 1. O
 * excedente é recortado pelo contêiner, então o retorno costuma ser bem maior
 * que `canvas` — a 94% de ocupação num quadro de 32 px, a imagem é renderizada
 * a 58 px e sobra pouco mais que o desenho.
 *
 * Não há deslocamento a calcular junto: um contêiner flex centralizado com
 * `overflow: hidden` recorta simetricamente sozinho, tanto no Satori quanto no
 * navegador.
 */
export function tamanhoParaOcupacao(
  canvas: number,
  ocupacaoAlvo: number,
): number {
  return Math.round((canvas * ocupacaoAlvo) / FRACAO_DESENHO);
}

/**
 * Quanto o desenho de fato ocupa depois do arredondamento.
 *
 * Serve ao teste: garante que a conta de ida e volta não escorregue mais que
 * um pixel do alvo.
 */
export function ocupacaoResultante(
  canvas: number,
  tamanhoRenderizado: number,
): number {
  return (tamanhoRenderizado * FRACAO_DESENHO) / canvas;
}

/**
 * Ocupação por destino, num lugar só.
 *
 * Os números não são arbitrários:
 *
 * - `favicon` — recorte apertado. A 16 e 32 px a margem é desperdício puro; o
 *   mark já é limítrofe nesse tamanho mesmo preenchendo o quadro.
 * - `app` — ícone `any` do manifesto. O web.dev recomenda tratá-lo "como o
 *   favicon do site, com regiões transparentes e sem padding extra", daí o
 *   valor alto.
 * - `apple` — o iOS aplica a própria máscara superelíptica **sem** recortar
 *   conteúdo, então 70% respira sem risco.
 * - `maskable` — a safe zone do Android é um círculo de raio 40% do lado. A
 *   66% de largura o raio efetivo do desenho fica em ~33%, com folga para o
 *   corte de até 10% da borda que algumas plataformas aplicam.
 */
export const OCUPACAO = {
  favicon: 0.94,
  app: 0.84,
  apple: 0.7,
  maskable: 0.66,
} as const;

/** Cor de fundo dos ícones que não podem ser transparentes. */
export const FUNDO_OPACO = "#FDFBF7";
