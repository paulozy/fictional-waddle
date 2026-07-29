/**
 * O plano, numa fonte só.
 *
 * O preço estava escrito à mão na landing e em nenhum outro lugar. Com a
 * `/precos` existindo, dois lugares divergem na primeira vez que alguém muda um
 * — e um preço diferente em duas páginas do mesmo site é o tipo de erro que o
 * cliente encontra antes de nós.
 *
 * **Faixa única, e isso é uma decisão de produto, não uma etapa.** O mercado
 * inteiro do nicho cobra por profissional (Booksy, Trinks, AppBarber, Avec,
 * Belasis); a Encaixaria atende um estabelecimento e um número de WhatsApp, e
 * escalonar exigiria prometer multi-profissional, que não existe. Sem gateway de
 * pagamento, cada faixa extra também é trabalho manual permanente — e
 * `perfis.status_assinatura` é digitado à mão, onde um typo deixa cliente
 * pagante sem bot.
 */

/** Ancoragem: mediana do nicho de bot que agenda por WhatsApp é ~R$ 90. */
export const PRECO_MENSAL = "49,90";

export const DIAS_TRIAL = 14;

/**
 * O que a assinatura entrega. Só o que o código faz hoje.
 *
 * "Ilimitado" é o item que ganha dos concorrentes baratos, e é literal: os que
 * cobram menos param em 100 ou 150 agendamentos por mês.
 */
export const INCLUSO = [
  "Agendamento automático pelo WhatsApp, 24 horas por dia",
  "Agendamentos ilimitados — não contamos cadeira, cliente nem mensagem",
  "Lembrete automático um dia antes",
  "Serviços e horários que você mesmo configura",
  "Roteiro da conversa do bot montado por você",
  "Painel com a agenda da semana",
];

/**
 * O que a assinatura **não** entrega.
 *
 * Vai para a página de preço de propósito, e não escondido numa FAQ. Cada linha
 * daqui é um cancelamento na segunda semana que não vai acontecer — e num modelo
 * em que cada venda é fechada à mão, esse cancelamento é caro. Note que nenhuma
 * delas diz "em breve": promessa em página de preço vira pergunta de suporte
 * todo mês.
 */
export const NAO_INCLUSO = [
  "Não recebe pagamento nem cobra sinal — a Encaixaria marca o horário, quem cobra é você",
  "Não divide a agenda por profissional: ela é do estabelecimento",
  "Não entende texto livre — o cliente responde por números, e é de propósito",
  "Não sincroniza com Google Calendar nem com outro sistema de agenda",
];
