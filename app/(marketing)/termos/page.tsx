import Link from "next/link";
import { DIAS_TRIAL, PRECO_ESSENCIAL, PRECO_GARANTIDO } from "@/lib/plano";
import {
  IDENTIFICACAO_LEGAL,
  identificacaoPendente,
  metadataPagina,
} from "@/lib/site";
import { PaginaTexto } from "../pagina-texto";

/**
 * Termos de uso.
 *
 * Descreve o produto que existe, incluindo as partes desconfortáveis: a cobrança
 * é manual, o cancelamento é por mensagem, e a conexão via QR code pode cair.
 *
 * O ponto que mais importa aqui é **não prometer autoatendimento que não
 * existe**. "Cancele quando quiser" é verdade, mas hoje significa "mande uma
 * mensagem que eu cancelo" — escrever a versão curta e deixar o cliente descobrir
 * a diferença é como se fabrica reclamação.
 */
export const metadata = metadataPagina({
  titulo: "Termos de uso",
  descricao:
    "As regras da assinatura da Encaixaria: teste gratuito, pagamento, cancelamento e limites do serviço.",
  caminho: "/termos",
  naoIndexar: identificacaoPendente(),
});

export default function TermosPage() {
  return (
    <PaginaTexto
      titulo="Termos de uso"
      resumo="O que a Encaixaria se compromete a fazer, o que ela não faz, e como funcionam assinatura e cancelamento."
      atualizadoEm="julho de 2026"
    >
      <h2>Quem presta o serviço</h2>
      <p>
        A Encaixaria é operada por{" "}
        <strong>{IDENTIFICACAO_LEGAL.razaoSocial}</strong> — nome fantasia{" "}
        {IDENTIFICACAO_LEGAL.nomeFantasia}, CNPJ {IDENTIFICACAO_LEGAL.cnpj}.
        Contato: <strong>{IDENTIFICACAO_LEGAL.emailContato}</strong>.
      </p>

      <h2>O que o serviço faz</h2>
      <p>
        A Encaixaria conecta-se ao WhatsApp do seu estabelecimento e atende quem
        manda mensagem, oferecendo os horários livres conforme os serviços e a
        grade que você cadastrou, registrando o agendamento e enviando um lembrete
        no dia anterior.
      </p>
      <p>
        A conta é para <strong>um estabelecimento e um número de WhatsApp</strong>.
        Usar a mesma conta para negócios distintos, ou revender o acesso, não é
        permitido.
      </p>

      <h2>O que o serviço não faz</h2>
      <ul>
        <li>Não recebe o pagamento do serviço. A cobrança de sinal por Pix existe no plano Garantido, e mesmo nela o dinheiro nunca passa por nós.</li>
        <li>Não tem financeiro, comissão nem controle de caixa.</li>
        <li>Não divide a agenda por profissional.</li>
        <li>Não interpreta texto livre: o cliente responde por números.</li>
        <li>Não integra com Google Calendar nem com outros sistemas de agenda.</li>
        <li>Não substitui o seu atendimento humano — você continua podendo assumir qualquer conversa.</li>
      </ul>

      <h2>Teste gratuito</h2>
      <p>
        São {DIAS_TRIAL} dias completos, sem cartão e sem compromisso. Ao final, o
        bot para de atender até a assinatura ser ativada; sua agenda e seus dados
        continuam acessíveis no painel.
      </p>
      <p>
        O teste pode começar em <strong>qualquer um dos dois planos</strong>,
        escolhido no cadastro. Se você escolher o Garantido, a cobrança de sinal só
        passa a funcionar depois de conectar sua conta do Mercado Pago; sem ela, o
        bot simplesmente não pede sinal e o restante funciona igual.
      </p>
      <p>
        <strong>
          Durante o teste, o sinal cobrado é dinheiro real, não simulação.
        </strong>{" "}
        O que é gratuito nesses {DIAS_TRIAL} dias é a nossa mensalidade. O Pix que
        o seu cliente pagar cai de verdade na sua conta do Mercado Pago desde o
        primeiro dia, e a devolução, se houver, também sai de lá. Não existe modo
        de simulação — recomendamos experimentar primeiro com um valor pequeno.
      </p>
      <p>
        <strong>O teste é um por número de WhatsApp</strong>, não por e-mail. Como
        o bot atende pelo número do estabelecimento, é ele que identifica o
        negócio. Se você trocou de número ou assumiu um estabelecimento que já
        testou, escreva para a gente que resolvemos — a regra existe para impedir
        teste infinito, não para punir quem tem motivo legítimo.
      </p>

      <h2>Assinatura e pagamento</h2>
      <p>
        São dois planos, por estabelecimento, sem cobrança por profissional, por
        cliente ou por mensagem, e sem limite de agendamentos:
      </p>
      <ul>
        <li>
          <strong>Essencial — R$ {PRECO_ESSENCIAL} por mês.</strong> Atendimento
          e agendamento pelo WhatsApp, cancelamento pelo cliente e lembrete no dia
          anterior.
        </li>
        <li>
          <strong>Garantido — R$ {PRECO_GARANTIDO} por mês.</strong> Tudo do
          Essencial, mais a cobrança de sinal por Pix descrita abaixo. Depende de
          você conectar uma conta do Mercado Pago da qual seja titular; sem essa
          conta conectada, o bot simplesmente não pede sinal, e as demais funções
          seguem valendo.
        </li>
      </ul>
      <p>
        A troca de plano é feita pelo mesmo canal da assinatura e passa a valer no
        período seguinte.
      </p>
      <p>
        Nesta fase <strong>não há cobrança automática</strong>: nenhum cartão é
        cadastrado e nada é debitado sozinho. A assinatura é combinada diretamente
        com a gente pelo WhatsApp, e é lá que o pagamento é acertado a cada
        período.
      </p>
      <p>
        Se um pagamento combinado não for feito, o bot deixa de atender. O painel
        continua acessível e nenhum dado é apagado por causa disso.
      </p>

      <h2>Cancelamento da assinatura</h2>
      <p>
        Sem multa, sem fidelidade e sem prazo mínimo. Sendo direto sobre como
        funciona hoje:{" "}
        <strong>não existe botão para cancelar a assinatura no painel</strong>.
        Você manda uma mensagem e a gente cancela. Como também não há débito
        automático, não há o risco de continuar sendo cobrado.
      </p>
      <p>
        Isso é diferente de cancelar o <em>horário</em> de um cliente, que você faz
        no painel a qualquer momento — ver abaixo.
      </p>
      <p>
        Para apagar seus dados, a exclusão da conta remove também os dados dos seus
        clientes — com uma exceção descrita na{" "}
        <Link href="/privacidade">política de privacidade</Link>.
      </p>

      <h2>Cancelamento de horário</h2>
      <p>
        Você cancela um horário no painel quando precisar, escolhendo o motivo numa
        lista fechada. O horário volta a ficar livre na hora, e o cliente é avisado
        pelo WhatsApp — se a conexão estiver caída, o painel avisa você de que a
        mensagem não saiu, para você falar com ele por outro caminho.
      </p>
      <p>
        <strong>A política de cancelamento é a do seu estabelecimento</strong>, não
        a nossa: prazo para desmarcar, cobrança por falta e o que você combina com
        cada cliente são decisões suas. A Encaixaria registra o cancelamento e
        transmite o aviso.
      </p>

      <h2>Cobrança de sinal (plano Garantido)</h2>
      <p>
        No plano Garantido, com a sua conta do Mercado Pago conectada, o bot pode
        pedir um sinal por Pix antes de fechar o agendamento. Quatro pontos que
        valem estar escritos:
      </p>
      <ul>
        <li>
          <strong>O dinheiro nunca passa por nós.</strong> A cobrança é criada em
          seu nome, com a autorização que você deu, e o Pix cai direto na sua
          conta. Não retemos, não repassamos e não cobramos comissão sobre ela.
          Não somos parte da transação nem intermediários dela: juridicamente, o
          pagamento é entre você e o seu cliente, e nós apenas geramos a cobrança
          com a autorização que você concedeu.
        </li>
        <li>
          <strong>A conta tem de ser sua.</strong> Você declara ser o titular da
          conta do Mercado Pago que conectar, e é responsável por ela: pelos dados
          cadastrais, pelos tributos que incidam sobre o que receber e pelo
          cumprimento das regras do próprio Mercado Pago. A exigência de conta
          própria não é nossa escolha comercial — a regulação do Pix não permite
          que alguém receba pagamentos por meio de conta de terceiro.
        </li>
        <li>
          <strong>A devolução é sua.</strong> Se o cliente desmarcar, ou se o
          pagamento cair depois de o horário já ter sido reservado por outra
          pessoa, quem decide devolver é você — o painel mostra os casos que
          pedem essa decisão e oferece o botão, mas a conta é sua.
        </li>
        <li>
          <strong>Contestação bate na sua conta.</strong> O cliente pode acionar o
          mecanismo de devolução do Pix junto ao banco dele, e nesse caso o valor
          pode ficar bloqueado enquanto a análise corre. Isso é regra do arranjo
          de pagamento, não nossa, e não temos como interferir.
        </li>
      </ul>
      <p>
        O horário fica segurado pelo prazo que você configurar. Passado o prazo
        sem pagamento, o agendamento é cancelado e o horário volta a ser oferecido.
      </p>

      <h2>Disponibilidade e limites</h2>
      <p>
        A conexão com o WhatsApp usa a mesma tecnologia do WhatsApp Web e depende
        do seu aparelho estar ligado e conectado.{" "}
        <strong>Ela pode cair</strong> — bateria, chip trocado, aparelho
        desvinculado. Quando isso acontece o painel avisa e reconectar leva um
        minuto, mas enquanto estiver fora o bot não responde e os lembretes não
        saem.
      </p>
      <p>
        Também não funciona em número já cadastrado na API oficial do WhatsApp da
        Meta: o QR code é aceito, mas as mensagens não chegam.
      </p>
      <p>
        Não prometemos disponibilidade ininterrupta e não nos responsabilizamos por
        agendamento perdido em decorrência de indisponibilidade do WhatsApp, da sua
        conexão ou do seu aparelho. A agenda continua sendo sua
        responsabilidade — a Encaixaria é uma ferramenta, não uma garantia.
      </p>

      <h2>Uso adequado</h2>
      <p>
        Você é responsável pelo conteúdo que configura no roteiro do bot e pelo
        relacionamento com seus clientes, incluindo ter base legal para se
        comunicar com eles. Não use a Encaixaria para envio de mensagem não
        solicitada em massa, nem para qualquer finalidade que viole as regras do
        WhatsApp — isso pode levar ao bloqueio do seu número pelo próprio WhatsApp,
        o que está fora do nosso controle.
      </p>

      <h2>Mudanças nos termos e no preço</h2>
      <p>
        Se estes termos mudarem de forma relevante, a data no topo muda e avisamos
        pelo canal de contato da conta. Mudança de preço é avisada com
        antecedência, e como não há débito automático, ela só passa a valer no
        período que você concordar em pagar.
      </p>

      <h2>Sem vínculo com a Meta</h2>
      <p>
        A Encaixaria não tem relação de afiliação, patrocínio ou representação com
        o WhatsApp, com a WhatsApp Inc. ou com a Meta Platforms.
      </p>
    </PaginaTexto>
  );
}
