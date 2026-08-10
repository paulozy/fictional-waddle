import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `encerrarConta` é a única ação do produto sem desfazer: o
 * `on delete cascade` de `auth.users` leva agenda, clientes e histórico junto.
 *
 * Os testes daqui cobrem as invariantes que, se caírem, não deixam rastro —
 * uma conta apagada não volta para reclamar. Em especial: o alvo é sempre a
 * sessão, nunca um id que veio do formulário; e a instância da Evolution é
 * excluída **antes** do banco, porque depois não há mais de onde ler o nome
 * dela e o socket Baileys ficaria aberto, respondendo por um número cujo dono
 * não tem mais painel.
 */

const perfil = vi.hoisted(() => ({
  valor: {
    nome_estabelecimento: "Barbearia do Nino",
    evolution_instance_name: "inst-123",
  } as Record<string, unknown> | null,
}));
const claims = vi.hoisted(() => ({
  valor: { sub: "dono-1", email: "nino@barbearia.com.br" } as {
    sub: string;
    email: string;
  } | null,
}));
const chamadas = vi.hoisted(() => ({ ordem: [] as string[] }));

const signOut = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const deleteUser = vi.hoisted(() =>
  vi.fn(async (id: string) => {
    chamadas.ordem.push(`deleteUser:${id}`);
    return { error: null };
  }),
);
const excluirInstancia = vi.hoisted(() =>
  vi.fn(async (nome: string) => {
    chamadas.ordem.push(`excluirInstancia:${nome}`);
  }),
);
const redirect = vi.hoisted(() =>
  vi.fn((destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  }),
);

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/evolution-api", () => ({ excluirInstancia }));

vi.mock("@/lib/supabase/admin", () => ({
  criarClienteAdmin: () => ({ auth: { admin: { deleteUser } } }),
}));

vi.mock("@/lib/supabase/server", () => ({
  obterClaims: async () => claims.valor,
  exigirUsuario: async () => claims.valor?.sub ?? "",
  criarClienteServidor: async () => ({
    auth: { signOut },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: perfil.valor }) }),
      }),
      update,
    }),
  }),
}));

const { encerrarConta } = await import("./actions");

function formulario(campos: Record<string, string>): FormData {
  const dados = new FormData();
  for (const [chave, valor] of Object.entries(campos)) dados.set(chave, valor);
  return dados;
}

beforeEach(() => {
  chamadas.ordem = [];
  claims.valor = { sub: "dono-1", email: "nino@barbearia.com.br" };
  perfil.valor = {
    nome_estabelecimento: "Barbearia do Nino",
    evolution_instance_name: "inst-123",
  };
  vi.clearAllMocks();
  deleteUser.mockImplementation(async (id: string) => {
    chamadas.ordem.push(`deleteUser:${id}`);
    return { error: null };
  });
  excluirInstancia.mockImplementation(async (nome: string) => {
    chamadas.ordem.push(`excluirInstancia:${nome}`);
  });
});

describe("encerrarConta", () => {
  it("recusa sem sessão, sem tocar em nada", async () => {
    claims.valor = null;

    const estado = await encerrarConta(undefined, formulario({}));

    expect(estado).toEqual({ erro: "Sua sessão expirou. Entre de novo." });
    expect(deleteUser).not.toHaveBeenCalled();
    expect(excluirInstancia).not.toHaveBeenCalled();
  });

  it("recusa quando o nome digitado não confere", async () => {
    const estado = await encerrarConta(
      undefined,
      formulario({ confirmacao: "Barbearia" }),
    );

    expect(estado).toHaveProperty("erro");
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("aceita diferença de caixa e de espaço em volta", async () => {
    // Quem digita no celular pega maiúscula automática e um espaço no fim; nem
    // um nem outro é sinal de que a pessoa não leu o aviso.
    await expect(
      encerrarConta(
        undefined,
        formulario({ confirmacao: "  barbearia DO nino " }),
      ),
    ).rejects.toThrow("REDIRECT:/");

    expect(deleteUser).toHaveBeenCalledWith("dono-1");
  });

  it("apaga o usuário da sessão, ignorando qualquer id vindo do formulário", async () => {
    await expect(
      encerrarConta(
        undefined,
        formulario({
          confirmacao: "Barbearia do Nino",
          // Sem esta invariante, a action viraria "apague a conta de qualquer
          // um" para quem souber montar um POST.
          id: "vitima-2",
          usuario_id: "vitima-2",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/");

    expect(deleteUser).toHaveBeenCalledTimes(1);
    expect(deleteUser).toHaveBeenCalledWith("dono-1");
  });

  it("exclui a instância da Evolution antes de apagar o usuário", async () => {
    await expect(
      encerrarConta(undefined, formulario({ confirmacao: "Barbearia do Nino" })),
    ).rejects.toThrow("REDIRECT:/");

    expect(chamadas.ordem).toEqual([
      "excluirInstancia:inst-123",
      "deleteUser:dono-1",
    ]);
  });

  it("segue em frente quando a Evolution está fora do ar", async () => {
    /**
     * Fail-open de propósito: um serviço externo indisponível não pode impedir
     * alguém de apagar os próprios dados. A instância órfã vira limpeza manual
     * nossa; o pedido recusado seria problema de LGPD.
     */
    excluirInstancia.mockRejectedValueOnce(new Error("503"));

    await expect(
      encerrarConta(undefined, formulario({ confirmacao: "Barbearia do Nino" })),
    ).rejects.toThrow("REDIRECT:/");

    expect(deleteUser).toHaveBeenCalledWith("dono-1");
  });

  it("não redireciona quando o deleteUser falha", async () => {
    // Redirecionar aqui deixaria o dono na landing achando que a conta sumiu,
    // com tudo ainda no lugar.
    deleteUser.mockResolvedValueOnce({
      error: { message: "boom" },
    } as never);

    const estado = await encerrarConta(
      undefined,
      formulario({ confirmacao: "Barbearia do Nino" }),
    );

    expect(estado).toHaveProperty("erro");
    expect(redirect).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("desfaz a sessão depois de apagar, não antes", async () => {
    // O cookie continua válido sem usuário do outro lado: sem o signOut, a
    // próxima navegação bate em telas que não conseguem ler perfil nenhum.
    await expect(
      encerrarConta(undefined, formulario({ confirmacao: "Barbearia do Nino" })),
    ).rejects.toThrow("REDIRECT:/");

    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
