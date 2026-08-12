import Link from "next/link";
import { CheckIcon } from "lucide-react";
import { ConversaDemo } from "@/components/conversa-demo";
import { Button } from "@/components/ui/button";
import { PRECO_GARANTIDO } from "@/lib/plano";
import { metadataPagina } from "@/lib/site";

/**
 * Página de "como funciona".
 *
 * O ativo desta página é a **transcrição real do bot**: é conteúdo que nenhum
 * concorrente tem, porque é o comportamento deste código e não uma descrição
 * genérica de agendamento. A landing mostra a conversa; aqui ela vem com o
 * contexto de cada etapa em volta.
 *
 * A seção sobre o menu numerado existe para virar uma objeção em argumento.
 * Metade do nicho vende "IA" e a Encaixaria não tem — mentir aqui é descoberto no
 * primeiro dia de teste. O que o menu tem de verdade é que funciona com cliente
 * de qualquer idade e com internet ruim, e não erra interpretação.
 */
export const metadata = metadataPagina({
  titulo: "Como funciona",
  descricao:
    "Do QR code ao lembrete: como a Encaixaria atende pelo WhatsApp do seu estabelecimento, com a conversa real do bot.",
  caminho: "/como-funciona",
});

const ETAPAS = [
  {
    titulo: "Você conecta o WhatsApp do negócio",
    texto:
      "Uma vez só, lendo um QR code no painel — igual ao WhatsApp Web. O número continua sendo o seu, o mesmo que seus clientes já têm salvo há anos. Seu celular continua funcionando normalmente, e você pode assumir qualquer conversa à mão quando quiser.",
  },
  {
    titulo: "Você diz o que faz e quando atende",
    texto:
      "Cadastra os serviços com a duração de cada um, e a grade de horários da semana — inclusive o intervalo do almoço. É disso que o bot precisa para nunca oferecer um horário que não cabe ou que você não trabalha.",
  },
  {
    titulo: "Você monta o roteiro da conversa",
    texto:
      // Não usar \"preferência de profissional\" como exemplo: a agenda é do
      // estabelecimento, e o exemplo convidaria o leitor a esperar agenda por
      // profissional, que /precos e /termos dizem que não existe.
      "As perguntas do bot são suas. As três etapas de sistema — escolher serviço, escolher horário e confirmar — são fixas, mas você acrescenta o que quiser em volta: se é a primeira vez aqui, se veio por indicação, alguma observação sobre o cabelo.",
  },
  {
    titulo: "O bot atende sozinho",
    texto:
      "O cliente manda mensagem, recebe o menu, escolhe por números e fecha o agendamento. Aparece na sua agenda na hora. Um dia antes, o cliente recebe o lembrete automático.",
  },
];

/**
 * As quatro linhas que respondem "o que a pausa quebra?".
 *
 * A segunda é a que mais importa e é a menos óbvia: pausar o bot **não** desfaz
 * agendamento nem cancela lembrete. Sem ela escrita, o dono hesita em assumir a
 * conversa justamente na hora em que deveria.
 */
const O_QUE_A_PAUSA_FAZ = [
  "Vale só para aquele contato — os outros seguem sendo atendidos",
  "Não cancela agendamento já marcado nem o lembrete dele",
  "Expira sozinha no prazo, e o bot retoma de onde a conversa parou",
  "Pode ser encerrada antes da hora pelo painel",
];

