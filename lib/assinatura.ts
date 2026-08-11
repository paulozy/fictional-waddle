/**
 * Fonte única de verdade para "a assinatura deste tenant está válida?".
 *
 * Função pura, sem Supabase e sem rede, porque os três consumidores leem o
 * perfil por caminhos diferentes: o layout do dashboard usa o client que
 * respeita RLS, o webhook e o cron usam o client admin. Só a regra é comum.
 *
 * `trial_expira_em` é `timestamptz`, então a comparação direta com um `Date` é
 * tz-safe. Diferente do resto do produto, isto **não** depende de
 * `perfis.fuso_horario`: fuso só importa para hora de parede
 * (`horarios_disponiveis`), não para um instante absoluto.
 */

export type PerfilAssinatura = {
  status_assinatura: string;
  trial_expira_em: string | null;
  /**
   * Preenchido quando este perfil pareou um número de WhatsApp que já havia
   * consumido trial em outra conta — a defesa contra reciclar o teste com um
   * e-mail novo. Obrigatório no tipo, e não opcional, de propósito: assim o
   * TypeScript quebra em todo `select` que esquecer a coluna, em vez de deixar
   * um dos três gates silenciosamente cego.
   */
  trial_bloqueado_em: string | null;
};

/**
 * Regras:
 * - `ativo`     → válido (mesmo com o trial já vencido, e mesmo bloqueado)
 * - `cancelado` → bloqueado (mesmo com trial no prazo)
 * - `trial`     → válido se `trial_expira_em` é nulo (isenção/VIP manual);
 *                 senão bloqueado se `trial_bloqueado_em` está preenchido;
 *                 senão válido enquanto estiver no prazo
 * - perfil ausente ou status desconhecido → bloqueado (fail-safe)
 *
 * O default é bloquear, e não liberar, porque a falha silenciosa aceitável aqui
 * é "cliente reclama que parou" — não "todo mundo usa de graça sem ninguém ver".
 *
 * Os dois sinais manuais vencem o bloqueio automático de número: `ativo` porque
 * um cliente que pagou nunca pode ser barrado por já ter testado antes, e o
 * `trial_expira_em` nulo porque esse valor só é gravado à mão, como isenção
 * explícita.
 *
 * Atenção: nenhum dos dois é o conserto de um falso-positivo — `ativo` marca
 * como pagante quem não é, e o nulo dá isenção permanente. Zerar
 * `trial_bloqueado_em` também não basta sozinho: a reivindicação regrava na
 * próxima reconexão enquanto a linha do livro-caixa existir. O runbook correto
 * (apagar a linha e só então limpar a coluna) está na seção "Um trial por número
 * de WhatsApp" do CLAUDE.md.
 */
export function assinaturaValida(
  perfil: PerfilAssinatura | null | undefined,
  agora: Date,
): boolean {
  if (!perfil) return false;

  switch (perfil.status_assinatura) {
    case "ativo":
      return true;
    case "cancelado":
      return false;
    case "trial":
      if (!perfil.trial_expira_em) return true;
      if (perfil.trial_bloqueado_em) return false;
      return agora < new Date(perfil.trial_expira_em);
    default:
      return false;
  }
}

export type MotivoBloqueio =
  | "trial_expirado"
  | "cancelado"
  | "numero_ja_usou_trial"
  | null;

/**
 * Motivo do bloqueio, para escolher o texto do banner. `null` quando a
 * assinatura é válida e não há nada a exibir.
 */
export function motivoBloqueio(
  perfil: PerfilAssinatura | null | undefined,
  agora: Date,
): MotivoBloqueio {
  if (assinaturaValida(perfil, agora)) return null;
  if (perfil?.status_assinatura === "cancelado") return "cancelado";
  /**
   * Vem antes de `trial_expirado` porque é mais informativo quando os dois
   * valem: o dono bloqueado por número no primeiro dia não entenderia "seu
   * teste terminou", e é justamente ele que precisa nos procurar se o caso for
   * legítimo. Reusar `trial_expirado` (ou forçar `trial_expira_em = now()`)
   * economizaria código ao custo de mentir no modelo.
   */
  if (perfil?.trial_bloqueado_em) return "numero_ja_usou_trial";
  // Trial expirado, perfil ausente e status desconhecido caem todos aqui: para
  // o dono, a ação é a mesma (assinar), e os dois últimos não deveriam existir.
  return "trial_expirado";
}

