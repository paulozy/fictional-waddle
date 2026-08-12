import type { Metadata } from "next";
import Link from "next/link";
import { addDays, format } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { instanteNoFuso } from "@/lib/bot/disponibilidade";
import { AgendaLista } from "@/components/agenda-lista";
import { CalendarioSemana } from "@/components/calendario-semana";
import { Button } from "@/components/ui/button";
import { diaSelecionado, montarAgendaDoDia } from "@/lib/agenda-lista";
import { rotuloDoPeriodo } from "@/lib/datas";
import {
  MINUTOS_POR_LINHA,
  blocosVisiveisNaGrade,
  idsCancelaveis,
  inicioDaSemana,
  montarCalendario,
  type AgendamentoParaCalendario,
} from "@/lib/calendario";
import { expirarSinaisDoDono } from "@/lib/pagamentos/expirar";
import { criarClienteServidor, exigirUsuario } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Agendamentos" };

/** `YYYY-MM-DD`. Vem de query string, então é validado antes de virar data. */
const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;

export default async function AgendamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string; dia?: string }>;
}) {
  const usuarioId = await exigirUsuario();
  const supabase = await criarClienteServidor();
  const { semana, dia } = await searchParams;

  const { data: perfil } = await supabase
    .from("perfis")
    /**
     * `plano` e `pagamento_conectado_em` entram só para a varredura de sinais
     * vencidos logo abaixo — é a mesma leitura, sem query nova.
     */
    .select("fuso_horario, plano, pagamento_conectado_em, politica_sinal")
    .eq("id", usuarioId)
    .single();

  /**
   * Expira holds de sinal vencidos ANTES de ler os agendamentos.
   *
   * Sequencial e não em paralelo, pelo mesmo motivo de `montarContexto`: é uma
   * escrita que muda o resultado da leitura seguinte. Em paralelo, o horário
   * recém-liberado poderia não aparecer nesta passada — e o dono veria "aguardando
   * sinal" num agendamento que a varredura acabou de cancelar.
   *
   * O `usuarioId` vem de `exigirUsuario()`, nunca de `searchParams`: a função usa
   * a service role, e o id de sessão é o que a mantém restrita a este tenant.
   */
  await expirarSinaisDoDono(usuarioId, perfil);

  const fusoHorario = perfil?.fuso_horario ?? "America/Sao_Paulo";
  const agora = new Date();
  const hoje = format(new TZDate(agora, fusoHorario), "yyyy-MM-dd");

  /**
   * A visão de celular navega por dia (`?dia=`) e a de desktop por semana
   * (`?semana=`), mas a query é uma só: um dia sempre implica a semana que o
   * contém. Assim trocar de dia no celular e girar para paisagem cai na semana
   * certa, sem segundo parâmetro para manter sincronizado.
   */
  const diaPedido = FORMATO_DATA.test(dia ?? "") ? dia : undefined;
  const semanaPedida = FORMATO_DATA.test(semana ?? "") ? semana : undefined;

  const dataInicial = inicioDaSemana(
    diaPedido ?? semanaPedida ?? hoje,
    fusoHorario,
  );

  // Busca pela janela exata da semana exibida, no fuso do estabelecimento.
  const inicioJanela = instanteNoFuso(dataInicial, "00:00", fusoHorario);
  const fimJanela = addDays(inicioJanela, 7);

  const { data: agendamentos } = await supabase
    .from("agendamentos")
    .select(
      "id, data_hora, duracao_minutos, status, sinal_status, servicos(nome), clientes_finais(nome)",
    )
    .eq("usuario_id", usuarioId)
    .gte("data_hora", inicioJanela.toISOString())
    .lt("data_hora", fimJanela.toISOString())
    .order("data_hora");

  const paraCalendario = (agendamentos ?? []) as AgendamentoParaCalendario[];

  const calendario = montarCalendario({
    dataInicial,
    dias: 7,
    fusoHorario,
    agora,
    agendamentos: paraCalendario,
  });

  /**
   * Calculado a partir do instante real, e não de `ItemDaAgenda.passou`: aquele
   * campo só é verdadeiro quando o dia exibido é hoje, então num dia passado
   * ofereceria "Cancelar" em agendamento da semana anterior.
   */
  const cancelaveis = idsCancelaveis(paraCalendario, agora);

  // `format` sobre Date comum usa o fuso do PROCESSO (UTC na Vercel). Em fuso a
  // leste de UTC isso devolveria a data errada e os botões de semana andariam
  // sozinhos — daí o TZDate.
  const janelaLocal = new TZDate(inicioJanela, fusoHorario);
  const semanaAnterior = format(addDays(janelaLocal, -7), "yyyy-MM-dd");
  const semanaSeguinte = format(addDays(janelaLocal, 7), "yyyy-MM-dd");

  const agenda = montarAgendaDoDia(
    calendario,
    diaSelecionado(calendario.dias, diaPedido),
  );

  const fechados = blocosVisiveisNaGrade(calendario.blocos).length;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Agendamentos
          </h1>
          {/* O fuso vem junto do período porque é ele que decide o que "esta
              semana" quer dizer — e o runtime da Vercel roda em UTC, então
              quem lê precisa saber contra qual relógio a grade foi montada. */}
          <p className="mt-2 text-sm text-muted-foreground">
            {rotuloDoPeriodo(
              dataInicial,
              format(addDays(janelaLocal, 6), "yyyy-MM-dd"),
            )}{" "}
            · <span className="font-mono">{fusoHorario}</span>
          </p>
        </div>

        <nav
          aria-label="Trocar de semana"
          className="flex items-center gap-1 text-sm"
        >
          <Link
            href={`/agendamentos?semana=${semanaAnterior}`}
            className="flex min-h-11 items-center rounded-md px-3 transition-colors hover:bg-muted"
          >
            ← Anterior
          </Link>
          <Link
            href="/agendamentos"
            className="flex min-h-11 items-center rounded-md px-3 font-medium transition-colors hover:bg-muted"
          >
            Hoje
          </Link>
          <Link
            href={`/agendamentos?semana=${semanaSeguinte}`}
            className="flex min-h-11 items-center rounded-md px-3 transition-colors hover:bg-muted"
          >
            Próxima →
          </Link>
        </nav>
      </div>

      {/**
       * Duas visões do mesmo `calendario`, escolhidas por CSS no servidor.
       *
       * `md:hidden` / `hidden md:block` em vez de `matchMedia`: a decisão
       * acontece na folha de estilo, então não há client component, não há
       * divergência de hidratação e a primeira pintura já vem certa. O preço é
       * mandar os dois markups — irrelevante para sete dias de agendamento, e
       * barato perto de hidratar a página inteira só para medir a tela.
       */}
      <div className="mt-6 md:hidden">
        <AgendaLista
          agenda={agenda}
          dias={calendario.dias}
          cancelaveis={cancelaveis}
        />
      </div>

      <div className="mt-6 hidden md:block">
        {/* Conta os blocos que a grade de fato desenha: uma semana só com
            cancelados mostraria grade vazia sem explicar por quê. */}
        {fechados === 0 ? (
          <div className="rounded-xl border border-border bg-card px-10 py-14 text-center">
            <p className="font-heading text-xl font-semibold tracking-tight">
              Nenhum agendamento nesta semana
            </p>
            <p className="mx-auto mt-3 max-w-[42ch] text-sm leading-relaxed text-muted-foreground">
              Quando o bot fechar um horário, ele aparece aqui na hora, com
              nome, serviço e duração.
            </p>
            {/* Semana vazia tem duas explicações, e só uma delas é "ninguém
                chamou": se o WhatsApp caiu, o bot não respondeu ninguém. O
                atalho leva à causa que o dono consegue resolver. */}
            <Button asChild size="lg" className="mt-6">
              <Link href="/conexao-whatsapp">
                Conferir a conexão do WhatsApp
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <Legenda className="bg-confirmado border-confirmado-borda">
                Confirmado
              </Legenda>
              <Legenda className="bg-concluido border-concluido-borda">
                Concluído
              </Legenda>
              <span className="ml-auto">
                {fechados === 1
                  ? "1 horário fechado nesta semana"
                  : `${fechados} horários fechados nesta semana`}
              </span>
            </div>

            <div className="mt-4">
              <CalendarioSemana
                calendario={calendario}
                cancelaveis={cancelaveis}
              />
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Cada faixa equivale a {MINUTOS_POR_LINHA} minutos. Clique em um
              bloco para ver o cliente e cancelar o horário.
            </p>
          </>
        )}
      </div>
    </>
  );
}

/**
 * Amostra de cor + nome do status.
 *
 * O nome vem junto porque cor sozinha não é informação acessível (WCAG 1.4.1),
 * e porque a diferença entre "confirmado" e "concluído" é de matiz — a mesma
 * família de bege e verde, difícil de separar de relance mesmo enxergando bem.
 */
function Legenda({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className={`size-3 rounded-xs border ${className}`} />
      {children}
    </span>
  );
}
