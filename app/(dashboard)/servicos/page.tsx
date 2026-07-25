import { criarClienteServidor, exigirUsuario } from "@/lib/supabase/server";
import { FormularioServico } from "./formulario-servico";
import { alternarServico } from "./actions";

export const metadata = { title: "Serviços — AgendaZap" };

const formatarPreco = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export default async function ServicosPage() {
  const usuarioId = await exigirUsuario();
  const supabase = await criarClienteServidor();

  const { data: servicos } = await supabase
    .from("servicos")
    .select("id, nome, duracao_minutos, preco, ativo")
    .eq("usuario_id", usuarioId)
    .order("ativo", { ascending: false })
    .order("nome");

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Serviços</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        A duração é o que define os horários que o bot oferece. Serviço
        desativado sai da lista do bot, mas o histórico de agendamentos
        continua.
      </p>

      <div className="mt-6">
        <FormularioServico />
      </div>

      {servicos?.length ? (
        <ul className="mt-6 divide-y divide-zinc-200 dark:divide-zinc-800">
          {servicos.map((servico) => (
            <li
              key={servico.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3"
            >
              <span
                className={
                  servico.ativo ? "font-medium" : "font-medium text-zinc-400"
                }
              >
                {servico.nome}
              </span>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                {servico.duracao_minutos} min
              </span>
              {servico.preco !== null && (
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {formatarPreco.format(servico.preco)}
                </span>
              )}
              {!servico.ativo && (
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  desativado
                </span>
              )}

              <form action={alternarServico} className="ml-auto">
                <input type="hidden" name="id" value={servico.id} />
                <input
                  type="hidden"
                  name="ativar"
                  value={String(!servico.ativo)}
                />
                <button
                  type="submit"
                  className="text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
                >
                  {servico.ativo ? "Desativar" : "Ativar"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-zinc-600 dark:text-zinc-400">
          Nenhum serviço cadastrado ainda. O bot precisa de pelo menos um
          serviço ativo para conseguir agendar.
        </p>
      )}
    </>
  );
}
