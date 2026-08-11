/**
 * Os planos, numa fonte só.
 *
 * O preço estava escrito à mão na landing e em nenhum outro lugar. Com a
 * `/precos` existindo, dois lugares divergem na primeira vez que alguém muda um
 * — e um preço diferente em duas páginas do mesmo site é o tipo de erro que o
 * cliente encontra antes de nós.
 *
 * **Duas faixas, e o eixo é capacidade, não tamanho.** A decisão anterior era
 * faixa única, e o argumento contra escalonar continua valendo do jeito que foi
 * escrito: o mercado escalona por número de profissionais (Booksy, Trinks,
 * AppBarber, Avec, Belasis), e a Encaixaria atende um estabelecimento e um
 * número de WhatsApp — cobrar por cadeira exigiria prometer multi-profissional,
 * que não existe. O que mudou não é isso. O que mudou é que a cobrança de sinal
 * por Pix passou a existir de fato, e ela **não é grátis para nós**: cada tenant
 * com ela ligada é uma conexão OAuth para renovar, um webhook de pagamento para
 * atender e um caminho de devolução para suportar. Embutir esse custo na faixa
 * de quem não cobra sinal faria a maioria pagar pela minoria.
 *
 * **Os nomes são comerciais; os valores no banco continuam `basico` e `sinal`.**
 * `perfis.plano` é lido por `lib/pagamentos/capacidade.ts` e por uma constraint
 * de banco — renomear a coluna para acompanhar o nome de venda trocaria uma
 * migration e um gate de capacidade por nada. `nomeDoPlano` faz a ponte.
 *
 * **Nenhum nome cita Pix nem Mercado Pago**, de propósito: o PSP é uma decisão
 * de implementação (o CLAUDE.md registra três alternativas descartadas e por
 * quê), e um plano chamado "Pix" ou "Mercado Pago" obrigaria a renomear o
 * produto no dia em que o provedor mudar.
 */

/** Valor no banco (`perfis.plano`). Não é o nome que o cliente vê. */
export type IdPlano = "basico" | "sinal";

/**
 * O default da coluna `perfis.plano`, repetido aqui de propósito.
 *
 * É para onde cai toda leitura que não sabe o plano — perfil ausente, `select`
 * que não trouxe a coluna, formulário sem o campo. Errar para o Essencial é a
 * direção certa: menos capacidade do que a real vira conversa comercial, o
 * inverso vira capacidade concedida por engano.
 */
export const PLANO_PADRAO: IdPlano = "basico";

/**
 * Guarda de tipo contra a mesma lista que desenha os cartões.
 *
 * Existe para que a validação do formulário e a da action não escrevam
 * `"basico" | "sinal"` à mão: o dia em que uma terceira faixa entrar em `PLANOS`,
 * ela passa a ser aceita nos dois lugares sem ninguém lembrar. O CHECK do banco
 * (`perfis_plano_valido`) continua sendo a autoridade final.
 */
export function ehIdPlano(valor: unknown): valor is IdPlano {
  return PLANOS.some((p) => p.id === valor);
}

export const DIAS_TRIAL = 14;

/**
 * Ancoragem: a mediana do nicho de bot que **agenda** por WhatsApp é ~R$ 90
 * (RobotiZap 89,90; AgendeZap Profissional 89,90; agendazap.me 99,90). Ficar
 * abaixo muda a pergunta do comprador de "qual é melhor" para "eu preciso de
 * tudo aquilo?", que é a pergunta que a Encaixaria ganha.
 */
export const PRECO_ESSENCIAL = "49,90";

/**
 * R$ 15 acima do Essencial, e o número tem uma régua: um sinal de R$ 20 num
 * único horário que furaria já cobre a diferença do mês. Ainda abaixo da mediana
 * do nicho — ou seja, o plano de cima daqui custa menos que o plano de entrada
 * de quem não cobra sinal nenhum.
 */
export const PRECO_GARANTIDO = "64,90";

/** Menor preço do site. É o número que vai em headline e em meta description. */
export const PRECO_A_PARTIR_DE = PRECO_ESSENCIAL;

/**
 * O que os dois planos entregam. Só o que o código faz hoje.
 *
 * "Ilimitado" é o item que ganha dos concorrentes baratos, e é literal: os que
 * cobram menos param em 100 ou 150 agendamentos por mês.
 */
export const INCLUSO = [
  "Agendamento automático pelo WhatsApp, 24 horas por dia",
  "Agendamentos ilimitados — não contamos cadeira, cliente nem mensagem",
  "Lembrete automático um dia antes",
  "Cliente desmarca pelo WhatsApp e o horário volta na hora para a agenda",
  "Você assume qualquer conversa quando quiser, e o bot volta sozinho",
  "Serviços e horários que você mesmo configura",
  "Roteiro da conversa do bot montado por você",
  "Painel com a agenda da semana",
];

/**
 * O que o Garantido acrescenta.
 *
 * A primeira linha é a promessa; as duas últimas são a contrapartida, e ficam na
 * mesma lista de propósito. Descobrir na segunda semana que a devolução é do
 * dono é o tipo de surpresa que este projeto escolheu pagar antecipado.
 */
export const EXTRA_GARANTIDO = [
  "Sinal por Pix antes de confirmar o horário, no valor que você define por serviço",
  "O horário fica segurado pelo prazo que você escolher; sem o pagamento, ele volta a ser oferecido",
  "O Pix cai direto na sua conta do Mercado Pago — não passa por nós, e não cobramos comissão",
  "Você decide por serviço: pode pedir sinal só na progressiva e deixar o corte livre",
  "Em troca, a devolução é sua: o painel mostra os casos e oferece o botão, mas a conta é a sua",
];

