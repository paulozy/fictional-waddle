import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CtaUpgrade } from "@/components/cta-upgrade";
import {
  linkAssinatura,
  motivoBloqueio,
  resumoAssinatura,
  type PerfilAssinatura,
} from "@/lib/assinatura";
import { nomeDoPlano, PLANO_PADRAO, precoDoPlano } from "@/lib/plano";
import { criarClienteServidor, obterClaims } from "@/lib/supabase/server";
import { BotaoTrocarSenha } from "./botao-trocar-senha";
import { DialogoEncerrarConta } from "./dialogo-encerrar-conta";
import { FormularioEstabelecimento } from "./formulario-estabelecimento";

export const metadata: Metadata = { title: "Conta" };

/**
 * Dados do estabelecimento, acesso e assinatura.
 *
 * Antes desta tela, `nome_estabelecimento` e `fuso_horario` só eram graváveis no
 * passo 2 do cadastro: quem errasse o fuso ali ficava com a agenda inteira
 * deslocada e sem nenhum caminho na interface para corrigir. Trocar de senha e
 * encerrar a conta também não existiam.
 */
export default async function ContaPage() {
  const claims = await obterClaims();
  if (!claims) redirect("/login");

  const supabase = await criarClienteServidor();
  const { data: perfil } = await supabase
    .from("perfis")
    .select(
      "nome_estabelecimento, fuso_horario, status_assinatura, trial_expira_em, trial_bloqueado_em, plano",
    )
    .eq("id", claims.sub)
    .maybeSingle();

  /*
    `plano` entrou no `select` porque o preço deixou de ser único: com dois
    planos, passar o do Essencial fixo diria "R$ 49,90 por mês" para quem assinou
    o Garantido — e a tela da Conta é justamente onde o dono confere quanto paga.
    `precoDoPlano` tolera nulo e cai no plano de entrada, que é o default da
    coluna no banco.
  */
  const resumo = resumoAssinatura(
    perfil as PerfilAssinatura | null,
    new Date(),
    precoDoPlano(perfil?.plano),
  );
  const href = linkAssinatura();
  const email = typeof claims.email === "string" ? claims.email : "";

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Conta</h1>
      <p className="mt-2 text-base text-muted-foreground md:text-sm">
        Dados do estabelecimento, acesso e assinatura.
      </p>

      <section className="mt-8 flex max-w-2xl flex-col gap-4 rounded-xl border border-confirmado-borda bg-confirmado p-5 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex-1">
          {/* O nome do plano vai no rótulo, e não numa linha nova: o cartão é o
              único lugar do painel que responde "qual plano eu tenho?", e uma
              quarta linha de texto num cartão de três empurraria o botão de
              assinar para baixo da dobra no celular. */}
          <h2 className="font-mono text-[11px] font-normal tracking-[0.14em] text-confirmado-tinta uppercase">
            Assinatura · plano {nomeDoPlano(perfil?.plano)}
          </h2>
          <p className="mt-2 text-lg font-semibold text-confirmado-tinta">
            {resumo.titulo}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-confirmado-tinta">
            {resumo.detalhe}
          </p>
        </div>

        {/**
         * Sem gateway de pagamento: o CTA leva à conversa em que a assinatura é
         * combinada de fato, e `status_assinatura` é virado à mão depois. Sem a
         * env var `WHATSAPP_CONTATO` o botão some — o resumo ao lado continua
         * valendo por si.
         */}
        {resumo.ofereceAssinar && href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            Assinar pelo WhatsApp
          </a>
        )}
      </section>

      {/*
        O caminho de upgrade, na tela em que o dono pergunta "quanto eu pago?".
        Mesma condição do shell: só no Essencial e só sem bloqueio — com o bot
        parado, o banner no topo já pede outra coisa, e duas ofertas competindo
        na mesma tela não ajudam ninguém a decidir.
      */}
      {perfil?.plano === PLANO_PADRAO && !motivoBloqueio(perfil, new Date()) && (
        <section className="mt-6 flex max-w-2xl flex-col gap-3 rounded-xl border border-border p-5 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex-1">
            <p className="font-medium">
              Precisa segurar o horário com um sinal?
            </p>
            <p className="mt-1 max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
              No plano {nomeDoPlano("sinal")}, por R$ {precoDoPlano("sinal")} por
              mês, o bot pede um Pix antes de fechar o agendamento. O dinheiro cai
              direto na sua conta do Mercado Pago — não passa por nós, e não
              cobramos comissão.
            </p>
          </div>
          <CtaUpgrade
            href={linkAssinatura("upgrade")}
            className="min-h-11 shrink-0 justify-center rounded-lg border border-primary px-4 sm:min-h-10"
          />
        </section>
      )}

      <section className="mt-11 max-w-2xl">
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          Estabelecimento
        </h2>
        <FormularioEstabelecimento
          nomeInicial={perfil?.nome_estabelecimento ?? ""}
          fusoInicial={perfil?.fuso_horario ?? "America/Sao_Paulo"}
        />
      </section>

      <section className="mt-11 max-w-2xl">
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          Acesso
        </h2>

        <div className="mt-5 grid gap-2 sm:grid-cols-[11.25rem_minmax(0,1fr)] sm:items-center sm:gap-5">
          <span className="text-sm text-muted-foreground">E-mail</span>
          {/**
           * Texto, e não campo desabilitado: trocar de e-mail exige confirmar o
           * endereço novo, que é um fluxo próprio e não existe. Um input cinza
           * convida ao clique e não faz nada.
           */}
          <p className="font-mono text-sm break-all">{email}</p>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-[11.25rem_minmax(0,1fr)] sm:items-center sm:gap-5">
          <span className="text-sm text-muted-foreground">Senha</span>
          <BotaoTrocarSenha email={email} />
        </div>
      </section>

      <section className="mt-14 max-w-2xl border-t border-border pt-6">
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          Encerrar conta
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          O bot para de responder na hora e a agenda deixa de ficar acessível.
          Os agendamentos já marcados não são avisados automaticamente — avise
          seus clientes antes.
        </p>
        <DialogoEncerrarConta
          nomeEstabelecimento={perfil?.nome_estabelecimento ?? ""}
        />
      </section>
    </>
  );
}
