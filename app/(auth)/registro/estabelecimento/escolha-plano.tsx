import { PLANOS } from "@/lib/plano";

/**
 * A escolha de faixa, no passo 2 do cadastro.
 *
 * **Radio de verdade, não `<select>`.** O idioma desta pasta para escolher entre
 * opções é `CampoSelecao` (`<select>` nativo), e ele está certo onde está: 16
 * fusos horários numa roda de iOS é melhor que qualquer dropdown customizado.
 * Aqui são duas opções e cada uma carrega um **preço** — num dropdown o preço só
 * aparece depois do toque, que é o oposto do que uma escolha de faixa precisa. E
 * o cartão do Garantido tem uma condição (conta no Mercado Pago) que não cabe
 * numa `<option>`.
 *
 * Sem `"use client"` e sem estado: são dois `<input type="radio">` dentro do
 * `<form>` que já é Server Action, então funcionam com JavaScript desligado e no
 * primeiro paint. O `defaultChecked` vem do banco, o que mantém a tela reentrante
 * — recarregar o passo 2 mostra o que já foi escolhido.
 *
 * **Não é o portão.** Quem decide se a troca vale é a RPC `escolher_plano_trial`;
 * esta peça só desenha. Um POST direto com `plano=sinal` fora do trial é recusado
 * no banco, não aqui.
 */
export function EscolhaPlano({ planoInicial }: { planoInicial: string }) {
  return (
    <fieldset className="flex flex-col gap-2">
      {/* `legend` e não um `<p>`: é o rótulo do grupo, e é o que o leitor de tela
          anuncia antes de cada opção. */}
      <legend className="mb-2 text-sm font-medium">Como você quer testar</legend>

      {PLANOS.map((plano) => (
        /*
          O `<label>` embrulha o input inteiro, então o alvo de toque é o cartão
          e não o círculo de 16px — que sozinho reprovaria o mínimo de 24px da
          WCAG 2.2 SC 2.5.8. `has-[:checked]` e `has-[:focus-visible]` põem o
          estado no cartão sem precisar de JavaScript para saber qual está
          marcado.
        */
        <label
          key={plano.id}
          className="flex min-h-11 cursor-pointer gap-3 rounded-lg border border-input p-3.5 transition-colors has-[:checked]:border-primary has-[:checked]:bg-accent/40 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
        >
          <input
            type="radio"
            name="plano"
            value={plano.id}
            defaultChecked={plano.id === planoInicial}
            className="mt-1 size-4 shrink-0 accent-primary outline-none"
          />

          <span className="flex flex-col gap-1">
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-base font-medium">{plano.nome}</span>
              <span className="text-base text-muted-foreground">
                R$ {plano.preco}/mês
              </span>
            </span>

            <span className="text-sm leading-relaxed text-muted-foreground">
              {plano.resumo}
            </span>

            {/*
              A exigência aparece junto da escolha, nunca só na tela de conexão.
              É a mesma regra de `/precos`: descobrir depois de assinar que
              precisa abrir conta em outro lugar é a pior hora possível.
            */}
            {plano.destacado && (
              <span className="text-sm leading-relaxed text-muted-foreground">
                Exige uma conta no Mercado Pago no seu nome — é nela que o Pix
                cai, direto do cliente para você.
              </span>
            )}
          </span>
        </label>
      ))}

      <p className="text-sm leading-relaxed text-muted-foreground">
        Dá para trocar depois: é só nos mandar uma mensagem. O teste é o mesmo nos
        dois planos.
      </p>
    </fieldset>
  );
}
