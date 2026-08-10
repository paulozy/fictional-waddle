import { describe, expect, it } from "vitest";
import {
  assinaturaValida,
  motivoBloqueio,
  resumoAssinatura,
  type PerfilAssinatura,
} from "./assinatura";

const AGORA = new Date("2026-07-25T12:00:00Z");
const FUTURO = "2026-08-05T00:00:00Z";
const PASSADO = "2026-07-01T00:00:00Z";

/**
 * `trial_bloqueado_em` é nulo por default porque é o caso comum: quase todo
 * perfil nunca pareou um número de outra conta. Cada teste declara só o que
 * importa para a regra que está exercitando.
 */
function perfil(campos: Partial<PerfilAssinatura>): PerfilAssinatura {
  return {
    status_assinatura: "trial",
    trial_expira_em: FUTURO,
    trial_bloqueado_em: null,
    ...campos,
  };
}

describe("assinaturaValida", () => {
  it("libera 'ativo' mesmo com o trial já vencido", () => {
    expect(
      assinaturaValida(
        perfil({ status_assinatura: "ativo", trial_expira_em: PASSADO }),
        AGORA,
      ),
    ).toBe(true);
  });

  it("bloqueia 'cancelado' mesmo com o trial no prazo", () => {
    expect(
      assinaturaValida(perfil({ status_assinatura: "cancelado" }), AGORA),
    ).toBe(false);
  });

  it("libera trial dentro do prazo", () => {
    expect(assinaturaValida(perfil({}), AGORA)).toBe(true);
  });

  it("bloqueia trial expirado", () => {
    expect(
      assinaturaValida(perfil({ trial_expira_em: PASSADO }), AGORA),
    ).toBe(false);
  });

  it("trata trial_expira_em nulo como isenção (VIP)", () => {
    expect(assinaturaValida(perfil({ trial_expira_em: null }), AGORA)).toBe(
      true,
    );
  });

  /**
   * O instante exato da expiração conta como expirado. Importa porque o cron
   * roda em horário fixo e o limite não pode depender de qual dos dois lados do
   * `<` a implementação escolheu.
   */
  it("bloqueia no instante exato da expiração", () => {
    expect(
      assinaturaValida(
        perfil({ trial_expira_em: AGORA.toISOString() }),
        AGORA,
      ),
    ).toBe(false);
  });

  it("bloqueia perfil ausente (fail-safe)", () => {
    expect(assinaturaValida(null, AGORA)).toBe(false);
    expect(assinaturaValida(undefined, AGORA)).toBe(false);
  });

  it("bloqueia status desconhecido (fail-safe)", () => {
    expect(
      assinaturaValida(perfil({ status_assinatura: "suspenso" }), AGORA),
    ).toBe(false);
  });

  describe("bloqueio por número já usado", () => {
    it("bloqueia trial no prazo cujo número já consumiu trial em outra conta", () => {
      expect(
        assinaturaValida(perfil({ trial_bloqueado_em: PASSADO }), AGORA),
      ).toBe(false);
    });

    /**
     * O sinal manual vence o automático: quem pagou não pode ser barrado por já
     * ter testado antes. Se este teste quebrar, um cliente pagante fica sem bot
     * em silêncio — a falha que o gate inteiro existe para evitar.
     */
    it("'ativo' vence o bloqueio de número", () => {
      expect(
        assinaturaValida(
          perfil({
            status_assinatura: "ativo",
            trial_expira_em: PASSADO,
            trial_bloqueado_em: PASSADO,
          }),
          AGORA,
        ),
      ).toBe(true);
    });

    /** Isenção manual (VIP) também vence: esse nulo só é gravado à mão. */
    it("trial_expira_em nulo vence o bloqueio de número", () => {
      expect(
        assinaturaValida(
          perfil({ trial_expira_em: null, trial_bloqueado_em: PASSADO }),
          AGORA,
        ),
      ).toBe(true);
    });

    it("segue bloqueando 'cancelado' com número bloqueado", () => {
      expect(
        assinaturaValida(
          perfil({
            status_assinatura: "cancelado",
            trial_bloqueado_em: PASSADO,
          }),
          AGORA,
        ),
      ).toBe(false);
    });
  });
});

