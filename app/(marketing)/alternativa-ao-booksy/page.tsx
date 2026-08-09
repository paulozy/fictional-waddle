import { PRECO_MENSAL } from "@/lib/plano";
import { metadataPagina } from "@/lib/site";
import {
  ChamadaComparacao,
  NotaDeApuracao,
  TabelaComparacao,
  type LinhaComparacao,
} from "../comparacao";

/**
 * Comparação com o Booksy.
 *
 * **RASCUNHO — não publicar sem revisão humana.** Duas classes de afirmação aqui
 * precisam de conferência antes de ir ao ar, porque são sobre outra empresa:
 *
 * - Os preços (R$ 99,99 para até dois profissionais, R$ 20 por agenda extra)
 *   foram lidos na página pública de planos em julho de 2026. Reconferir.
 * - A afirmação de que o cliente final usa aplicativo/conta é o eixo da página.
 *   É verdadeira e é o modelo declarado do produto deles, mas convém reler a
 *   página deles para não descrever errado alguma modalidade nova.
 *
 * O que esta página **não** faz, de propósito: não diz que o Booksy é ruim, e
 * dedica uma seção inteira a onde ele ganha. Comparação em que o autor vence
 * todas as linhas é lida como propaganda; e o marketplace deles é uma vantagem
 * real que a Encaixaria não tem e não vai ter.
 */
export const metadata = metadataPagina({
  titulo: "Alternativa ao Booksy",
  descricao:
    "Booksy pede que seu cliente baixe o app e crie conta. A Encaixaria atende pelo WhatsApp do seu estabelecimento, em faixa única.",
  caminho: "/alternativa-ao-booksy",
  // Ficar fora do sitemap e sem link não impede indexação — impede descoberta
  // por essas duas vias. Enquanto o texto afirma preço de outra empresa sem
  // conferência humana, a página precisa dizer explicitamente que não é para
  // aparecer na busca.
  naoIndexar: true,
});

const LINHAS: LinhaComparacao[] = [
  {
    aspecto: "O que seu cliente faz para marcar",
    encaixaria:
      "Manda mensagem no WhatsApp do seu estabelecimento e responde com números.",
    concorrente: "Usa o aplicativo ou o site do Booksy, com conta criada.",
  },
  {
    aspecto: "Cliente precisa instalar algo",
    encaixaria: "Não.",
    concorrente: "O fluxo é pensado para o aplicativo.",
  },
  {
    aspecto: "De qual número o cliente recebe resposta",
    encaixaria: "Do seu, o mesmo que ele já tem salvo com o nome do salão.",
    concorrente: "Da plataforma.",
  },
  {
    aspecto: "Como o preço escala",
    encaixaria: `Faixa única de R$ ${PRECO_MENSAL}, sem contar profissional.`,
    concorrente: "Por agenda: uma faixa inicial e um valor por agenda adicional.",
  },
  {
    aspecto: "Traz cliente novo",
    encaixaria: "Não. Atende quem já procura você.",
    concorrente: "Sim — tem vitrine própria onde as pessoas descobrem salões.",
  },
  {
    aspecto: "Gestão além da agenda",
    encaixaria: "Não tem: sem financeiro nem comissão. Só cobrança de sinal, como adicional.",
    concorrente: "Bem mais completo nesse aspecto.",
  },
];

export default function AlternativaAoBooksyPage() {
  return (
    <>
      <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-12 pt-14 sm:pt-20">
        <p className="font-mono text-sm uppercase tracking-widest sm:text-xs text-muted-foreground">
          Comparação
        </p>
        <h1 className="mt-4 font-heading text-4xl font-semibold leading-[1.1] tracking-tight text-balance sm:text-5xl">
          Uma alternativa ao Booksy para quem não quer pedir download ao cliente
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
          O Booksy é um produto sério e bem construído, e para muitos
          estabelecimentos é a escolha certa. A diferença que importa é anterior a
          recursos: ele funciona quando seu cliente aceita usar um aplicativo de
          agendamento. Quando não aceita, nenhum recurso compensa.
        </p>
      </section>

      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
          <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            Lado a lado
          </h2>
          <div className="mt-8">
            <TabelaComparacao concorrente="Booksy" linhas={LINHAS} />
            <NotaDeApuracao
              concorrente="o Booksy"
              urlPrecos="https://biz.booksy.com/pt-br/pricing"
              consultadoEm="julho de 2026"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          Onde o Booksy é melhor, sem rodeio
        </h2>
        <div className="mt-6 grid gap-6 text-muted-foreground sm:grid-cols-2">
          <p>
            <strong className="font-medium text-foreground">
              Ele traz cliente novo.
            </strong>{" "}
            O Booksy é também uma vitrine: existe gente procurando barbearia por
            lá e descobrindo estabelecimentos que não conhecia. A Encaixaria não
            faz nada disso — ela atende melhor quem já procura você. Se o seu
            problema é <em>aparecer</em>, e não <em>responder</em>, o Booksy
            resolve algo que aqui não tem solução.
          </p>
          <p>
            <strong className="font-medium text-foreground">
              Ele faz muito mais que agenda.
            </strong>{" "}
            Financeiro, comissão, controle de equipe, pagamento do serviço. A
            Encaixaria faz uma coisa só, de propósito — o mais perto disso que
            ela chega é cobrar sinal por Pix, como adicional, com o dinheiro indo
            direto para a conta do dono. Se você precisa de sistema de gestão, está
            comparando produtos de categorias diferentes.
          </p>
        </div>
      </section>

      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
          <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Quando a Encaixaria é a escolha melhor
          </h2>
          <ul className="mt-6 grid gap-4 text-muted-foreground sm:grid-cols-2">
            <li>
              Seus clientes já mandam mensagem no WhatsApp para marcar, e você
              perde agendamento por não conseguir responder na hora.
            </li>
            <li>
              Sua clientela não vai baixar aplicativo — por idade, por celular
              antigo, ou simplesmente porque não quer.
            </li>
            <li>
              Você atende sozinho ou com pouca gente, e não quer pagar por
              cadeira.
            </li>
            <li>
              O que te incomoda é falta e mensagem não respondida, não falta de
              cliente novo.
            </li>
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
        <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          O que você deve saber antes de trocar
        </h2>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          A Encaixaria está em validação, com poucos estabelecimentos usando. Tem
          menos recurso, menos estrada e algum defeito que ninguém achou ainda. A
          conexão com o WhatsApp usa a mesma tecnologia do WhatsApp Web e pode
          cair — quando cai, o painel avisa e reconectar leva um minuto, mas
          enquanto está fora o bot não responde.
        </p>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Dá para testar duas semanas sem cartão e sem desligar o que você já usa.
          É a forma barata de descobrir se o seu caso é este.
        </p>
      </section>

      <ChamadaComparacao />
    </>
  );
}
