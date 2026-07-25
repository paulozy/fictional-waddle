import {
  ALTURA_LINHA_REM,
  type Calendario,
} from "@/lib/calendario";

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

const CORES_STATUS: Record<string, string> = {
  confirmado: "bg-confirmado border-confirmado-borda text-confirmado-tinta",
  concluido: "bg-concluido border-concluido-borda text-concluido-tinta",
  cancelado:
    "bg-cancelado border-cancelado-borda text-cancelado-tinta line-through",
  falta: "bg-falta border-falta-borda text-falta-tinta",
};

export function CalendarioSemana({ calendario }: { calendario: Calendario }) {
  const colunas = "4rem repeat(7, minmax(0, 1fr))";

  return (
    /* Rola horizontalmente em tela estreita, sem estourar o corpo da página. */
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <div className="min-w-[44rem]">
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

          {calendario.blocos.map((bloco) => {
            const cores = CORES_STATUS[bloco.status] ?? CORES_STATUS.confirmado;
            const descricao = `${bloco.horaInicio}–${bloco.horaFim} · ${bloco.cliente} · ${bloco.titulo}`;
            // Num bloco de 1h30 ou mais sobra altura: truncar em uma linha só
            // escondia nome de serviço longo sem necessidade.
            const tituloEmDuasLinhas = bloco.linhasOcupadas >= 3;

            return (
              <div
                key={bloco.id}
                title={descricao}
                style={{
                  gridColumn: bloco.coluna + 1,
                  gridRow: `${bloco.linhaInicio} / span ${bloco.linhasOcupadas}`,
                }}
                className={`relative z-10 m-px overflow-hidden rounded-sm border-y border-r border-l-2 px-1.5 py-0.5 text-xs leading-tight ${cores}`}
              >
                {bloco.compacto ? (
                  /**
                   * Bloco de menos de 60 min não comporta três linhas: antes o
                   * `overflow-hidden` cortava a última e o nome do serviço
                   * sumia. Em linha única a hora fica fixa e o serviço fica com
                   * o resto do espaço. O `title` acima preserva o texto inteiro.
                   */
                  <div className="flex items-baseline gap-1.5">
                    <span className="shrink-0 font-mono tabular-nums">
                      {bloco.horaInicio}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {bloco.titulo}
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="font-mono tabular-nums">
                      {bloco.horaInicio}
                    </div>
                    <div
                      className={`font-medium ${
                        tituloEmDuasLinhas ? "line-clamp-2" : "truncate"
                      }`}
                    >
                      {bloco.titulo}
                    </div>
                    <div className="truncate opacity-80">{bloco.cliente}</div>
                  </>
                )}
              </div>
            );
          })}

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
