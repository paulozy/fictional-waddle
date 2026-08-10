import type { Metadata } from "next";
import { UsersIcon } from "lucide-react";
import { traduzirEstado, type EstadoConexao } from "@/lib/evolution-api";
import {
  dataHoraLocal,
  janelasDoDia,
  tempoRelativo,
} from "@/lib/metricas-whatsapp";
import { criarClienteServidor, exigirUsuario } from "@/lib/supabase/server";
import { normalizarNumeroWhatsApp } from "@/lib/telefone";
import { PainelConexao } from "./painel-conexao";

export const metadata: Metadata = { title: "Conexão do WhatsApp" };

export default async function ConexaoWhatsAppPage({
  searchParams,
}: {
  /**
   * `?numero=&iniciar=1` é como o passo 3 do cadastro chega aqui, com o número
   * que o dono acabou de digitar lá. Sem isso ele digitaria o mesmo número duas
   * vezes em duas telas seguidas.
   */
  searchParams: Promise<{ numero?: string; iniciar?: string }>;
}) {
  const usuarioId = await exigirUsuario();
  const supabase = await criarClienteServidor();

  const { numero, iniciar } = await searchParams;
  /**
   * Renormalizado aqui, mesmo tendo passado por `lerTelefone` no passo 3: a URL
   * é editável, e o valor vai direto para a Evolution como número de pareamento.
   * Inválido vira `undefined` — o painel apenas abre com o campo vazio.
   */
  const normalizado = numero ? normalizarNumeroWhatsApp(numero) : null;
  const numeroInicial = normalizado?.valido ? normalizado.numero : undefined;

  const { data: perfil } = await supabase
    .from("perfis")
    .select("status_conexao_whatsapp, fuso_horario")
    .eq("id", usuarioId)
    .single();

  const fusoHorario = perfil?.fuso_horario ?? "America/Sao_Paulo";
  const agora = new Date();
  const { inicioHoje, inicioOntem } = janelasDoDia(agora, fusoHorario);

  /**
   * As três medidas do painel, todas com o client que respeita RLS: o dono tem
   * `select` nas três tabelas, então nada aqui precisa de service role.
   *
   * O `.eq("usuario_id", ...)` é redundante sob RLS e fica assim mesmo — o dia
   * em que alguma destas leituras migrar para o client admin, ele é a única
   * barreira entre tenants.
   */
  const [conexao, lembretes, conversasHoje, ultimaConversa] = await Promise.all(
    [
      supabase
        .from("log_conexao")
        .select("em")
        .eq("usuario_id", usuarioId)
        .eq("estado", "conectado")
        .order("em", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("log_envio")
        .select("id", { count: "exact", head: true })
        .eq("usuario_id", usuarioId)
        .eq("tipo", "lembrete")
        .gte("data_envio", inicioOntem.toISOString())
        .lt("data_envio", inicioHoje.toISOString()),
      supabase
        .from("conversas_estado")
        .select("id", { count: "exact", head: true })
        .eq("usuario_id", usuarioId)
        .gte("atualizado_em", inicioHoje.toISOString()),
      supabase
        .from("conversas_estado")
        .select("atualizado_em")
        .eq("usuario_id", usuarioId)
        .order("atualizado_em", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ],
  );

  const conectadoDesde = conexao.data?.em ? new Date(conexao.data.em) : null;
  const ultimaMensagem = ultimaConversa.data?.atualizado_em
    ? new Date(ultimaConversa.data.atualizado_em)
    : null;

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
        <div className="mt-6 max-w-2xl rounded-xl border border-aviso/40 bg-aviso-suave p-5">
          <p className="font-medium text-aviso">WhatsApp desconectado</p>
          <p className="mt-1.5 text-sm leading-relaxed text-aviso">
            Enquanto estiver assim, o bot não responde e os lembretes não são
            enviados. Gere um QR code e faça a leitura para reconectar.
          </p>
        </div>
      )}

      <PainelConexao
        estadoInicial={estado}
        numeroInicial={numeroInicial}
        iniciarAutomaticamente={iniciar === "1"}
      />

      {/**
       * Três medidas, e só o que os dados sustentam.
       *
       * O design pedia também o número conectado e "mensagens respondidas
       * hoje". O número não pode ser exibido: o produto guarda apenas
       * `hmac_sha256(numero, TRIAL_HASH_PEPPER)` (ver `lib/trial-numero.ts`), e
       * é essa pseudonimização que sustenta a minimização de dados da LGPD.
       * "Mensagens respondidas" não tem fonte — nada conta mensagem, e inventar
       * o número exigiria coluna nova. "Conversas atendidas" é o que
       * `conversas_estado` de fato responde.
       *
       * O bloco só aparece conectado: desconectado, três zeros ao lado do aviso
       * âmbar leem como consequência da queda, e não como o histórico que são.
       */}
      {estado === "conectado" && (
        <dl className="mt-9 max-w-2xl">
          <Medida rotulo="Conectado desde">
            {conectadoDesde ? dataHoraLocal(conectadoDesde, fusoHorario) : "—"}
          </Medida>
          <Medida rotulo="Conversas atendidas hoje">
            {conversasHoje.count ?? 0}
          </Medida>
          <Medida rotulo="Lembretes enviados ontem">
            {lembretes.count ?? 0}
          </Medida>
          <Medida rotulo="Última mensagem recebida" ultima>
            {tempoRelativo(ultimaMensagem, agora, fusoHorario) ?? "nenhuma"}
          </Medida>
        </dl>
      )}

      <p className="mt-8 max-w-[62ch] text-xs leading-relaxed text-muted-foreground">
        Deixe o celular do estabelecimento com bateria e conectado à internet. Se
        o WhatsApp for desconectado no aparelho ou o chip for trocado, será
        preciso ler um novo QR code aqui.
      </p>
    </>
  );
}

/**
 * Uma linha de `rótulo … valor`, em lista de definição.
 *
 * `<dl>` e não `<div>`: são pares nome/valor, e é o que faz o leitor de tela
 * anunciar "Lembretes enviados ontem, 8" em vez de dois textos soltos que
 * dependem da posição na tela para significar alguma coisa.
 */
function Medida({
  rotulo,
  ultima = false,
  children,
}: {
  rotulo: string;
  ultima?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 border-t border-border py-3.5 text-sm ${
        ultima ? "border-b" : ""
      }`}
    >
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="font-mono">{children}</dd>
    </div>
  );
}
