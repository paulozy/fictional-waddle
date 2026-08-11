"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { PanelLeftIcon } from "lucide-react";
import { AlternarTema } from "@/components/alternar-tema";
import { Marca } from "@/components/marca";
import {
  ehAtivo,
  ICONES,
  type ItemNavegacao,
} from "@/components/navegacao-dashboard";
import { CtaUpgrade } from "@/components/cta-upgrade";
import { Button } from "@/components/ui/button";
import {
  COOKIE_SIDEBAR_RECOLHIDA,
  VALIDADE_PREFERENCIA_SEGUNDOS,
} from "@/lib/preferencias-ui";
import type { EstadoConexao } from "@/lib/tipos";
import { cn } from "@/lib/utils";

/**
 * Menu lateral do painel, a partir de `md`.
 *
 * **Por que ele não substitui a barra inferior do celular.** A barra de abas
 * continua sendo a navegação abaixo de `md`, com a mesma justificativa de
 * sempre: o dono opera isto entre atendimentos, com uma mão. Uma gaveta lateral
 * custaria um toque a mais em toda navegação. Aqui em cima, onde há largura
 * sobrando e o mouse é preciso, a lista vertical cabe inteira e ainda mostra os
 * dois agrupamentos — que a linha única de links do header antigo não mostrava.
 *
 * **Por que o estado recolhido vem de cookie.** O layout do painel é RSC, e a
 * primeira pintura precisa já sair na largura certa. Lido de `localStorage` num
 * efeito, o menu abriria largo e encolheria depois — um salto de 196px no
 * conteúdo inteiro, em toda navegação. O cookie é lido no servidor e chega aqui
 * como prop; esta ilha só o regrava no clique.
 */

export type GrupoNavegacao = {
  titulo: string;
  itens: ItemNavegacao[];
};

