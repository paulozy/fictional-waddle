import type { Metadata } from "next";

import { formatarValor } from "@/lib/bot/mensagens-pagamento";
import { motivoSemCobranca } from "@/lib/pagamentos/capacidade";
import { criarClienteServidor, exigirUsuario } from "@/lib/supabase/server";
import { conectarMercadoPago, salvarPrazoSinal } from "./actions";
import { BotaoDesconectar, BotaoEstornar } from "./painel-pagamentos";

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
    .select("plano, pagamento_conectado_em, sinal_minutos_validade")
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

  const motivo = motivoSemCobranca(perfil);
  const aviso = conexao ? AVISOS[conexao] : undefined;

  /**
   * Só as cobranças que exigem ação: pagas sem horário.
   *
   * O painel não é extrato — quem quer ver tudo tem a agenda. Listar cobrança
   * normal aqui afogaria justamente a linha que precisa de decisão humana.
   */
  const { data: pendentes } = await supabase
    .from("cobrancas_sinal")
    .select("id, valor_centavos, criado_em, agendamentos(data_hora, servicos(nome))")
    .eq("usuario_id", usuarioId)
    .eq("estorno_pendente", true)
    .is("estornado_em", null)
    .order("criado_em", { ascending: false });

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Pagamentos</h1>
      <p className="mt-2 max-w-[36rem] text-base text-muted-foreground md:text-sm">
        Com a conta conectada, o bot pede um sinal por Pix antes de fechar o
        agendamento. O dinheiro cai direto na sua conta do Mercado Pago — a
        Encaixaria não recebe nem retém nada.
      </p>

      {aviso && (
        <p
          role="status"
          className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
            aviso.tom === "ok"
              ? "border-border bg-card text-foreground"
              : "border-aviso bg-aviso-suave text-foreground"
          }`}
        >
          {aviso.texto}
        </p>
      )}

      {motivo === "plano" ? (
        <SemPlano />
      ) : (
        <>
          <section className="mt-6 rounded-lg border border-border bg-card p-4">
            <h2 className="font-medium">Conta do Mercado Pago</h2>

            {perfil?.pagamento_conectado_em ? (
              <>
                <p className="mt-1 text-sm text-muted-foreground">
                  Conectada em{" "}
                  {new Intl.DateTimeFormat("pt-BR", {
                    dateStyle: "long",
                  }).format(new Date(perfil.pagamento_conectado_em))}
                  .
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <BotaoDesconectar />
                </div>
              </>
            ) : (
              <>
                <p className="mt-1 max-w-[36rem] text-sm text-muted-foreground">
                  Você autoriza uma vez e pode revogar quando quiser, aqui ou no
                  painel do Mercado Pago. Não pedimos sua senha nem acesso ao seu
                  saldo — só a permissão de gerar cobranças em seu nome.
                </p>
                {/**
                  * `<form action>` e não ilha de cliente.
                  *
                  * A versão anterior era um botão com `onClick` que chamava a
                  * Server Action e navegava com `window.location`. Dois modos de
                  * falha, os dois silenciosos: se a hidratação não acontecesse, o
                  * clique não fazia NADA; e se a ação rejeitasse, o erro morria
                  * dentro do `startTransition`, sem `catch`. "Não acontece nada"
                  * é o pior desfecho possível — não dá nem para começar a
                  * diagnosticar.
                  *
                  * Com formulário, o navegador envia mesmo sem JavaScript, e a
                  * própria ação decide o destino: ou o Mercado Pago, ou de volta
                  * para cá com um código de erro que a página sabe explicar.
                  */}
                <form action={conectarMercadoPago} className="mt-4">
                  <button
                    type="submit"
                    className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground max-md:h-11"
                  >
                    Conectar conta do Mercado Pago
                  </button>
                </form>
              </>
            )}
          </section>

          <section className="mt-4 rounded-lg border border-border bg-card p-4">
            <h2 className="font-medium">Prazo para pagar</h2>
            <p className="mt-1 max-w-[36rem] text-sm text-muted-foreground">
              Quanto tempo o horário fica segurado esperando o Pix. Passado o
              prazo sem pagamento, o agendamento é cancelado e o horário volta a
              ser oferecido.
            </p>

            <form action={salvarPrazoSinal} className="mt-4 flex flex-wrap items-end gap-3">
              <label className="text-sm">
                <span className="block text-muted-foreground">Minutos</span>
                <input
                  name="minutos"
                  type="number"
                  min={30}
                  max={1440}
                  defaultValue={perfil?.sinal_minutos_validade ?? 30}
                  /* Sem `text-sm`: herda os 16px do corpo, que é o que impede o
                     zoom de foco do iOS. */
                  className="mt-1 h-10 w-28 rounded-md border border-input bg-transparent px-3 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 max-md:h-11 dark:bg-input/30"
                />
              </label>
              <button
                type="submit"
                className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground max-md:h-11"
              >
                Salvar
              </button>
            </form>
          </section>

          <section className="mt-4">
            <h2 className="font-medium">Devoluções pendentes</h2>
            <p className="mt-1 max-w-[36rem] text-sm text-muted-foreground">
              Sinal que caiu depois do prazo, quando o horário já tinha sido
              reservado por outra pessoa. O cliente pagou e não foi atendido.
            </p>

            {pendentes?.length ? (
              <ul className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                {pendentes.map((cobranca) => (
                  <li
                    key={cobranca.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                  >
                    <span className="font-medium">
                      {formatarValor(cobranca.valor_centavos)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {cobranca.agendamentos?.servicos?.nome ?? "Serviço"} —{" "}
                      {cobranca.agendamentos?.data_hora
                        ? new Intl.DateTimeFormat("pt-BR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          }).format(new Date(cobranca.agendamentos.data_hora))
                        : "sem horário"}
                    </span>
                    <span className="ml-auto">
                      <BotaoEstornar cobrancaId={cobranca.id} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 rounded-lg border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
                Nenhuma devolução pendente.
              </p>
            )}
          </section>
        </>
      )}
    </>
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
      <section className="mt-6 rounded-lg border border-aviso bg-aviso-suave p-4">
        <h2 className="font-medium">Não foi possível carregar esta tela</h2>
        <p className="mt-1 max-w-[36rem] text-sm text-muted-foreground">
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
function SemPlano() {
  const contato = process.env.WHATSAPP_CONTATO;

  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-4">
      <h2 className="font-medium">Cobrança de sinal não está no seu plano</h2>
      <p className="mt-1 max-w-[36rem] text-sm text-muted-foreground">
        Cobrar sinal é um adicional. Com ele, o bot pede um Pix antes de fechar o
        agendamento e segura o horário até o pagamento cair — o dinheiro vai
        direto para a sua conta do Mercado Pago.
      </p>

      {contato && (
        <a
          href={`https://wa.me/${contato}`}
          className="mt-4 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground max-md:h-11"
        >
          Falar sobre o adicional
        </a>
      )}
    </section>
  );
}
