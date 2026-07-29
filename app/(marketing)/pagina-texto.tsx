/**
 * Moldura das páginas de texto corrido: sobre, privacidade, termos.
 *
 * Existe para a tipografia de leitura longa ficar num lugar só. `max-w-2xl` é
 * medida de conforto, não estética — passa de perto dos 75 caracteres por linha
 * acima dos quais o olho perde o começo da linha seguinte.
 *
 * `atualizadoEm` é data escrita à mão, e não `new Date()`, de propósito: numa
 * página jurídica ela informa **quando o texto mudou**, e um build noturno não
 * muda texto nenhum. Data que se move sozinha é pior que data ausente, porque
 * mente com aparência de precisão.
 */
export function PaginaTexto({
  titulo,
  resumo,
  atualizadoEm,
  children,
}: {
  titulo: string;
  resumo?: string;
  atualizadoEm?: string;
  children: React.ReactNode;
}) {
  return (
    <article className="mx-auto max-w-2xl px-4 sm:px-6 pb-20 pt-14 sm:pt-20">
      <h1 className="font-heading text-3xl font-semibold leading-tight tracking-tight text-balance sm:text-4xl">
        {titulo}
      </h1>

      {resumo ? (
        <p className="mt-4 text-lg leading-8 text-muted-foreground">{resumo}</p>
      ) : null}

      {atualizadoEm ? (
        <p className="mt-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Atualizado em {atualizadoEm}
        </p>
      ) : null}

      {/*
        Estilos por seletor descendente, e não classe em cada elemento: o corpo
        destas páginas é prosa, e encher cada `<p>` de utilitário torna o texto
        difícil de editar por quem escreve, não por quem programa.
      */}
      <div className="mt-10 space-y-5 leading-7 text-muted-foreground [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mt-10 [&_h2]:font-heading [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground [&_li]:pl-1 [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
        {children}
      </div>
    </article>
  );
}
