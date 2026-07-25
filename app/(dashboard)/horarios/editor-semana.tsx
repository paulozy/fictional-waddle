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
 * configurar a semana, faixa nenhuma editável (só dava para remover e recriar),
 * e o intervalo de almoço precisava de um parágrafo explicando que se modela com
 * duas faixas no mesmo dia. Aqui o botão de somar faixa ensina isso sozinho, e o
 * parágrafo saiu.
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

  return (
    <form action={acao}>
      <input type="hidden" name="grade" value={serializar(semana)} />

      <div className="overflow-hidden rounded-lg border border-border bg-card">
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

      {estado && "erro" in estado && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {estado.erro}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!alterado || salvando}>
          {salvando ? "Salvando…" : "Salvar horários"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Horários no fuso <span className="font-mono">{fusoHorario}</span>.
        </p>
      </div>
    </form>
  );
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
      className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-6 ${
        primeira ? "" : "border-t border-border"
      }`}
    >
      <div className="flex w-40 shrink-0 items-center gap-3">
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
          className="cursor-pointer font-medium capitalize"
        >
          {nome}
        </label>
      </div>

      {!aberto ? (
        <p className="text-sm text-muted-foreground sm:pt-1.5">Fechado</p>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col gap-2">
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

          {faixas.length > 1 && (
            <p className="text-xs text-muted-foreground">
              Duas faixas no mesmo dia é como se marca o intervalo do almoço.
            </p>
          )}
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
      className="h-9 rounded-md border border-input bg-transparent px-2 font-mono text-sm tabular-nums outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
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

        <div className="grid grid-cols-2 gap-1">
          {outros.map((dia) => (
            <label
              key={dia}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm capitalize transition-colors hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={selecionados.includes(dia)}
                onChange={() => alternar(dia)}
                className="size-4 accent-primary"
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
