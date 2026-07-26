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
