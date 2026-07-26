import { describe, expect, it } from "vitest";
import { hashNumeroWhatsapp } from "./trial-numero";

const PEPPER = "pepper-de-teste-nao-usar-em-producao";
const NUMERO = "5511999998888";

describe("hashNumeroWhatsapp", () => {
  it("é determinístico: o mesmo número e pepper dão o mesmo hash", () => {
    expect(hashNumeroWhatsapp(NUMERO, PEPPER)).toBe(
      hashNumeroWhatsapp(NUMERO, PEPPER),
    );
  });

  it("separa números diferentes", () => {
    expect(hashNumeroWhatsapp(NUMERO, PEPPER)).not.toBe(
      hashNumeroWhatsapp("5511977776666", PEPPER),
    );
  });

  /**
   * A consequência operacional de trocar o pepper: o livro-caixa inteiro deixa
   * de casar e todo mundo ganha um trial novo. Documentado em `.env.example`, e
   * fixado aqui para que a propriedade não se perca numa refatoração.
   */
  it("muda por completo quando o pepper muda", () => {
    expect(hashNumeroWhatsapp(NUMERO, PEPPER)).not.toBe(
      hashNumeroWhatsapp(NUMERO, "outro-pepper"),
    );
  });

  /** Hex de SHA-256: 64 caracteres. O tamanho fixo é o que não vaza o número. */
  it("devolve hex de 64 caracteres", () => {
    expect(hashNumeroWhatsapp(NUMERO, PEPPER)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("não carrega o número em claro", () => {
    expect(hashNumeroWhatsapp(NUMERO, PEPPER)).not.toContain(NUMERO);
  });

  /**
   * Vetor conhecido, e não teste redundante com os de cima.
   *
   * O runbook de desbloqueio no CLAUDE.md calcula o hash com um one-liner de
   * `node -e`, porque o suporte precisa do valor para montar o `delete` e não
   * tem como importar este módulo num psql. Esse one-liner duplica a lógica
   * daqui, então esta asserção é o que impede os dois de divergirem em silêncio:
   * se a implementação mudar (outro algoritmo, ordem de pepper e mensagem,
   * encoding), este teste quebra e o runbook precisa ser reescrito junto.
   *
   * Reproduzir na mão:
   *   TRIAL_HASH_PEPPER=pepper-de-teste-nao-usar-em-producao \
   *     node -e "console.log(require('node:crypto').createHmac('sha256', process.env.TRIAL_HASH_PEPPER).update('5511999998888').digest('hex'))"
   */
  it("casa com o one-liner documentado no runbook", () => {
    expect(hashNumeroWhatsapp(NUMERO, PEPPER)).toBe(
      "4e0bcf9291759cd1287edca9882c67e26368ca6c73c73b181ebb89790b26173b",
    );
  });
});
