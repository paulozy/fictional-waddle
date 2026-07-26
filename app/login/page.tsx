import Link from "next/link";
import { Marca } from "@/components/marca";
import { FormularioLogin } from "./formulario-login";

export const metadata = { title: "Entrar — AgendaZap" };

export default function LoginPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 sm:px-6 py-16">
      {/* Aqui a marca é o único elemento de identidade da tela, então respira
          mais que nos cabeçalhos. */}
      <Link
        href="/"
        className="flex min-h-11 flex-col items-center gap-2 font-heading text-sm font-semibold uppercase tracking-wide text-foreground"
      >
        <Marca tamanho={40} prioritaria />
        AgendaZap
      </Link>
      <h1 className="mt-4 mb-8 text-2xl font-semibold tracking-tight">
        Entrar na sua conta
      </h1>
      <FormularioLogin />
    </div>
  );
}
