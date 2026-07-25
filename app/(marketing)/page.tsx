import Link from "next/link";

const BENEFICIOS = [
  {
    titulo: "Responde enquanto você atende",
    texto:
      "O cliente manda mensagem, vê os horários livres e fecha o agendamento sozinho — sem você parar o que está fazendo.",
  },
  {
    titulo: "Do seu próprio número",
    texto:
      "O bot atende pelo WhatsApp do seu estabelecimento, o mesmo número que seus clientes já têm salvo.",
  },
  {
    titulo: "Lembrete automático",
    texto:
      "Um dia antes, o cliente recebe a confirmação do horário. Menos falta, menos cadeira vazia.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col items-center px-6 py-20">
      <main className="w-full max-w-2xl">
        <p className="text-sm font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-500">
          AgendaZap
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance">
          Seu cliente agenda pelo WhatsApp. Sem baixar nada.
        </h1>
        <p className="mt-5 text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          Salões, clínicas e barbearias perdem agendamento porque ninguém
          consegue responder mensagem no meio do atendimento. O AgendaZap
          responde por você — dentro do WhatsApp que seu cliente já usa, sem app
          separado para ele instalar.
        </p>

        <Link
          href="/login"
          className="mt-8 inline-flex h-12 items-center rounded-full bg-emerald-700 px-6 font-medium text-white transition-colors hover:bg-emerald-800"
        >
          Começar teste grátis
        </Link>

        <dl className="mt-16 grid gap-8 sm:grid-cols-3">
          {BENEFICIOS.map(({ titulo, texto }) => (
            <div key={titulo}>
              <dt className="font-medium">{titulo}</dt>
              <dd className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                {texto}
              </dd>
            </div>
          ))}
        </dl>
      </main>
    </div>
  );
}
