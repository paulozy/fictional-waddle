import { z } from "zod";

/**
 * Fora de `actions.ts` de propósito: um arquivo `"use server"` só pode exportar
 * funções async, e um schema Zod é um objeto.
 */
export const credenciaisSchema = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido."),
  senha: z.string().min(8, "A senha precisa de pelo menos 8 caracteres."),
});

export type EstadoLogin = { erro: string } | undefined;

export function lerCredenciais(formData: FormData) {
  return credenciaisSchema.safeParse({
    email: formData.get("email"),
    senha: formData.get("senha"),
  });
}
