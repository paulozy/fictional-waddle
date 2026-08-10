export const TOTAL_PASSOS = 3;

export type NumeroDePasso = 1 | 2 | 3;

/**
 * Indicador de progresso do cadastro, como no design: rótulo em mono maiúsculo
 * e três barras.
 *
 * As barras são `aria-hidden` porque a informação inteira já está no texto acima
 * — três `<span>` vazios não dizem nada a um leitor de tela, e anunciá-los como
 * lista de itens sem nome só acrescentaria ruído.
 *
 * Sem `flex-wrap`: as barras dividem a linha com `flex-1`, então elas encolhem
 * em vez de quebrar, e o indicador se comporta igual a 320px e a 1280px.
 */
export function Passos({ atual }: { atual: NumeroDePasso }) {
  return (
    <div className="mt-9 lg:mt-11">
      <p className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
        Passo {atual} de {TOTAL_PASSOS}
      </p>
      <div aria-hidden className="mt-3.5 flex gap-1.5">
        {Array.from({ length: TOTAL_PASSOS }, (_, indice) => (
          <span
            key={indice}
            data-preenchido={indice < atual}
            className="h-[3px] flex-1 rounded-full bg-border data-[preenchido=true]:bg-primary"
          />
        ))}
      </div>
    </div>
  );
}
