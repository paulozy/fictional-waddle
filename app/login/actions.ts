"use server";

import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ROTA_PADRAO_LOGADO } from "@/lib/supabase/proxy";
import { lerCredenciais, type EstadoLogin } from "./schema";

export async function entrar(
  _estado: EstadoLogin,
  formData: FormData,
): Promise<EstadoLogin> {
  const parsed = lerCredenciais(formData);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0].message };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.senha,
  });

  // Mensagem genérica de propósito: não revelar se o e-mail existe na base.
  if (error) return { erro: "E-mail ou senha incorretos." };

  redirect(ROTA_PADRAO_LOGADO);
}

export async function criarConta(
  _estado: EstadoLogin,
  formData: FormData,
): Promise<EstadoLogin> {
  const parsed = lerCredenciais(formData);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0].message };
  }

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.senha,
  });

  if (error) return { erro: error.message };

  // Com confirmação de e-mail ligada no projeto, o signUp não cria sessão. Sem
  // este aviso o redirect voltaria para /login pelo proxy, sem explicação.
  if (!data.session) {
    return {
      erro: "Conta criada. Confirme o e-mail que enviamos para poder entrar.",
    };
  }

  redirect(ROTA_PADRAO_LOGADO);
}

export async function sair() {
  const supabase = await criarClienteServidor();
  await supabase.auth.signOut();
  redirect("/login");
}
