import type { Metadata } from "next";
import Link from "next/link";

import { linkAssinatura } from "@/lib/assinatura";
import { formatarValor } from "@/lib/bot/mensagens-pagamento";
import { dataHoraLocal } from "@/lib/metricas-whatsapp";
import { motivoSemCobranca } from "@/lib/pagamentos/capacidade";
import { expirarSinaisDoDono } from "@/lib/pagamentos/expirar";
import { PRECO_GARANTIDO } from "@/lib/plano";
import { criarClienteServidor, exigirUsuario } from "@/lib/supabase/server";
import { conectarMercadoPago, salvarPrazoSinal } from "./actions";
import { BotaoEstornar, BotaoRevogar } from "./painel-pagamentos";

export const metadata: Metadata = { title: "Pagamentos" };

/** Resultados que o callback do OAuth devolve na query string. */
const AVISOS: Record<string, { texto: string; tom: "ok" | "erro" }> = {
  ok: { texto: "Conta conectada. O bot já pode cobrar sinal.", tom: "ok" },
  recusada: { texto: "Você cancelou a autorização no Mercado Pago.", tom: "erro" },
  /**
   * Na prática, a causa quase nunca é "expirou".
   *
   * O `state` vive num cookie gravado na origem em que a conexão começou, e o
   * callback chega na origem do `redirect_uri`. Origens diferentes — abrir o
   * painel por um endereço e ter o redirect apontando para outro — e o cookie
   * não acompanha. Dizer só "expirou" mandava o dono repetir o mesmo caminho
   * errado indefinidamente.
   */
  state_invalido: {
    texto:
      "A conexão começou em um endereço e voltou em outro, então o link de retorno não confere. " +
      "Abra o painel pelo mesmo endereço cadastrado no Mercado Pago e comece de novo por lá. " +
      "(Se o endereço estiver certo, o link pode ter expirado — são 10 minutos.)",
    tom: "erro",
  },
  falhou: {
    texto: "Não foi possível concluir a conexão. Tente de novo em instantes.",
    tom: "erro",
  },
  origem_divergente: {
    texto:
      "Você está acessando o painel por um endereço diferente do que está cadastrado no Mercado Pago. " +
      "A conexão precisa começar e terminar no mesmo endereço — abra o painel pelo endereço cadastrado e tente de novo.",
    tom: "erro",
  },
  erro_ao_iniciar: {
    texto:
      "Não foi possível montar o link de autorização. Isso é configuração deste ambiente, não da sua conta — o log do servidor tem o motivo.",
    tom: "erro",
  },
};

const FUSO_PADRAO = "America/Sao_Paulo";