describe("motivoBloqueio", () => {
  it("devolve null quando a assinatura é válida", () => {
    expect(
      motivoBloqueio(
        perfil({ status_assinatura: "ativo", trial_expira_em: PASSADO }),
        AGORA,
      ),
    ).toBeNull();
    expect(motivoBloqueio(perfil({}), AGORA)).toBeNull();
  });

  it("distingue trial expirado de cancelado", () => {
    expect(
      motivoBloqueio(perfil({ trial_expira_em: PASSADO }), AGORA),
    ).toBe("trial_expirado");
    expect(
      motivoBloqueio(perfil({ status_assinatura: "cancelado" }), AGORA),
    ).toBe("cancelado");
  });

  it("cai em trial_expirado para perfil ausente e status desconhecido", () => {
    expect(motivoBloqueio(null, AGORA)).toBe("trial_expirado");
    expect(
      motivoBloqueio(perfil({ status_assinatura: "suspenso" }), AGORA),
    ).toBe("trial_expirado");
  });

  it("devolve numero_ja_usou_trial quando o bloqueio é por número", () => {
    expect(
      motivoBloqueio(perfil({ trial_bloqueado_em: PASSADO }), AGORA),
    ).toBe("numero_ja_usou_trial");
  });

  /**
   * Bloqueado E expirado: o motivo do número vence, porque é o único que explica
   * ao dono por que o teste acabou antes da hora — e é o caso em que ele precisa
   * nos procurar, se for engano.
   */
  it("prefere numero_ja_usou_trial a trial_expirado quando ambos valem", () => {
    expect(
      motivoBloqueio(
        perfil({ trial_expira_em: PASSADO, trial_bloqueado_em: PASSADO }),
        AGORA,
      ),
    ).toBe("numero_ja_usou_trial");
  });

  /** 'cancelado' continua vencendo: é a decisão comercial mais recente. */
  it("prefere cancelado a numero_ja_usou_trial", () => {
    expect(
      motivoBloqueio(
        perfil({
          status_assinatura: "cancelado",
          trial_bloqueado_em: PASSADO,
        }),
        AGORA,
      ),
    ).toBe("cancelado");
  });
});

describe("resumoAssinatura", () => {
  const resumo = (campos: Partial<PerfilAssinatura>) =>
    resumoAssinatura(perfil(campos), AGORA, "49,90");

  it("conta os dias restantes do teste e diz quando termina", () => {
    // 25/07 12:00Z → 05/08 00:00Z são 10,5 dias.
    const r = resumo({});
    expect(r.titulo).toBe("Período de teste · 11 dias restantes");
    expect(r.detalhe).toBe(
      "Termina em 05/08. Depois disso, R$ 49,90 por mês, sem fidelidade.",
    );
    expect(r.ofereceAssinar).toBe(true);
  });

  it("arredonda para cima, e nunca chega a zero enquanto vale", () => {
    /**
     * Faltando poucas horas, "0 dias restantes" contradiz a tela: o gate ainda
     * libera, o bot ainda responde. Para cima também não cria surpresa — quem
     * lê "1 dia" e assina hoje nunca é pego pelo corte.
     */
    expect(resumo({ trial_expira_em: "2026-07-25T20:00:00Z" }).titulo).toBe(
      "Período de teste · 1 dia restante",
    );
  });

  it("não oferece assinar a quem já paga nem a quem é isento", () => {
    expect(resumo({ status_assinatura: "ativo" })).toMatchObject({
      titulo: "Assinatura ativa",
      ofereceAssinar: false,
    });
    // Nulo em `trial_expira_em` é isenção manual, gravada à mão. Cobrar de um
    // VIP seria o pior erro possível nesta tela.
    expect(resumo({ trial_expira_em: null })).toMatchObject({
      titulo: "Acesso liberado",
      ofereceAssinar: false,
    });
  });

  it("mantém a oferta viva depois do trial vencer e no cancelamento", () => {
    expect(resumo({ trial_expira_em: PASSADO })).toMatchObject({
      titulo: "Período de teste encerrado",
      ofereceAssinar: true,
    });
    expect(resumo({ status_assinatura: "cancelado" })).toMatchObject({
      titulo: "Assinatura cancelada",
      ofereceAssinar: true,
    });
  });

  it("explica o bloqueio por número em voz alta", () => {
    // Quem foi barrado por engano (salão vendido, número trocado) precisa
    // entender a regra para querer nos procurar — o runbook depende disso.
    const r = resumo({ trial_expira_em: PASSADO, trial_bloqueado_em: PASSADO });
    expect(r.titulo).toBe("Teste indisponível para este número");
    expect(r.detalhe).toContain("já usou o período de teste em outra conta");
  });

  it("não quebra sem perfil, e trata como bloqueado", () => {
    // Fail-safe: perfil ausente nunca pode virar "assinatura ativa".
    expect(resumoAssinatura(null, AGORA, "49,90")).toMatchObject({
      ofereceAssinar: true,
    });
  });
});
