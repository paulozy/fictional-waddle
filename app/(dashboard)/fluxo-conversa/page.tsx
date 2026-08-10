import type { Metadata } from "next";
import { criarClienteServidor, exigirUsuario } from "@/lib/supabase/server";
import { FormularioEtapa } from "./formulario-etapa";
import { ListaEtapas, type EtapaDaLista } from "./lista-etapas";

export const metadata: Metadata = { title: "Fluxo da conversa" };

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
      <p className="mt-2 max-w-[60ch] text-base leading-relaxed text-muted-foreground md:text-sm">
        Este é o roteiro que o bot segue com seu cliente. As três etapas de
        sistema podem ser reescritas, mas não removidas. Entre elas, você
        acrescenta as perguntas que quiser.
      </p>

      {/* Duas colunas só em `lg`, pelo mesmo motivo da tela de Serviços: a
          `minmax(340px)` do design abriria a segunda coluna perto de 740px e
          espremeria as duas no iPad em retrato. */}
      <div className="mt-8 grid grid-cols-1 items-start gap-8 lg:grid-cols-2 lg:gap-10">
        <div>
          <ListaEtapas etapas={(etapas ?? []) as EtapaDaLista[]} />

          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Conversas já em andamento continuam no roteiro em que começaram —
            mudar o fluxo aqui não confunde quem está no meio do atendimento.
          </p>
        </div>

        <FormularioEtapa />
      </div>
    </>
  );
}
