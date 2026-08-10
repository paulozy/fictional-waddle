/**
 * Tradução dos erros de autenticação do Supabase, que vêm em inglês e crus.
 *
 * Módulo próprio, e não uma função dentro de `actions.ts`, por dois motivos: um
 * arquivo `"use server"` só pode exportar funções async, então uma função pura
 * ali não é testável; e o mapa é a parte que erra em silêncio — um código não
 * tratado não quebra nada, só produz a frase errada na frente de quem está
 * tentando criar conta.
 */

/**
 * Como pedir ajuda, quando a saída depende de nós.
 *
 * Sem `WHATSAPP_CONTATO` a frase some em vez de virar um "fale com o suporte" sem
 * endereço — é o mesmo critério do `components/banner-assinatura.tsx`, que também
 * fica sem botão quando a variável não existe.
 */
function convite(): string {
  const numero = process.env.WHATSAPP_CONTATO?.replace(/\D/g, "");
  return numero
    ? `Fale com a gente no WhatsApp https://wa.me/${numero} que liberamos o acesso na hora.`
    : "Fale com a gente que liberamos o acesso na hora.";
}

/**
 * O caso `user_already_exists` só aparece com confirmação de e-mail
 * **desligada**: com ela ligada o Supabase devolve sucesso falso justamente para
 * não confirmar a existência da conta a quem está sondando. Ou seja, em produção
 * este galho não vaza nada — e no local ele evita que o dev fique olhando um
 * "erro inesperado" enquanto o motivo é conta repetida.
 */
export function mensagemDeCadastro(codigo: string | undefined): string {
  switch (codigo) {
    case "user_already_exists":
    case "email_exists":
      return "Este e-mail já tem conta. Entre, ou use “Esqueci a senha”.";
    case "weak_password":
      return "Senha fraca demais. Use pelo menos 8 caracteres e evite sequências óbvias.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Muitas tentativas em pouco tempo. Espere um minuto e tente de novo.";
    case "email_address_invalid":
      return "Este endereço de e-mail não foi aceito. Confira a digitação.";
    /**
     * **A conta foi criada e o e-mail não saiu.** Este galho existe por um caso
     * real em produção: o SMTP do projeto respondeu `535 "Authentication
     * credentials invalid"` (credencial de envio inválida, RFC 4954 §6), o
     * Supabase registrou `user_confirmation_requested` com o usuário **já
     * gravado** e devolveu 500 com `error_code: unexpected_failure`.
     *
     * Sem tratamento próprio, isto caía no "tente de novo em instantes" — que é a
     * pior orientação possível aqui. A conta existe e está **não confirmada**:
     * tentar de novo não cria nada, entrar não funciona, e com a confirmação
     * ligada o Supabase passa a responder de forma obfuscada, mandando o dono
     * para a tela "confirme seu e-mail" a esperar por um e-mail que nunca foi
     * enviado. É falha nossa, e a mensagem tem de dizer isso e dar uma saída
     * humana.
     */
    case "unexpected_failure":
      return `Sua conta foi criada, mas o e-mail de confirmação não saiu — é uma falha nossa, não sua. ${convite()}`;
    default:
      return "Não foi possível criar a conta agora. Tente de novo em instantes.";
  }
}

/** Verdadeiro quando o erro do `signUp` provavelmente já deixou a conta gravada. */
export function contaTalvezCriada(codigo: string | undefined): boolean {
  return codigo === "unexpected_failure";
}
