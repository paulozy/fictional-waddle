import Link from "next/link";
import {
  IDENTIFICACAO_LEGAL,
  identificacaoPendente,
  metadataPagina,
} from "@/lib/site";
import { PaginaTexto } from "../pagina-texto";

/**
 * Política de privacidade.
 *
 * Descreve o tratamento que o **código faz hoje**, não um modelo genérico. Três
 * pontos foram escritos com cuidado porque errar neles seria declarar coisa
 * falsa:
 *
 * 1. **Os papéis são diferentes para dois conjuntos de dados.** Sobre a conta do
 *    dono, a Encaixaria é controladora. Sobre os clientes finais dele, quem
 *    determina a finalidade é o dono — ele é o controlador e a Encaixaria é
 *    operadora. Declarar-se controladora de tudo seria assumir obrigação que não
 *    é nossa e tirar do dono uma que é.
 * 2. **O livro-caixa do trial sobrevive à exclusão da conta**, de propósito
 *    (`trials_numero_whatsapp` fica fora do cascade). Omitir isso enquanto se
 *    promete "apagamos tudo" seria a parte falsa da política.
 * 3. **A identidade do cliente final é o JID, não o telefone** — em muitos casos
 *    não existe telefone guardado. Isso muda o que se pode prometer sobre
 *    portabilidade.
 *
 * Não é peça jurídica revisada: descreve fielmente o sistema, e o texto merece
 * leitura de advogado antes de virar compromisso público.
 */
export const metadata = metadataPagina({
  titulo: "Privacidade",
  descricao:
    "Que dados a Encaixaria trata, com que finalidade, por quanto tempo e como exercer seus direitos.",
  caminho: "/privacidade",
  naoIndexar: identificacaoPendente(),
});

