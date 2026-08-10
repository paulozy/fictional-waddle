"use client";

import { useActionState, useEffect, useState } from "react";
import { CopyIcon, PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { nomeDoDia } from "@/lib/datas";
import { ORDEM_SEMANA, type Semana } from "@/lib/grade-semanal";
import {
  MAX_FAIXAS_POR_DIA,
  type EstadoFormulario,
  type Faixa,
} from "@/lib/validacao/agenda";
import { definirGrade } from "./actions";

/**
 * Editor da grade semanal, no padrão consagrado por Cal.com e Calendly: uma
 * linha por dia, chave de liga/desliga, faixas editáveis no lugar.
 *
 * A tela anterior era "formulário em cima, lista embaixo": sete submissões para
 * configurar a semana e faixa nenhuma editável — só dava para remover e
 * recriar.
 *
 * O intervalo do almoço é explicado uma vez só, no subtítulo da página. Já
 * esteve aqui dentro, aparecendo quando o dia ganhava a segunda faixa; o
 * problema é que essa é a hora em que o dono já descobriu sozinho. Quem precisa
 * da dica é quem ainda está olhando a semana inteira com uma faixa por dia.
 */

const FAIXA_PADRAO: Faixa = { horaInicio: "09:00", horaFim: "18:00" };

function paraMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Formatador puro, **sem limitar a faixa**.
 *
 * Já teve um `Math.min(23:30)` aqui, para a sugestão de faixa nova não passar da
 * meia-noite. O efeito colateral foi um bug de verdade: ao gerar a lista de
 * horários, 23:45 colapsava em 23:30 e o React reclamava de duas opções com a
 * mesma chave. Limitar é responsabilidade de quem sugere, não de quem formata.
 */
function paraHora(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function limitarAoDia(minutos: number): number {
  return Math.min(23 * 60 + 45, Math.max(0, minutos));
}

/**
 * Sugestão para a faixa nova: começa uma hora depois do fim da última.
 *
 * O caso real é o intervalo do almoço — quem clica em "somar faixa" num dia que
 * já vai das 09:00 às 12:00 quer a tarde, não outro bloco colado.
 */
function proximaFaixa(faixas: Faixa[]): Faixa {
  const ultima = faixas.at(-1);
  if (!ultima) return FAIXA_PADRAO;

  const inicio = limitarAoDia(paraMinutos(ultima.horaFim) + 60);
  return {
    horaInicio: paraHora(inicio),
    horaFim: paraHora(limitarAoDia(inicio + 180)),
  };
}

export function EditorSemana({
  inicial,
  fusoHorario,
}: {
  inicial: Semana;
  fusoHorario: string;
}) {
  const [semana, setSemana] = useState<Semana>(inicial);
  const [estado, acao, salvando] = useActionState<EstadoFormulario, FormData>(
    definirGrade,
    undefined,
  );

  // `inicial` é a verdade do servidor; comparar contra ela evita oferecer
  // "salvar" quando o dono desfez as mudanças na mão.
  const alterado = JSON.stringify(semana) !== JSON.stringify(inicial);

  useEffect(() => {
    if (estado && "ok" in estado) toast.success("Horários salvos");
  }, [estado]);

  function atualizarDia(dia: number, faixas: Faixa[]) {
    setSemana((atual) => ({ ...atual, [dia]: faixas }));
  }

  function copiarPara(origem: number, destinos: number[]) {
    setSemana((atual) => {
      const copia = { ...atual };
      for (const destino of destinos) {
        copia[destino] = atual[origem].map((faixa) => ({ ...faixa }));
      }
      return copia;
    });
  }

  /**
   * A semana **salva** está inteira fechada e o dono ainda não mexeu em nada.
   *
   * A condição olha `inicial`, e não `semana`, de propósito: quem desliga os
   * sete dias na mão para reconfigurar não pode ver a grade sumir debaixo do
   * cursor e ser jogado de volta ao cartão de boas-vindas.
   */
  const nuncaConfigurada =
    !alterado && ORDEM_SEMANA.every((dia) => inicial[dia].length === 0);

  return (
    <form action={acao}>
      <input type="hidden" name="grade" value={serializar(semana)} />

      {nuncaConfigurada ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-8 py-12 text-center">
          <p className="font-heading text-lg font-semibold tracking-tight">
            Todos os dias estão fechados
          </p>
          <p className="mx-auto mt-2 max-w-[44ch] text-sm leading-relaxed text-muted-foreground">
            Sem nenhuma faixa aberta, o bot não tem horário para oferecer e
            responde que a agenda está indisponível.
          </p>
          {/* Preenche o estado local e nada mais: quem salva continua sendo o
              botão de baixo, então o dono ainda ajusta a grade antes de
              gravar. */}
          <Button
            type="button"
            size="lg"
            className="mt-6"
            onClick={() => setSemana(gradePadrao())}
          >
            Usar a grade padrão (seg a sex, 09:00–18:00)
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {ORDEM_SEMANA.map((dia, indice) => (
            <LinhaDoDia
              key={dia}
              dia={dia}
              faixas={semana[dia]}
              primeira={indice === 0}
              onChange={(faixas) => atualizarDia(dia, faixas)}
              onCopiar={(destinos) => copiarPara(dia, destinos)}
            />
          ))}
        </div>
      )}

      {estado && "erro" in estado && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {estado.erro}
        </p>
      )}

      {!nuncaConfigurada && (
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <Button type="submit" size="lg" disabled={!alterado || salvando}>
            {salvando ? "Salvando…" : "Salvar horários"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Horários no fuso <span className="font-mono">{fusoHorario}</span>.
          </p>
        </div>
      )}
    </form>
  );
}

/** Segunda a sexta na faixa padrão; fim de semana fechado. */
function gradePadrao(): Semana {
  return Object.fromEntries(
    ORDEM_SEMANA.map((dia) => [
      dia,
      dia >= 1 && dia <= 5 ? [{ ...FAIXA_PADRAO }] : [],
    ]),
  ) as Semana;
}

/** O servidor espera sempre os sete dias, inclusive os fechados. */
function serializar(semana: Semana): string {
  return JSON.stringify({
    dias: ORDEM_SEMANA.map((dia) => ({ diaSemana: dia, faixas: semana[dia] })),
  });
}

function LinhaDoDia({
  dia,
  faixas,
  primeira,
  onChange,
  onCopiar,
}: {
  dia: number;
  faixas: Faixa[];
  primeira: boolean;
  onChange: (faixas: Faixa[]) => void;
  onCopiar: (destinos: number[]) => void;
}) {
  const aberto = faixas.length > 0;
  const nome = nomeDoDia(dia);

  return (
    <div
      className={`flex flex-col gap-3 px-5 py-4 sm:grid sm:grid-cols-[11.25rem_minmax(0,1fr)] sm:items-start sm:gap-6 ${
        primeira ? "" : "border-t border-border"
      } ${aberto ? "" : "bg-muted/40"}`}
    >
      <div className="flex items-center gap-3">
        <Switch
          id={`dia-${dia}`}
          checked={aberto}
          onCheckedChange={(marcado) =>
            onChange(marcado ? [{ ...FAIXA_PADRAO }] : [])
          }
          aria-label={`${aberto ? "Fechar" : "Abrir"} ${nome}`}
        />
        <label
          htmlFor={`dia-${dia}`}
          className={`cursor-pointer font-medium capitalize ${
            aberto ? "" : "text-muted-foreground"
          }`}
        >
          {nome}
        </label>
      </div>

      {!aberto ? (
        <p className="text-sm text-muted-foreground sm:pt-2">Fechado</p>
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          {faixas.map((faixa, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <CampoHora
                valor={faixa.horaInicio}
                rotulo={`Início da ${i + 1}ª faixa de ${nome}`}
                onChange={(valor) =>
                  onChange(
                    faixas.map((f, j) =>
                      j === i ? { ...f, horaInicio: valor } : f,
                    ),
                  )
                }
              />
              <span aria-hidden className="text-muted-foreground">
                –
              </span>
              <CampoHora
                valor={faixa.horaFim}
                rotulo={`Fim da ${i + 1}ª faixa de ${nome}`}
                fim
                onChange={(valor) =>
                  onChange(
                    faixas.map((f, j) =>
                      j === i ? { ...f, horaFim: valor } : f,
                    ),
                  )
                }
              />

              {faixas.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remover ${i + 1}ª faixa de ${nome}`}
                  onClick={() => onChange(faixas.filter((_, j) => j !== i))}
                >
                  <XIcon className="size-4" />
                </Button>
              )}
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-1">
            {faixas.length < MAX_FAIXAS_POR_DIA && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange([...faixas, proximaFaixa(faixas)])}
              >
                <PlusIcon className="size-4" />
                Somar faixa
              </Button>
            )}

            <DialogCopiar origem={dia} onConfirmar={onCopiar} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Passo da lista de horários. Cobre qualquer expediente real sem virar rolagem infinita. */
const PASSO_LISTA_MINUTOS = 15;

const HORARIOS_DA_LISTA = Array.from(
  { length: (24 * 60) / PASSO_LISTA_MINUTOS },
  (_, i) => paraHora(i * PASSO_LISTA_MINUTOS),
);

/**
 * Seleção de horário, não `input[type=time]`.
 *
 * O campo nativo desenha a hora no formato do **navegador**, não no do
 * documento: com a interface em inglês ele mostra `09:00 AM` mesmo dentro de uma
 * página `lang="pt-BR"`, e não há atributo que force 24h. Num produto para
 * salão brasileiro, AM/PM é fonte de erro de cadastro — e erro aqui vira horário
 * errado oferecido ao cliente final.
 *
 * A lista também elimina digitação inválida e é bem mais rápida no celular, que
 * é onde o dono costuma mexer nisso.
 */
function CampoHora({
  valor,
  rotulo,
  fim = false,
  onChange,
}: {
  valor: string;
  rotulo: string;
  /** Só o campo de fim oferece 24:00 — abrir à meia-noite não faz sentido. */
  fim?: boolean;
  onChange: (valor: string) => void;
}) {
  // `24:00` é o único valor com hora 24 que o Postgres aceita em `time`, e é
  // como se cadastra quem fecha à meia-noite.
  const base = fim ? [...HORARIOS_DA_LISTA, "24:00"] : HORARIOS_DA_LISTA;

  // Horário fora do passo (cadastrado antes, ou direto no banco) não pode
  // desaparecer só por não estar na lista.
  const opcoes = base.includes(valor) ? base : [...base, valor].sort();

  return (
    <select
      value={valor}
      aria-label={rotulo}
      onChange={(e) => onChange(e.target.value)}
      /**
       * `text-base` abaixo de `md`, não `text-sm` em toda largura.
       *
       * Com fonte menor que 16px o Safari do iPhone dá zoom ao focar o campo e
       * **não desfaz** — e esta tela tem dois selects por faixa, sete dias.
       * Cada toque deixava a página mais ampliada que a anterior. Resolver por
       * fonte e não por `maximum-scale=1`: aquilo tiraria o zoom de quem
       * precisa dele (WCAG 1.4.4).
       *
       * O `<select>` nativo já foi a escolha certa aqui: em iOS ele abre o
       * seletor de roda, que é melhor para hora do que qualquer dropdown
       * customizado.
       */
      className="h-9 rounded-md border border-input bg-transparent px-2 font-mono text-base tabular-nums outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 max-md:h-11 md:text-sm dark:bg-input/30"
    >
      {opcoes.map((hora) => (
        <option key={hora} value={hora}>
          {hora}
        </option>
      ))}
    </select>
  );
}

/**
 * "Copiar para…" — o maior ganho isolado desta tela.
 *
 * Configurar segunda e replicar em terça-sexta num clique substitui quatro
 * edições idênticas, que era o trabalho mais chato do cadastro.
 */
function DialogCopiar({
  origem,
  onConfirmar,
}: {
  origem: number;
  onConfirmar: (destinos: number[]) => void;
}) {
  const [selecionados, setSelecionados] = useState<number[]>([]);
  const outros = ORDEM_SEMANA.filter((dia) => dia !== origem);

  function alternar(dia: number) {
    setSelecionados((atual) =>
      atual.includes(dia) ? atual.filter((d) => d !== dia) : [...atual, dia],
    );
  }

  return (
    <Dialog onOpenChange={(aberto) => !aberto && setSelecionados([])}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <CopyIcon className="size-4" />
          Copiar para…
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle className="capitalize">
            Copiar horários de {nomeDoDia(origem)}
          </DialogTitle>
          <DialogDescription>
            Os dias escolhidos passam a ter exatamente as mesmas faixas,
            substituindo o que estiver neles.
          </DialogDescription>
        </DialogHeader>

        {/* Uma coluna no celular: dois checkboxes lado a lado em 375px deixam
            os alvos a poucos pixels um do outro, e a caixa tem 16px — falha o
            teste de espaçamento do SC 2.5.8 mesmo com o `py` da label. */}
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {outros.map((dia) => (
            <label
              key={dia}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm capitalize transition-colors hover:bg-muted sm:min-h-0 sm:gap-2 sm:py-1.5"
            >
              <input
                type="checkbox"
                checked={selecionados.includes(dia)}
                onChange={() => alternar(dia)}
                className="size-5 accent-primary sm:size-4"
              />
              {nomeDoDia(dia)}
            </label>
          ))}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancelar
            </Button>
          </DialogClose>
          <DialogClose asChild>
            <Button
              type="button"
              disabled={selecionados.length === 0}
              onClick={() => onConfirmar(selecionados)}
            >
              Copiar para {selecionados.length}{" "}
              {selecionados.length === 1 ? "dia" : "dias"}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
