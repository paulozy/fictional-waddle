/**
 * Leitura de variáveis de ambiente.
 *
 * Falha alto e cedo: uma env var ausente vira erro explícito em vez de um
 * `undefined` que só aparece depois como 401 obscuro da Evolution API ou como
 * client Supabase apontando para lugar nenhum.
 *
 * Sem `import 'server-only'` de propósito — este módulo é puro e precisa rodar
 * sob Vitest. O guard de servidor fica em `lib/supabase/admin.ts`, que é onde
 * um import acidental no cliente teria consequência real (vazar a service key).
 */
export function envObrigatoria(nome: string): string {
  const valor = process.env[nome];
  if (!valor) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${nome}`);
  }
  return valor;
}
