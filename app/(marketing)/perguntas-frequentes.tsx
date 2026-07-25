"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

/**
 * As perguntas que realmente travam a decisão neste nicho.
 *
 * Todas as respostas descrevem o comportamento que o código tem hoje — inclusive
 * as desconfortáveis, como a conexão cair. Prometer o que a V0 não faz é o jeito
 * mais rápido de perder um piloto na primeira semana.
 */
const PERGUNTAS = [
  {
    pergunta: "Preciso de um celular só para isso?",
    resposta:
      "De celular separado, não. O AgendaZap se conecta ao WhatsApp que você já usa, do mesmo jeito que o WhatsApp Web: você lê um QR code uma vez e pronto. Seu celular continua funcionando normalmente e você continua respondendo à mão quando quiser. O que vale separar é o número — veja a pergunta abaixo.",
  },
  {
    pergunta: "Posso conectar meu WhatsApp pessoal?",
    resposta:
      "Funciona, mas não recomendamos. Depois de conectado, qualquer pessoa que mandar mensagem para aquele número recebe o menu de agendamento — inclusive quem só queria falar com você. Por isso o ideal é um número dedicado ao negócio, como o do WhatsApp Business. Não é uma questão técnica: o AgendaZap funciona igual nos dois. É para não misturar o atendimento com a sua conversa pessoal. Em grupos e nos status o bot não responde, e você pode desconectar quando quiser.",
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
      "Por enquanto ele trabalha com menu numerado — pergunta e o cliente responde 1, 2 ou 3. É simples de propósito: não erra interpretação e funciona para qualquer idade. Entender texto livre está no plano, mas só depois que o básico estiver redondo.",
  },
  {
    pergunta: "E os dados dos meus clientes?",
    resposta:
      "São seus. Guardamos nome e o contato do WhatsApp apenas para o bot agendar e mandar o lembrete, e nada disso é compartilhado com outro estabelecimento. Se você excluir sua conta, os dados dos seus clientes são apagados junto.",
  },
  {
    pergunta: "Posso cancelar quando quiser?",
    resposta:
      "Pode, sem multa e sem falar com ninguém. O teste de 14 dias não pede cartão.",
  },
];

export function PerguntasFrequentes() {
  return (
    <Accordion type="single" collapsible className="w-full">
      {PERGUNTAS.map(({ pergunta, resposta }) => (
        <AccordionItem key={pergunta} value={pergunta}>
          <AccordionTrigger className="text-left text-base">
            {pergunta}
          </AccordionTrigger>
          <AccordionContent className="text-muted-foreground">
            {resposta}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
