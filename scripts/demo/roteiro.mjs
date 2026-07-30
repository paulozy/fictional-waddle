/**
 * Roteiro do vídeo de demonstração: o que é dito, em que ordem e por quanto
 * tempo. Separado de `gravar.mjs` para o texto ser revisável sem ler mecânica de
 * browser.
 *
 * As legendas afirmam só o que o produto faz hoje. "Sem baixar app" é o
 * diferencial contra Booksy/Trinks e é verdade; o que NÃO pode entrar aqui é
 * promessa de redução de falta em número (a base é evidência de saúde, não de
 * barbearia) nem qualquer menção a IA — o fluxo é menu numerado, e isso é
 * virtude, não limitação a esconder.
 */

/** Milissegundos que cada fala fica no ar antes da próxima aparecer. */
export const RITMO = {
  /** Fala do cliente: curta, lida num relance. */
  cliente: 900,
  /** Fala do bot: é um menu, precisa de tempo para ser lido. */
  bot: 2600,
  /** Respiro antes de trocar de cena. */
  cena: 1600,
};

export const LEGENDAS = {
  abertura: "Seu cliente manda mensagem enquanto você atende outro.",
  conversa: "O bot responde no seu próprio número e mostra os horários livres.",
  semApp: "Sem baixar aplicativo. Sem esperar você responder.",
  agenda: "Do seu lado, o horário já está na agenda.",
  fechamento: "Encaixaria · R$ 49,90 por mês · 14 dias grátis",
};

/**
 * As datas da conversa em `components/conversa-demo.tsx` são fixas ("sex 15/08")
 * porque a landing é estática. No vídeo elas são reescritas para as datas que o
 * seed realmente gravou, senão a conversa marca um dia e a agenda mostra outro.
 *
 * Os dois rótulos originais viram o MESMO dia: o seed deixa 09:00 e 10:30 livres
 * e 14:00 ocupado, todos no dia em destaque.
 */
export const DATAS_ORIGINAIS = ["qui 14/08", "sex 15/08"];
