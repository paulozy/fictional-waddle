import type { Metadata } from "next";
import Link from "next/link";

import {
  MODELO_PADRAO_COBRANCA,
  MODELO_PADRAO_RECEBIDO,
} from "@/lib/bot/mensagens-pagamento";
import { cobrancaSinalHabilitada } from "@/lib/pagamentos/capacidade";
import { criarClienteServidor, exigirUsuario } from "@/lib/supabase/server";
import { FormularioEtapa } from "./formulario-etapa";
import { ListaEtapas, type EtapaDaLista } from "./lista-etapas";
import { MensagensSinal, type MensagemEditavel } from "./mensagens-sinal";

export const metadata: Metadata = { title: "Fluxo da conversa" };

/**
 * Os dois contextos do que o bot fala.
 *
 * Abas por link, não por estado de cliente: o conteúdo de cada uma vem do
 * servidor, e um `useState` obrigaria a carregar as duas sempre. Assim cada aba é
 * uma URL — compartilhável, com histórico, e funcionando sem JavaScript.
 */
const CONTEXTOS = [
  { id: "agendamento", rotulo: "Agendamento" },
  { id: "sinal", rotulo: "Sinal por Pix" },
] as const;

type Contexto = (typeof CONTEXTOS)[number]["id"];

export default async function FluxoConversaPage({
  searchParams,
}: {
  searchParams: Promise<{ contexto?: string }>;
}) {
  const usuarioId = await exigirUsuario();
  const supabase = await criarClienteServidor();
  const { contexto } = await searchParams;

  const [{ data: etapas }, { data: perfil }, { data: textos }] =
    await Promise.all([
      supabase
        .from("fluxo_etapas")
        .select(
          "id, ordem, tipo, pergunta_texto, opcoes, campo_destino, obrigatorio, ativo",
        )
        .eq("usuario_id", usuarioId)
        // Desempate por id: a coluna `ordem` não tem unique, porque a reordenação
        // regrava todas as linhas em bloco.
        .order("ordem")
        .order("id"),
      supabase
        .from("perfis")
        .select("plano, pagamento_conectado_em, politica_sinal")
        .eq("id", usuarioId)
        .maybeSingle(),
      supabase
        .from("mensagens_tenant")
        .select("chave, texto")
        .eq("usuario_id", usuarioId),
    ]);

  const cobraSinal = cobrancaSinalHabilitada(perfil);

  /**
   * A aba de sinal só existe para quem tem a capacidade ligada, e o parâmetro é
   * validado contra isso: um `?contexto=sinal` digitado à mão por quem não cobra
   * sinal cai no agendamento em vez de mostrar uma tela vazia sem explicação.
   */
  const ativo: Contexto = contexto === "sinal" && cobraSinal ? "sinal" : "agendamento";
  const salvos = new Map((textos ?? []).map((t) => [t.chave, t.texto]));

  /**
   * O `padrao` é a constante que o próprio bot renderiza (`MODELO_PADRAO_*`), na
   * forma crua. Não há cópia: a tela mostra a mesma string que vira a mensagem, e
   * mudar o texto lá muda a sugestão aqui.
   *
   * `sinal_expirado` existe na tabela e **não** aparece aqui: a mensagem de
   * vencimento ainda não é enviada por caminho nenhum, porque falta um disparo com
   * granularidade de minutos. Oferecer o campo seria pedir para o dono escrever um
   * texto que nunca sai. Quando o disparo existir, é somar uma entrada nesta lista.
   */
  const mensagens: MensagemEditavel[] = [
    {
      chave: "sinal_cobranca",
      rotulo: "Pedindo o sinal",
      contexto:
        "Enviada quando o cliente escolhe o horário. O código Pix vai na mensagem seguinte.",
      padrao: MODELO_PADRAO_COBRANCA,
      exemplos: EXEMPLOS,
      atual: salvos.get("sinal_cobranca") ?? "",
    },
    {
      chave: "sinal_recebido",
      rotulo: "Sinal recebido",
      contexto: "Enviada quando o Pix cai e o horário está confirmado.",
      padrao: MODELO_PADRAO_RECEBIDO,
      exemplos: EXEMPLOS,
      atual: salvos.get("sinal_recebido") ?? "",
    },
  ];

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        Fluxo da conversa
      </h1>
      <p className="mt-2 max-w-[60ch] text-base leading-relaxed text-muted-foreground md:text-sm">
        Tudo que o bot fala com seu cliente fica aqui.
      </p>

      {cobraSinal && (
        <nav
          aria-label="Contexto da conversa"
          className="mt-6 flex gap-1 border-b border-border"
        >
          {CONTEXTOS.map((item) => {
            const selecionado = item.id === ativo;

            return (
              <Link
                key={item.id}
                href={`/fluxo-conversa?contexto=${item.id}`}
                aria-current={selecionado ? "page" : undefined}
                /* -mb-px sobrepõe a borda da barra: a aba ativa "abre" nela em
                   vez de ficar flutuando acima. */
                className={`-mb-px flex min-h-11 items-center border-b-2 px-4 text-sm transition-colors md:min-h-10 ${
                  selecionado
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.rotulo}
              </Link>
            );
          })}
        </nav>
      )}

      <div className="mt-8">
        {ativo === "sinal" ? (
          // `politica_sinal` nunca é nulo aqui: a aba só existe quando
          // `cobrancaSinalHabilitada` é verdadeira, e ela já exige a política. O
          // `?? ""` é só para satisfazer o tipo.
          <MensagensSinal
            mensagens={mensagens}
            politica={perfil?.politica_sinal ?? ""}
          />
        ) : (
          <>
            <p className="max-w-[60ch] text-base leading-relaxed text-muted-foreground md:text-sm">
              Este é o roteiro que o bot segue para marcar. As três etapas de
              sistema podem ser reescritas, mas não removidas. Entre elas, você
              acrescenta as perguntas que quiser.
            </p>

            {/* Duas colunas só em `lg`, pelo mesmo motivo da tela de Serviços: a
                `minmax(340px)` do design abriria a segunda coluna perto de 740px
                e espremeria as duas no iPad em retrato. */}
            <div className="mt-6 grid grid-cols-1 items-start gap-8 lg:grid-cols-2 lg:gap-10">
              <div>
                <ListaEtapas etapas={(etapas ?? []) as EtapaDaLista[]} />

                <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                  Conversas já em andamento continuam no roteiro em que começaram
                  — mudar o fluxo aqui não confunde quem está no meio do
                  atendimento.
                </p>
              </div>

              <FormularioEtapa />
            </div>
          </>
        )}
      </div>
    </>
  );
}

/**
 * O que cada chave vira no envio.
 *
 * **Valores de exemplo, e a UI precisa dizer isso em voz alta.** A legenda é lida
 * numa tela de configuração, onde não há cliente nem horário em jogo, então um
 * exemplo estável ensina melhor que um dado que muda a cada visita. Mas sem a
 * palavra "exemplo" ao lado, `{valor} vira R$ 20,00` se lê como afirmação sobre o
 * valor do sinal — e ele **não é fixo**: sai de `servicos.valor_sinal`, um por
 * serviço, definido pelo dono. Quem lesse como fato configuraria o valor errado,
 * ou não configuraria nenhum achando que R$ 20 já era o padrão. Daí o "No envio,
 * por exemplo:" que precede esta lista em `mensagens-sinal.tsx`.
 */
const EXEMPLOS: Record<string, string> = {
  valor: "R$ 20,00",
  servico: "Corte",
  quando: "seg, 12/08 às 09:30",
  prazo: "14:30",
};
