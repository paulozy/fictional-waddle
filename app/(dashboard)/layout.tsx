import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { sair } from "@/app/(auth)/actions";
import { AlternarTema } from "@/components/alternar-tema";
import { BannerAssinatura } from "@/components/banner-assinatura";
import { BarraLateral, type GrupoNavegacao } from "@/components/barra-lateral";
import { Marca } from "@/components/marca";
import {
  NavegacaoDashboard,
  type ItemNavegacao,
} from "@/components/navegacao-dashboard";
import {
  linkAssinatura,
  motivoBloqueio,
  type PerfilAssinatura,
} from "@/lib/assinatura";
import { COOKIE_SIDEBAR_RECOLHIDA } from "@/lib/preferencias-ui";
import { ROBOTS_PRIVADO } from "@/lib/site";
import { criarClienteServidor, obterClaims } from "@/lib/supabase/server";
import type { EstadoConexao } from "@/lib/tipos";

/**
 * `noindex` para todo o dashboard, herdado por cada página do grupo — elas
 * declaram só `title`, então esta chave sobrevive à mesclagem.
 *
 * O `proxy.ts` já redireciona anônimo para `/login`, então o Googlebot recebe
 * 307 e não há duplicata hoje. Isto é a segunda tranca: se um dia alguma rota
 * daqui deixar de exigir sessão, ela não passa a ser indexável por acidente.
 *
 * Sem `Disallow` correspondente em `app/robots.ts`, pelo mesmo motivo do
 * `/login`: bloquear no robots.txt impediria o Google de ler o `noindex`.
 */
export const metadata: Metadata = { robots: ROBOTS_PRIVADO };

/**
 * Os seis destinos do painel, declarados uma vez só.
 *
 * As duas navegações recortam esta lista de jeitos diferentes, e é de propósito
 * que o recorte more aqui: se cada componente montasse a sua, um destino novo
 * apareceria numa e não na outra.
 *
 * - **Celular** (`NavegacaoDashboard`): `ABAS_PRINCIPAIS` na barra inferior e
 *   `ITENS_EXTRAS` na folha "Mais". O critério do corte é frequência de uso,
 *   não importância — a agenda é consultada todo dia, enquanto fluxo é
 *   configuração inicial, WhatsApp só interessa quando a conexão cai e conta é
 *   quase nunca.
 * - **`md`+** (`BarraLateral`): os mesmos destinos em dois grupos nomeados, com
 *   a conta separada no rodapé.
 */
const AGENDAMENTOS: ItemNavegacao = {
  href: "/agendamentos",
  rotulo: "Agendamentos",
  rotuloCurto: "Agenda",
  icone: "agenda",
};
const SERVICOS: ItemNavegacao = {
  href: "/servicos",
  rotulo: "Serviços",
  icone: "servicos",
};
const HORARIOS: ItemNavegacao = {
  href: "/horarios",
  rotulo: "Horários",
  icone: "horarios",
};
const FLUXO: ItemNavegacao = {
  href: "/fluxo-conversa",
  rotulo: "Fluxo da conversa",
  icone: "fluxo",
};
const WHATSAPP: ItemNavegacao = {
  href: "/conexao-whatsapp",
  rotulo: "WhatsApp",
  icone: "whatsapp",
};
const CONTA: ItemNavegacao = {
  href: "/conta",
  rotulo: "Conta",
  icone: "conta",
};

const ABAS_PRINCIPAIS: ItemNavegacao[] = [AGENDAMENTOS, SERVICOS, HORARIOS];
const ITENS_EXTRAS: ItemNavegacao[] = [FLUXO, WHATSAPP, CONTA];

const GRUPOS_LATERAIS: GrupoNavegacao[] = [
  { titulo: "Operação", itens: [AGENDAMENTOS] },
  { titulo: "Configuração", itens: [SERVICOS, HORARIOS, FLUXO, WHATSAPP] },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /**
   * Segunda verificação de sessão, além do `proxy.ts`.
   *
   * Não é redundância inútil: a doc do Next 16 alerta que o matcher do proxy
   * pode ser contornado e que a autorização precisa viver junto do dado. Aqui
   * também precisamos das claims para renderizar, então a chamada não é extra.
   */
  const claims = await obterClaims();
  if (!claims) redirect("/login");

  /**
   * Gate de assinatura, na versão **soft**: o banner avisa, mas não bloqueia a
   * navegação. Bloquear esconderia o próprio CTA de assinar, e o dono ainda
   * precisa consultar a agenda que já foi marcada. O bloqueio de verdade está
   * onde custa dinheiro: no webhook do bot e no cron de lembretes.
   */
  const supabase = await criarClienteServidor();
  const { data: perfil } = await supabase
    .from("perfis")
    .select(
      "status_assinatura, trial_expira_em, trial_bloqueado_em, status_conexao_whatsapp",
    )
    .eq("id", claims.sub)
    .maybeSingle<PerfilAssinatura & { status_conexao_whatsapp: EstadoConexao }>();
  const motivo = motivoBloqueio(perfil, new Date());

  /**
   * Lido no servidor, não em `localStorage`: o menu precisa sair na largura
   * certa já na primeira pintura. Decidido num efeito, ele abriria largo e
   * encolheria depois, empurrando o conteúdo inteiro em toda navegação.
   *
   * O nome do cookie vem de `lib/preferencias-ui.ts`, e não do componente que o
   * escreve, porque aquele é `"use client"` — ver o JSDoc de lá.
   */
  const recolhidaInicial =
    (await cookies()).get(COOKIE_SIDEBAR_RECOLHIDA)?.value === "1";

  return (
    <div className="flex min-h-full flex-1 md:items-stretch">
      <BarraLateral
        grupos={GRUPOS_LATERAIS}
        itemConta={CONTA}
        estadoConexao={perfil?.status_conexao_whatsapp ?? "desconectado"}
        recolhidaInicial={recolhidaInicial}
        aoSair={sair}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Abaixo de `md` a marca ainda precisa de um lugar, e o tema também —
            no celular a navegação é a barra inferior, que não tem espaço para
            os dois. Acima de `md` isto some: quem faz esse papel é a lateral. */}
        <header className="border-b border-border bg-card md:hidden">
          <div className="flex items-center justify-between px-4 py-3 sm:px-6">
            {/* A palavra fica em `text-foreground`, não em `text-primary`: com
                o símbolo colorido ao lado, o teal na tipografia daria três
                famílias de cor no mesmo cabeçalho — e o teal precisa continuar
                significando "elemento interativo" na UI. */}
            <Link
              href="/agendamentos"
              className="flex min-h-11 items-center gap-2 font-heading text-lg font-semibold tracking-tight text-foreground"
            >
              <Marca tamanho={28} />
              Encaixaria
            </Link>
            <AlternarTema />
          </div>
        </header>

        <NavegacaoDashboard
          abas={ABAS_PRINCIPAIS}
          itensExtras={ITENS_EXTRAS}
          aoSair={sair}
        />

        {motivo && <BannerAssinatura motivo={motivo} href={linkAssinatura()} />}

        {/**
         * `pb-24` abre espaço para a barra inferior fixa: sem isto o último
         * item de qualquer lista termina embaixo dela e fica inalcançável.
         */}
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-24 sm:px-6 md:px-8 md:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
