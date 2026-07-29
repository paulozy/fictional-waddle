import Link from "next/link";
import { DIAS_TRIAL, PRECO_MENSAL } from "@/lib/plano";
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
        <li>Não recebe pagamento e não cobra sinal do seu cliente.</li>
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
        <strong>O teste é um por número de WhatsApp</strong>, não por e-mail. Como
        o bot atende pelo número do estabelecimento, é ele que identifica o
        negócio. Se você trocou de número ou assumiu um estabelecimento que já
        testou, escreva para a gente que resolvemos — a regra existe para impedir
        teste infinito, não para punir quem tem motivo legítimo.
      </p>

      <h2>Assinatura e pagamento</h2>
      <p>
        O valor é de <strong>R$ {PRECO_MENSAL} por mês</strong>, em faixa única,
        sem cobrança por profissional, por cliente ou por mensagem, e sem limite de
        agendamentos.
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

      <h2>Cancelamento</h2>
      <p>
        Sem multa, sem fidelidade e sem prazo mínimo. Sendo direto sobre como
        funciona hoje: <strong>não existe botão de cancelamento no painel</strong>.
        Você manda uma mensagem e a gente cancela. Como também não há débito
        automático, não há o risco de continuar sendo cobrado.
      </p>
      <p>
        Para apagar seus dados, a exclusão da conta remove também os dados dos seus
        clientes — com uma exceção descrita na{" "}
        <Link href="/privacidade">política de privacidade</Link>.
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
