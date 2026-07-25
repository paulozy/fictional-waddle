import { UsersIcon } from "lucide-react";
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
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        O bot atende pelo número do seu estabelecimento — o mesmo que seus
        clientes já têm salvo. Para isso, o WhatsApp desse número precisa ficar
        conectado aqui.
      </p>

      {/**
       * Pré-requisito, não alerta de perigo.
       *
       * O bot responde **toda** mensagem de texto em conversa privada, de
       * qualquer número, sem palavra-chave (ver `lib/bot/engine-fluxo.ts`). Quem
       * parear o número pessoal vai mandar menu de agendamento para a família, e
       * até agora nada na interface dizia isso.
       *
       * Não usa os tokens `aviso`/`aviso-suave` de propósito: o box âmbar de
       * "WhatsApp desconectado" vem logo abaixo, e dois blocos âmbar empilhados
       * se anulam. Aqui a informação é neutra — é condição de uso, não problema.
       */}
      <div className="mt-6 flex max-w-2xl items-start gap-3 rounded-lg border border-border bg-card p-4">
        <UsersIcon
          aria-hidden
          className="mt-0.5 size-5 shrink-0 text-muted-foreground"
        />
        <div className="text-sm">
          <p className="font-medium">Use o número do negócio, não o pessoal</p>
          <p className="mt-1 text-muted-foreground">
            Depois de conectado, qualquer pessoa que mandar mensagem para este
            número recebe o menu de agendamento — inclusive quem só queria falar
            com você. O ideal é um número dedicado ao estabelecimento, como o do
            WhatsApp Business. Dá para desconectar quando quiser.
          </p>
        </div>
      </div>

      {estado !== "conectado" && (
        <div className="mt-6 rounded-lg border border-aviso/40 bg-aviso-suave p-4">
          <p className="font-medium text-aviso">WhatsApp desconectado</p>
          <p className="mt-1 text-sm text-aviso">
            Enquanto estiver assim, o bot não responde e os lembretes não são
            enviados. Gere um QR code e faça a leitura para reconectar.
          </p>
        </div>
      )}

      <PainelConexao estadoInicial={estado} />

      <p className="mt-8 text-xs text-muted-foreground">
        Deixe o celular do estabelecimento com bateria e conectado à internet. Se
        o WhatsApp for desconectado no aparelho ou o chip for trocado, será
        preciso ler um novo QR code aqui.
      </p>
    </>
  );
}
