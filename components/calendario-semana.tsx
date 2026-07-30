import {
  ALTURA_LINHA_REM,
  blocosVisiveisNaGrade,
  coresDoStatus,
  type Calendario,
} from "@/lib/calendario";
import { BlocoAgendamento } from "@/components/bloco-agendamento";

/**
 * Grade semanal de agendamentos. **Sem estado e sem `'use client'`** — recebe o
 * layout já calculado por `montarCalendario` e só desenha.
 *
 * A metáfora é a agenda de papel pautada: calha de horas como margem, régua da
 * hora cheia mais forte que a da meia hora, e a linha do "agora" atravessando a
 * semana — onde estaria o dedo de quem consulta o livro.
 */

/** A altura da faixa vem do módulo: é ela que decide o modo compacto do bloco. */
const ALTURA_LINHA = `${ALTURA_LINHA_REM}rem`;

export function CalendarioSemana({
  calendario,
  cancelaveis,
}: {
  calendario: Calendario;
  /** Ids que ainda podem ser cancelados — ver `idsCancelaveis`. */
  cancelaveis: Set<string>;
}) {
  const colunas = "4rem repeat(7, minmax(0, 1fr))";
  const primeiro = calendario.dias[0];
  const ultimo = calendario.dias.at(-1);

  return (
    /* Rola horizontalmente em tela estreita, sem estourar o corpo da página. */
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      {/**
       * Nomeia a região, e não é enfeite: os blocos são botões irmãos na ordem do DOM
       * (`montarCalendario` ordena por coluna e depois por linha), então o Tab varre dia
       * a dia, hora a hora. O rótulo do grupo é o que diz de que semana se trata.
       *
       * Deliberadamente **não** é `role="grid"`: a APG só considera célula-com-widget
       * quando há gerência de foco completa (roving tabindex, setas, Enter/F2/Escape), o
       * que exigiria um gerente de foco no cliente para uma grade que hoje é RSC.
       */}
      <div
        role="group"
        aria-label={
          primeiro && ultimo
            ? `Agenda de ${primeiro.rotuloNumero} a ${ultimo.rotuloNumero}`
            : "Agenda da semana"
        }
        className="min-w-[44rem]"
      >
        <div
          className="grid border-b border-regua-forte"
          style={{ gridTemplateColumns: colunas }}
        >
          <div />
          {calendario.dias.map((dia) => (
            <div
              key={dia.data}
              className={`border-l border-regua px-2 py-2 text-center text-sm ${
                dia.ehHoje ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <div className={`capitalize ${dia.ehHoje ? "font-semibold" : ""}`}>
                {dia.rotuloDia}
              </div>
              <div className="font-mono text-xs tabular-nums">
                {dia.rotuloNumero}
              </div>
            </div>
          ))}
        </div>

        <div
          className="relative grid"
          style={{
            gridTemplateColumns: colunas,
            gridTemplateRows: `repeat(${calendario.faixasHorarias.length}, ${ALTURA_LINHA})`,
          }}
        >
          {/* Calha de horas — a margem do caderno. */}
          {calendario.faixasHorarias.map((faixa, i) => (
            <div
              key={faixa}
              style={{ gridColumn: 1, gridRow: i + 1 }}
              className="-translate-y-2 pr-2 text-right font-mono text-[11px] tabular-nums text-muted-foreground"
            >
              {/* Só a hora cheia recebe rótulo, para não virar poluição. */}
              {faixa.endsWith(":00") ? faixa : ""}
            </div>
          ))}

          {/* Pauta: a régua da hora cheia é mais forte que a da meia hora. */}
          {calendario.faixasHorarias.map((faixa, i) =>
            calendario.dias.map((dia, coluna) => (
              <div
                key={`${dia.data}-${faixa}`}
                style={{ gridColumn: coluna + 2, gridRow: i + 1 }}
                className={`border-l border-regua ${
                  faixa.endsWith(":00")
                    ? "border-t border-t-regua-forte"
                    : "border-t border-t-regua"
                }`}
              />
            )),
          )}

          {/**
           * Cancelado não entra na grade: o horário dele está de fato livre para
           * reserva (a constraint anti-sobreposição é parcial em `confirmado`), e um
           * bloco riscado ali faria o dono achar que não pode encaixar ninguém. Na
           * lista do dia ele continua, com o rótulo.
           */}
          {blocosVisiveisNaGrade(calendario.blocos).map((bloco) => (
            <div
              key={bloco.id}
              style={{
                gridColumn: bloco.coluna + 1,
                gridRow: `${bloco.linhaInicio} / span ${bloco.linhasOcupadas}`,
              }}
              /**
               * Sem `title`: ele não aparece em toque, não é anunciado com confiança, e
               * era o **único** lugar onde o nome do cliente existia em bloco compacto.
               * O detalhe do bloco resolve isso de forma acessível.
               */
              className={`relative z-10 m-px overflow-hidden rounded-sm border-y border-r border-l-2 text-xs leading-tight ${coresDoStatus(
                bloco.status,
              )}`}
            >
              <BlocoAgendamento
                bloco={bloco}
                cancelavel={cancelaveis.has(bloco.id)}
              />
            </div>
          ))}

          {calendario.agora && (
            <>
              <div
                className="pointer-events-none relative z-20"
                style={{ gridColumn: 1, gridRow: calendario.agora.linha }}
              >
                <span
                  className="absolute right-1 -translate-y-1/2 rounded-sm bg-primary px-1 py-px font-mono text-[10px] tabular-nums text-primary-foreground"
                  style={{ top: `${calendario.agora.percentual}%` }}
                >
                  {calendario.agora.rotulo}
                </span>
              </div>

              {/**
               * A linha corre **por baixo** dos agendamentos (`z-0` contra o
               * `z-10` dos blocos), e não por cima como no Google Agenda.
               *
               * Não é preciosismo: atravessando um bloco, a hairline passa
               * exatamente na altura do texto e o nome do serviço parece
               * tachado — que aqui já é o significado de "cancelado". Correndo
               * por baixo, ela aparece em todas as colunas livres e o horário
               * exato continua legível na etiqueta da calha.
               */}
              <div
                aria-hidden
                className="pointer-events-none relative z-0"
                style={{
                  gridColumn: "2 / -1",
                  gridRow: calendario.agora.linha,
                }}
              >
                <span
                  className="absolute inset-x-0 h-px bg-agora"
                  style={{ top: `${calendario.agora.percentual}%` }}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
