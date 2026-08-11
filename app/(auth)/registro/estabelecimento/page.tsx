import type { Metadata } from "next";
import { FUSO_PADRAO } from "@/lib/fusos";
import { PLANO_PADRAO } from "@/lib/plano";
import { ROBOTS_PRIVADO } from "@/lib/site";
import { criarClienteServidor, exigirUsuario } from "@/lib/supabase/server";
import { FormularioEstabelecimento } from "./formulario-estabelecimento";

export const metadata: Metadata = {
  title: "Sobre o estabelecimento",
  robots: ROBOTS_PRIVADO,
};

/**
 * Passo 2 de 3.
 *
 * Lê o perfil antes de renderizar porque esta tela é reentrante: o link do
 * e-mail pode ser aberto duas vezes, e quem voltar aqui precisa ver o que já
 * gravou em vez de um formulário em branco pedindo tudo de novo. O perfil sempre
 * existe — quem o cria é o trigger `ao_criar_usuario`, no banco.
 */
export default async function EstabelecimentoPage() {
  const usuarioId = await exigirUsuario();
  const supabase = await criarClienteServidor();

  const { data: perfil } = await supabase
    .from("perfis")
    .select("nome_estabelecimento, fuso_horario, plano")
    .eq("id", usuarioId)
    .single();

  return (
    <FormularioEstabelecimento
      nomeInicial={perfil?.nome_estabelecimento ?? ""}
      fusoInicial={perfil?.fuso_horario ?? FUSO_PADRAO}
      planoInicial={perfil?.plano ?? PLANO_PADRAO}
    />
  );
}
