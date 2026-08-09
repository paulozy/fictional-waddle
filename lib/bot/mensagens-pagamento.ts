/**
 * Textos do bot sobre sinal.
 *
 * Módulo separado pelo mesmo motivo de `mensagens-cancelamento.ts`: arquivo
 * `"use server"` só exporta função async, então construtor de texto síncrono não
 * cabe no lado do adaptador. Aqui é puro, e testável sem stack nenhuma.
 *
 * Regra de conteúdo que atravessa o arquivo: **nunca prometer irreversibilidade
 * nem instantaneidade sobre o dinheiro**. Contestação de Pix bloqueia o valor
 * cautelarmente por até 7 dias, e a devolução é decisão do estabelecimento, não
 * nossa — o texto que diz "é seu na hora e ninguém tira" vira reclamação.
 */

/** "R$ 20,00" a partir de centavos. */
export function formatarValor(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(centavos / 100);
}

/**
 * "sexta-feira, 14/08 às 09:00" no fuso do estabelecimento.
 *
 * Duplica a intenção do `formatarQuando` de `mensagens-cancelamento.ts`, que é
 * privado daquele módulo. Exportar aquele criaria uma dependência entre dois
 * conjuntos de texto que não têm relação — e o dia em que o cancelamento quiser
 * um formato diferente, mudaria o do pagamento junto, sem ninguém notar.
 */
export function formatarQuando(dataHora: string, fusoHorario: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fusoHorario,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dataHora));
}

/** "até 14:35" no fuso do estabelecimento. */
function formatarPrazo(expiraEm: Date, fusoHorario: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fusoHorario,
    hour: "2-digit",
    minute: "2-digit",
  }).format(expiraEm);
}

/**
 * Aviso de que o horário está reservado e depende do sinal.
 *
 * Vai SEPARADO do copia-e-cola de propósito: no WhatsApp, o cliente segura a
 * mensagem para copiar, e qualquer texto em volta entra na cópia. Um payload Pix
 * com "Segue o código:" grudado na frente é recusado pelo banco, e o cliente não
 * tem como saber por quê.
 */
export function montarTextoCobrancaSinal(dados: {
  valorCentavos: number;
  expiraEm: Date;
  fusoHorario: string;
  servicoNome: string;
}): string {
  return (
    `Separei seu horário de ${dados.servicoNome}. ` +
    `Para confirmar, é preciso um sinal de ${formatarValor(dados.valorCentavos)}.\n\n` +
    `Você tem até ${formatarPrazo(dados.expiraEm, dados.fusoHorario)} para pagar — ` +
    "depois disso o horário volta a ficar disponível.\n\n" +
    "Copie o código Pix da próxima mensagem e cole no seu banco:"
  );
}

/**
 * O copia-e-cola, sozinho na mensagem.
 *
 * Função em vez de mandar a string crua para deixar a regra explícita e travada
 * por teste: nada pode ser concatenado aqui.
 */
export function montarTextoCodigoPix(copiaECola: string): string {
  return copiaECola;
}

/** Sinal confirmado: o agendamento está de pé. */
export function montarTextoSinalRecebido(dados: {
  valorCentavos: number;
  servicoNome: string;
  quando: string;
}): string {
  return (
    `Sinal de ${formatarValor(dados.valorCentavos)} recebido. ` +
    `Seu horário de ${dados.servicoNome} em ${dados.quando} está confirmado.\n\n` +
    "Até lá!"
  );
}

/**
 * Pagou e não há horário.
 *
 * Acontece quando o Pix cai depois do prazo e o horário já foi de outra pessoa.
 * O texto precisa fazer três coisas ao mesmo tempo: não culpar o cliente, não
 * prometer prazo de devolução que não controlamos, e dizer com quem ele resolve.
 * Quem devolve é o estabelecimento — o dinheiro está na conta dele, nunca na
 * nossa.
 */
export function montarTextoSinalSemHorario(nomeEstabelecimento: string): string {
  return (
    "Recebemos seu pagamento, mas o horário já tinha sido reservado por outra " +
    "pessoa antes de o sinal cair. Nada foi marcado.\n\n" +
    `Entre em contato com ${nomeEstabelecimento} por aqui mesmo para combinar a ` +
    "devolução ou escolher um horário novo."
  );
}

/**
 * O prazo venceu sem pagamento.
 *
 * Não é enviada hoje: a expiração acontece numa varredura sem conversa aberta, e
 * mandar mensagem espontânea depois de silêncio é o tipo de coisa que faz o
 * cliente bloquear o número do salão. Fica exportada porque o texto é o mesmo se
 * o cliente voltar a escrever, e escondê-lo dentro do caminho de envio faria a
 * próxima pessoa reescrevê-lo diferente.
 */
export function montarTextoSinalExpirado(): string {
  return (
    "O prazo para o sinal terminou e o horário voltou a ficar disponível. " +
    "Se ainda quiser agendar, é só me mandar uma mensagem que a gente começa de novo."
  );
}
