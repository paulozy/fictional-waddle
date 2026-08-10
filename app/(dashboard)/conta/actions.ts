"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { lerEstabelecimento } from "@/app/(auth)/schema";
import { excluirInstancia } from "@/lib/evolution-api";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import {
  criarClienteServidor,
  exigirUsuario,
  obterClaims,
} from "@/lib/supabase/server";
import { primeiroErro, type EstadoFormulario } from "@/lib/validacao/agenda";

/**
 * Nome e fuso do estabelecimento, agora editáveis fora do cadastro.
 *
 * Reusa o `lerEstabelecimento` do passo 2 do registro (`app/(auth)/schema.ts`)
 * de propósito: são os mesmos dois campos com as mesmas regras, e um segundo
 * schema divergiria na primeira vez que a lista de fusos mudasse. O que muda é
 * o retorno — aqui é `EstadoFormulario`, como nas outras actions do painel, e
 * não há redirect: o dono continua na tela.
 */
export async function salvarEstabelecimento(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const parsed = lerEstabelecimento(formData);
  if (!parsed.success) {
    return { erro: primeiroErro(parsed.error) };
  }

  const usuarioId = await exigirUsuario();
  const supabase = await criarClienteServidor();

  const { error } = await supabase
    .from("perfis")
    .update({
      nome_estabelecimento: parsed.data.nome,
      fuso_horario: parsed.data.fuso,
    })
    .eq("id", usuarioId);

  if (error) {
    console.error("conta: falha ao salvar o perfil", error);
    return { erro: "Não foi possível salvar agora. Tente de novo." };
  }

  /**
   * O fuso decide o que "hoje" quer dizer na agenda, nos horários e nas
   * métricas do WhatsApp. Sem invalidar o layout inteiro, trocá-lo deixaria
   * três telas mostrando a grade do fuso antigo até o próximo hard reload.
   */
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Encerra a conta e apaga os dados do tenant.
 *
 * **Por que o client admin aparece numa Server Action.** Só
 * `auth.admin.deleteUser` apaga a linha de `auth.users`, e é o
 * `on delete cascade` dela que leva junto perfil, serviços, horários, fluxo,
 * clientes, agendamentos e logs — o que a LGPD exige. Nenhum client autenticado
 * consegue fazer isso. Este é o terceiro ponto de uso da service role, e está
 * anotado no JSDoc de `lib/supabase/admin.ts`.
 *
 * A ordem dos passos importa e não é intercambiável:
 *
 * 1. Sessão primeiro, e o alvo é **sempre** `claims.sub`. Um id vindo do
 *    `FormData` transformaria esta action em "apague a conta de qualquer um".
 * 2. Conferência do nome digitado, contra o perfil do próprio usuário. É o
 *    único freio contra o clique acidental numa ação sem desfazer.
 * 3. Instância da Evolution antes do banco. Depois do `deleteUser` não há mais
 *    de onde ler `evolution_instance_name`, e a instância ficaria órfã: o
 *    socket Baileys segue aberto, respondendo por um número cujo dono não tem
 *    mais painel para desconectá-lo.
 * 4. `deleteUser`, e só então o logout.
 *
 * `trials_numero_whatsapp` **não** cascateia, e isso é deliberado: é o
 * livro-caixa antiabuso, e um livro-caixa que some com a conta é um livro-caixa
 * que o abusador apaga sozinho (ver CLAUDE.md).
 */
export async function encerrarConta(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const claims = await obterClaims();
  if (!claims) return { erro: "Sua sessão expirou. Entre de novo." };

  const supabase = await criarClienteServidor();
  const { data: perfil } = await supabase
    .from("perfis")
    .select("nome_estabelecimento, evolution_instance_name")
    .eq("id", claims.sub)
    .maybeSingle();

  const digitado = String(formData.get("confirmacao") ?? "").trim();
  const esperado = (perfil?.nome_estabelecimento ?? "").trim();

  if (!esperado || digitado.toLowerCase() !== esperado.toLowerCase()) {
    return {
      erro: `Digite exatamente o nome do estabelecimento para confirmar${
        esperado ? `: ${esperado}` : ""
      }.`,
    };
  }

  if (perfil?.evolution_instance_name) {
    try {
      await excluirInstancia(perfil.evolution_instance_name);
    } catch (erro) {
      /**
       * Fail-open, e é a escolha certa aqui: a Evolution fora do ar não pode
       * impedir alguém de apagar os próprios dados. Uma instância órfã é
       * limpeza manual nossa; um pedido de exclusão recusado é problema de
       * LGPD.
       */
      console.error("conta: instância não pôde ser excluída", erro);
    }
  }

  const admin = criarClienteAdmin();
  const { error } = await admin.auth.admin.deleteUser(claims.sub);

  if (error) {
    console.error("conta: deleteUser recusado", error);
    return { erro: "Não foi possível encerrar a conta agora. Tente de novo." };
  }

  // A sessão continua válida em cookie mesmo sem usuário do outro lado: sem o
  // signOut, a próxima navegação bate em telas que não conseguem ler perfil.
  await supabase.auth.signOut();
  redirect("/");
}
