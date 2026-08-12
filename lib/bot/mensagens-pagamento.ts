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

import { aplicarModelo, renderizarOuPadrao } from "@/lib/bot/modelo-mensagem";

/**
 * Os textos de fábrica, escritos **na forma de modelo** — com as chaves à mostra.
 *
 * Fonte única, e a razão é uma duplicação que existiu por dez minutos: a tela de
 * edição precisa mostrar o padrão com `{valor}` visível (é o que ensina a
 * mecânica), enquanto o bot precisa dele já interpolado. Manter as duas versões
 * escritas à mão significaria dois "padrões" divergindo no primeiro ajuste, com a
 * tela sugerindo um texto e o cliente recebendo outro.
 *
 * Aqui existe um só: o painel exibe a constante crua, e as funções abaixo a
 * renderizam. Mudar o texto num lugar muda nos dois, por construção.
 */
export const MODELO_PADRAO_COBRANCA =
  "Separei seu horário de {servico}. Para confirmar, é preciso um sinal de {valor}.\n\n" +
  "Você tem até {prazo} para pagar — depois disso o horário volta a ficar disponível.";

/**
 * Fecho fixo, colado depois da política. **Não** é editável, e a mudança é
 * deliberada.
 *
 * Antes, este aviso era a última linha de `MODELO_PADRAO_COBRANCA`, e o JSDoc
 * registrava que um modelo personalizado o perdia — "decisão do dono". Isso
 * deixou de valer quando a política de cancelamento passou a existir: ela precisa
 * ficar **imediatamente antes** do código, que é o momento em que a pessoa
 * decide pagar, e um modelo personalizado não pode empurrá-la para o meio do
 * texto nem enterrá-la depois do fecho. O dono continua dono do corpo da
 * mensagem; o que ele não escolhe mais é a ordem das duas últimas coisas.
 */
const FECHO_COBRANCA =
  "Copie o código Pix da próxima mensagem e cole no seu banco:";

/**
 * A ordem da mensagem de cobrança, num lugar só: **corpo → política → fecho**.
 *
 * Exportada porque tem dois chamadores, e é exatamente o tipo de coisa que não
 * pode ter duas implementações: `montarTextoCobrancaSinal`, que produz o texto
 * que o cliente recebe, e a prévia "Como chega no WhatsApp" do painel, que
 * promete ao dono estar mostrando esse mesmo texto. Se a ordem morasse escrita
 * nos dois, a prévia passaria a mentir no primeiro ajuste — e mentir ali é pior
 * do que não ter prévia, porque o dono confere e aprova algo que não é o que sai.
 */
export function comporCobranca(corpo: string, politica: string): string {
  return `${corpo}\n\n${politica.trim()}\n\n${FECHO_COBRANCA}`;
}

export const MODELO_PADRAO_RECEBIDO =
  "Sinal de {valor} recebido. Seu horário de {servico} em {quando} está confirmado.\n\n" +
  "Até lá!";

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
  /** Horário do agendamento, para o `{quando}` do modelo do dono. */
  dataHora: string;
  /** Texto personalizado do dono (`mensagens_tenant`). Vazio = usa o padrão. */
  modelo?: string | null;
  /**
   * A política de cancelamento do estabelecimento (`perfis.politica_sinal`).
   *
   * **Obrigatória**, e o tipo diz isso: sem ela `lib/pagamentos/capacidade.ts` já
   * teria bloqueado a cobrança lá atrás, então chegar aqui sem política é estado
   * impossível — e se um caminho novo tornar possível, o compilador reclama antes
   * de um cliente pagar sem saber o que acontece com o dinheiro dele.
   */
  politica: string;
}): string {
  const prazo = formatarPrazo(dados.expiraEm, dados.fusoHorario);

  const valores = {
    valor: formatarValor(dados.valorCentavos),
    servico: dados.servicoNome,
    quando: formatarQuando(dados.dataHora, dados.fusoHorario),
    prazo,
  };

  /**
   * O padrão termina anunciando a mensagem seguinte, e isso é parte do desenho:
   * o copia-e-cola vai sozinho na próxima bolha porque texto em volta entra na
   * cópia do cliente. Um modelo personalizado **não** perde essa garantia — o
   * código continua vindo separado —, mas perde o aviso, e é decisão do dono.
   */
  const corpo = renderizarOuPadrao(
    dados.modelo,
    valores,
    aplicarModelo(MODELO_PADRAO_COBRANCA, valores),
  );

  /*
    Ordem fixa: corpo → política → fecho → (próxima mensagem) código.

    A política vai colada no fecho porque é onde ela tem função. Dita no começo,
    ela é lida como termo de serviço e ignorada; dita depois do código, chega
    tarde — a pessoa já colou no banco. O único lugar em que ela muda uma decisão
    é imediatamente antes de a decisão ser tomada.
  */
  return comporCobranca(corpo, dados.politica);
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
  /** Texto personalizado do dono (`mensagens_tenant`). Vazio = usa o padrão. */
  modelo?: string | null;
}): string {
  const valores = {
    valor: formatarValor(dados.valorCentavos),
    servico: dados.servicoNome,
    quando: dados.quando,
  };

  return renderizarOuPadrao(
    dados.modelo,
    valores,
    aplicarModelo(MODELO_PADRAO_RECEBIDO, valores),
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
