import type { Metadata } from "next";
import { ROBOTS_PRIVADO } from "@/lib/site";
import { exigirUsuario } from "@/lib/supabase/server";
import { FormularioNovaSenha } from "./formulario-nova-senha";

export const metadata: Metadata = {
  title: "Nova senha",
  robots: ROBOTS_PRIVADO,
};

export default async function RedefinirSenhaPage() {
  // A sessão aqui é a de recuperação, criada por `/auth/confirmar`. Sem ela esta
  // tela não teria em quem gravar — e é isso que acontece com link expirado.
  await exigirUsuario();

  return <FormularioNovaSenha />;
}
