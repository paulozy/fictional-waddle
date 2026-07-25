import Link from "next/link";
import { FormularioLogin } from "./formulario-login";

export const metadata = { title: "Entrar — AgendaZap" };

export default function LoginPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <Link
        href="/"
        className="font-heading text-sm font-semibold uppercase tracking-wide text-primary"
      >
        AgendaZap
      </Link>
      <h1 className="mt-4 mb-8 text-2xl font-semibold tracking-tight">
        Entrar na sua conta
      </h1>
      <FormularioLogin />
    </div>
  );
}
