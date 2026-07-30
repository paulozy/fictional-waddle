/**
 * Textos de cancelamento, puros e testáveis.
 *
 * Módulo separado da Server Action de propósito: um arquivo `"use server"` só pode
 * exportar funções **assíncronas**, então um construtor de texto síncrono não cabe
 * lá — e transformá-lo em `async` só para caber esconderia que ele é puro.
 *
 * Mesmo formato de data de `montarTextoLembrete`
 * (`app/api/cron/enviar-lembretes/route.ts:267`): `Intl.DateTimeFormat` com
 * `timeZone` do perfil. O runtime da Vercel roda em UTC, então formatar sem o fuso
 * do negócio produziria um horário errado — o cliente leria "21:00" para um
 * agendamento das 18:00.
 */

type DadosAgendamento = {
  data_hora: string;
  servicos: { nome: string } | null;
  clientes_finais: { nome: string | null } | null;
};

function formatarQuando(dataHora: string, fusoHorario: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fusoHorario,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dataHora));
}

/**
 * Aviso ao cliente de que o **dono** cancelou.
 *
 * **Não inclui o motivo nem a observação, e isso é regra, não esquecimento.** O
 * motivo é vocabulário interno ("Não vou poder atender" lido pelo cliente soa como
 * desculpa seca), e a observação é nota livre do dono — mandá-la seria abrir um
 * canal de saída para o que ele digitou, inclusive um deslize.
 *
 * Termina convidando a remarcar porque o convite cai no fluxo normal de
 * agendamento: é o mesmo número, e a próxima mensagem do cliente já cai no bot.
 * Sem isso, o cancelamento é um beco — o dono perde a venda que ainda dava.
 */
export function montarTextoCancelamentoPeloDono(
  agendamento: DadosAgendamento,
  fusoHorario: string,
  nomeEstabelecimento: string | null,
): string {
  const saudacao = agendamento.clientes_finais?.nome
    ? `Oi, ${agendamento.clientes_finais.nome}! `
    : "Oi! ";

  const servico = agendamento.servicos?.nome
    ? ` de ${agendamento.servicos.nome}`
    : "";

  const quem = nomeEstabelecimento ? `${nomeEstabelecimento} precisou` : "Precisei";

  return (
    `${saudacao}${quem} cancelar o seu agendamento${servico}.\n\n` +
    `${formatarQuando(agendamento.data_hora, fusoHorario)}\n\n` +
    "Se quiser marcar outro horário, me manda uma mensagem que eu te mostro " +
    "os horários livres."
  );
}
