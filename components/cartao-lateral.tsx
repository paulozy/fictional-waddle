/**
 * A coluna estreita de "adicionar" que fica ao lado da lista, nas telas de
 * Serviços e Fluxo da conversa.
 *
 * Existe porque as duas telas usam o mesmo desenho — moldura de cartão mais um
 * rótulo miúdo em versalete — e ele já estava escrito à mão em `rounded-lg
 * border border-border bg-card p-4` espalhado pelo projeto. Com o formulário
 * virando uma coluna própria em cada tela, a terceira cópia era certa.
 *
 * O rótulo é `<h2>` e não `<p>`: ele nomeia uma região da página, e sem isso a
 * navegação por títulos pula direto da lista para o rodapé.
 */
export function CartaoLateral({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-mono text-[11px] font-normal tracking-[0.14em] text-muted-foreground uppercase">
        {titulo}
      </h2>
      {children}
    </section>
  );
}