export default async function PagamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ conexao?: string }>;
}) {
  const usuarioId = await exigirUsuario();
  const supabase = await criarClienteServidor();
  const { conexao } = await searchParams;

  const { data: perfil, error: erroPerfil } = await supabase
    .from("perfis")
    /**
     * `fuso_horario` entra porque esta tela mostra **hora**: o instante em que o
     * sinal caiu. Sem ele, `Intl.DateTimeFormat` formata no fuso do runtime — UTC
     * na Vercel — e um Pix pago às 23h em São Paulo aparecia como 02h do dia
     * seguinte. O erro é invisível em desenvolvimento, porque a máquina do dono
     * já está no fuso certo. Mesmo motivo de `lib/metricas-whatsapp.ts` existir.
     */
    .select("plano, pagamento_conectado_em, sinal_minutos_validade, fuso_horario")
    .eq("id", usuarioId)
    .maybeSingle();

  /**
   * Falha de leitura **não** pode virar "seu plano não inclui".
   *
   * `motivoSemCobranca` devolve `"plano"` para perfil nulo, e isso está certo
   * como fail-safe — o que estava errado era descartar o `error` aqui: uma
   * coluna ausente (migration não aplicada no ambiente), uma policy quebrada ou
   * uma queda do banco produziam a MESMA tela de "contrate o adicional". O dono
   * lia aquilo como decisão comercial e abria suporte, enquanto a causa era
   * schema desatualizado.
   *
   * Aconteceu de verdade: com as migrations do sinal aplicadas só no banco
   * local, `pagamento_conectado_em` não existia no remoto e a tela dizia que o
   * plano não incluía a cobrança — para uma conta com `plano = 'sinal'`.
   */
  if (erroPerfil) {
    console.error("falha ao ler configuração de pagamentos", {
      usuario_id: usuarioId,
      codigo: erroPerfil.code,
      mensagem: erroPerfil.message,
    });

    return <FalhaAoCarregar codigo={erroPerfil.code} />;
  }

  /**
   * Mesma varredura da agenda, e aqui ela é pré-requisito da lista de devoluções:
   * `expirar_sinais_vencidos` também **reconcilia** cobrança de agendamento
   * cancelado por outro caminho. Sem isto, a tela poderia listar como pendente uma
   * devolução que já não faz sentido.
   */
  await expirarSinaisDoDono(usuarioId, perfil);

  const motivo = motivoSemCobranca(perfil);
  const aviso = conexao ? AVISOS[conexao] : undefined;
  const fusoHorario = perfil?.fuso_horario ?? FUSO_PADRAO;

  /**
   * Só as cobranças que exigem ação: pagas sem horário.
   *
   * O painel não é extrato — quem quer ver tudo tem a agenda. Listar cobrança
   * normal aqui afogaria justamente a linha que precisa de decisão humana.
   *
   * `clientes_finais(nome)` entrou porque o design identifica a linha pela
   * pessoa, e é a leitura certa: quem decide devolver está pensando "o Marcos
   * pagou e não foi atendido", não num valor solto.
   */
  const [{ data: pendentes }, { data: comSinal }] = await Promise.all([
    supabase
      .from("cobrancas_sinal")
      .select(
        "id, valor_centavos, pago_em, criado_em, agendamentos(data_hora, servicos(nome), clientes_finais(nome))",
      )
      .eq("usuario_id", usuarioId)
      .eq("estorno_pendente", true)
      .is("estornado_em", null)
      .order("criado_em", { ascending: false }),
    /**
     * Quais serviços cobram, para a linha "Valor do sinal".
     *
     * O design tinha ali um campo editável de valor único por agendamento, e o
     * schema não tem onde guardar isso: o valor mora em `servicos.valor_sinal`,
     * um por serviço. Criar um valor global seria uma segunda fonte de verdade
     * para o mesmo número — daí a linha relatar o que existe e mandar para onde
     * se edita, em vez de inventar um campo.
     */
    supabase
      .from("servicos")
      .select("valor_sinal")
      .eq("usuario_id", usuarioId)
      .eq("ativo", true)
      .not("valor_sinal", "is", null)
      .order("valor_sinal"),
  ]);

  const valores = (comSinal ?? [])
    .map((s) => s.valor_sinal)
    .filter((v): v is number => v !== null);


  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Pagamentos</h1>
      <p className="mt-2 max-w-[56ch] text-base leading-relaxed text-muted-foreground md:text-sm">
        Com a conta conectada, o bot pede um sinal por Pix antes de fechar o
        agendamento. O dinheiro cai direto na sua conta do Mercado Pago — a
        Encaixaria não recebe nem retém nada.
      </p>

      {aviso && (
        <p
          role="status"
          className={`mt-4 max-w-2xl rounded-lg border px-4 py-3 text-sm ${aviso.tom === "ok"
              ? "border-confirmado-borda bg-confirmado text-confirmado-tinta"
              : "border-aviso bg-aviso-suave text-foreground"
            }`}
        >
          {aviso.texto}
        </p>
      )}

      {motivo === "plano" ? (
        <SemPlano contaConectada={Boolean(perfil?.pagamento_conectado_em)} />
      ) : perfil?.pagamento_conectado_em ? (
        <>
          {/**
           * Cartão de conectado no mesmo idioma do "WhatsApp conectado" em
           * `painel-conexao.tsx`: os tokens `confirmado`/`confirmado-borda`/
           * `confirmado-tinta` são exatamente o trio de cores que o design pede,
           * então não há cor nova nem par claro/escuro a inventar.
           *
           * O design mostrava também o e-mail da conta autorizada. **Não é
           * possível, e não é para ser:** o único identificador guardado é
           * `credenciais_pagamento.conta_externa_id` (o id do Mercado Pago, não
           * um e-mail), e aquela tabela não tem policy de `select` para
           * `authenticated` — guarda token cifrado. Exibi-lo exigiria a service
           * role numa página de leitura, ou seja, ampliar privilégio para
           * enfeite. Mesma decisão do número do WhatsApp, que também não aparece
           * no painel.
           */}
          <section className="mt-8 flex max-w-2xl flex-col gap-4 rounded-xl border border-confirmado-borda bg-confirmado p-5 sm:flex-row sm:items-center">
            {/* Decorativo: o estado já está dito por extenso ao lado. */}
            <span
              aria-hidden
              className="hidden size-2.5 shrink-0 rounded-full bg-confirmado-tinta sm:block"
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-confirmado-tinta">
                Mercado Pago conectado
              </p>
              <p className="mt-1 text-sm leading-relaxed text-confirmado-tinta">
                Autorizado em{" "}
                <span className="font-mono">
                  {dataHoraLocal(
                    new Date(perfil.pagamento_conectado_em),
                    fusoHorario,
                  )}
                </span>
                . Você revoga quando quiser, aqui ou no painel do Mercado Pago.
              </p>
            </div>
            <BotaoRevogar />
          </section>

          <section className="mt-11 max-w-2xl">
            <h2 className="font-heading text-lg font-semibold tracking-tight">
              Sinal e prazo
            </h2>
            <p className="mt-2 max-w-[54ch] text-base leading-relaxed text-muted-foreground md:text-sm">
              Quanto tempo o horário fica segurado esperando o Pix. Passado o
              prazo sem pagamento, o agendamento é cancelado e o horário volta a
              ser oferecido.
            </p>

            {/**
             * Grade de rótulo à esquerda a partir de `sm`, empilhada abaixo — o
             * design usa 180px fixos, que a 375px não deixariam largura para o
             * campo.
             */}
            <dl className="mt-5 space-y-4">
              <div className="grid gap-1.5 sm:grid-cols-[11rem_1fr] sm:items-center sm:gap-5">
                <dt className="text-sm text-muted-foreground">
                  Valor do sinal
                </dt>
                <dd className="text-sm">
                  {valores.length === 0 ? (
                    <>
                      <span className="text-muted-foreground">
                        Nenhum serviço cobra sinal ainda.
                      </span>{" "}
                      <Link
                        href="/servicos"
                        className="underline underline-offset-4"
                      >
                        Definir por serviço
                      </Link>
                    </>
                  ) : (
                    <>
                      <span className="font-mono">
                        {formatarValor(Math.round(valores[0] * 100))}
                        {valores.length > 1 &&
                          valores.at(-1) !== valores[0] &&
                          ` – ${formatarValor(
                            Math.round(valores.at(-1)! * 100),
                          )}`}
                      </span>{" "}
                      <span className="text-muted-foreground">
                        em {valores.length}{" "}
                        {valores.length === 1 ? "serviço" : "serviços"}.
                      </span>{" "}
                      <Link
                        href="/servicos"
                        className="underline underline-offset-4"
                      >
                        Editar por serviço
                      </Link>
                    </>
                  )}
                </dd>
              </div>

              <form
                action={salvarPrazoSinal}
                className="grid gap-1.5 sm:grid-cols-[11rem_1fr] sm:items-center sm:gap-5"
              >
                <label
                  htmlFor="minutos"
                  className="text-sm text-muted-foreground"
                >
                  Prazo para pagar
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    id="minutos"
                    name="minutos"
                    type="number"
                    min={15}
                    max={1440}
                    defaultValue={perfil.sinal_minutos_validade ?? 30}
                    /* Sem `text-sm`: herda os 16px do corpo, que é o que impede
                       o zoom de foco do iOS. `font-mono` porque é número que se
                       compara, como no design. */
                    className="h-11 w-24 rounded-md border border-input bg-transparent px-3 font-mono outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-10 dark:bg-input/30"
                  />
                  <span className="text-sm text-muted-foreground">minutos</span>
                  <button
                    type="submit"
                    className="inline-flex h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground md:h-10"
                  >
                    Salvar
                  </button>
                </div>
              </form>
            </dl>

            <p className="mt-4 max-w-[56ch] text-xs leading-relaxed text-muted-foreground">
              Vale para os próximos agendamentos, não para os já marcados. O
              mínimo é 15 minutos: com prazo curto demais, o código Pix morre
              antes de o cliente conseguir pagar, e o app do banco dele diz que
              sua conta não pode receber.
            </p>
          </section>

          <section className="mt-12 max-w-2xl">
            <h2 className="font-heading text-lg font-semibold tracking-tight">
              Devoluções pendentes
            </h2>
            <p className="mt-2 max-w-[54ch] text-base leading-relaxed text-muted-foreground md:text-sm">
              Sinal que caiu depois do prazo, quando o horário já tinha sido
              reservado por outra pessoa. O cliente pagou e não foi atendido.
            </p>

            {pendentes?.length ? (
              <>
                <ul className="mt-5 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                  {pendentes.map((cobranca) => {
                    /**
                     * `pago_em` é o instante que interessa — é o pagamento que
                     * precisa voltar. Cai para `criado_em` só por robustez: uma
                     * linha marcada para estorno sem data de pagamento não
                     * deveria existir, e some seria pior que aproximada.
                     */
                    const quando = cobranca.pago_em ?? cobranca.criado_em;

                    return (
                      <li
                        key={cobranca.id}
                        className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">
                            {cobranca.agendamentos?.clientes_finais?.nome ??
                              "Cliente sem nome"}
                          </p>
                          <p className="mt-1 font-mono text-xs text-muted-foreground">
                            {formatarValor(cobranca.valor_centavos)}
                            {quando &&
                              ` · pago ${dataHoraLocal(new Date(quando), fusoHorario)}`}
                            {cobranca.agendamentos?.servicos?.nome &&
                              ` · ${cobranca.agendamentos.servicos.nome}`}
                          </p>
                        </div>
                        <BotaoEstornar cobrancaId={cobranca.id} />
                      </li>
                    );
                  })}
                </ul>

                <p className="mt-4 max-w-[56ch] text-xs leading-relaxed text-muted-foreground">
                  A devolução é feita pelo Mercado Pago, com o valor cheio. A
                  Encaixaria só registra que foi feita.
                </p>
              </>
            ) : (
              <p className="mt-5 rounded-xl border border-dashed border-border bg-card px-6 py-8 text-center text-sm text-muted-foreground">
                Nenhuma devolução pendente.
              </p>
            )}
          </section>
          {/**
           * As mensagens moram na tela de fluxo, com o resto do que o bot fala —
           * aqui o assunto é a conta e o dinheiro. Este link existe porque o dono
           * que acabou de conectar a conta pensa nas duas coisas na mesma sessão,
           * e não teria por que adivinhar que o texto se edita em outro lugar.
           */}
          <section className="mt-12 max-w-2xl">
            <h2 className="font-heading text-lg font-semibold tracking-tight">
              Mensagens do sinal
            </h2>
            <p className="mt-2 max-w-[54ch] text-base leading-relaxed text-muted-foreground md:text-sm">
              O que o bot fala ao pedir o sinal e ao confirmar que ele caiu fica
              junto do resto da conversa, no fluxo.
            </p>
            <Link
              href="/fluxo-conversa?contexto=sinal"
              className="mt-4 inline-flex h-11 items-center rounded-lg border border-border bg-card px-5 text-sm font-medium md:h-10"
            >
              Editar mensagens do sinal
            </Link>
          </section>
        </>
      ) : (
        <SemConta />
      )}
    </>
  );
}

