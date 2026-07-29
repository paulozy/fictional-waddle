import Link from "next/link";
import { CheckIcon, MinusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DIAS_TRIAL, INCLUSO, NAO_INCLUSO, PRECO_MENSAL } from "@/lib/plano";
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
 */
export const metadata = metadataPagina({
  titulo: "Preço",
  descricao: `Faixa única de R$ ${PRECO_MENSAL} por mês, com agendamentos ilimitados e ${DIAS_TRIAL} dias grátis sem cartão.`,
  caminho: "/precos",
});

export default function PrecoPage() {
  return (
    <>
      <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-12 pt-14 sm:pt-20">
        <h1 className="font-heading text-4xl font-semibold leading-[1.1] tracking-tight text-balance sm:text-5xl">
          Um horário que não fura já pagou o mês
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
          Com corte entre R$ 50 e R$ 65 na maior parte do país, basta uma falta
          evitada para a assinatura se pagar. O resto do mês é lucro — e os
          agendamentos que a Encaixaria fecha enquanto você está de mãos ocupadas
          entram por cima disso.
        </p>
      </section>

      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
          <div className="grid gap-8 rounded-lg border border-border bg-background p-6 sm:p-8 sm:grid-cols-[auto_1fr] sm:gap-12">
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Plano único
              </p>
              <p className="mt-4 flex items-baseline gap-1">
                <span className="text-sm text-muted-foreground">R$</span>
                <span className="font-heading text-5xl font-semibold tabular-nums">
                  {PRECO_MENSAL}
                </span>
                <span className="text-sm text-muted-foreground">/mês</span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Um estabelecimento, um número de WhatsApp.
              </p>
              <Button asChild size="lg" className="mt-6 w-full sm:w-auto">
                <Link href="/login">Começar teste grátis</Link>
              </Button>
              <p className="mt-3 text-xs text-muted-foreground">
                {DIAS_TRIAL} dias grátis, sem cartão — o dobro do que a maioria
                dá.
              </p>
            </div>

            <ul className="space-y-3 text-sm sm:border-l sm:border-border sm:pl-12">
              {INCLUSO.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <CheckIcon
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-primary"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
          <div>
            <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              Preço único. Não contamos cadeira nem cliente
            </h2>
            <p className="mt-4 text-muted-foreground">
              Quase todo sistema de agendamento cobra por profissional: você
              cresce, contrata mais um, e a mensalidade sobe. Aqui é um valor só,
              e ele não muda porque a agenda encheu.
            </p>
            <p className="mt-3 text-muted-foreground">
              Também não há teto de agendamentos. Existem alternativas mais
              baratas que param em 100 ou 150 marcações por mês — uma barbearia
              movimentada passa disso na terceira semana, e aí ou a conta sobe ou
              o bot para de atender.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-6">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              O que a Encaixaria não faz
            </p>
            <ul className="mt-4 space-y-3 text-sm">
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
            <p className="mt-5 text-xs leading-5 text-muted-foreground">
              Está aqui na frente de propósito. É melhor você descobrir agora do
              que na segunda semana de uso.
            </p>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
          <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            Como funciona o pagamento
          </h2>
          <div className="mt-6 grid gap-6 text-sm leading-6 text-muted-foreground sm:grid-cols-2">
            <p>
              Nesta fase a assinatura é combinada direto com a gente pelo
              WhatsApp — sem cartão cadastrado, sem cobrança automática. Você
              testa {DIAS_TRIAL} dias, e se fizer sentido a gente acerta o
              pagamento por lá.
            </p>
            <p>
              Para cancelar, é o mesmo caminho: você manda uma mensagem e a gente
              cancela. Não existe botão de cancelamento no painel, e a gente
              prefere dizer isso do que fingir que existe. Sem multa e sem
              fidelidade.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
        <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          E se a conexão do WhatsApp cair?
        </h2>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Cai, sim — celular sem bateria, chip trocado, aparelho desconectado. A
          conexão é a mesma do WhatsApp Web, e ela depende do seu celular estar
          vivo. Quando cai, o painel mostra um aviso claro e reconectar leva um
          minuto: é ler um QR code novo. Enquanto estiver desconectado, o bot não
          responde e os lembretes não saem.
        </p>
        <p className="mt-3 max-w-2xl text-muted-foreground">
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
            <Link href="/login">Começar teste grátis</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
