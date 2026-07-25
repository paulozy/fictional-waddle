import "server-only";

import { createClient } from "@supabase/supabase-js";
import { envObrigatoria } from "@/lib/config";
import type { Database } from "./tipos-banco";

/**
 * Client com service role key — **ignora RLS por completo**.
 *
 * Uso restrito a dois lugares que chegam sem sessão de usuário:
 *   - `/api/webhook/whatsapp/[instance]` (a Evolution API não tem sessão)
 *   - `/api/cron/enviar-lembretes` (a Vercel não tem sessão)
 *
 * Consequência que vale repetir: como a RLS não se aplica aqui, o
 * `.eq("usuario_id", ...)` deixa de ser otimização e passa a ser a **única**
 * barreira entre tenants. Todo query neste client precisa filtrar por
 * `usuario_id` explicitamente.
 *
 * O `import "server-only"` no topo faz qualquer import acidental deste módulo
 * em Client Component quebrar o build, em vez de vazar a chave no bundle.
 * Note também que é `createClient` do `supabase-js`, não do `ssr`: não há
 * cookies nem sessão para sincronizar.
 */
export function criarClienteAdmin() {
  return createClient<Database>(
    envObrigatoria("NEXT_PUBLIC_SUPABASE_URL"),
    envObrigatoria("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
