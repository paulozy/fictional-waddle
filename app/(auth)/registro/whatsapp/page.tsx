import type { Metadata } from "next";
import { ROBOTS_PRIVADO } from "@/lib/site";
import { exigirUsuario } from "@/lib/supabase/server";
import { FormularioWhatsapp } from "./formulario-whatsapp";

export const metadata: Metadata = {
  title: "Conectar o WhatsApp",
  robots: ROBOTS_PRIVADO,
};

export default async function WhatsappPage() {
  // Não usa o id, mas mantém o guard: `proxy.ts` não cobre Server Actions nem
  // vale como camada de autorização (ver o JSDoc de `exigirUsuario`).
  await exigirUsuario();

  return <FormularioWhatsapp />;
}