export default function PrivacidadePage() {
  return (
    <PaginaTexto
      titulo="Política de privacidade"
      resumo="Quais dados passam pela Encaixaria, por quê, e o que você pode exigir a respeito deles."
      atualizadoEm="julho de 2026"
    >
      <h2>Quem trata os dados</h2>
      <p>
        A Encaixaria é operada por{" "}
        <strong>{IDENTIFICACAO_LEGAL.razaoSocial}</strong> — nome fantasia{" "}
        {IDENTIFICACAO_LEGAL.nomeFantasia}, CNPJ {IDENTIFICACAO_LEGAL.cnpj}. Para
        qualquer assunto relativo a dados pessoais, incluindo o exercício dos
        direitos listados abaixo, o contato é{" "}
        <strong>{IDENTIFICACAO_LEGAL.emailContato}</strong>.
      </p>

      <h2>Dois conjuntos de dados, com papéis diferentes</h2>
      <p>
        Essa distinção não é formalidade — ela define quem responde pelo quê.
      </p>
      <ul>
        <li>
          <strong>Sua conta.</strong> Os dados que você cadastra para usar a
          Encaixaria. Aqui somos o <strong>controlador</strong>: a finalidade é
          nossa.
        </li>
        <li>
          <strong>Os clientes do seu estabelecimento.</strong> Aqui{" "}
          <strong>você é o controlador e nós somos operadores</strong>. Quem
          decide o que perguntar, o que guardar e por quanto tempo atender é você;
          nós processamos conforme essa configuração e não usamos esses dados para
          nenhuma finalidade própria.
        </li>
      </ul>

      <h2>O que é coletado</h2>
      <p>Sobre você, dono da conta:</p>
      <ul>
        <li>E-mail e senha (a senha é gerenciada pelo provedor de autenticação e nunca fica legível para nós).</li>
        <li>Nome do estabelecimento, fuso horário e as configurações de agenda.</li>
        <li>
          O número de WhatsApp que você conecta, guardado como{" "}
          <strong>código irreversível</strong> — ver a seção sobre o teste
          gratuito.
        </li>
        <li>
          O histórico de quando a conexão do seu WhatsApp caiu e voltou, com o
          código numérico do motivo, quando o WhatsApp o informa.{" "}
          <strong>Nenhum conteúdo de mensagem entra nesse registro.</strong> Ele
          existe para o suporte conseguir responder por que o bot parou de
          atender.
        </li>
      </ul>
      <p>Sobre os clientes do seu estabelecimento:</p>
      <ul>
        <li>
          O identificador da conversa no WhatsApp e, quando o WhatsApp o informa,
          o número de telefone. Cada vez mais o WhatsApp entrega apenas um
          identificador interno, sem telefone — nesse caso é só isso que
          guardamos, e não reconstruímos o número.
        </li>
        <li>
          O nome do perfil de WhatsApp, exatamente como o WhatsApp o envia junto
          da mensagem. Não perguntamos o nome — se a pessoa mudar o perfil dela, é
          o novo que passa a aparecer.
        </li>
        <li>
          Os agendamentos e as respostas às perguntas que <em>você</em> montou no
          roteiro do bot.
        </li>
        <li>
          O estado da conversa em andamento: em que ponto do roteiro a pessoa
          está e o que ela já respondeu ali.
        </li>
        <li>
          Quando um agendamento é cancelado: a data do cancelamento, quem
          cancelou (você ou o cliente) e, se foi você, o motivo escolhido numa
          lista fechada — e uma observação opcional que <em>você</em> escreve.{" "}
          <strong>Não perguntamos o motivo ao cliente</strong>, e a sua observação
          nunca é enviada a ele: fica só no seu painel. Ela também não é lugar
          para informação de saúde.
        </li>
      </ul>
      <p>
        <strong>Não guardamos o conteúdo</strong> das mensagens fora do roteiro de
        agendamento — nada do que é conversado com você é lido ou arquivado. Mas
        vale ser exato: como o bot atende no número do estabelecimento, quem manda
        mensagem para ele entra no fluxo, e o identificador de quem escreveu fica
        registrado mesmo que a pessoa só quisesse falar com você. Em grupos e nos
        status o bot não atua.
      </p>

      <h2>Para que serve</h2>
      <ul>
        <li>Manter sua conta e autenticar seu acesso.</li>
        <li>Atender seus clientes no WhatsApp e registrar os agendamentos.</li>
        <li>Enviar o lembrete automático no dia anterior.</li>
        <li>
          Avisar o cliente pelo WhatsApp quando você cancela um horário dele.
        </li>
        <li>
          Registrar o envio dos lembretes, para que o mesmo lembrete não saia
          duas vezes e para investigar reclamação de mensagem não recebida.
        </li>
        <li>Impedir que o mesmo número faça o teste gratuito repetidas vezes.</li>
        <li>
          No plano Garantido, gerar a cobrança de sinal em nome do
          estabelecimento e registrar o desfecho dela — pago, expirado ou
          devolvido.
        </li>
      </ul>
      <p>
        Não vendemos dados, não fazemos publicidade com eles e não compartilhamos
        os clientes de um estabelecimento com outro. Um estabelecimento nunca vê o
        dado de outro.
      </p>

      <h2>Base legal</h2>
      <ul>
        <li>
          <strong>Execução de contrato</strong> (Art. 7º, V da LGPD) para tudo o
          que é necessário para o serviço funcionar: sua conta, o atendimento aos
          seus clientes, o lembrete.
        </li>
        <li>
          <strong>Legítimo interesse</strong> (Art. 7º, IX) para prevenir abuso do
          teste gratuito, tratando o mínimo possível — um código irreversível, não
          o número.
        </li>
        <li>
          <strong>Cumprimento de obrigação legal</strong> (Art. 7º, II) quando
          houver.
        </li>
        <li>
          <strong>Execução de contrato</strong>, também, para a cobrança de sinal
          no plano Garantido: ela existe porque o estabelecimento a contratou e a
          autorizou, e os dados tratados são os mínimos para emitir a cobrança e
          saber se ela foi paga.
        </li>
      </ul>

      <h2>Se a cobrança de sinal estiver ativa (plano Garantido)</h2>
      <p>
        A cobrança de sinal existe apenas no plano Garantido, e só passa a
        funcionar depois de o dono autorizar a própria conta do Mercado Pago —
        conta da qual ele é o titular — o que pode ser feito já durante o período
        de teste —, porque{" "}
        <strong>
          a regulação do Pix não permite receber pagamento por meio de conta de
          terceiro
        </strong>
        . Quando isso acontece, três coisas passam a ser guardadas — e uma que{" "}
        <em>não</em> é:
      </p>
      <ul>
        <li>
          <strong>A autorização de acesso à conta do dono</strong>, guardada
          cifrada. Ela permite gerar cobranças em nome dele e nada além disso: não
          dá acesso a senha, a saldo nem a movimentação da conta. O dono pode
          revogá-la a qualquer momento, no painel da Encaixaria ou no do Mercado
          Pago.
        </li>
        <li>
          <strong>O registro de cada cobrança</strong>: valor, prazo, o código Pix
          gerado, o identificador do pagamento no Mercado Pago e se foi pago,
          expirou ou foi devolvido.
        </li>
        <li>
          <strong>A ligação com o agendamento</strong>, para saber qual horário
          aquele pagamento reservou.
        </li>
        <li>
          <strong>Não guardamos dado de pagador.</strong> Não pedimos CPF, nome
          completo nem e-mail do cliente para gerar a cobrança — a identidade dele
          no sistema continua sendo o identificador do WhatsApp, como no resto do
          produto.
        </li>
      </ul>
      <p>
        <strong>O dinheiro não passa por nós em momento nenhum.</strong> O Pix é
        pago diretamente à conta do estabelecimento; a Encaixaria não recebe, não
        retém, não repassa valores e não é intermediária do pagamento. Também não
        temos acesso a saldo, extrato ou movimentação da conta do dono: a
        autorização serve para gerar cobranças e consultar o resultado delas, e
        nada além disso.
      </p>

      <h2>Com quem os dados são compartilhados</h2>
      <p>
        Apenas com os provedores necessários para o serviço existir: hospedagem da
        aplicação, banco de dados e o serviço que faz a ponte com o WhatsApp. Eles
        atuam como operadores, sob instrução nossa, e não recebem os dados para
        finalidade própria.
      </p>
      <p>
        Com a cobrança de sinal ativa, entra também o <strong>Mercado Pago</strong>,
        que é quem processa o pagamento. O tratamento que ele faz dos dados da
        transação é regido pela política dele, não pela nossa.
      </p>
      <p>
        As mensagens trafegam pelo WhatsApp, cuja operação e política de
        privacidade são da Meta e não nossas.
      </p>

      <h2>Por quanto tempo ficam guardados</h2>
      <ul>
        <li>
          <strong>Enquanto a conta existir</strong>, para os dados da conta, dos
          serviços, dos horários, dos clientes e dos agendamentos.
        </li>
        <li>
          <strong>Seis horas</strong> é o prazo em que uma conversa parada deixa de
          valer: passado esse tempo, a próxima mensagem começa um atendimento novo
          e o que estava pela metade é substituído. Sendo preciso sobre o que isso
          significa — o registro não é apagado nesse momento, ele deixa de ser
          usado e é sobrescrito na conversa seguinte. A remoção acontece com a
          exclusão da conta.
        </li>
        <li>
          <strong>Ao excluir a conta, os dados dos seus clientes são apagados
          junto</strong>, em cascata — agendamentos, cadastros, histórico de
          conversa e registros de envio.
        </li>
      </ul>

      <h2>A exceção: o registro do teste gratuito</h2>
      <p>
        O teste gratuito é um por número de WhatsApp, porque é o número do
        estabelecimento que identifica o negócio — criar outro e-mail é grátis e
        infinito, e sem essa regra o teste seria eterno.
      </p>
      <p>
        Para isso guardamos um <strong>código irreversível</strong> derivado do
        número, e não o número. O cálculo usa um segredo que não fica no banco de
        dados, então mesmo uma cópia integral da tabela não revela nenhum
        telefone. Não é possível partir do código e chegar ao número.
      </p>
      <p>
        <strong>
          Esse registro é o único dado que sobrevive, no nosso banco, à exclusão da
          conta.
        </strong>{" "}
        Ele existe exatamente para impedir que excluir e recriar a conta zere a
        contagem, e se fosse apagado junto não teria função alguma. É um código
        sozinho: não fica ligado a nome, e-mail ou histórico.
      </p>
      <p>
        Uma ressalva de precisão: o serviço que faz a ponte com o WhatsApp mantém
        a sessão do número conectado enquanto ela existir, e desconectar o
        aparelho é o que encerra essa sessão. Se você quiser que ela seja removida
        junto com a conta, peça no mesmo pedido de exclusão.
      </p>
      <p>
        Se você foi barrado por engano — comprou um salão que já tinha testado, ou
        trocou de número —, escreva para{" "}
        <strong>{IDENTIFICACAO_LEGAL.emailContato}</strong> que a gente corrige.
      </p>

      <h2>Seus direitos</h2>
      <p>
        A LGPD (Art. 18) garante a você confirmação de tratamento, acesso,
        correção, anonimização, portabilidade, eliminação, informação sobre
        compartilhamento e revisão de decisões automatizadas. Para exercer
        qualquer um, escreva para{" "}
        <strong>{IDENTIFICACAO_LEGAL.emailContato}</strong>.
      </p>
      <p>
        Uma ressalva honesta sobre portabilidade dos clientes finais: em boa parte
        dos casos não temos o número de telefone, só o identificador interno do
        WhatsApp, que não serve fora dele. O que podemos entregar é o que existe.
      </p>
      <p>
        Se você é cliente de um estabelecimento que usa a Encaixaria e quer
        exercer direitos sobre seus dados, o caminho mais direto é falar com o
        estabelecimento, que é o controlador. Se preferir nos escrever, nós
        encaminhamos.
      </p>

      <h2>Segurança</h2>
      <p>
        O acesso aos dados é isolado por estabelecimento no próprio banco de
        dados, e não apenas na aplicação. As chaves de serviço ficam restritas ao
        servidor e nunca chegam ao navegador. Evitamos registrar telefone e nome
        em texto legível nos diagnósticos.
      </p>
      <p>
        Nenhum sistema é imune. Se houver incidente com risco relevante,
        comunicamos os afetados e a ANPD, como manda o Art. 48.
      </p>

      <h2>Mudanças</h2>
      <p>
        Se esta política mudar de forma relevante, a data no topo muda e avisamos
        pelo canal de contato da conta. As regras da assinatura estão nos{" "}
        <Link href="/termos">termos de uso</Link>.
      </p>
    </PaginaTexto>
  );
}
