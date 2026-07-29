/**
 * A conversa que o cliente final tem com o bot.
 *
 * É a peça central da landing, e é uma **transcrição**, não uma ilustração:
 * cada fala aqui é o texto que `lib/bot/engine-fluxo.ts` realmente envia, com o
 * mesmo menu numerado e o mesmo formato de horário. Um mock inventado venderia
 * um produto que não existe, e o primeiro piloto descobriria a diferença.
 *
 * Mostrado do lado do **cliente final**, não do dono: é o que prova o
 * diferencial de não precisar instalar nada.
 */

type Fala = { de: "bot" | "cliente"; texto: string };

const CONVERSA: Fala[] = [
  { de: "cliente", texto: "oi, queria marcar um horário" },
  {
    de: "bot",
    texto:
      "Olá! Qual serviço você gostaria de agendar?\n\n" +
      "1. Corte masculino (30 min) — R$ 60,00\n" +
      "2. Corte + barba (45 min) — R$ 90,00\n" +
      "3. Barba (15 min) — R$ 35,00\n\n" +
      "Responda com o número da opção.",
  },
  { de: "cliente", texto: "2" },
  {
    de: "bot",
    texto:
      "Estes são os horários livres. Qual deles fica melhor para você?\n\n" +
      "1. qui 14/08 09:00\n" +
      "2. qui 14/08 10:30\n" +
      "3. sex 15/08 14:00\n" +
      // A última posição é a saída para quem não pode em nenhum dos horários
      // próximos. Sem ela a etapa era um laço fechado.
      "4. Quero escolher outro dia\n\n" +
      "Responda com o número da opção.",
  },
  { de: "cliente", texto: "3" },
  /**
   * A etapa `confirmacao` é obrigatória e vinha faltando aqui.
   *
   * O fluxo semeado no banco é `servico → horario → confirmacao`
   * (`supabase/migrations/*_trigger_novo_usuario.sql`), e a engine só grava o
   * agendamento depois do "1" desta etapa (`engine-fluxo.ts`, ramo
   * `case "confirmacao"`). A demo pulava do horário direto para o "confirmado",
   * omitindo uma pergunta inteira — e a landing e `/como-funciona` afirmam que
   * esta transcrição é literal.
   */
  {
    de: "bot",
    texto:
      "Confira os dados do seu agendamento:\n\n" +
      "Serviço: Corte + barba\n" +
      "Quando: sex 15/08 14:00\n\n" +
      "1. Confirmar\n" +
      "2. Cancelar",
  },
  { de: "cliente", texto: "1" },
  {
    de: "bot",
    texto:
      "Agendamento confirmado! ✅\n\n" +
      "Corte + barba\n" +
      "sex 15/08 14:00\n\n" +
      "Um dia antes eu te mando um lembrete. Até lá!",
  },
];

export function ConversaDemo() {
  return (
    <div
      className="mx-auto w-full max-w-sm rounded-xl border border-border bg-card p-3 shadow-sm"
      role="img"
      aria-label="Exemplo de conversa: o cliente pede um horário, o bot lista os serviços numerados, o cliente responde com um número, o bot lista os horários livres com a opção de escolher outro dia, o cliente escolhe, o bot mostra um resumo para conferência e confirma o agendamento depois do cliente aceitar."
    >
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <span
          aria-hidden
          className="grid size-8 place-items-center rounded-full bg-primary font-heading text-sm font-semibold text-primary-foreground"
        >
          B
        </span>
        <div className="leading-tight">
          <p className="text-sm font-medium">Barbearia do Nino</p>
          <p className="text-xs text-muted-foreground">online</p>
        </div>
      </div>

      <div aria-hidden className="flex flex-col gap-2 pt-3">
        {CONVERSA.map((fala, i) => (
          <p
            key={i}
            className={`max-w-[85%] whitespace-pre-line rounded-lg px-3 py-2 text-[13px] leading-snug ${
              fala.de === "cliente"
                ? "self-end bg-accent text-accent-foreground"
                : "self-start bg-muted text-foreground"
            }`}
          >
            {fala.texto}
          </p>
        ))}
      </div>
    </div>
  );
}
