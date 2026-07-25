import { criarClienteServidor, exigirUsuario } from "@/lib/supabase/server";
import { FormularioEtapa } from "./formulario-etapa";
import { ListaEtapas, type EtapaDaLista } from "./lista-etapas";

export const metadata = { title: "Fluxo da conversa — AgendaZap" };

export default async function FluxoConversaPage() {
  const usuarioId = await exigirUsuario();
  const supabase = await criarClienteServidor();

  const { data: etapas } = await supabase
    .from("fluxo_etapas")
    .select(
      "id, ordem, tipo, pergunta_texto, opcoes, campo_destino, obrigatorio, ativo",
    )
    .eq("usuario_id", usuarioId)
    // Desempate por id: a coluna `ordem` não tem unique, porque a reordenação
    // regrava todas as linhas em bloco.
    .order("ordem")
    .order("id");

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        Fluxo da conversa
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
        Este é o roteiro que o bot segue com seu cliente. As três etapas cinzas
        são obrigatórias — o texto pode ser editado, mas elas não podem ser
        removidas. Entre elas você adiciona as perguntas que quiser.
      </p>

      <ListaEtapas etapas={(etapas ?? []) as EtapaDaLista[]} />

      <FormularioEtapa />

      <p className="mt-6 text-xs text-zinc-500">
        Conversas já em andamento continuam no roteiro em que começaram — mudar o
        fluxo aqui não confunde quem está no meio do atendimento.
      </p>
    </>
  );
}
