import Link from "next/link";
import { CheckIcon, MinusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DIAS_TRIAL,
  INCLUSO,
  MERCADO_PAGO_PORQUE,
  NAO_INCLUSO,
  PLANOS,
  PRECO_A_PARTIR_DE,
} from "@/lib/plano";
import { metadataPagina } from "@/lib/site";

/**
 * Página de preço.
 *
 * A ordem dos argumentos é deliberada: **ROI antes de mecanismo.** O dono de
 * barbearia decide com a régua dele — se um horário que não fura paga o mês, a
 * conta fecha antes de ele entender o que é um bot. Explicar a tecnologia
 * primeiro é vender para a pessoa errada.
 *
 * A seção do que **não** está incluído é o item mais importante da página, e por
 * isso não está escondida numa FAQ. Cada linha ali é um cancelamento na segunda
 * semana que não acontece — e num modelo sem gateway, em que cada venda é uma
 * conversa de vinte minutos no WhatsApp, esse cancelamento é o custo mais alto
 * que existe.
 *
 * Com duas faixas, uma decisão nova de redação: **o Essencial é apresentado como
 * completo, não como versão reduzida.** Ele resolve inteiro o problema que o
 * produto existe para resolver; o Garantido resolve um segundo problema, que não
 * é de todo mundo. Uma página que empurra o plano de cima faz o dono de salão
 * pequeno pagar por uma conta de Mercado Pago que ele não vai conectar — e
 * cliente que assinou o plano errado cancela.
 *
 * A seção do Mercado Pago é obrigatória e não é letra miúda: ela responde a
 * pergunta que qualquer dono faz ao ver "cobra sinal por Pix" — *quem fica com o
 * meu dinheiro?* — antes de ele precisar perguntar.
 */
export const metadata = metadataPagina({
  titulo: "Preço",
  descricao: `Dois planos, a partir de R$ ${PRECO_A_PARTIR_DE} por mês, com agendamentos ilimitados e ${DIAS_TRIAL} dias grátis sem cartão.`,
  caminho: "/precos",
});

