import { z } from "zod";
import { ehFusoConhecido } from "@/lib/fusos";
import { ehIdPlano, PLANO_PADRAO, type IdPlano } from "@/lib/plano";
import { normalizarNumeroWhatsApp } from "@/lib/telefone";

/**
 * Validação das telas de autenticação.
 *
 * Fora de `actions.ts` de propósito: um arquivo `"use server"` só pode exportar
 * funções async, e um schema Zod é um objeto.
 *
 * Tudo aqui roda **no servidor**, mesmo o que a UI já checa com `required` e
 * `minLength`. Atributo de HTML é conveniência para quem digita; um POST direto
 * ignora todos eles.
 */

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email("Informe um e-mail válido.");

/**
 * Oito caracteres é o piso do NIST SP 800-63B para segredo escolhido por
 * pessoa. Não há regra de composição (maiúscula, símbolo, dígito) porque a mesma
 * publicação recomenda **não** exigir isso: leva a `Senha@123` e a senha
 * anotada, não a senha forte.
 */
const senha = z.string().min(8, "A senha precisa de pelo menos 8 caracteres.");

export const credenciaisSchema = z.object({ email, senha });

export const emailSomenteSchema = z.object({ email });

export const novaSenhaSchema = z
  .object({ senha, confirmacao: z.string() })
  .refine((valores) => valores.senha === valores.confirmacao, {
    // O caminho importa: sem ele a mensagem se pendura no objeto e a UI não
    // sabe qual dos dois campos marcar.
    path: ["confirmacao"],
    message: "As duas senhas precisam ser iguais.",
  });

export const estabelecimentoSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, "Informe o nome do estabelecimento.")
    // O nome vai no texto que o bot manda ao cliente final; sem teto, uma
    // colagem acidental de parágrafo entra em toda mensagem.
    .max(80, "No máximo 80 caracteres."),
  fuso: z
    .string()
    .refine(ehFusoConhecido, "Escolha um fuso horário da lista."),
});

/**
 * A faixa escolhida no passo 2, num schema **separado** de
 * `estabelecimentoSchema`.
 *
 * Não é organização: `lerEstabelecimento` é reusado por
 * `app/(dashboard)/conta/actions.ts`, que edita nome e fuso e **não** manda
 * `plano`. Um campo obrigatório lá quebraria a tela de Conta em silêncio — ela
 * não tem teste — e um campo opcional abriria uma segunda porta para o mesmo
 * privilégio, num formulário que nunca deveria tocá-lo.
 *
 * `catch` e não `optional`: o campo ausente **e** o campo com lixo caem os dois
 * no Essencial, que é o default da coluna no banco. Um POST direto sem o campo
 * não deve virar erro de formulário, e não deve virar capacidade.
 */
export const planoSchema = z
  .string()
  .refine(ehIdPlano, "Escolha um dos planos.")
  .catch(PLANO_PADRAO);

export type EstadoAuth = { erro?: string; aviso?: string } | undefined;

export function lerCredenciais(formData: FormData) {
  return credenciaisSchema.safeParse({
    email: formData.get("email"),
    senha: formData.get("senha"),
  });
}

export function lerEmail(formData: FormData) {
  return emailSomenteSchema.safeParse({ email: formData.get("email") });
}

export function lerNovaSenha(formData: FormData) {
  return novaSenhaSchema.safeParse({
    senha: formData.get("senha"),
    confirmacao: formData.get("confirmacao"),
  });
}

export function lerEstabelecimento(formData: FormData) {
  return estabelecimentoSchema.safeParse({
    nome: formData.get("nome"),
    fuso: formData.get("fuso"),
  });
}

/**
 * Devolve sempre um `IdPlano`, nunca um resultado a destrinchar.
 *
 * É o `catch` de `planoSchema` que garante isso, e é o que permite chamar esta
 * função sem tratar erro: a escolha de faixa não pode reprovar um cadastro. Se o
 * valor não fizer sentido, o dono termina no Essencial e resolve por mensagem —
 * o mesmo caminho de quem quer trocar depois.
 */
export function lerPlano(formData: FormData): IdPlano {
  return planoSchema.parse(formData.get("plano"));
}

/**
 * O número do dono não usa Zod: quem sabe normalizar `(11) 99999-8888` para
 * `5511999998888` é `lib/telefone.ts`, que já existe, é puro e é testado.
 * Envolver aquilo num schema só acrescentaria uma segunda fonte de mensagem de
 * erro para o mesmo problema.
 */
export function lerTelefone(formData: FormData) {
  return normalizarNumeroWhatsApp(String(formData.get("numero") ?? ""));
}
