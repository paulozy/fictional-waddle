import { createHmac } from "node:crypto";

/**
 * Hash do número de WhatsApp que identifica um trial já consumido.
 *
 * O livro-caixa (`trials_numero_whatsapp`) guarda este valor, e nunca o número:
 * dado pessoal só é armazenado quando é necessário, e para responder "este
 * número já usou o teste?" basta comparar hashes (LGPD Art. 6º, III).
 *
 * HMAC com pepper, e não SHA-256 puro, porque o espaço de telefones brasileiros
 * é pequeno — na ordem de 10^11 combinações, varrível em minutos. Sem o segredo,
 * um hash puro seria reversível na prática. O pepper vive em env var e nunca no
 * banco, então um dump da tabela não revela número nenhum.
 *
 * Consequência: **trocar o pepper invalida o livro-caixa inteiro**, porque todos
 * os hashes gravados deixam de casar.
 *
 * O pepper entra por parâmetro em vez de ser lido de `process.env` aqui dentro
 * para a função ficar pura — quem decide o que fazer quando ele falta é o
 * chamador, e o teste não precisa mexer no ambiente.
 *
 * `numero` deve vir já normalizado (só dígitos), via
 * `normalizarIdentificadorJid` de `lib/bot/webhook-payload.ts`: `55119...` e
 * `55119...@s.whatsapp.net` precisam produzir o mesmo hash.
 */
export function hashNumeroWhatsapp(numero: string, pepper: string): string {
  return createHmac("sha256", pepper).update(numero).digest("hex");
}
