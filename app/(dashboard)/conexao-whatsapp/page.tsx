import { traduzirEstado, type EstadoConexao } from "@/lib/evolution-api";
import { criarClienteServidor, exigirUsuario } from "@/lib/supabase/server";
import { PainelConexao } from "./painel-conexao";

export const metadata = { title: "Conexão do WhatsApp — AgendaZap" };

export default async function ConexaoWhatsAppPage() {
  const usuarioId = await exigirUsuario();
  const supabase = await criarClienteServidor();

  const { data: perfil } = await supabase
    .from("perfis")
    .select("status_conexao_whatsapp")
    .eq("id", usuarioId)
    .single();

  /**
   * Estado guardado no banco, alimentado pelo webhook `CONNECTION_UPDATE`. O
   * painel consulta a Evolution API ao vivo por cima disto, porque webhook se
   * perde e a sessão cai sozinha (celular sem bateria, WhatsApp Web deslogado).
   */
  const estado: EstadoConexao =
    perfil?.status_conexao_whatsapp === "conectado"
      ? "conectado"
      : traduzirEstado(undefined);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        Conexão do WhatsApp
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
        O bot atende pelo número do seu estabelecimento — o mesmo que seus
        clientes já têm salvo. Para isso, o WhatsApp desse número precisa ficar
        conectado aqui.
      </p>

      {estado !== "conectado" && (
        <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
          <p className="font-medium text-amber-900 dark:text-amber-200">
            WhatsApp desconectado
          </p>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
            Enquanto estiver assim, o bot não responde e os lembretes não são
            enviados. Gere um QR code e faça a leitura para reconectar.
          </p>
        </div>
      )}

      <PainelConexao estadoInicial={estado} />

      <p className="mt-8 text-xs text-zinc-500">
        Deixe o celular do estabelecimento com bateria e conectado à internet. Se
        o WhatsApp for desconectado no aparelho ou o chip for trocado, será
        preciso ler um novo QR code aqui.
      </p>
    </>
  );
}
