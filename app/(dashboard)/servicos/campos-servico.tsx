"use client";

import { useId, useState } from "react";

/**
 * Campos de serviço, compartilhados entre criar e editar.
 *
 * A duração aparece como atalhos, não como `input[type=number]` cru: o dono
 * pensa em "meia hora", "uma hora", e digitar minuto a minuto é atrito puro. O
 * campo livre continua ali para o serviço que não cai num dos presets.
 */

/** Durações que cobrem a maior parte de salão, barbearia e estética. */
const PRESETS_DURACAO = [15, 30, 45, 60, 90, 120];

export type ValoresServico = {
  nome: string;
  duracaoMinutos: number;
  preco: string;
  valorSinal: string;
};

export function CamposServico({
  inicial,
  erros,
  cobraSinal = false,
}: {
  inicial?: Partial<ValoresServico>;
  erros?: Record<string, string[]>;
  /**
   * O campo de sinal só existe para quem pode cobrar.
   *
   * Mostrá-lo desabilitado, ou mostrá-lo e ignorar o valor, seria pior que
   * escondê-lo: o dono preencheria, salvaria sem erro nenhum e concluiria que a
   * cobrança está ligada — descobrindo que não no primeiro cliente que agendou
   * sem pagar.
   */
  cobraSinal?: boolean;
}) {
  const [duracao, setDuracao] = useState(inicial?.duracaoMinutos ?? 30);
  const idNome = useId();
  const idDuracao = useId();
  const idPreco = useId();
  const idSinal = useId();

  const semPreset = !PRESETS_DURACAO.includes(duracao);

  return (
    <div className="grid gap-4">
      <Campo
        id={idNome}
        rotulo="Serviço"
        erros={erros?.nome}
        render={(props) => (
          <input
            {...props}
            name="nome"
            required
            maxLength={80}
            defaultValue={inicial?.nome}
            placeholder="Corte masculino"
            className={CAMPO}
          />
        )}
      />

      <Campo
        id={idDuracao}
        rotulo="Duração"
        dica="É a duração que define os horários que o bot oferece."
        erros={erros?.duracaoMinutos}
        render={() => (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {PRESETS_DURACAO.map((minutos) => (
              <button
                key={minutos}
                type="button"
                aria-pressed={duracao === minutos}
                onClick={() => setDuracao(minutos)}
                className={`h-9 rounded-md border px-3 text-sm tabular-nums transition-colors max-md:h-11 max-md:px-4 ${
                  duracao === minutos
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input hover:bg-muted"
                }`}
              >
                {rotularDuracao(minutos)}
              </button>
            ))}

            <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span className="sr-only">Duração personalizada em minutos</span>
              <input
                id={idDuracao}
                type="number"
                // `type=number` sozinho não abre o teclado numérico grande no
                // iOS — abre o de números e pontuação, com as teclas do
                // tamanho de sempre. `inputMode` é o que pede o teclado certo;
                // o `type` fica pelo `min`/`max`/`step`.
                inputMode="numeric"
                min={5}
                max={480}
                step={5}
                value={duracao}
                onChange={(e) => setDuracao(Number(e.target.value))}
                aria-invalid={erros?.duracaoMinutos ? true : undefined}
                // O erro vence o destaque de "fora dos atalhos": a borda teal
                // marca escolha, a vermelha marca problema, e a segunda importa
                // mais.
                //
                // `text-base` abaixo de `md` porque abaixo de 16px o Safari do
                // iPhone dá zoom ao focar e não desfaz.
                className={`h-9 w-20 rounded-md border bg-transparent px-2 text-base tabular-nums outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 max-md:h-11 md:text-sm dark:bg-input/30 ${
                  semPreset ? "border-primary" : "border-input"
                }`}
              />
              min
            </label>

            {/* O valor que vai para a ação é sempre este, venha do chip ou do campo. */}
            <input type="hidden" name="duracaoMinutos" value={duracao} />
          </div>
        )}
      />

      <Campo
        id={idPreco}
        rotulo="Preço"
        dica="Opcional — deixe em branco para não divulgar valor pelo WhatsApp."
        erros={erros?.preco}
        render={(props) => (
          <input
            {...props}
            name="preco"
            inputMode="decimal"
            defaultValue={inicial?.preco}
            placeholder="60,00"
            className={CAMPO}
          />
        )}
      />

      {cobraSinal && (
        <Campo
          id={idSinal}
          rotulo="Sinal para reservar"
          dica="Opcional — em branco, este serviço é agendado sem cobrança. O valor cai direto na sua conta do Mercado Pago."
          erros={erros?.valorSinal}
          render={(props) => (
            <input
              {...props}
              name="valorSinal"
              inputMode="decimal"
              defaultValue={inicial?.valorSinal}
              placeholder="20,00"
              className={CAMPO}
            />
          )}
        />
      )}
    </div>
  );
}

/**
 * Sem `text-*`: herda os 16px do corpo, que é justamente o que impede o zoom
 * de foco do iOS. Não acrescentar `text-sm` aqui.
 */
const CAMPO =
  "mt-1 h-10 w-full rounded-md border border-input bg-transparent px-3 outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 max-md:h-11 dark:bg-input/30";

function rotularDuracao(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  if (minutos === 60) return "1h";
  return minutos % 60 === 0 ? `${minutos / 60}h` : `${Math.floor(minutos / 60)}h${minutos % 60}`;
}

/**
 * Rótulo, campo, dica e erro — amarrados por `aria-describedby`.
 *
 * O formulário antes mostrava um erro global por vez, então quem errasse nome e
 * duração juntos só descobria o segundo depois de corrigir o primeiro. Aqui cada
 * campo carrega o próprio erro e é anunciado por leitor de tela.
 */
function Campo({
  id,
  rotulo,
  dica,
  erros,
  render,
}: {
  id: string;
  rotulo: string;
  dica?: string;
  erros?: string[];
  render: (props: {
    id: string;
    "aria-invalid"?: true;
    "aria-describedby"?: string;
  }) => React.ReactNode;
}) {
  const idDica = `${id}-dica`;
  const idErro = `${id}-erro`;
  const descrito = [dica ? idDica : null, erros?.length ? idErro : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {rotulo}
      </label>

      {render({
        id,
        "aria-invalid": erros?.length ? true : undefined,
        "aria-describedby": descrito || undefined,
      })}

      {dica && (
        <p id={idDica} className="mt-1 text-xs text-muted-foreground">
          {dica}
        </p>
      )}

      {erros?.length ? (
        <p id={idErro} className="mt-1 text-xs text-destructive">
          {erros[0]}
        </p>
      ) : null}
    </div>
  );
}