export default function ComoFuncionaPage() {
  return (
    <>
      <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-12 pt-14 sm:pt-20">
        <h1 className="font-heading text-4xl font-semibold leading-[1.1] tracking-tight text-balance sm:text-5xl">
          Do QR code ao lembrete
        </h1>
        <p className="mt-5 max-w-[36rem] text-lg leading-8 text-muted-foreground">
          A Encaixaria não é um aplicativo que seu cliente instala. Ela atende
          pelo WhatsApp que ele já usa, respondendo do número que ele já tem
          salvo com o nome do seu estabelecimento.
        </p>
      </section>

      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
          <ol className="grid gap-10 sm:grid-cols-2">
            {ETAPAS.map(({ titulo, texto }, i) => (
              <li key={titulo}>
                <div className="flex items-center gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary font-mono text-sm tabular-nums text-primary-foreground">
                    {i + 1}
                  </span>
                  <h2 className="font-heading text-lg font-semibold tracking-tight">
                    {titulo}
                  </h2>
                </div>
                <p className="mt-3 text-base leading-7 text-muted-foreground md:text-sm md:leading-6">
                  {texto}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
        <div className="grid gap-10 lg:grid-cols-[1fr_0.9fr] lg:items-start">
          <div>
            <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              Assumir uma conversa quando o assunto pede gente
            </h2>
            <p className="mt-4 max-w-[36rem] text-muted-foreground lg:max-w-none">
              O bot é bom em marcar horário. Ele não é quem deve responder uma
              reclamação, explicar um procedimento ou negociar preço. Para esses
              casos você assume a conversa, e ele sai da frente.
            </p>
            <p className="mt-3 max-w-[36rem] text-muted-foreground lg:max-w-none">
              Basta responder ao cliente pelo WhatsApp de sempre, do seu celular:
              é isso que pausa o bot naquela conversa. Enquanto a pausa durar, ele
              não responde nada para aquele contato — nem menu, nem confirmação.
              O cliente também pode pedir para falar com uma pessoa, e nesse caso
              você recebe um aviso no seu próprio WhatsApp dizendo quem pediu.
            </p>
            <p className="mt-3 max-w-[36rem] text-muted-foreground lg:max-w-none">
              Terminado o prazo, o bot volta a atender aquele contato sozinho,
              retomando de onde a conversa parou. Você também pode encerrar a
              pausa antes da hora pelo painel.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-6">
            <p className="font-mono text-sm uppercase tracking-widest text-muted-foreground sm:text-xs">
              O que a pausa faz
            </p>
            <ul className="mt-4 space-y-3 text-base md:text-sm">
              {O_QUE_A_PAUSA_FAZ.map((item) => (
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
        <div className="grid gap-10 lg:grid-cols-[1fr_1.05fr] lg:items-center">
          <div>
            <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              A conversa que seu cliente recebe
            </h2>
            <p className="mt-4 max-w-[36rem] text-muted-foreground lg:max-w-none">
              Não é ilustração: é o que o bot responde hoje. O cliente não baixa
              nada, não cria conta e não decora endereço de site — ele manda
              mensagem como sempre fez e responde com números.
            </p>
            <p className="mt-3 max-w-[36rem] text-muted-foreground lg:max-w-none">
              Se ele digitar qualquer coisa fora das opções, o bot repete a
              pergunta em vez de travar. E em grupos e nos status ele não
              responde nada.
            </p>
          </div>

          <div className="lg:pl-4">
            <ConversaDemo />
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
          <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Por que menu de números, e não inteligência artificial
          </h2>
          <div className="mt-6 grid gap-6 text-muted-foreground sm:grid-cols-2">
            <p>
              Porque o menu não erra. Um bot que tenta adivinhar o que a pessoa
              quis dizer acerta quase sempre — e o &quot;quase&quot; é um horário
              marcado errado, que você descobre quando o cliente aparece na porta.
            </p>
            <p>
              E porque funciona com todo mundo. Cliente de qualquer idade
              consegue responder &quot;2&quot;, com internet ruim e celular
              antigo. Hoje não existe interpretação de texto livre, e a gente não
              promete data para isso.
            </p>
          </div>
        </div>
      </section>

      {/*
        Esta seção existe na página de "como funciona", e não só na de preço,
        porque a pergunta que ela responde é de mecanismo e não de valor: *como*
        um sinal por Pix acontece dentro de uma conversa de WhatsApp, e onde o
        dinheiro para. A parte comercial (quanto custa, o que o plano inclui) fica
        em `/precos`, com o link daqui para lá.
      */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
        <p className="font-mono text-sm uppercase tracking-widest text-muted-foreground sm:text-xs">
          Só no plano Garantido
        </p>
        <h2 className="mt-4 max-w-[26ch] font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          Cobrar um sinal por Pix antes de fechar o horário
        </h2>
        <p className="mt-4 max-w-[36rem] text-muted-foreground">
          Você define um valor de sinal por serviço — pode pedir só na progressiva
          e deixar o corte livre. Quando o cliente escolhe um serviço que tem
          sinal, o bot manda o código Pix na própria conversa e segura o horário
          pelo prazo que você configurou. Se o pagamento cair, o horário está
          fechado; se não cair, o agendamento é cancelado sozinho e o horário
          volta a ser oferecido para outra pessoa.
        </p>
        <p className="mt-3 max-w-[36rem] text-muted-foreground">
          O ponto que mais importa:{" "}
          <strong className="font-medium text-foreground">
            o dinheiro não passa por nós.
          </strong>{" "}
          Para isso funcionar você conecta uma conta do Mercado Pago no seu nome —
          é nela que o Pix cai, na hora, direto do cliente para você. A gente não
          recebe, não retém e não cobra comissão sobre o sinal; em troca, se
          houver devolução, quem devolve é você. Não precisa de CNPJ: conta de
          pessoa física serve, e criá-la é de graça.
        </p>
        <p className="mt-3 max-w-[36rem] text-muted-foreground">
          O plano Garantido custa R$ {PRECO_GARANTIDO} por mês.{" "}
          <Link href="/precos#mercado-pago" className="underline underline-offset-2">
            A página de preço explica em detalhe por que a conta precisa ser sua
          </Link>
          .
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
        <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          O que depende do seu celular
        </h2>
        <p className="mt-4 max-w-[36rem] text-muted-foreground">
          A conexão é a mesma tecnologia do WhatsApp Web, então ela depende do seu
          aparelho estar ligado e com o WhatsApp conectado. Se cair — bateria,
          chip trocado, aparelho desvinculado — o painel avisa e reconectar leva
          um minuto, lendo um QR code novo. Enquanto estiver fora, o bot não
          responde e os lembretes não saem.
        </p>
        <p className="mt-3 max-w-[36rem] text-muted-foreground">
          Um detalhe que vale conferir antes: se o número já estiver cadastrado na
          API oficial do WhatsApp da Meta, a conexão não funciona. O QR code é
          aceito, mas as mensagens não chegam. Nesse caso use outro número.
        </p>
      </section>

      <section className="border-t border-border bg-card">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16 text-center">
          <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Conectar leva um minuto
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Depois disso o bot atende no seu lugar, inclusive quando você está com
            as mãos ocupadas.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Button asChild size="lg">
              <Link href="/registro">Começar teste grátis</Link>
            </Button>
            {/* Alvo isolado: precisa do piso de toque, como em `comparacao.tsx`. */}
            <Link
              href="/precos"
              className="flex min-h-11 items-center px-2 text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
            >
              Ver o preço
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
