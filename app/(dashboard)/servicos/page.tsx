import { ScissorsIcon } from "lucide-react";
import { criarClienteServidor, exigirUsuario } from "@/lib/supabase/server";
import { alternarServico } from "./actions";
import { DialogoEditar } from "./dialogo-editar";
import { FormularioServico } from "./formulario-servico";

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
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Serviço desativado sai da lista do bot, mas o histórico de agendamentos
        continua.
      </p>

      <div className="mt-6">
        <FormularioServico />
      </div>

      {servicos?.length ? (
        <ul className="mt-6 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {servicos.map((servico) => (
            <li
              key={servico.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
            >
              <span
                className={
                  servico.ativo
                    ? "font-medium"
                    : "font-medium text-muted-foreground"
                }
              >
                {servico.nome}
              </span>
              <span className="text-sm tabular-nums text-muted-foreground">
                {servico.duracao_minutos} min
              </span>
              {servico.preco !== null && (
                <span className="text-sm tabular-nums text-muted-foreground">
                  {formatarPreco.format(servico.preco)}
                </span>
              )}
              {!servico.ativo && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  desativado
                </span>
              )}

              <div className="ml-auto flex items-center gap-1">
                <DialogoEditar servico={servico} />
                <form action={alternarServico}>
                  <input type="hidden" name="id" value={servico.id} />
                  <input
                    type="hidden"
                    name="ativar"
                    value={String(!servico.ativo)}
                  />
                  <button
                    type="submit"
                    className="flex min-h-11 items-center rounded-md px-2 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline md:min-h-8"
                  >
                    {servico.ativo ? "Desativar" : "Ativar"}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-6 rounded-lg border border-dashed border-border p-8 text-center">
          <ScissorsIcon
            aria-hidden
            className="mx-auto size-6 text-muted-foreground"
          />
          <p className="mt-3 font-medium">Nenhum serviço cadastrado</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            O bot precisa de pelo menos um serviço ativo para conseguir agendar.
            Cadastre o primeiro no formulário acima.
          </p>
        </div>
      )}
    </>
  );
}
