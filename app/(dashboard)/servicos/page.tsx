import type { Metadata } from "next";
import { ScissorsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { criarClienteServidor, exigirUsuario } from "@/lib/supabase/server";
import { alternarServico } from "./actions";
import { DialogoEditar } from "./dialogo-editar";
import { FormularioServico } from "./formulario-servico";

export const metadata: Metadata = { title: "Serviços" };

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
      <p className="mt-2 max-w-[56ch] text-base leading-relaxed text-muted-foreground md:text-sm">
        A duração define quais horários o bot oferece. Serviço desativado sai da
        lista do bot, e o histórico de agendamentos continua.
      </p>

      {/**
       * Duas colunas só a partir de `lg`, e não com `auto-fit`/`minmax(340px)`
       * como no design: aquele valor abriria a segunda coluna já perto de
       * 740px, deixando lista e formulário espremidos lado a lado no iPad em
       * retrato. É o mesmo motivo pelo qual a prosa da landing só vira três
       * colunas em `lg`.
       */}
      <div className="mt-8 grid grid-cols-1 items-start gap-8 lg:grid-cols-2 lg:gap-10">
        <div>
          {servicos?.length ? (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {servicos.map((servico) => (
                <li
                  key={servico.id}
                  className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 ${
                    servico.ativo ? "" : "bg-muted/40"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className={
                        servico.ativo ? "font-medium" : "font-medium opacity-70"
                      }
                    >
                      {servico.nome}
                    </p>
                    {/* Duração, preço e situação numa linha só, em mono: são
                        três números que o dono compara entre serviços, e
                        alinhados verticalmente a comparação é de relance. */}
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {servico.duracao_minutos} min
                      {servico.preco !== null &&
                        ` · ${formatarPreco.format(servico.preco)}`}
                      {!servico.ativo && " · desativado"}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <DialogoEditar servico={servico} />
                    <form action={alternarServico}>
                      <input type="hidden" name="id" value={servico.id} />
                      <input
                        type="hidden"
                        name="ativar"
                        value={String(!servico.ativo)}
                      />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        className="font-normal text-muted-foreground"
                      >
                        {servico.ativo ? "Desativar" : "Reativar"}
                      </Button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card px-8 py-12 text-center">
              <ScissorsIcon
                aria-hidden
                className="mx-auto size-6 text-muted-foreground"
              />
              <p className="mt-4 font-heading text-lg font-semibold tracking-tight">
                Nenhum serviço cadastrado
              </p>
              <p className="mx-auto mt-2 max-w-[40ch] text-sm leading-relaxed text-muted-foreground">
                O bot precisa de pelo menos um serviço com duração para
                conseguir oferecer horários.
              </p>
            </div>
          )}
        </div>

        <FormularioServico />
      </div>
    </>
  );
}