/**
 * Ainda não conectou.
 *
 * Cartão de borda tracejada, como os empty states de serviços e horários: é
 * espaço que ainda vai ser preenchido, não problema. O rodapé fora do cartão
 * responde a pergunta que o dono faz nesse instante — "e enquanto eu não
 * conectar, o bot para?".
 */
function SemConta() {
  return (
    <div className="mt-8 max-w-2xl">
      <div className="rounded-xl border border-dashed border-border bg-card p-7">
        <p className="font-heading text-lg font-semibold tracking-tight">
          Nenhuma conta conectada
        </p>
        <p className="mt-2.5 max-w-[52ch] text-base leading-relaxed text-muted-foreground md:text-sm">
          Você autoriza uma vez e revoga quando quiser, aqui ou no painel do
          Mercado Pago. Não pedimos sua senha nem acesso ao saldo — só a
          permissão de gerar cobranças em seu nome.
        </p>

        {/**
         * `<form action>` e não ilha de cliente.
         *
         * A versão anterior era um botão com `onClick` que chamava a Server
         * Action e navegava com `window.location`. Dois modos de falha, os dois
         * silenciosos: se a hidratação não acontecesse, o clique não fazia NADA;
         * e se a ação rejeitasse, o erro morria dentro do `startTransition`, sem
         * `catch`. "Não acontece nada" é o pior desfecho possível — não dá nem
         * para começar a diagnosticar.
         *
         * Com formulário, o navegador envia mesmo sem JavaScript, e a própria
         * ação decide o destino: ou o Mercado Pago, ou de volta para cá com um
         * código de erro que a página sabe explicar.
         */}
        <form action={conectarMercadoPago} className="mt-6">
          <button
            type="submit"
            className="inline-flex h-11 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground md:h-10"
          >
            Conectar conta do Mercado Pago
          </button>
        </form>
      </div>

      <p className="mt-4 max-w-[56ch] text-xs leading-relaxed text-muted-foreground">
        Enquanto não houver conta conectada, o bot fecha o agendamento sem sinal
        — como faz hoje.
      </p>
    </div>
  );
}

