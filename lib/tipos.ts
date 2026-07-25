/**
 * Tipos compartilhados entre servidor e cliente.
 *
 * Existe para que Client Components não precisem importar de módulos marcados
 * com `server-only`. Um `import type` de módulo server-only compila hoje (o tipo
 * é apagado), mas basta alguém passar a usar um valor do mesmo arquivo para o
 * build cair com um erro confuso.
 */

/** Estado da instância WhatsApp do estabelecimento. */
export type EstadoConexao = "conectado" | "desconectado" | "conectando";
