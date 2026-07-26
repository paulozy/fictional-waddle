import Link from "next/link";
import type { AgendaDoDia } from "@/lib/agenda-lista";
import { coresDoStatus, type DiaDoCalendario } from "@/lib/calendario";

/**
 * Agenda de um dia, em lista. **Sem estado e sem `'use client'`** — recebe o
 * dia já montado por `montarAgendaDoDia` e só desenha, igual ao
 * `CalendarioSemana`.
 *
 * É a visão de celular. A troca de dia é feita por link (`?dia=`) e não por
 * estado no cliente: a página já é um Server Component que busca a semana
 * inteira numa query, então mudar de dia não custa ida ao banco, e a URL passa
 * a ser compartilhável e a funcionar com o botão voltar.
 */

const ROTULO_STATUS: Record<string, string> = {
  confirmado: "Confirmado",
  concluido: "Concluído",
  cancelado: "Cancelado",
  falta: "Faltou",
};

export function AgendaLista({
  agenda,
  dias,
}: {
  agenda: AgendaDoDia | null;
  dias: DiaDoCalendario[];
}) {
  return (
    <div>
      <FaixaDeDias dias={dias} selecionado={agenda?.dia.data} />

      {!agenda || agenda.itens.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhum agendamento neste dia.
        </p>
      ) : (
        <ol className="mt-4 space-y-2">
          {agenda.itens.map((item, indice) => (
            <li key={item.id}>
              {indice === agenda.indiceDaLinhaDeAgora && <LinhaDeAgora />}

              <article
                className={`flex gap-3 rounded-lg border border-l-4 p-3 ${coresDoStatus(
                  item.status,
                )} ${item.passou ? "opacity-60" : ""}`}
              >
                {/**
                 * Hora e duração numa coluna própria e monoespaçada: é o dado
                 * que o dono varre com o olho, e alinhado ele vira uma régua.
                 * Na grade esse papel era da calha de horas.
                 */}
                <div className="shrink-0 text-right">
                  <div className="font-mono text-base leading-tight tabular-nums">
                    {item.horaInicio}
                  </div>
                  <div className="font-mono text-xs tabular-nums opacity-70">
                    {item.duracao}
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.titulo}</p>
                  <p className="text-sm opacity-80">{item.cliente}</p>
                </div>

                {/**
                 * Na grade o status era só cor de fundo. Aqui ele vira palavra
                 * fora de `confirmado`: cor sozinha não é informação acessível
                 * (WCAG 1.4.1), e no celular o `line-through` do cancelado é
                 * fácil demais de confundir com texto riscado por engano.
                 */}
                {item.status !== "confirmado" && (
                  <span className="shrink-0 self-start text-xs font-medium no-underline opacity-80">
                    {ROTULO_STATUS[item.status] ?? item.status}
                  </span>
                )}
              </article>
            </li>
          ))}

          {/* Todos já terminaram: a linha fecha a lista em vez de sumir. */}
          {agenda.indiceDaLinhaDeAgora === agenda.itens.length && (
            <li>
              <LinhaDeAgora />
            </li>
          )}
        </ol>
      )}
    </div>
  );
}

/**
 * Seletor de dia. Sete alvos numa linha de 375px dão ~48px cada — acima do
 * mínimo AA de 24px e do alvo confortável de 44px na vertical.
 *
 * Rola na horizontal só por segurança: em tela muito estreita ou com fonte
 * ampliada pelo sistema, sete colunas fixas espremeriam o rótulo em vez de
 * deixar arrastar.
 */
function FaixaDeDias({
  dias,
  selecionado,
}: {
  dias: DiaDoCalendario[];
  selecionado: string | undefined;
}) {
  return (
    <nav aria-label="Escolher o dia" className="-mx-1 overflow-x-auto">
      <ul className="flex min-w-full gap-1 px-1">
        {dias.map((dia) => {
          const ativo = dia.data === selecionado;

          return (
            <li key={dia.data} className="flex-1">
              <Link
                href={`/agendamentos?dia=${dia.data}`}
                aria-current={ativo ? "page" : undefined}
                className={`flex min-h-14 min-w-11 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 transition-colors ${
                  ativo
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                <span
                  className={`text-xs capitalize ${
                    // Hoje continua reconhecível mesmo sem estar selecionado —
                    // é a âncora de quem navegou para outro dia.
                    dia.ehHoje && !ativo ? "font-semibold text-primary" : ""
                  }`}
                >
                  {dia.rotuloDia}
                </span>
                <span className="font-mono text-[11px] tabular-nums">
                  {dia.rotuloNumero}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Mesma cor da linha do "agora" da grade semanal, no eixo da lista. */
function LinhaDeAgora() {
  return (
    <div aria-hidden className="flex items-center gap-2 py-2">
      <span className="size-1.5 shrink-0 rounded-full bg-agora" />
      <span className="h-px flex-1 bg-agora" />
    </div>
  );
}
