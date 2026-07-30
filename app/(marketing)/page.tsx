import Link from "next/link";
import {
  CalendarCheckIcon,
  CheckIcon,
  MessageSquareIcon,
  ScissorsIcon,
} from "lucide-react";
import { ConversaDemo } from "@/components/conversa-demo";
import { Button } from "@/components/ui/button";
import { jsonLdHome, serializarJsonLd } from "@/lib/json-ld";
import { DIAS_TRIAL, INCLUSO, PRECO_MENSAL } from "@/lib/plano";
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
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
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
                <Link href="/login">Começar teste grátis</Link>
              </Button>
              <p className="text-sm text-muted-foreground">
                {DIAS_TRIAL} dias grátis, sem cartão.
              </p>
            </div>
          </div>

          <div className="lg:pl-4">
            <ConversaDemo />
            <p className="mt-3 text-center text-xs text-muted-foreground">
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
          <p className="mt-4 max-w-2xl text-muted-foreground">
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

        {/* Numerado porque aqui a ordem é informação: cada passo depende do anterior. */}
        <ol className="mt-8 grid gap-8 sm:grid-cols-3">
          {PASSOS.map(({ icone: Icone, titulo, texto }, i) => (
            <li key={titulo}>
              <div className="flex items-center gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary font-mono text-sm tabular-nums text-primary-foreground">
                  {i + 1}
                </span>
                <Icone aria-hidden className="size-5 text-primary" />
              </div>
              <h3 className="mt-4 font-medium">{titulo}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {texto}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
          <dl className="grid gap-8 sm:grid-cols-3">
            {BENEFICIOS.map(({ titulo, texto }) => (
              <div key={titulo}>
                <dt className="font-medium">{titulo}</dt>
                <dd className="mt-2 text-sm leading-6 text-muted-foreground">
                  {texto}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
          <div>
            <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              Por que não usar um aplicativo de agendamento?
            </h2>
            <p className="mt-4 text-muted-foreground">
              Booksy, Trinks e parecidos são bons produtos, e funcionam bem para
              quem já tem público acostumado a marcar por aplicativo. Só que eles
              pedem uma coisa do seu cliente: baixar, criar conta e lembrar de
              abrir.
            </p>
            <p className="mt-3 text-muted-foreground">
              A Encaixaria não pede nada disso. Ela vive no WhatsApp que seu
              cliente já usa todo dia, e responde pelo número que ele já tem
              salvo com o nome do seu estabelecimento.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-6">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Do lado do seu cliente
            </p>
            <ul className="mt-4 space-y-3 text-sm">
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

      <section id="preco" className="border-y border-border bg-card">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
          <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            Preço
          </h2>

          <div className="mt-8 grid gap-8 rounded-lg border border-border bg-background p-8 sm:grid-cols-[auto_1fr] sm:gap-12">
            <div>
              <p className="flex items-baseline gap-1">
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
                {DIAS_TRIAL} dias grátis, sem cartão. Cancele quando quiser.{" "}
                <Link href="/precos" className="underline underline-offset-2">
                  Ver o que está incluído
                </Link>
                .
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
            <Link href="/login">Começar teste grátis</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
