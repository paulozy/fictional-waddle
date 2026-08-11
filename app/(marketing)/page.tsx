import Link from "next/link";
import {
  CalendarCheckIcon,
  CheckIcon,
  MessageSquareIcon,
  ScissorsIcon,
} from "lucide-react";
import { ConversaDemo, ConversaPausa } from "@/components/conversa-demo";
import { Button } from "@/components/ui/button";
import { jsonLdHome, serializarJsonLd } from "@/lib/json-ld";
import { DIAS_TRIAL, PLANOS } from "@/lib/plano";
import { metadataPagina } from "@/lib/site";
import { PerguntasFrequentes } from "./perguntas-frequentes";
import { VideoDemonstracao } from "./video-demonstracao";

/**
 * Sem `titulo`: a home usa o título padrão do site. Passar "Início" aqui daria
 * "Início — Encaixaria", e o título da home é um dos sinais que o Google lê para
 * decidir o nome do site na SERP — ele deve ser o nome, não um rótulo de menu.
 */
export const metadata = metadataPagina({ caminho: "/" });

/**
 * Landing.
 *
 * A tese: o produto se explica melhor sendo mostrado do que descrito, então a
 * conversa real com o bot entra já na primeira dobra, ao lado da headline, e não
 * como ilustração enfeitando uma seção lá embaixo. Em cinco segundos o dono vê o
 * produto inteiro e entende sozinho por que o cliente dele não instala nada.
 *
 * Sem depoimento e sem logo de cliente: os pilotos ainda não existem, e prova
 * social inventada é a primeira coisa que se descobre.
 */

const PASSOS = [
  {
    icone: MessageSquareIcon,
    titulo: "Conecte seu WhatsApp",
    texto:
      "Você lê um QR code uma vez, como no WhatsApp Web. O número continua sendo o seu — o mesmo que seus clientes já têm salvo.",
  },
  {
    icone: ScissorsIcon,
    titulo: "Cadastre serviços e horários",
    texto:
      "Diga o que você faz, quanto tempo leva e quando atende. É disso que o bot precisa para saber quais horários pode oferecer.",
  },
  {
    icone: CalendarCheckIcon,
    titulo: "O bot atende sozinho",
    texto:
      "Ele responde na hora, mostra os horários livres, fecha o agendamento e manda o lembrete um dia antes.",
  },
];

const BENEFICIOS = [
  {
    titulo: "Responde enquanto você atende",
    texto:
      "O cliente manda mensagem, vê os horários livres e fecha o agendamento sozinho — sem você parar o que está fazendo.",
  },
  {
    titulo: "Do seu próprio número",
    texto:
      "O bot atende pelo WhatsApp do seu estabelecimento, o mesmo número que seus clientes já têm salvo.",
  },
  {
    titulo: "Lembrete automático",
    texto:
      "Um dia antes, o cliente recebe a confirmação do horário. Menos falta, menos cadeira vazia.",
  },
];

const DO_LADO_DO_CLIENTE = [
  "Não baixa aplicativo",
  "Não cria conta nem senha",
  "Não precisa lembrar de abrir nada",
  "Fala com o número que ele já tem salvo",
];


