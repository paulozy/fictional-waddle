import { DIAS_TRIAL, PRECO_MENSAL } from "@/lib/plano";
import { metadataPagina } from "@/lib/site";
import {
  ChamadaComparacao,
  NotaDeApuracao,
  TabelaComparacao,
  type LinhaComparacao,
} from "../comparacao";

/**
 * Comparação com o Trinks.
 *
 * **RASCUNHO — não publicar sem revisão humana.** O que precisa ser reconferido
 * na página de planos deles antes de ir ao ar:
 *
 * - As faixas de preço por número de profissionais (lidas em julho de 2026).
 * - A duração do teste gratuito deles.
 * - Que recurso de lembrete/WhatsApp está atrelado a faixa — esta é a afirmação
 *   mais frágil da página e a mais fácil de ficar desatualizada.
 *
 * Uma afirmação foi **deliberadamente deixada de fora**: a pesquisa apontou multa
 * de 50% em cancelamento de plano semestral. É verificável em princípio, mas
 * afirmar cláusula de penalidade de outra empresa é o item de maior dano se
 * estiver errado ou vencido, e não é necessário para o argumento. No lugar dela,
 * a página apenas sugere conferir as condições de fidelidade.
 */
export const metadata = metadataPagina({
  titulo: "Encaixaria ou Trinks",
  descricao:
    "Trinks cobra por profissional e o cliente final agenda por app ou site. A Encaixaria é faixa única e atende pelo seu WhatsApp.",
  caminho: "/encaixaria-vs-trinks",
  // Ver a nota gêmea em `/alternativa-ao-booksy`: rascunho não indexável até
  // revisão humana, porque afirma preço e recurso de outra empresa.
  naoIndexar: true,
});

const LINHAS: LinhaComparacao[] = [
  {
    aspecto: "Onde seu cliente marca",
    encaixaria: "No WhatsApp do seu estabelecimento, respondendo com números.",
    concorrente: "No aplicativo ou na página de agendamento da plataforma.",
  },
  {
    aspecto: "Como o preço escala",
    encaixaria: `Faixa única de R$ ${PRECO_MENSAL}, independente de quanta gente atende.`,
    concorrente:
      "Por número de profissionais, com faixas — e as maiores sob consulta.",
  },
  {
    aspecto: "Lembrete automático",
    encaixaria: "Incluído desde o primeiro dia, sem custo por mensagem.",
    concorrente: "Depende da faixa contratada.",
  },
  {
    aspecto: "Teste gratuito",
    encaixaria: `${DIAS_TRIAL} dias, sem cartão.`,
    concorrente: "Bem mais curto — confira o prazo atual no site deles.",
  },
  {
    aspecto: "Fidelidade",
    encaixaria: "Nenhuma. Cancelamento por mensagem, sem multa.",
    concorrente: "Há planos com prazo — vale ler as condições antes de assinar.",
  },
  {
    aspecto: "Escopo",
    encaixaria: "Agendamento e lembrete. Nada além disso.",
    concorrente: "Suíte de gestão para salão, muito mais ampla.",
  },
];

export default function EncaixariaVsTrinksPage() {
  return (
    <>
      <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-12 pt-14 sm:pt-20">
        <p className="font-mono text-sm uppercase tracking-widest sm:text-xs text-muted-foreground">
          Comparação
        </p>
        <h1 className="mt-4 font-heading text-4xl font-semibold leading-[1.1] tracking-tight text-balance sm:text-5xl">
          Encaixaria ou Trinks: qual faz sentido para o seu salão
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
          São produtos de tamanhos diferentes, e isso é a resposta mais útil que
          existe aqui. O Trinks é uma suíte de gestão para salão; a Encaixaria
          resolve uma coisa só, o agendamento pelo WhatsApp, e cobra um valor único
          por isso.
        </p>
      </section>

      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
          <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            Lado a lado
          </h2>
          <div className="mt-8">
            <TabelaComparacao concorrente="Trinks" linhas={LINHAS} />
            <NotaDeApuracao
              concorrente="o Trinks"
              urlPrecos="https://negocios.trinks.com/planos/"
              consultadoEm="julho de 2026"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
          <div>
            <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              A conta muda quando o salão cresce
            </h2>
            <p className="mt-4 text-muted-foreground">
              Cobrança por profissional tem uma consequência que só aparece
              depois: contratar mais uma pessoa aumenta a mensalidade. Faz sentido
              para quem vende software de gestão, e não faz diferença nenhuma para
              o custo de atender uma mensagem no WhatsApp.
            </p>
            <p className="mt-3 text-muted-foreground">
              Aqui o valor não muda porque a agenda encheu. Também não há cobrança
              por mensagem enviada. Cobrar sinal do cliente final é adicional, e
              não muda com o volume.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-6">
            <p className="font-mono text-sm uppercase tracking-widest sm:text-xs text-muted-foreground">
              Onde o Trinks é melhor
            </p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
              <li>
                Faz gestão de verdade: comissão, financeiro, comanda, controle de
                equipe. A Encaixaria não faz nada disso.
              </li>
              <li>
                É produto maduro, com anos de operação e muito mais
                estabelecimentos usando. A Encaixaria está em validação.
              </li>
              <li>
                Se o seu salão tem equipe e cada profissional precisa da própria
                agenda, isso hoje não existe aqui.
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
          <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            A pergunta que decide
          </h2>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Seus clientes já mandam mensagem no WhatsApp para marcar horário? Se
            sim, o problema não é onde eles agendam — é que ninguém responde
            enquanto você está atendendo. É esse buraco que a Encaixaria tapa, sem
            pedir que eles mudem de hábito.
          </p>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Se o que falta no seu salão é controle de comissão, caixa e equipe, a
            resposta honesta é que a Encaixaria não serve — e o Trinks provavelmente
            sim.
          </p>
        </div>
      </section>

      <ChamadaComparacao />
    </>
  );
}
