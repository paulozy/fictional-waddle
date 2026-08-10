import type { Metadata } from "next";
import { ROBOTS_PRIVADO } from "@/lib/site";
import { FormularioRegistro } from "./formulario-registro";

export const metadata: Metadata = {
  title: "Criar conta",
  robots: ROBOTS_PRIVADO,
};

export default function RegistroPage() {
  return <FormularioRegistro />;
}