export default function LandingPage() {
  return (
    <>
      {/*
        JSON-LD só aqui, e não no layout: a doc do Google é explícita que o
        `WebSite` tem de estar na home ("must be on the home page of a site") —
        num layout ele iria para toda página do grupo e valeria em nenhuma.

        `dangerouslySetInnerHTML` é o padrão documentado pelo Next para JSON-LD
        no App Router. O escape de `<` acontece em `serializarJsonLd`.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializarJsonLd(
            jsonLdHome({ telefoneContato: process.env.WHATSAPP_CONTATO }),
          ),
        }}
      />
      <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-16 pt-14 sm:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
          <div>
            {/*
              `text-sm sm:text-xs`: maior no celular e menor no desktop, que é o
              mesmo idioma de `components/ui/input.tsx` (`text-base md:text-sm`) e
              não um deslize. Mono, caixa-alta e `tracking-widest` a 12px é a
              combinação mais difícil de ler da página — três penalidades de
              legibilidade no menor corpo do documento.
            */}
            <p className="font-mono text-sm uppercase tracking-widest text-muted-foreground sm:text-xs">
              Para salões, barbearias, clínicas e estética
            </p>

            <h1 className="mt-4 font-heading text-4xl font-semibold leading-[1.08] tracking-tight text-balance sm:text-5xl">
              Seu cliente agenda pelo WhatsApp. Sem baixar nada.
            </h1>

            <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">
              Você está de mãos ocupadas, a mensagem chega, e quando dá para
              responder o cliente já marcou em outro lugar. A Encaixaria responde
              na hora pelo seu número — mostra os horários livres, fecha o
              agendamento e lembra o cliente um dia antes.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button asChild size="lg">
                <Link href="/registro">Começar teste grátis</Link>
              </Button>
              <p className="text-sm text-muted-foreground">
                {DIAS_TRIAL} dias grátis, sem cartão.
              </p>
            </div>
          </div>

          <div className="lg:pl-4">
            <ConversaDemo />
            {/*
              Esta legenda não é enfeite: é a linha que afirma que a conversa acima
              é transcrição e não ilustração, e a landing sustenta essa afirmação em
              `/como-funciona`. A 12px era, junto com o rodapé, o menor texto da
              primeira dobra no celular.
            */}
            <p className="mt-3 text-center text-sm text-muted-foreground sm:text-xs">
              Conversa real do bot — é exatamente isso que seu cliente recebe.
            </p>
          </div>
        </div>
      </section>

      {/* A pauta separa as seções, como a régua separa as horas no caderno. */}
      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
          <h2 className="max-w-2xl font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Cada mensagem não respondida é uma cadeira vazia
          </h2>
          {/*
            `max-w-[36rem]` e não `max-w-2xl`: 42rem (672px) a 16px dá ~85
            caracteres por linha, medido a 768px. O teto de conforto é 75, acima do
            qual o olho perde o começo da linha seguinte; 36rem (576px) cai em ~75.

            A conta que faltava é a largura média de caractere da Instrument Sans a
            16px: **~7,7px**, não os ~8,4px que a escolha de `2xl` assumia. Por isso
            a medida certa é 36rem e não 38 — e por isso ela **não** serve para
            texto de 12px, que no mesmo espaço rende ~96 caracteres.
          */}
          <p className="mt-4 max-w-[36rem] text-muted-foreground">
            Quem manda mensagem para marcar horário não espera. Se você está com
            a mão na cabeça de alguém, não dá para parar — e meia hora depois o
            cliente já resolveu em outro lugar. As faltas fazem o resto do
            estrago: o horário fica preso na agenda e ninguém ocupa.
          </p>
        </div>
      </section>

      <VideoDemonstracao />

      <section id="como-funciona" className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
        <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          Como funciona
        </h2>

        {/*
          Numerado porque aqui a ordem é informação: cada passo depende do
          anterior.

          Três colunas só a partir de `lg`, e isso é medido. Com `sm:grid-cols-3`
          a grade virava três colunas já a 640px: a 768px cada coluna tinha ~224px
          e o texto caía para **~24 caracteres por linha em 5 linhas** — coluna de
          jornal estreita, em que o olho salta linha. Empilhado, o `max-w-[34rem]`
          impede o problema oposto (a linha de 90 caracteres que uma coluna de
          720px produziria).
        */}
        <ol className="mt-8 grid gap-8 lg:grid-cols-3">
          {PASSOS.map(({ icone: Icone, titulo, texto }, i) => (
            <li key={titulo} className="max-w-[34rem] lg:max-w-none">
              <div className="flex items-center gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary font-mono text-sm tabular-nums text-primary-foreground">
                  {i + 1}
                </span>
                <Icone aria-hidden className="size-5 text-primary" />
              </div>
              <h3 className="mt-4 font-medium">{titulo}</h3>
              <p className="mt-2 text-base leading-7 text-muted-foreground lg:text-sm lg:leading-6">
                {texto}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
          {/* Mesma razão da grade de passos: 3 colunas de prosa só a partir de `lg`. */}
          <dl className="grid gap-8 lg:grid-cols-3">
            {BENEFICIOS.map(({ titulo, texto }) => (
              <div key={titulo} className="max-w-[34rem] lg:max-w-none">
                <dt className="font-medium">{titulo}</dt>
                <dd className="mt-2 text-base leading-7 text-muted-foreground lg:text-sm lg:leading-6">
                  {texto}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/*
        A objeção mais comum a um bot de atendimento não é "ele funciona?" — é "e
        quando o cliente precisa falar comigo?". Sem esta seção, quem tem essa
        dúvida sai da landing com ela; com ela, a resposta chega antes da
        pergunta. É também a única seção que mostra o produto pelo lado do dono.
      */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
        <div className="grid gap-10 lg:grid-cols-[1fr_0.9fr] lg:items-center">
          <div>
            <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              Quando o assunto pede gente, o bot sai da frente
            </h2>
            <p className="mt-4 max-w-[36rem] text-muted-foreground lg:max-w-none">
              Nem toda conversa é um agendamento. Cliente perguntando sobre um
              procedimento, reclamando de um corte ou negociando preço merece
              você do outro lado, não um menu.
            </p>
            <p className="mt-3 max-w-[36rem] text-muted-foreground lg:max-w-none">
              Você responde pelo WhatsApp de sempre, do seu celular, e o bot
              entende que assumiu: ele se cala naquela conversa e não responde
              mais nada para aquele cliente. Passado o prazo, volta a atender
              sozinho — sem você precisar lembrar de reativar nada.
            </p>
            <p className="mt-3 max-w-[36rem] text-muted-foreground lg:max-w-none">
              A pausa vale só para aquele contato. Os outros clientes continuam
              sendo atendidos normalmente, e o horário já marcado e o lembrete
              dele não são afetados.
            </p>
          </div>

          <div className="lg:pl-4">
            <ConversaPausa />
            {/*
              Legenda deliberadamente diferente da da `ConversaDemo`: aquela
              afirma ser transcrição do bot e esta não pode afirmar o mesmo — as
              falas de gente são exemplo. Ver o comentário em
              `components/conversa-demo.tsx`.
            */}
            <p className="mt-3 text-center text-sm text-muted-foreground sm:text-xs">
              Exemplo: as duas linhas de estado e a mensagem de retomada são o
              que o produto gera sozinho.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
          <div>
            <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              Por que não usar um aplicativo de agendamento?
            </h2>
            <p className="mt-4 max-w-[36rem] text-muted-foreground lg:max-w-none">
              Booksy, Trinks e parecidos são bons produtos, e funcionam bem para
              quem já tem público acostumado a marcar por aplicativo. Só que eles
              pedem uma coisa do seu cliente: baixar, criar conta e lembrar de
              abrir.
            </p>
            <p className="mt-3 max-w-[36rem] text-muted-foreground lg:max-w-none">
              A Encaixaria não pede nada disso. Ela vive no WhatsApp que seu
              cliente já usa todo dia, e responde pelo número que ele já tem
              salvo com o nome do seu estabelecimento.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-6">
            <p className="font-mono text-sm uppercase tracking-widest text-muted-foreground sm:text-xs">
              Do lado do seu cliente
            </p>
            <ul className="mt-4 space-y-3 text-base md:text-sm">
              {DO_LADO_DO_CLIENTE.map((item) => (
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

      {/*
        Preço na landing: **os dois planos, com a lista curta, e a decisão
        empurrada para `/precos`.** Repetir aqui as oito linhas do Essencial mais
        as cinco do Garantido faria da landing uma segunda página de preço, e a
        primeira coisa que se perde numa página de preço duplicada é a
        coincidência entre as duas.

        O que precisa estar aqui é só o que decide se a pessoa clica: os dois
        números, a frase que separa um do outro, e o aviso de que o Garantido
        pede conta no Mercado Pago — porque descobrir isso na tela de conexão,
        depois de assinar, é a pior hora possível.
      */}
      <section id="preco" className="border-y border-border bg-card">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
          <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            Preço
          </h2>
          <p className="mt-3 max-w-[36rem] text-muted-foreground">
            Dois planos, um valor por estabelecimento. Nenhum dos dois conta
            cadeira, cliente nem mensagem.
          </p>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            {PLANOS.map((plano) => (
              <div
                key={plano.id}
                className="rounded-lg border border-border bg-background p-6 sm:p-8"
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
                <p className="mt-3 text-base leading-7 text-muted-foreground md:text-sm md:leading-6">
                  {plano.resumo}
                </p>
                {plano.destacado && (
                  <p className="mt-3 flex items-start gap-2.5 text-base leading-7 text-muted-foreground md:text-sm md:leading-6">
                    <CheckIcon
                      aria-hidden
                      className="mt-1 size-4 shrink-0 text-primary md:mt-0.5"
                    />
                    <span>
                      O Pix cai direto na sua conta do Mercado Pago. O dinheiro
                      não passa por nós, e não cobramos comissão sobre ele.
                    </span>
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button asChild size="lg">
              <Link href="/registro">Começar teste grátis</Link>
            </Button>
            {/* Alvo isolado: precisa do piso de toque, como em `comparacao.tsx`. */}
            <Link
              href="/precos"
              className="flex min-h-11 items-center px-2 text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
            >
              Comparar os dois planos
            </Link>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-xs sm:leading-5">
            {DIAS_TRIAL} dias grátis, sem cartão. Você escolhe o plano ao criar a
            conta, e cancela quando quiser.
          </p>
        </div>
      </section>

      <section id="perguntas" className="mx-auto max-w-3xl px-4 sm:px-6 py-16">
        <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          Perguntas frequentes
        </h2>
        <div className="mt-6">
          <PerguntasFrequentes />
        </div>
      </section>

      <section className="border-t border-border bg-card">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16 text-center">
          <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Comece hoje e não perca o próximo agendamento
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Conectar leva um minuto. Depois disso o bot atende no seu lugar,
            inclusive quando você está com as mãos ocupadas.
          </p>
          <Button asChild size="lg" className="mt-8">
            <Link href="/registro">Começar teste grátis</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