export default function PrecoPage() {
  return (
    <>
      <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-12 pt-14 sm:pt-20">
        <h1 className="font-heading text-4xl font-semibold leading-[1.1] tracking-tight text-balance sm:text-5xl">
          Um horário que não fura já pagou o mês
        </h1>
        <p className="mt-5 max-w-[36rem] text-lg leading-8 text-muted-foreground">
          Com corte entre R$ 50 e R$ 65 na maior parte do país, basta uma falta
          evitada para a assinatura se pagar. O resto do mês é lucro — e os
          agendamentos que a Encaixaria fecha enquanto você está de mãos ocupadas
          entram por cima disso.
        </p>
        <p className="mt-3 max-w-[36rem] text-muted-foreground">
          São dois planos. A diferença entre eles é uma só: se o bot pede um
          sinal por Pix antes de fechar o horário, ou não.
        </p>
      </section>

      {/*
        Os dois cartões, e o de cima **não** ganha borda de destaque nem selo de
        "mais popular": não há dado que sustente popularidade, e prova social
        inventada é a primeira coisa que se descobre. O que distingue o Garantido
        é o rótulo do que ele acrescenta e o link para a seção que o explica.
      */}
      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
          <div className="grid gap-6 lg:grid-cols-2">
            {PLANOS.map((plano) => (
              <div
                key={plano.id}
                className="flex flex-col rounded-lg border border-border bg-background p-6 sm:p-8"
              >
                <p className="font-mono text-sm uppercase tracking-widest text-muted-foreground sm:text-xs">
                  {plano.nome}
                </p>
                <p className="mt-4 flex items-baseline gap-1">
                  <span className="text-sm text-muted-foreground">R$</span>
                  <span className="font-heading text-5xl font-semibold tabular-nums">
                    {plano.preco}
                  </span>
                  <span className="text-sm text-muted-foreground">/mês</span>
                </p>
                <p className="mt-3 text-base text-muted-foreground md:text-sm">
                  {plano.resumo}
                </p>

                <p className="mt-6 font-mono text-sm uppercase tracking-widest text-muted-foreground sm:text-xs">
                  {plano.destacado
                    ? `O que o ${plano.nome} acrescenta`
                    : "O que está incluído"}
                </p>
                <ul className="mt-4 space-y-3 text-base md:text-sm">
                  {plano.itens.map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <CheckIcon
                        aria-hidden
                        className="mt-0.5 size-4 shrink-0 text-primary"
                      />
                      {item}
                    </li>
                  ))}
                </ul>

                {plano.destacado && (
                  <p className="mt-4 text-base leading-7 text-muted-foreground md:text-sm md:leading-6">
                    Precisa de uma conta no Mercado Pago no seu nome, porque é
                    nela que o Pix cai.{" "}
                    <Link
                      href="#mercado-pago"
                      className="underline underline-offset-2"
                    >
                      Explicamos por quê logo abaixo
                    </Link>
                    .
                  </p>
                )}

                <Button asChild size="lg" className="mt-8 w-full sm:w-auto">
                  <Link href="/registro">Começar teste grátis</Link>
                </Button>
                <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-xs sm:leading-5">
                  {DIAS_TRIAL} dias grátis, sem cartão — o dobro do que a maioria
                  dá. Você escolhe o plano ao criar a conta, e troca depois se
                  mudar de ideia.
                </p>
              </div>
            ))}
          </div>

          {/*
            Esta linha existe para que o cartão do Garantido não precise repetir
            as oito linhas do Essencial. Sem ela, "O que o Garantido acrescenta"
            se leria como "é só isso que o Garantido tem".
          */}
          <p className="mx-auto mt-8 max-w-[36rem] text-center text-base leading-7 text-muted-foreground md:text-sm md:leading-6">
            O <strong className="font-medium text-foreground">Garantido</strong>{" "}
            inclui tudo o que está no{" "}
            <strong className="font-medium text-foreground">Essencial</strong> —
            as {INCLUSO.length} linhas listadas nele, sem exceção.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          Qual dos dois é o seu
        </h2>
        {/* Mesma razão da grade de passos da landing: duas colunas de prosa só a
            partir de `lg`, para não produzir coluna de jornal a 768px. */}
        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          {PLANOS.map((plano) => (
            <div key={plano.id} className="max-w-[34rem] lg:max-w-none">
              <h3 className="font-medium">
                {plano.nome} — R$ {plano.preco}
              </h3>
              <p className="mt-2 text-base leading-7 text-muted-foreground md:text-sm md:leading-6">
                {plano.paraQuem}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-8 max-w-[36rem] text-base leading-7 text-muted-foreground md:text-sm md:leading-6">
          Na dúvida, comece no Essencial. Trocar de plano é uma mensagem para a
          gente, e o teste de {DIAS_TRIAL} dias é o mesmo nos dois — dá tempo de
          descobrir se o sinal faz falta antes de pagar por ele.
        </p>
        {/*
          O teste é gratuito na NOSSA mensalidade, e só nela. Quem testa o
          Garantido cobra sinal de verdade, com dinheiro de cliente de verdade —
          "período de teste" se lê como "simulado" se ninguém disser o contrário,
          e a hora de dizer é antes, não quando o primeiro Pix cair.
        */}
        <p className="mt-3 max-w-[36rem] text-base leading-7 text-muted-foreground md:text-sm md:leading-6">
          Uma ressalva sobre testar o Garantido: os {DIAS_TRIAL} dias são
          gratuitos na <em>nossa</em> mensalidade. O sinal que o seu cliente pagar
          durante o teste é dinheiro real e cai de verdade na sua conta — com a
          devolução, se houver, também sendo sua.
        </p>
      </section>

      {/*
        A seção que responde "quem fica com o meu dinheiro?".
        `scroll-mt` porque o cabeçalho é `sticky`: sem ele, a âncora do cartão
        acima deixa o título escondido atrás do header.
      */}
      <section
        id="mercado-pago"
        className="scroll-mt-20 border-y border-border bg-card"
      >
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
          <p className="font-mono text-sm uppercase tracking-widest text-muted-foreground sm:text-xs">
            Só o plano Garantido
          </p>
          <h2 className="mt-4 max-w-[26ch] font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Por que o Garantido pede uma conta no Mercado Pago
          </h2>
          <p className="mt-4 max-w-[36rem] text-muted-foreground">
            Resumo, antes do detalhe:{" "}
            <strong className="font-medium text-foreground">
              o sinal do seu cliente nunca passa pela Encaixaria.
            </strong>{" "}
            Ele sai do celular dele e cai na sua conta, na hora. A gente não
            recebe, não retém, não repassa e não fica com nenhuma parte dele.
          </p>

          <dl className="mt-10 grid gap-8 lg:grid-cols-2">
            {MERCADO_PAGO_PORQUE.map(({ titulo, texto }) => (
              <div key={titulo} className="max-w-[34rem] lg:max-w-none">
                <dt className="font-medium">{titulo}</dt>
                <dd className="mt-2 text-base leading-7 text-muted-foreground md:text-sm md:leading-6">
                  {texto}
                </dd>
              </div>
            ))}
          </dl>

          <p className="mt-10 max-w-[36rem] text-base leading-7 text-muted-foreground md:text-sm md:leading-6">
            Conectar a conta é uma tela do painel, uma vez só: você clica,
            entra no Mercado Pago, autoriza e volta. Se preferir não conectar, o
            plano Essencial atende igual em tudo o mais — e o bot simplesmente
            não pede sinal.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
          <div>
            <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              Nenhum dos dois conta cadeira, cliente nem mensagem
            </h2>
            <p className="mt-4 max-w-[36rem] text-muted-foreground lg:max-w-none">
              Quase todo sistema de agendamento cobra por profissional: você
              cresce, contrata mais um, e a mensalidade sobe. Aqui o valor é por
              estabelecimento, e ele não muda porque a agenda encheu ou porque
              mais gente passou a atender.
            </p>
            <p className="mt-3 max-w-[36rem] text-muted-foreground lg:max-w-none">
              Também não há teto de agendamentos. Existem alternativas mais
              baratas que param em 100 ou 150 marcações por mês — uma barbearia
              movimentada passa disso na terceira semana, e aí ou a conta sobe ou
              o bot para de atender.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-6">
            <p className="font-mono text-sm uppercase tracking-widest text-muted-foreground sm:text-xs">
              O que a Encaixaria não faz, em nenhum plano
            </p>
            <ul className="mt-4 space-y-3 text-base md:text-sm">
              {NAO_INCLUSO.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <MinusIcon
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  />
                  {item}
                </li>
              ))}
            </ul>
            {/* `max-w-[28rem]`: medida de 12px, não a de 16px da prosa. */}
            <p className="mt-5 max-w-[28rem] text-sm leading-6 text-muted-foreground sm:text-xs sm:leading-5">
              Está aqui na frente de propósito. É melhor você descobrir agora do
              que na segunda semana de uso.
            </p>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
          <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            Como funciona o pagamento da assinatura
          </h2>
          <div className="mt-6 grid gap-6 text-base leading-7 text-muted-foreground md:text-sm md:leading-6 sm:grid-cols-2">
            <p>
              Nesta fase a assinatura é combinada direto com a gente pelo
              WhatsApp — sem cartão cadastrado, sem cobrança automática. Você
              testa {DIAS_TRIAL} dias, escolhe o plano, e se fizer sentido a
              gente acerta o pagamento por lá.
            </p>
            <p>
              Para cancelar, ou para trocar de plano, é o mesmo caminho: você
              manda uma mensagem. Não existe botão de cancelamento no painel, e a
              gente prefere dizer isso do que fingir que existe. Sem multa e sem
              fidelidade.
            </p>
          </div>
          {/*
            Distinção que precisa estar escrita: são dois dinheiros diferentes, e
            só um deles é nosso. Sem esta linha, "assinatura sem cartão" ao lado
            de "cobrança por Pix" convida a pensar que a mensalidade sai do
            Mercado Pago do dono, ou que o sinal desconta dela.
          */}
          <p className="mt-6 max-w-[36rem] text-base leading-7 text-muted-foreground md:text-sm md:leading-6">
            São duas coisas separadas, e vale não confundir: a mensalidade do
            plano é o que você paga <em>para nós</em>; o sinal é o que o seu
            cliente paga <em>para você</em>. Um não desconta do outro, e nós não
            temos acesso ao segundo.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
        <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          E se a conexão do WhatsApp cair?
        </h2>
        <p className="mt-4 max-w-[36rem] text-muted-foreground">
          Cai, sim — celular sem bateria, chip trocado, aparelho desconectado. A
          conexão é a mesma do WhatsApp Web, e ela depende do seu celular estar
          vivo. Quando cai, o painel mostra um aviso claro e reconectar leva um
          minuto: é ler um QR code novo. Enquanto estiver desconectado, o bot não
          responde e os lembretes não saem.
        </p>
        <p className="mt-3 max-w-[36rem] text-muted-foreground">
          A gente diz isso na página de preço porque é a pergunta certa a fazer
          antes de assinar, não depois.
        </p>
      </section>

      <section className="border-t border-border bg-card">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16 text-center">
          <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Teste {DIAS_TRIAL} dias antes de decidir
          </h2>
          {/*
            Não prometer contagem nem métrica de falta: não existe agregado no
            painel, e `agendamentos.status = 'falta'` está no CHECK do banco mas
            **nunca é escrito** por código nenhum. Relatório de ocupação/no-show
            é V2 no roadmap. Prometer aqui é a reclamação da segunda semana que
            esta página inteira existe para evitar.
          */}
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Sem cartão e sem compromisso. Em duas semanas você vê a agenda
            enchendo sem parar o atendimento, e os agendamentos aparecendo no
            painel conforme o bot fecha cada um.
          </p>
          <Button asChild size="lg" className="mt-8">
            <Link href="/registro">Começar teste grátis</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