/**
 * O que **nenhum** dos planos entrega.
 *
 * Vai para a página de preço de propósito, e não escondido numa FAQ. Cada linha
 * daqui é um cancelamento na segunda semana que não vai acontecer — e num modelo
 * em que cada venda é fechada à mão, esse cancelamento é caro. Note que nenhuma
 * delas diz "em breve": promessa em página de preço vira pergunta de suporte
 * todo mês.
 *
 * A primeira linha mudou de sentido com o Garantido e continua verdadeira: o
 * pagamento **do serviço** segue fora, e o sinal, que entrou, nunca passa por
 * nós.
 */
export const NAO_INCLUSO = [
  "Não recebe o pagamento do serviço, e nem o sinal: o dinheiro do seu cliente nunca passa por nós",
  "Não tem financeiro, comissão nem controle de caixa",
  "Não divide a agenda por profissional: ela é do estabelecimento",
  "Não entende texto livre — o cliente responde por números, e é de propósito",
  "Não sincroniza com Google Calendar nem com outro sistema de agenda",
];

/**
 * Os dois planos como o site os apresenta.
 *
 * `destacado` é o Garantido, e não é escolha estética: ele é o único que precisa
 * de explicação (conta no Mercado Pago), então é ele que carrega o link para a
 * seção que explica.
 */
export const PLANOS = [
  {
    id: "basico",
    nome: "Essencial",
    preco: PRECO_ESSENCIAL,
    resumo: "O bot atende, marca o horário e lembra o cliente um dia antes.",
    paraQuem:
      "Para quem perde agendamento por não conseguir responder na hora. É o problema que a Encaixaria existe para resolver, e este plano resolve ele inteiro.",
    itens: INCLUSO,
    destacado: false,
  },
  {
    id: "sinal",
    nome: "Garantido",
    preco: PRECO_GARANTIDO,
    resumo:
      "Tudo do Essencial, e o bot ainda pede um sinal por Pix antes de fechar o horário.",
    paraQuem:
      "Para quem tem serviço longo ou caro e já perdeu tarde de trabalho com cliente que não apareceu. Quem paga sinal costuma aparecer — e quem não paga libera o horário sozinho.",
    itens: EXTRA_GARANTIDO,
    destacado: true,
  },
] as const satisfies readonly {
  id: IdPlano;
  nome: string;
  preco: string;
  resumo: string;
  paraQuem: string;
  itens: readonly string[];
  destacado: boolean;
}[];

/**
 * Nome comercial a partir do valor do banco.
 *
 * Tolerante a valor desconhecido de propósito: `perfis.plano` tem constraint,
 * mas esta função também é chamada com `perfil` possivelmente nulo (conta recém
 * criada, leitura que falhou), e um `undefined` na tela da Conta é pior que o
 * nome do plano de entrada.
 */
export function nomeDoPlano(plano: string | null | undefined): string {
  return PLANOS.find((p) => p.id === plano)?.nome ?? PLANOS[0].nome;
}

/** Preço mensal a partir do valor do banco. Mesma tolerância de `nomeDoPlano`. */
export function precoDoPlano(plano: string | null | undefined): string {
  return PLANOS.find((p) => p.id === plano)?.preco ?? PLANOS[0].preco;
}

/**
 * Por que o Garantido exige conta do dono no Mercado Pago.
 *
 * Fica aqui, e não escrito na página, porque a mesma explicação aparece em
 * `/precos`, na FAQ, nos Termos e na Privacidade — e é justamente o texto que
 * não pode divergir entre eles, já que ele descreve quem responde pelo dinheiro.
 *
 * **Sem detalhe técnico e sem citar norma.** O motivo verdadeiro é o art. 90-A do
 * Regulamento do Pix, que veda receber Pix por meio de conta de terceiro (o
 * "conta bolsão"); dito assim, para o dono de barbearia, não informa nada. O que
 * informa é a consequência: a conta tem de ser dele, e por isso o dinheiro é
 * dele desde o primeiro instante.
 */
export const MERCADO_PAGO_PORQUE = [
  {
    titulo: "A conta precisa ser sua porque o dinheiro é seu",
    texto:
      "Pela regra do Pix no Brasil, quem recebe um pagamento tem de ser o titular da conta que recebe. Ninguém pode receber Pix por dentro da conta de outra empresa — nem nós por você. Então a cobrança é criada no seu nome, com a autorização que você dá uma vez, e o valor cai na sua conta na mesma hora.",
  },
  {
    titulo: "Não somos intermediários do seu dinheiro",
    texto:
      "O sinal não passa pela Encaixaria em momento nenhum. Não recebemos, não retemos, não repassamos e não cobramos comissão sobre ele. Também não vemos seu saldo nem sua movimentação: a autorização serve para gerar cobranças e nada além disso, e você pode revogá-la quando quiser. O que a gente cobra é a mensalidade do plano, e só ela.",
  },
  {
    titulo: "Criar a conta é de graça, e serve CPF",
    texto:
      "Não precisa de CNPJ: conta de pessoa física resolve. Se você já usa Mercado Pago ou Mercado Livre, é a mesma conta — você entra nela e autoriza, sem digitar senha nenhuma para nós. Qualquer taxa do Pix é entre você e o Mercado Pago; nós não colocamos nada por cima.",
  },
  {
    titulo: "A devolução é sua, e isso é a outra face",
    texto:
      "Como o dinheiro é seu desde o começo, quem devolve também é você. Se o cliente desmarcar, ou se o pagamento cair depois de outra pessoa já ter pegado o horário, o painel mostra o caso e oferece o botão de devolver — mas a decisão e o valor são seus. Contestação de Pix, quando acontece, é resolvida entre o cliente e o banco dele, e pode bloquear o valor enquanto isso.",
  },
];
