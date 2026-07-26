import Link from "next/link";
import { redirect } from "next/navigation";
import { sair } from "@/app/login/actions";
import { AlternarTema } from "@/components/alternar-tema";
import { BannerAssinatura } from "@/components/banner-assinatura";
import { Marca } from "@/components/marca";
import {
  NavegacaoDashboard,
  type ItemNavegacao,
} from "@/components/navegacao-dashboard";
import { motivoBloqueio, type PerfilAssinatura } from "@/lib/assinatura";
import { criarClienteServidor, obterClaims } from "@/lib/supabase/server";

/**
 * A lista está partida em dois porque a barra inferior do celular comporta
 * quatro abas com folga e cinco no aperto. O critério do corte é frequência de
 * uso, não importância: a agenda é consultada todo dia, enquanto fluxo é
 * configuração inicial e WhatsApp só interessa quando a conexão cai.
 *
 * Acima de `md` os dois grupos voltam a ser uma lista só, no header —
 * `NavegacaoDashboard` faz essa recomposição.
 */
const ABAS_PRINCIPAIS: ItemNavegacao[] = [
  {
    href: "/agendamentos",
    rotulo: "Agendamentos",
    rotuloCurto: "Agenda",
    icone: "agenda",
  },
  { href: "/servicos", rotulo: "Serviços", icone: "servicos" },
  { href: "/horarios", rotulo: "Horários", icone: "horarios" },
];

const ITENS_EXTRAS: ItemNavegacao[] = [
  { href: "/fluxo-conversa", rotulo: "Fluxo da conversa", icone: "fluxo" },
  { href: "/conexao-whatsapp", rotulo: "WhatsApp", icone: "whatsapp" },
];

/**
 * Não há gateway de pagamento nesta fase: o `status_assinatura` é virado à mão
 * no banco. O CTA então leva o dono a falar com a gente pelo WhatsApp, que é
 * onde a assinatura é combinada de fato.
 *
 * Devolve `null` sem a env var, e o banner some com o botão — o aviso continua
 * aparecendo, porque a informação de que o bot parou vale por si.
 */
function linkAssinatura(): string | null {
  const numero = process.env.WHATSAPP_CONTATO?.replace(/\D/g, "");
  if (!numero) return null;
  const texto = encodeURIComponent("Olá! Quero assinar um plano do AgendaZap.");
  return `https://wa.me/${numero}?text=${texto}`;
}

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
    .select("status_assinatura, trial_expira_em, trial_bloqueado_em")
    .eq("id", claims.sub)
    .maybeSingle<PerfilAssinatura>();
  const motivo = motivoBloqueio(perfil, new Date());

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center gap-x-6 px-4 py-3 sm:px-6 md:py-4">
          {/* A palavra fica em `text-foreground`, não em `text-primary`: com o
              símbolo colorido ao lado, o teal na tipografia daria três famílias
              de cor no mesmo cabeçalho — e o teal precisa continuar
              significando "elemento interativo" na UI. */}
          <Link
            href="/agendamentos"
            className="flex min-h-11 items-center gap-2 font-heading text-lg font-semibold tracking-tight text-foreground"
          >
            <Marca tamanho={28} />
            AgendaZap
          </Link>

          <NavegacaoDashboard
            abas={ABAS_PRINCIPAIS}
            itensExtras={ITENS_EXTRAS}
            aoSair={sair}
          />

          {/* No celular estes dois moram no "Mais" da barra inferior — repetir
              aqui só roubaria altura do header em toda página. */}
          <div className="ml-auto hidden items-center gap-1 md:flex">
            <AlternarTema />
            <form action={sair}>
              <button
                type="submit"
                className="flex min-h-9 items-center rounded-md px-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      {motivo && (
        <BannerAssinatura motivo={motivo} href={linkAssinatura()} />
      )}

      {/**
       * `pb-24` abre espaço para a barra inferior fixa: sem isto o último item
       * de qualquer lista termina embaixo dela e fica inalcançável.
       */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-24 sm:px-6 md:py-8">
        {children}
      </main>
    </div>
  );
}