export function BarraLateral({
  grupos,
  itemConta,
  estadoConexao,
  recolhidaInicial,
  linkUpgrade,
  aoSair,
}: {
  grupos: GrupoNavegacao[];
  itemConta: ItemNavegacao;
  /** Alimenta o ponto ao lado de "WhatsApp". */
  estadoConexao: EstadoConexao;
  recolhidaInicial: boolean;
  /** `null` esconde o CTA — quem decide isso é o layout, não esta peça. */
  linkUpgrade: string | null;
  /** Server Action de logout, repassada pelo layout. */
  aoSair: () => void | Promise<void>;
}) {
  const caminho = usePathname();
  const [recolhida, setRecolhida] = useState(recolhidaInicial);

  function alternar() {
    const proxima = !recolhida;
    setRecolhida(proxima);
    document.cookie = `${COOKIE_SIDEBAR_RECOLHIDA}=${proxima ? "1" : "0"}; path=/; max-age=${VALIDADE_PREFERENCIA_SEGUNDOS}; samesite=lax`;
  }

  return (
    <div
      id="menu-lateral"
      data-recolhida={recolhida ? "" : undefined}
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col gap-7 border-r border-border bg-secondary px-3 py-6 md:flex",
        recolhida ? "w-16" : "w-63",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2",
          recolhida ? "justify-center" : "px-2",
        )}
      >
        <Link
          href="/agendamentos"
          className="flex min-h-9 items-center gap-2 font-heading text-lg font-semibold tracking-tight text-foreground"
        >
          <Marca tamanho={26} />
          {/* Recolhida, a palavra sai da tela mas continua sendo o nome
              acessível do link — o símbolo é `aria-hidden` por decisão de
              marca, então sem ela o link ficaria mudo. */}
          <span className={cn(recolhida && "sr-only")}>Encaixaria</span>
        </Link>
      </div>

      <nav aria-label="Seções do painel" className="flex flex-col gap-7">
        {grupos.map((grupo) => (
          <div key={grupo.titulo} className="flex flex-col gap-1">
            {/* Recolhida, o rótulo do grupo vira uma régua: o texto não caberia
                em 40px e abreviá-lo não informaria nada. */}
            {recolhida ? (
              <hr className="mx-2 mb-1 border-t border-border" />
            ) : (
              <p className="mb-1 px-2 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                {grupo.titulo}
              </p>
            )}

            {grupo.itens.map((item) => (
              <ItemLateral
                key={item.href}
                item={item}
                ativo={ehAtivo(caminho, item.href)}
                recolhida={recolhida}
                estadoConexao={
                  item.icone === "whatsapp" ? estadoConexao : undefined
                }
              />
            ))}
          </div>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-1 border-t border-border pt-4">
        {/* Acima de "Conta", que é onde o dono procura assinatura — e dentro do
            rodapé, não da navegação: não é um destino do app. */}
        <CtaUpgrade href={linkUpgrade} recolhida={recolhida} />

        <ItemLateral
          item={itemConta}
          ativo={ehAtivo(caminho, itemConta.href)}
          recolhida={recolhida}
        />

        <form action={aoSair}>
          <Button
            type="submit"
            variant="ghost"
            size="lg"
            className={cn(
              "w-full font-normal text-muted-foreground",
              recolhida ? "justify-center px-0" : "justify-start px-2",
            )}
            title={recolhida ? "Sair" : undefined}
          >
            <span className={cn(recolhida && "sr-only")}>Sair</span>
          </Button>
        </form>

        <div
          className={cn(
            "flex items-center gap-1",
            recolhida ? "flex-col" : "justify-between",
          )}
        >
          <AlternarTema />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={alternar}
            aria-expanded={!recolhida}
            aria-controls="menu-lateral"
            aria-label={recolhida ? "Expandir o menu" : "Recolher o menu"}
          >
            <PanelLeftIcon className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ItemLateral({
  item,
  ativo,
  recolhida,
  estadoConexao,
}: {
  item: ItemNavegacao;
  ativo: boolean;
  recolhida: boolean;
  estadoConexao?: EstadoConexao;
}) {
  const Icone = ICONES[item.icone];

  return (
    <Link
      href={item.href}
      aria-current={ativo ? "page" : undefined}
      /* Recolhida, o rótulo só existe para leitor de tela — o `title` devolve
         a mesma informação a quem usa mouse. */
      title={recolhida ? item.rotulo : undefined}
      className={cn(
        "flex min-h-10 items-center gap-2.5 rounded-lg text-sm transition-colors",
        recolhida ? "justify-center px-0" : "px-2",
        ativo
          ? "bg-card font-medium text-foreground shadow-xs"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <span className="relative flex shrink-0 items-center">
        <Icone className="size-4" aria-hidden />
        {/* Recolhida não há linha onde pendurar o ponto, então ele vira um
            selo na quina do ícone. */}
        {estadoConexao && recolhida && (
          <PontoConexao
            estado={estadoConexao}
            className="absolute -top-0.5 -right-1"
          />
        )}
      </span>

      <span className={cn("flex-1", recolhida && "sr-only")}>
        {item.rotulo}
      </span>

      {estadoConexao && !recolhida && <PontoConexao estado={estadoConexao} />}
    </Link>
  );
}

/**
 * O ponto tem texto próprio em `sr-only` porque cor sozinha não é informação
 * acessível — e porque, no escuro, verde e âmbar a 7px são difíceis de separar
 * mesmo para quem enxerga bem.
 */
function PontoConexao({
  estado,
  className,
}: {
  estado: EstadoConexao;
  className?: string;
}) {
  const conectado = estado === "conectado";

  return (
    <>
      <span
        aria-hidden
        className={cn(
          "size-2 shrink-0 rounded-full",
          conectado ? "bg-confirmado-tinta" : "bg-aviso",
          className,
        )}
      />
      {/* A vírgula é obrigatória, e não é enfeite: o nome acessível do link é
          a concatenação dos filhos **sem separador**, e cada nó tem o próprio
          espaço em branco aparado — um `{" "}` some e sai
          "WhatsAppconectado". */}
      <span className="sr-only">
        , {conectado ? "conectado" : "desconectado"}
      </span>
    </>
  );
}
