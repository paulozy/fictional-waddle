import Link from "next/link";
import { redirect } from "next/navigation";
import { sair } from "@/app/login/actions";
import { obterClaims } from "@/lib/supabase/server";

const NAVEGACAO = [
  { href: "/agendamentos", rotulo: "Agendamentos" },
  { href: "/servicos", rotulo: "Serviços" },
  { href: "/horarios", rotulo: "Horários" },
  { href: "/fluxo-conversa", rotulo: "Fluxo da conversa" },
  { href: "/conexao-whatsapp", rotulo: "WhatsApp" },
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

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4">
          <Link
            href="/agendamentos"
            className="font-semibold tracking-tight text-emerald-700 dark:text-emerald-500"
          >
            AgendaZap
          </Link>
          <nav className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {NAVEGACAO.map(({ href, rotulo }) => (
              <Link
                key={href}
                href={href}
                className="text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
              >
                {rotulo}
              </Link>
            ))}
          </nav>
          <form action={sair} className="ml-auto">
            <button
              type="submit"
              className="text-sm text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              Sair
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        {children}
      </main>
    </div>
  );
}
