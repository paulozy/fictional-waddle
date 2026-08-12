import Link from "next/link";
import {
  IDENTIFICACAO_LEGAL,
  identificacaoPendente,
  metadataPagina,
} from "@/lib/site";
import { PaginaTexto } from "../pagina-texto";

/**
 * Página "sobre".
 *
 * O objetivo não é institucional, é de confiança: o dono do salão vai entregar o
 * cadastro dos clientes dele para alguém, e precisa poder ver quem é esse alguém.
 * Isso também é E-E-A-T barato — uma pessoa identificável e um canal de contato
 * real valem mais para o Google, e para o comprador, que qualquer adjetivo.
 *
 * Os campos entre colchetes vêm de `IDENTIFICACAO_LEGAL` e são pendência:
 * `lib/organizacao.test.ts` falha enquanto estiverem assim.
 */
export const metadata = metadataPagina({
  titulo: "Sobre",
  descricao:
    "Quem faz a Encaixaria, por que ela existe e como falar com a gente.",
  caminho: "/sobre",
  // Esta página exibe a identificação do controlador. Enquanto ela for um
  // marcador, a página não deve entrar na busca — o teste é o portão do CI, isto
  // é o portão do deploy, e deploy não roda teste.
  naoIndexar: identificacaoPendente(),
});

export default function SobrePage() {
  return (
    <PaginaTexto
      titulo="Sobre a Encaixaria"
      resumo="Um produto pequeno, com um problema só, feito para negócio de horário marcado."
    >
      <h2>Por que ela existe</h2>
      <p>
        A conta que originou este produto é simples: quem manda mensagem para
        marcar horário não espera. Se você está com a mão na cabeça de um cliente,
        não dá para parar — e meia hora depois quem mandou a mensagem já resolveu
        em outro lugar. Some a isso a falta, que prende o horário na agenda e não
        gera nada.
      </p>
      <p>
        As duas coisas têm o mesmo conserto: alguém respondendo na hora, pelo
        número que o cliente já tem salvo, e um lembrete no dia anterior. É só
        isso que a Encaixaria faz.
      </p>

      <h2>O que ela deliberadamente não é</h2>
      <p>
        Não é um sistema de gestão. Não tem financeiro, comissão, controle de
        estoque nem relatório de faturamento. Cobrar sinal por Pix existe no plano
        Garantido, e mesmo lá o dinheiro vai direto para a conta do dono — não
        passa por nós em momento nenhum. Existem
        produtos bons que fazem tudo isso e custam mais — se é o que você precisa,
        vale olhar para eles com honestidade.
      </p>
      <p>
        A escolha de fazer uma coisa só tem um motivo prático: um produto que faz
        pouco pode ser configurado em dez minutos por alguém que nunca usou um
        sistema. É esse o público.
      </p>

      <h2>Em que fase está</h2>
      <p>
        Em validação, com poucos estabelecimentos usando de verdade. Isso tem um
        lado bom e um lado ruim, e os dois são reais: você fala direto com quem
        escreve o código e o que você pedir tem chance de entrar; em troca, o
        produto tem menos recurso que os concorrentes estabelecidos e vai ter
        algum defeito que ninguém encontrou ainda.
      </p>
      <p>
        Por isso não há depoimento nem logo de cliente em nenhuma página deste
        site. Quando houver com nome e cidade de quem usa, aparecem.
      </p>

      <h2>Quem é o responsável</h2>
      <p>
        A Encaixaria é operada por{" "}
        <strong>{IDENTIFICACAO_LEGAL.razaoSocial}</strong> — nome fantasia{" "}
        {IDENTIFICACAO_LEGAL.nomeFantasia}, CNPJ {IDENTIFICACAO_LEGAL.cnpj}.
      </p>
      <p>
        Para falar sobre o produto, sobre uma conta ou sobre dados pessoais, o
        canal é <strong>{IDENTIFICACAO_LEGAL.emailContato}</strong>. Quem responde
        é gente, e a mesma gente que escreve o código.
      </p>
      <p>
        Detalhes de tratamento de dados estão na{" "}
        <Link href="/privacidade">política de privacidade</Link>, e as regras da
        assinatura nos <Link href="/termos">termos de uso</Link>.
      </p>

      <h2>Sem vínculo com a Meta nem com o Mercado Pago</h2>
      <p>
        A Encaixaria não tem nenhuma relação de afiliação, patrocínio ou
        representação com o WhatsApp, com a WhatsApp Inc. ou com a Meta
        Platforms. &quot;WhatsApp&quot; é marca dos respectivos titulares, citada
        aqui apenas para descrever com o que o produto se conecta.
      </p>
      <p>
        O mesmo vale para o <strong>Mercado Pago</strong>, usado no plano
        Garantido: a Encaixaria é um aplicativo independente, que{" "}
        <strong>não pertence ao Mercado Pago nem ao Mercado Livre</strong> e não é
        patrocinada, endossada ou operada por eles. Nós apenas nos conectamos à
        conta que você autoriza, e as marcas são dos respectivos titulares.
      </p>
    </PaginaTexto>
  );
}
