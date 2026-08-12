import type { Calendario, DiaDoCalendario } from "./calendario";

/**
 * Visão de **um dia em lista**, derivada do mesmo `Calendario` que a grade
 * semanal desenha. Módulo **puro**.
 *
 * Por que a grade não serve no celular: `CalendarioSemana` tem `min-w-[44rem]`,
 * porque sete colunas mais a calha de horas não cabem em menos que isso. Num
 * aparelho de 375px isso mostra 46% da semana, com coluna de 91px — larga
 * demais para o nome do serviço, estreita demais para o do cliente. Pior: a
 * calha de horas sai da tela no primeiro arrasto lateral, e sem ela nenhum
 * bloco tem horário legível.
 *
 * Achatar a grade não resolveria; a pergunta é outra. Entre um atendimento e
 * outro, o dono não quer a topologia da semana, quer saber **quem é o
 * próximo**. Lista de um dia responde isso na vertical, que é a direção em que
 * o telefone tem espaço.
 *
 * A entrada é o `Calendario` já montado, não os agendamentos crus: toda a
 * conversão de fuso e a montagem dos blocos já aconteceram em
 * `montarCalendario`, e refazer aquilo aqui criaria uma segunda fonte de
 * verdade para o mesmo cálculo.
 */

export type ItemDaAgenda = {
  id: string;
  horaInicio: string;
  horaFim: string;
  /** `"40min"`, `"1h"`, `"1h30"`. */
  duracao: string;
  titulo: string;
  cliente: string;
  status: string;
  /** Eixo do sinal, independente de `status`. `null` quando não há cobrança. */
  sinalStatus?: string | null;
  /**
   * O item já terminou em relação ao "agora" do calendário. Só faz sentido no
   * dia de hoje; nos outros dias é sempre `false`.
   */
  passou: boolean;
};

export type AgendaDoDia = {
  dia: DiaDoCalendario;
  itens: ItemDaAgenda[];
  /**
   * Onde desenhar a linha do "agora" na lista: índice do primeiro item que
   * ainda não começou. `itens.length` põe a linha no fim (todos já passaram),
   * `null` significa que ela não vai para esta lista — outro dia, ou hora fora
   * da faixa exibida.
   *
   * Índice e não posição em pixels: a grade posiciona a marca por percentual
   * dentro de uma faixa de 30 min porque lá o eixo vertical é tempo contínuo.
   * Na lista o eixo é a sequência de itens, e o que a linha responde é "o que
   * já foi e o que vem" — não "que altura tem 14:23".
   */
  indiceDaLinhaDeAgora: number | null;
};

/**
 * Rótulo de duração em português corrente.
 *
 * `1h` e não `1h00`, `1h30` e não `1h 30min`: é como o dono fala, e é o que
 * cabe ao lado da hora em 375px.
 */
export function rotuloDuracao(minutos: number): string {
  if (minutos < 60) return `${minutos}min`;

  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;

  return resto === 0
    ? `${horas}h`
    : `${horas}h${String(resto).padStart(2, "0")}`;
}

/** `"09:30"` → 570. Formato garantido por `rotularHora` em `calendario.ts`. */
function emMinutos(hora: string): number {
  const [h, m] = hora.split(":");
  return Number(h) * 60 + Number(m);
}

/**
 * Extrai de `calendario` a lista de um dia.
 *
 * `data` fora da janela do calendário devolve lista vazia em vez de lançar: a
 * data vem de query string (`?dia=`), e usuário digitando na URL não deve
 * derrubar a página.
 */
export function montarAgendaDoDia(
  calendario: Calendario,
  data: string,
): AgendaDoDia | null {
  const indiceDoDia = calendario.dias.findIndex((dia) => dia.data === data);
  if (indiceDoDia === -1) return null;

  const dia = calendario.dias[indiceDoDia];
  // `coluna` em `BlocoCalendario` é 1-based, para casar com `grid-column`.
  const coluna = indiceDoDia + 1;

  const doDia = calendario.blocos
    .filter((bloco) => bloco.coluna === coluna)
    .sort((a, b) => emMinutos(a.horaInicio) - emMinutos(b.horaInicio));

  /**
   * O "agora" do calendário é a hora de parede corrente, mas só existe quando
   * hoje está na janela exibida. Comparar `dia.ehHoje` além disso não é
   * redundante: `agora.coluna` aponta para hoje, e o dia selecionado pode ser
   * qualquer outro da mesma semana.
   */
  const minutoAgora =
    calendario.agora && calendario.agora.coluna === coluna
      ? // `rotulo` é a mesma hora corrente já formatada pela grade; usar ele
        // evita reconstruir o minuto a partir de linha + percentual, que
        // depende do passo do grid.
        emMinutos(calendario.agora.rotulo)
      : null;

  const itens: ItemDaAgenda[] = doDia.map((bloco) => ({
    id: bloco.id,
    horaInicio: bloco.horaInicio,
    horaFim: bloco.horaFim,
    duracao: rotuloDuracao(
      emMinutos(bloco.horaFim) - emMinutos(bloco.horaInicio),
    ),
    titulo: bloco.titulo,
    cliente: bloco.cliente,
    status: bloco.status,
    sinalStatus: bloco.sinalStatus ?? null,
    passou: minutoAgora !== null && emMinutos(bloco.horaFim) <= minutoAgora,
  }));

  return {
    dia,
    itens,
    indiceDaLinhaDeAgora:
      minutoAgora === null
        ? null
        : primeiroQueNaoComecou(itens, minutoAgora),
  };
}

function primeiroQueNaoComecou(
  itens: ItemDaAgenda[],
  minutoAgora: number,
): number {
  const indice = itens.findIndex(
    (item) => emMinutos(item.horaInicio) > minutoAgora,
  );
  // Nada mais hoje: a linha fecha a lista em vez de sumir.
  return indice === -1 ? itens.length : indice;
}

/**
 * Qual dia a tela deve abrir.
 *
 * Preferência: o que veio na URL, se estiver na janela; senão hoje, se hoje
 * estiver na janela; senão o primeiro dia exibido — que é o caso de navegar
 * para outra semana, onde "hoje" não existe e abrir na segunda-feira é o
 * comportamento esperado.
 */
export function diaSelecionado(
  dias: DiaDoCalendario[],
  pedido: string | undefined,
): string {
  if (pedido && dias.some((dia) => dia.data === pedido)) return pedido;

  const hoje = dias.find((dia) => dia.ehHoje);
  return hoje?.data ?? dias[0]?.data ?? "";
}
