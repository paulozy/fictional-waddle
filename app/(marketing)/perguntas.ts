import { DIAS_TRIAL } from "@/lib/plano";

/**
 * As perguntas que realmente travam a decisão neste nicho.
 *
 * Todas as respostas descrevem o comportamento que o código tem hoje — inclusive
 * as desconfortáveis, como a conexão cair. Prometer o que a V0 não faz é o jeito
 * mais rápido de perder um piloto na primeira semana.
 *
 * Mora num módulo próprio, e não dentro do componente, porque este é o texto de
 * maior densidade semântica do site: ~750 palavras que dobram o conteúdo
 * indexável da landing. Separado, ele é testável sem jsdom e pode ser lido por
 * mais de um consumidor sem arrastar React.
 */
export const PERGUNTAS = [
  {
    pergunta: "Preciso de um celular só para isso?",
    resposta:
      "De celular separado, não. A Encaixaria se conecta ao WhatsApp que você já usa, do mesmo jeito que o WhatsApp Web: você lê um QR code uma vez e pronto. Seu celular continua funcionando normalmente e você continua respondendo à mão quando quiser. O que vale separar é o número — veja a pergunta abaixo.",
  },
  {
    pergunta: "Posso conectar meu WhatsApp pessoal?",
    resposta:
      "Funciona, mas não recomendamos. Depois de conectado, qualquer pessoa que mandar mensagem para aquele número recebe o menu de agendamento — inclusive quem só queria falar com você. Por isso o ideal é um número dedicado ao negócio, como o do WhatsApp Business. Não é uma questão técnica: a Encaixaria funciona igual nos dois. É para não misturar o atendimento com a sua conversa pessoal. Em grupos e nos status o bot não responde, e você pode desconectar quando quiser.",
  },
  {
    pergunta: "Já uso o WhatsApp Business. Muda alguma coisa?",
    resposta:
      "A conexão é a mesma, pelo QR code de aparelhos conectados. Só vale desligar as mensagens automáticas de saudação e de ausência do aplicativo: elas continuam saindo do celular por conta própria e o cliente acabaria recebendo duas respostas. Uma ressalva importante: se esse número já estiver cadastrado na API oficial do WhatsApp da Meta, a conexão não funciona — o QR code é aceito, mas as mensagens não chegam. Nesse caso use outro número.",
  },
  {
    pergunta: "E se a conexão cair?",
    resposta:
      "Acontece — celular sem bateria, chip trocado, WhatsApp desconectado no aparelho. Quando cai, o painel mostra um aviso claro e é só ler um novo QR code. Enquanto estiver desconectado o bot não responde e os lembretes não saem, então a gente prefere avisar isso na cara do que fingir que está tudo bem.",
  },
  {
    pergunta: "Meu cliente precisa instalar alguma coisa?",
    resposta:
      "Nada. Ele manda mensagem no seu WhatsApp, como sempre fez, e responde com números. É essa a diferença para os aplicativos de agendamento: quem marca não baixa nada nem cria conta em lugar nenhum.",
  },
  {
    pergunta: "O bot entende o que meu cliente escreve?",
    resposta:
      "Ele trabalha com menu numerado — pergunta e o cliente responde 1, 2 ou 3. É simples de propósito: não erra interpretação e funciona para qualquer idade, com celular antigo e internet ruim. Interpretar texto livre não existe hoje, e a gente prefere não prometer data.",
  },
  {
    pergunta: "E os dados dos meus clientes?",
    resposta:
      "São seus. Guardamos nome e o contato do WhatsApp apenas para o bot agendar e mandar o lembrete, e nada disso é compartilhado com outro estabelecimento. Se você excluir sua conta, os dados dos seus clientes são apagados junto.",
  },
  {
    pergunta: "E se o cliente precisar desmarcar?",
    resposta:
      "Ele desmarca pelo WhatsApp, sem falar com você. Quem já tem horário marcado recebe, na primeira mensagem, a opção de cancelar — em menu numerado, como o resto do fluxo. O horário volta na hora para a sua agenda e fica livre para outro cliente, que é o ponto: horário desmarcado e não liberado é prejuízo parado. Você também pode cancelar pelo painel, escolhendo o motivo, e aí é o cliente que recebe o aviso pelo WhatsApp. Remarcar em uma etapa só ainda não existe: cancela e marca de novo.",
  },
  {
    pergunta: "Dá para cobrar sinal antes de confirmar o horário?",
    resposta:
      "Dá, como adicional. Você conecta sua conta do Mercado Pago uma vez e define um valor de sinal por serviço — pode cobrar só na progressiva e deixar o corte livre, por exemplo. O bot manda o Pix na conversa e segura o horário pelo prazo que você escolher; se o pagamento não cair, o agendamento é cancelado sozinho e o horário volta a ser oferecido. O ponto que mais importa: o dinheiro cai direto na sua conta, a Encaixaria não recebe, não retém e não cobra comissão sobre ele. Em troca, a devolução também é sua — se o cliente desmarcar, quem decide estornar é você, pelo painel. E vale saber que uma contestação de Pix é resolvida entre o cliente e o banco dele, e pode bloquear o valor enquanto isso.",
  },
  {
    pergunta: "Posso cancelar a assinatura quando quiser?",
    resposta:
      `Pode, sem multa e sem fidelidade. Sendo direto sobre como funciona hoje: não existe botão para cancelar a assinatura no painel — você manda uma mensagem e a gente cancela. (O botão de cancelar que existe no painel é para desmarcar horário de cliente, que é outra coisa.) Como também não há cartão cadastrado nem débito automático, não existe o risco de continuar sendo cobrado. O teste de ${DIAS_TRIAL} dias não pede cartão.`,
  },
  {
    pergunta: `Como funciona o teste de ${DIAS_TRIAL} dias?`,
    resposta:
      `São ${DIAS_TRIAL} dias completos, sem cartão e sem compromisso. O teste é um por número de WhatsApp: como o bot atende pelo número do seu estabelecimento, é ele que identifica o teste. Se você trocou de número ou assumiu um salão que já testou a Encaixaria, fale com a gente que a gente resolve.`,
  },
];