/**
 * A configuração não pôde ser lida.
 *
 * Estado próprio, e não uma variação do "contrate o adicional": o dono não tem
 * nada a fazer aqui, e sugerir que ele contrate algo seria mandá-lo resolver
 * comercialmente um problema técnico nosso.
 *
 * `42703` (undefined_column) é o caso concreto que motivou esta tela — schema
 * atrás do código, tipicamente migration aplicada só no banco local. Dizer isso
 * em voz alta economiza a rodada de suporte em que alguém descobre sozinho.
 */
function FalhaAoCarregar({ codigo }: { codigo?: string }) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Pagamentos</h1>
      <section className="mt-8 max-w-2xl rounded-xl border border-aviso bg-aviso-suave p-5">
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          Não foi possível carregar esta tela
        </h2>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground md:text-sm">
          {codigo === "42703"
            ? "O banco de dados deste ambiente está desatualizado em relação ao aplicativo — faltam colunas que esta tela usa. Isso é problema nosso, não do seu plano."
            : "Houve uma falha ao ler sua configuração de pagamentos. Isso é problema nosso, não do seu plano."}{" "}
          Nenhum agendamento seu foi afetado.
        </p>
      </section>
    </>
  );
}

/**
 * O plano não inclui a capacidade.
 *
 * Sem gateway para a nossa própria assinatura, contratar é conversa — o CTA leva
 * ao WhatsApp, mesmo caminho do banner de assinatura. Sem a env var, o texto
 * aparece sem botão, como lá.
 */