/**
 * Link para combinar a assinatura pelo WhatsApp.
 *
 * Não há gateway de pagamento nesta fase: o `status_assinatura` é virado à mão
 * no banco. O CTA então leva o dono a falar com a gente, que é onde a
 * assinatura é combinada de fato.
 *
 * Devolve `null` sem a env var, e quem chama some com o botão — o aviso
 * continua aparecendo, porque a informação de que o bot parou vale por si.
 *
 * **Só pode ser chamada no servidor.** `WHATSAPP_CONTATO` não tem prefixo
 * `NEXT_PUBLIC_`, então num bundle de cliente ela devolveria `null` em
 * silêncio, e o botão sumiria sem ninguém entender por quê.
 */
export type IntencaoContato = "assinar" | "upgrade";

/**
 * A mensagem já vem escrita porque ela é a primeira coisa que **nós** lemos.
 *
 * Sem gateway, cada troca de plano é uma conversa manual, e a diferença entre
 * "quero assinar" e "quero subir para o Garantido" decide o que respondemos. Um
 * texto genérico obrigaria uma pergunta de ida e volta antes de qualquer coisa
 * acontecer.
 */
const TEXTO_CONTATO: Record<IntencaoContato, string> = {
  assinar: "Olá! Quero assinar um plano da Encaixaria.",
  upgrade: "Olá! Quero mudar para o plano Garantido, com cobrança de sinal.",
};

export function linkAssinatura(
  intencao: IntencaoContato = "assinar",
): string | null {
  const numero = process.env.WHATSAPP_CONTATO?.replace(/\D/g, "");
  if (!numero) return null;
  const texto = encodeURIComponent(TEXTO_CONTATO[intencao]);
  return `https://wa.me/${numero}?text=${texto}`;
}

export type ResumoAssinatura = {
  /** Linha principal do cartão de conta. */
  titulo: string;
  /** Linha de apoio: prazo e preço, ou o que fazer para voltar. */
  detalhe: string;
  /** Falso quando não há o que assinar (já ativo, ou isento). */
  ofereceAssinar: boolean;
};

/**
 * Descreve a assinatura para a tela de Conta.
 *
 * Separada de `motivoBloqueio` porque as duas respondem perguntas diferentes: o
 * banner do layout só aparece quando há problema, e este cartão precisa dizer
 * algo mesmo quando está tudo certo — inclusive quantos dias de teste restam,
 * que é a informação que o dono procura quando abre esta tela.
 *
 * `diasRestantes` arredonda para cima: faltando 30 horas, "1 dia restante"
 * subestima e "2 dias" superestima; para quem precisa decidir se assina hoje, o
 * arredondamento para cima é o que não cria surpresa.
 */
export function resumoAssinatura(
  perfil: PerfilAssinatura | null | undefined,
  agora: Date,
  precoMensal: string,
): ResumoAssinatura {
  const mensal = `R$ ${precoMensal} por mês, sem fidelidade.`;

  if (perfil?.status_assinatura === "ativo") {
    return {
      titulo: "Assinatura ativa",
      detalhe: mensal,
      ofereceAssinar: false,
    };
  }

  if (perfil?.status_assinatura === "trial" && perfil.trial_expira_em === null) {
    return {
      titulo: "Acesso liberado",
      detalhe: "Esta conta está isenta de cobrança.",
      ofereceAssinar: false,
    };
  }

  switch (motivoBloqueio(perfil, agora)) {
    case null: {
      const expira = new Date(perfil!.trial_expira_em!);
      const dias = Math.max(
        1,
        Math.ceil((expira.getTime() - agora.getTime()) / 86_400_000),
      );
      return {
        titulo: `Período de teste · ${dias === 1 ? "1 dia restante" : `${dias} dias restantes`}`,
        detalhe: `Termina em ${formatarDiaMes(expira)}. Depois disso, ${mensal}`,
        ofereceAssinar: true,
      };
    }
    case "cancelado":
      return {
        titulo: "Assinatura cancelada",
        detalhe: `O bot não está respondendo. Para reativar: ${mensal}`,
        ofereceAssinar: true,
      };
    case "numero_ja_usou_trial":
      return {
        titulo: "Teste indisponível para este número",
        detalhe: `Este número de WhatsApp já usou o período de teste em outra conta. Se houve engano, fale com a gente. Assinatura: ${mensal}`,
        ofereceAssinar: true,
      };
    default:
      return {
        titulo: "Período de teste encerrado",
        detalhe: `O bot parou de responder. Para voltar: ${mensal}`,
        ofereceAssinar: true,
      };
  }
}

/**
 * `"15/08"`. Sem fuso de propósito: `trial_expira_em` é um instante, e a
 * diferença de três horas só muda o dia exibido em quem expira de madrugada —
 * caso em que "termina em 15/08" e "em 14/08" são igualmente aproximados. Quem
 * decide de fato é `assinaturaValida`, que compara o instante.
 */
function formatarDiaMes(data: Date): string {
  const dia = String(data.getUTCDate()).padStart(2, "0");
  const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}`;
}
