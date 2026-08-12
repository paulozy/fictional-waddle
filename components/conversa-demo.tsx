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
 *
 * **O corpo é `text-sm` (14px) e não pode encolher.** Estava em 13px, e esta é a
 * peça que a landing pede para o visitante ler primeiro — medido a 375px, era o
 * menor texto da primeira dobra. 14px é também o **teto**: as linhas de menu
 * ("1. Corte masculino (30 min) — R$ 60,00") são as mais largas do produto e a
 * 15px passam a quebrar na bolha, o que faz o menu numerado parecer desalinhado.
 * O `max-w-[92%]` abaixo de `sm` compra a folga que 14px exige.
 */

/**
 * `aviso` e `retomada` não são falas: são as duas linhas de estado que o produto
 * gera sozinho (o bot pausou, o bot voltou). Ficam no mesmo tipo porque
 * atravessam a mesma lista, e a bolha as desenha como pílula centralizada — o
 * idioma que o WhatsApp já usa para "mensagens temporárias ativadas".
 */
type Fala = {
  de: "bot" | "cliente" | "dono" | "aviso" | "retomada";
  texto: string;
};

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

/**
 * A mesma conversa vista do outro lado: o dono assumindo o atendimento.
 *
 * **Esta não é transcrição, e a diferença importa.** As falas do dono e da
 * cliente são exemplo — o que o produto de fato produz aqui são as duas pílulas
 * de estado e a mensagem de retomada do bot. Por isso a legenda que acompanha
 * esta peça na página não repete a afirmação de "conversa real" que a
 * `ConversaDemo` sustenta.
 *
 * O cabeçalho mostra a **cliente**, não o estabelecimento: o ponto da seção é
 * que o dono está do lado de dentro da conversa, respondendo do WhatsApp dele.
 */
const PAUSA: Fala[] = [
  {
    de: "cliente",
    texto:
      "oi, fiz luzes com vocês semana passada e ficou puxando pro amarelo, dá pra corrigir?",
  },
  { de: "aviso", texto: "Bot pausado · volta às 16:40" },
  {
    de: "dono",
    texto:
      "Oi Joana, aqui é o Nino. Dá sim — passa aqui quinta que eu ajusto sem custo.",
  },
  { de: "cliente", texto: "ah que ótimo, obrigada!" },
  { de: "retomada", texto: "Bot reativado automaticamente" },
  /**
   * A primeira linha é literal: é `AVISO_RETOMADA` em
   * `lib/bot/engine-fluxo.ts`. O que vem depois é a etapa em que a conversa
   * estava sendo reapresentada — aqui a primeira, porque esta cliente escreveu
   * sobre um problema e não estava no meio de um agendamento.
   */
  {
    de: "bot",
    texto:
      "Voltei ao atendimento automático. Vamos continuar de onde paramos:\n\n" +
      "Qual serviço você gostaria de agendar?\n\n" +
      "1. Corte masculino (30 min) — R$ 60,00\n" +
      "2. Corte + barba (45 min) — R$ 90,00\n" +
      "3. Barba (15 min) — R$ 35,00",
  },
];

/**
 * Estilo por autor.
 *
 * `dono` usa `bg-confirmado` e não `bg-accent`: a bolha dele fica do mesmo lado
 * da tela que a do bot (as duas saem do estabelecimento) e, sem cor própria, as
 * falas do dono e do bot se tornariam indistinguíveis — que é justamente a
 * confusão que a seção existe para desfazer.
 */
const ESTILO: Record<Fala["de"], string> = {
  cliente: "self-end bg-accent text-accent-foreground",
  bot: "self-start bg-muted text-foreground",
  dono: "self-start bg-confirmado text-confirmado-tinta",
  aviso:
    "self-center border border-aviso-suave bg-aviso-suave text-center text-aviso",
  retomada:
    "self-center border border-confirmado-borda bg-confirmado text-center text-confirmado-tinta",
};

function Janela({
  titulo,
  legenda,
  inicial,
  falas,
  rotulo,
}: {
  titulo: string;
  legenda: string;
  inicial: string;
  falas: Fala[];
  rotulo: string;
}) {
  return (
    <div
      className="mx-auto w-full max-w-sm rounded-xl border border-border bg-card p-3 shadow-sm"
      role="img"
      aria-label={rotulo}
    >
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <span
          aria-hidden
          className="grid size-8 place-items-center rounded-full bg-primary font-heading text-sm font-semibold text-primary-foreground"
        >
          {inicial}
        </span>
        <div className="leading-tight">
          <p className="text-sm font-medium">{titulo}</p>
          <p className="text-xs text-muted-foreground">{legenda}</p>
        </div>
      </div>

      <div aria-hidden className="flex flex-col gap-2 pt-3">
        {falas.map((fala, i) => (
          <p
            key={i}
            className={`max-w-[92%] whitespace-pre-line rounded-lg px-3 py-2 text-sm leading-relaxed sm:max-w-[85%] ${ESTILO[fala.de]}`}
          >
            {fala.texto}
          </p>
        ))}
      </div>
    </div>
  );
}

export function ConversaDemo() {
  return (
    <Janela
      titulo="Barbearia do Nino"
      legenda="online"
      inicial="B"
      falas={CONVERSA}
      rotulo="Exemplo de conversa: o cliente pede um horário, o bot lista os serviços numerados, o cliente responde com um número, o bot lista os horários livres com a opção de escolher outro dia, o cliente escolhe, o bot mostra um resumo para conferência e confirma o agendamento depois do cliente aceitar."
    />
  );
}

export function ConversaPausa() {
  return (
    <Janela
      titulo="Joana Ribeiro"
      legenda="cliente"
      inicial="J"
      falas={PAUSA}
      rotulo="Exemplo de atendimento humano: a cliente escreve sobre um problema no serviço, o bot é pausado naquela conversa, o dono responde pelo WhatsApp dele, e quando o prazo termina o bot volta a atender oferecendo um menu numerado."
    />
  );
}
