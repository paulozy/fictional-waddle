import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cobre só `salvarEstabelecimento`, e por um motivo: é a única action de registro
 * que toca um privilégio.
 *
 * `perfis.plano` governa a capacidade de cobrar sinal e está fora do
 * `grant update` de `authenticated`. A escrita sai por
 * `escolher_plano_trial`, e o que este arquivo trava é o **contrato do
 * chamador** — que a RPC é chamada com o valor validado, que a identidade nunca
 * viaja no `FormData`, e que uma recusa da RPC não derruba o cadastro. A guarda
 * em si (VIP, trial vencido, número bloqueado) vive no SQL e é verificada contra
 * o banco, não aqui.
 */

const navegacao = vi.hoisted(() => ({
  redirect: vi.fn((destino: string) => {
    // O `redirect` do Next lança para interromper o fluxo. Sem imitar isso, o
    // código depois dele rodaria no teste e não roda em produção.
    throw new Error(`REDIRECT:${destino}`);
  }),
}));

vi.mock("next/navigation", () => navegacao);

const supabase = vi.hoisted(() => ({
  usuarioId: "dono-da-sessao",
  erroUpdate: null as { message: string } | null,
  rpc: vi.fn(),
  eqUpdate: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  exigirUsuario: vi.fn(async () => supabase.usuarioId),
  criarClienteServidor: vi.fn(async () => ({
    from: () => ({
      update: (valores: Record<string, unknown>) => ({
        eq: (coluna: string, valor: string) => {
          supabase.eqUpdate(valores, coluna, valor);
          return Promise.resolve({ error: supabase.erroUpdate });
        },
      }),
    }),
    rpc: supabase.rpc,
  })),
}));

function formulario(campos: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [chave, valor] of Object.entries(campos)) {
    formData.set(chave, valor);
  }
  return formData;
}

const VALIDO = { nome: "Barbearia do Nino", fuso: "America/Sao_Paulo" };

/** Roda a action e devolve o destino do redirect, ou o estado de erro. */
async function executar(campos: Record<string, string>) {
  const { salvarEstabelecimento } = await import("./actions");

  try {
    const estado = await salvarEstabelecimento(undefined, formulario(campos));
    return { estado, destino: null as string | null };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    if (!mensagem.startsWith("REDIRECT:")) throw erro;
    return { estado: undefined, destino: mensagem.slice("REDIRECT:".length) };
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  supabase.usuarioId = "dono-da-sessao";
  supabase.erroUpdate = null;
  supabase.rpc.mockResolvedValue({ data: "trocado", error: null });
});

describe("salvarEstabelecimento", () => {
  it("grava nome e fuso e segue para o passo 3", async () => {
    const { destino } = await executar(VALIDO);

    expect(supabase.eqUpdate).toHaveBeenCalledWith(
      {
        nome_estabelecimento: "Barbearia do Nino",
        fuso_horario: "America/Sao_Paulo",
      },
      "id",
      "dono-da-sessao",
    );
    expect(destino).toBe("/registro/whatsapp");
  });

  it("manda o plano escolhido para a RPC", async () => {
    await executar({ ...VALIDO, plano: "sinal" });

    expect(supabase.rpc).toHaveBeenCalledWith("escolher_plano_trial", {
      p_plano: "sinal",
    });
  });

  /**
   * O ponto mais importante do arquivo. A RPC não aceita identidade por
   * parâmetro — o alvo é `auth.uid()` dentro dela —, então um `usuario_id` no
   * formulário não pode virar nada. Se algum dia alguém acrescentar o parâmetro,
   * este teste é o que reclama.
   */
  it("ignora identidade vinda do formulário", async () => {
    await executar({
      ...VALIDO,
      plano: "sinal",
      id: "outro-tenant",
      usuario_id: "outro-tenant",
      p_usuario_id: "outro-tenant",
    });

    expect(supabase.rpc).toHaveBeenCalledWith("escolher_plano_trial", {
      p_plano: "sinal",
    });
    expect(supabase.eqUpdate).toHaveBeenCalledWith(
      expect.anything(),
      "id",
      "dono-da-sessao",
    );
  });

  /**
   * Valor forjado não pode virar capacidade. `lerPlano` o derruba para o plano de
   * entrada antes de a RPC ser chamada — e o CHECK do banco ainda o recusaria
   * depois, mas depender só dele deixaria a decisão sem mensagem de contrato.
   */
  it("derruba plano desconhecido para o plano de entrada", async () => {
    await executar({ ...VALIDO, plano: "garantido" });

    expect(supabase.rpc).toHaveBeenCalledWith("escolher_plano_trial", {
      p_plano: "basico",
    });
  });

  it("manda o plano de entrada quando o campo não vem", async () => {
    await executar(VALIDO);

    expect(supabase.rpc).toHaveBeenCalledWith("escolher_plano_trial", {
      p_plano: "basico",
    });
  });

  /**
   * `'nao_permitido'` é o desfecho de quem tentou trocar fora de um trial em
   * curso — pagante, VIP, trial vencido. Não há o que a pessoa corrija no
   * formulário, e travar o cadastro aqui perderia a conta inteira por causa da
   * escolha de faixa. Registra e segue.
   */
  it.each(["nao_permitido", "invalido"])(
    "segue para o passo 3 mesmo quando a RPC recusa com %s",
    async (desfecho) => {
      const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
      supabase.rpc.mockResolvedValue({ data: desfecho, error: null });

      const { destino } = await executar({ ...VALIDO, plano: "sinal" });

      expect(destino).toBe("/registro/whatsapp");
      expect(aviso).toHaveBeenCalled();
      aviso.mockRestore();
    },
  );

  it("segue para o passo 3 mesmo quando a RPC falha", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    supabase.rpc.mockResolvedValue({
      data: null,
      error: { message: "conexão perdida" },
    });

    const { destino } = await executar({ ...VALIDO, plano: "sinal" });

    expect(destino).toBe("/registro/whatsapp");
    aviso.mockRestore();
  });

  /**
   * `'sem_efeito'` é o caminho de quem recarregou o passo 2 e reenviou o mesmo
   * plano — caso comum numa tela reentrante, e não motivo de alarme no log.
   */
  it("não registra alarme quando o plano já era o escolhido", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    supabase.rpc.mockResolvedValue({ data: "sem_efeito", error: null });

    await executar({ ...VALIDO, plano: "sinal" });

    expect(aviso).not.toHaveBeenCalled();
    aviso.mockRestore();
  });

  /**
   * Ordem: nome e fuso primeiro. Falhar ali interrompe antes da RPC, então o
   * perfil nunca fica com `plano = 'sinal'` e sem nome — e o nome é o que o bot
   * usa na mensagem ao cliente final.
   */
  it("não tenta o plano quando o perfil não salvou", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    supabase.erroUpdate = { message: "falhou" };

    const { estado, destino } = await executar({ ...VALIDO, plano: "sinal" });

    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(destino).toBeNull();
    expect(estado?.erro).toBeTruthy();
    erro.mockRestore();
  });

  it("recusa nome vazio antes de qualquer escrita", async () => {
    const { estado } = await executar({ ...VALIDO, nome: " " });

    expect(estado?.erro).toBeTruthy();
    expect(supabase.eqUpdate).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
