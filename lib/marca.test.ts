import { describe, expect, it } from "vitest";
import {
  FRACAO_DESENHO,
  FUNDO_OPACO,
  OCUPACAO,
  ocupacaoResultante,
  tamanhoParaOcupacao,
} from "./marca";

describe("FRACAO_DESENHO", () => {
  it("guarda a medida do arquivo de origem", () => {
    /**
     * Trava proposital. Este número foi medido decodificando
     * `public/encaixaria-icon.png` (bbox opaco de 259px num canvas de 500) e
     * **não** é convenção. Trocar o PNG por outro com margem diferente sem
     * remedir degradaria os quatro ícones em silêncio; aqui isso vira uma
     * falha com nome.
     */
    expect(FRACAO_DESENHO).toBeCloseTo(259 / 500, 3);
  });
});

describe("tamanhoParaOcupacao", () => {
  it("amplia a imagem para o desenho preencher a fração pedida", () => {
    // Quadro de 32px, desenho a 94%: 32 × 0,94 ÷ 0,518 = 58px de imagem.
    expect(tamanhoParaOcupacao(32, OCUPACAO.favicon)).toBe(58);
  });

  it("cobre os quatro destinos reais", () => {
    const casos: [number, number, number][] = [
      [32, OCUPACAO.favicon, 58], // favicon de aba
      [512, OCUPACAO.app, 830], // ícone `any` do manifesto
      [180, OCUPACAO.apple, 243], // apple-touch-icon
      [512, OCUPACAO.maskable, 652], // maskable do Android
    ];

    for (const [canvas, alvo, esperado] of casos) {
      expect(tamanhoParaOcupacao(canvas, alvo), `canvas ${canvas}`).toBe(
        esperado,
      );
    }
  });

  it("sempre devolve imagem maior que o quadro", () => {
    // Se devolvesse menor, não haveria o que recortar e sobraria margem — que
    // é exatamente o problema que este módulo existe para resolver.
    for (const alvo of Object.values(OCUPACAO)) {
      for (const canvas of [16, 32, 180, 192, 512]) {
        expect(
          tamanhoParaOcupacao(canvas, alvo),
          `${canvas}@${alvo}`,
        ).toBeGreaterThan(canvas);
      }
    }
  });

  it("não perde mais que meio pixel no arredondamento", () => {
    /**
     * A tolerância é em **pixel**, não em fração do quadro.
     *
     * Fração seria a métrica errada: num canvas de 16px, um único pixel de
     * arredondamento já são 6% do quadro, e um teste em porcentagem reprovaria
     * a aritmética correta do `Math.round`. Meio pixel é o erro máximo que
     * arredondar pode introduzir, e é o que de fato se quer garantir.
     */
    for (const alvo of Object.values(OCUPACAO)) {
      for (const canvas of [16, 32, 180, 192, 512]) {
        const ideal = (canvas * alvo) / FRACAO_DESENHO;
        expect(
          Math.abs(tamanhoParaOcupacao(canvas, alvo) - ideal),
          `${canvas}@${alvo}`,
        ).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it("acerta a ocupação nos tamanhos que o projeto realmente gera", () => {
    // Aqui a tolerância em fração faz sentido, porque nenhum destino real usa
    // canvas pequeno o bastante para o arredondamento pesar.
    const reais: [number, number][] = [
      [32, OCUPACAO.favicon],
      [192, OCUPACAO.app],
      [512, OCUPACAO.app],
      [180, OCUPACAO.apple],
      [512, OCUPACAO.maskable],
    ];

    for (const [canvas, alvo] of reais) {
      const resultado = ocupacaoResultante(
        canvas,
        tamanhoParaOcupacao(canvas, alvo),
      );
      expect(Math.abs(resultado - alvo), `${canvas}@${alvo}`).toBeLessThan(0.01);
    }
  });
});


describe("OCUPACAO", () => {
  it("mantém a ordem que os destinos exigem", () => {
    /**
     * A ordem não é estética. O favicon precisa do recorte mais apertado
     * (margem é desperdício em 32px); o maskable precisa do mais folgado
     * (a safe zone do Android é um círculo de 40% do lado e a borda pode ser
     * cortada). Inverter isso passaria despercebido na revisão e só
     * apareceria no aparelho de alguém.
     */
    expect(OCUPACAO.favicon).toBeGreaterThan(OCUPACAO.app);
    expect(OCUPACAO.app).toBeGreaterThan(OCUPACAO.apple);
    expect(OCUPACAO.apple).toBeGreaterThan(OCUPACAO.maskable);
  });

  it("mantém o maskable dentro da safe zone do Android", () => {
    // A safe zone é um círculo de raio 40% do lado. Com o desenho centrado, o
    // raio efetivo dele é metade da ocupação — precisa ficar abaixo de 0,40.
    expect(OCUPACAO.maskable / 2).toBeLessThan(0.4);
  });
});

describe("FUNDO_OPACO", () => {
  it("é a mesma cor do tema claro declarada no manifesto e no viewport", () => {
    // Divergir aqui faz a splash do PWA piscar numa cor e o app abrir noutra.
    expect(FUNDO_OPACO).toBe("#FDFBF7");
  });
});
