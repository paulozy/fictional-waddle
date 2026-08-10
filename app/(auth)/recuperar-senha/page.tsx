import type { Metadata } from "next";
import { ROBOTS_PRIVADO } from "@/lib/site";
import { FormularioRecuperacao } from "./formulario-recuperacao";

export const metadata: Metadata = {
  title: "Recuperar acesso",
  robots: ROBOTS_PRIVADO,
};

export default function RecuperarSenhaPage() {
  return <FormularioRecuperacao />;
}