function SemPlano({ contaConectada }: { contaConectada: boolean }) {
  const href = linkAssinatura("upgrade");

  return (
    <section className="mt-8 max-w-2xl rounded-xl border border-border bg-card p-7">
      <h2 className="font-heading text-lg font-semibold tracking-tight">
        Cobrança de sinal não está no seu plano
      </h2>
      <p className="mt-2.5 max-w-[52ch] text-base leading-relaxed text-muted-foreground md:text-sm">
        Cobrar sinal é o plano{" "}
        <strong className="font-medium text-foreground">Garantido</strong>, de R${" "}
        {PRECO_GARANTIDO} por mês. Com ele, o bot pede um Pix antes de fechar o
        agendamento e segura o horário até o pagamento cair — o dinheiro vai
        direto para a sua conta do Mercado Pago, sem passar por nós e sem
        comissão.
      </p>

      {/* Sem a env var o texto fica sem botão, como no banner de assinatura: a
          informação de que a capacidade não está no plano vale por si. */}
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex h-11 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground md:h-10"
        >
          Fazer upgrade
        </a>
      )}

      {/*
        A saída para uma autorização que sobrou.

        Este braço da tela é o único que um tenant vê depois de perder a
        capacidade — e ele podia ter conectado o Mercado Pago antes disso, agora
        que o trial pode nascer no Garantido. O botão de revogar só existia no
        braço de quem TEM o plano, então a autorização ficava cifrada no banco
        sem nenhum caminho de saída pela nossa interface. A política de
        privacidade promete que ela é revogável "a qualquer momento, no painel da
        Encaixaria ou no do Mercado Pago"; sem isto, metade da promessa era falsa.
      */}
      {contaConectada && (
        <div className="mt-7 border-t border-border pt-5">
          <p className="max-w-[52ch] text-base leading-relaxed text-muted-foreground md:text-sm">
            Sua conta do Mercado Pago continua conectada. Enquanto o plano não
            incluir a cobrança, ela não é usada para nada — se preferir, pode
            desconectar agora e reconectar quando voltar ao Garantido.
          </p>
          <div className="mt-4">
            <BotaoRevogar />
          </div>
        </div>
      )}
    </section>
  );
}
