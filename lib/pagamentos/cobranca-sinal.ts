import "server-only";

import { envObrigatoria } from "@/lib/config";
import {
  montarTextoCobrancaSinal,
  montarTextoCodigoPix,
} from "@/lib/bot/mensagens-pagamento";
import {
  cobrancaSinalHabilitada,
  sinalEmCentavos,
  type PerfilCobranca,
} from "@/lib/pagamentos/capacidade";
import { obterCredencial } from "@/lib/pagamentos/credenciais";
import { criarPagamentoPix } from "@/lib/pagamentos/mercado-pago";
import type { criarClienteAdmin } from "@/lib/supabase/admin";

type ClienteAdmin = ReturnType<typeof criarClienteAdmin>;

export type PerfilParaCobranca = PerfilCobranca & {
  id: string;
  fuso_horario: string;
  sinal_minutos_validade: number;
};

/**
 * Hosts que só existem dentro da máquina ou da rede local.
 *
 * `localhost`, loopback, link-local e os três blocos privados da RFC 1918 —
 * `10/8`, `172.16/12` (que é onde vive o gateway das redes bridge do Docker) e
 * `192.168/16`.
 */
const HOST_PRIVADO =
  /^(localhost$|127\.|0\.0\.0\.0$|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/i;

/**
 * Endereço PÚBLICO deste app — o que vai para o Mercado Pago.
 *
 * Variável própria, e não a `WEBHOOK_BASE_URL`, porque as duas têm exigências
 * **opostas** e por um tempo compartilharam o mesmo valor:
 *
 *  - `WEBHOOK_BASE_URL` é onde a **Evolution API** alcança este app. Com a
 *    Evolution em container na mesma máquina, o valor certo é o gateway da rede
 *    dela (`172.20.0.1:3000`) — privado de propósito, e melhor assim: o bot não
 *    passa a depender de um túnel de desenvolvimento para responder.
 *  - `APP_PUBLIC_URL` é onde os **servidores do Mercado Pago** alcançam este
 *    app. Tem de ser roteável da internet.
 *
 * Uma variável servindo os dois significa que consertar um lado quebra o outro,
 * em silêncio — foi o que aconteceu: com a `WEBHOOK_BASE_URL` apontada para o
 * gateway do Docker (o valor correto para a Evolution), todo Pix saiu com uma
 * `notification_url` que o MP não tem como chamar.
 *
 * Cai para `WEBHOOK_BASE_URL` quando `APP_PUBLIC_URL` não existe, para não
 * quebrar ambiente já configurado (em produção as duas são a mesma URL pública).
 */
function basePublica(): string {
  const publica = process.env.APP_PUBLIC_URL?.trim();
  const base = publica || envObrigatoria("WEBHOOK_BASE_URL");
  return base.replace(/\/+$/, "");
}

/**
 * Caminho do webhook que o MP vai chamar quando o pagamento mudar.
 *
 * **Lança quando o endereço não é alcançável de fora, e isso é falha fechada de
 * propósito** — mesmo raciocínio da guarda de `collector_id` mais abaixo. As duas
 * alternativas são ruins, mas em graus muito diferentes:
 *
 *  - recusar a cobrança custa **um agendamento sem sinal**, e o horário fica de
 *    pé (é a política do módulo: falhar ao cobrar não derruba agendamento);
 *  - emitir com URL inalcançável custa **o dinheiro do cliente**: ele paga, a
 *    confirmação nunca chega, a varredura de holds vencidos cancela o
 *    agendamento — e como o webhook nunca rodou, nem `estorno_pendente` é
 *    levantado. Ninguém fica sabendo que há um Pix para devolver.
 *
 * Quem chama é `cobrarSinal`, cuja exceção o webhook engole em
 * `console.error("falha ao cobrar sinal")` — então o efeito prático é um log
 * explícito no lugar de um cliente lesado em silêncio.
 */
export function urlDeNotificacao(): string {
  const base = basePublica();
  const host = (() => {
    try {
      return new URL(base).hostname;
    } catch {
      return "";
    }
  })();

  if (!host || HOST_PRIVADO.test(host)) {
    throw new Error(
      `APP_PUBLIC_URL precisa ser um endereço público — recebido "${base}". ` +
        "Os servidores do Mercado Pago não alcançam localhost nem IP de rede privada. " +
        "Em desenvolvimento, use a URL do túnel (ngrok/cloudflared) apontando " +
        "para a porta do app; não reaproveite a WEBHOOK_BASE_URL, que é o " +
        "endereço da Evolution API e pode ser privado.",
    );
  }

  return `${base}/api/webhook/pagamento/mercadopago`;
}

/**
 * Emite o Pix de sinal para um agendamento recém-criado e devolve as mensagens.
 *
 * `null` significa "este agendamento não leva sinal" — que é o caminho da imensa
 * maioria: tenant sem a capacidade, serviço sem valor configurado, ou conta do
 * PSP desconectada.
 *
 * **É chamada DEPOIS de o agendamento existir e estar confirmado**, nunca antes.
 * O horário já está bloqueado pela constraint desde a criação, então o cliente
 * não perde a vaga enquanto vai pagar — e não existe "reserva pendente" disputando
 * o slot com a EXCLUDE, que é o desenho que a migration de cancelamento
 * argumentou contra.
 *
 * ## Falha aqui NÃO derruba o agendamento
 *
 * Toda exceção é engolida pelo chamador e o horário fica de pé sem sinal. É
 * fail-open deliberado, e a direção é oposta à do gate de assinatura: lá a falha
 * aceitável é "cliente reclama que parou"; aqui é "o dono não recebeu o sinal
 * desta vez". Cancelar um agendamento real porque o MP estava fora do ar seria
 * punir o cliente por um problema que não é dele — e o produto existe justamente
 * para não perder agendamento.
 */
export async function cobrarSinal(dados: {
  admin: ClienteAdmin;
  perfil: PerfilParaCobranca;
  agendamentoId: string;
  servicoId: string;
  servicoNome: string;
  /** Horário do agendamento, em ISO — alimenta o `{quando}` do modelo do dono. */
  dataHora: string;
}): Promise<string[] | null> {
  const { admin, perfil } = dados;

  if (!cobrancaSinalHabilitada(perfil)) return null;

  /**
   * Valor do serviço e texto personalizado do dono, em paralelo.
   *
   * Duas leituras num `Promise.all` e não em sequência: nenhuma depende da outra,
   * e este é o caminho quente de toda mensagem que fecha agendamento. A do modelo
   * pode voltar vazia — ausência de linha significa "usa o padrão".
   */
  const [{ data: servico }, { data: modelo }] = await Promise.all([
    admin
      .from("servicos")
      .select("valor_sinal")
      // A service role ignora RLS: este filtro é a única barreira entre tenants.
      .eq("usuario_id", perfil.id)
      .eq("id", dados.servicoId)
      .maybeSingle(),
    admin
      .from("mensagens_tenant")
      .select("texto")
      .eq("usuario_id", perfil.id)
      .eq("chave", "sinal_cobranca")
      .maybeSingle(),
  ]);

  const valorCentavos = sinalEmCentavos(servico?.valor_sinal);
  if (valorCentavos === null) return null;

  const credencial = await obterCredencial(admin, perfil.id);
  if (!credencial) {
    // `pagamento_conectado_em` dizia que havia conexão e não há: o dono
    // desautorizou a aplicação no painel do MP, e o carimbo ficou para trás.
    console.error("cobrança de sinal sem credencial", { usuario_id: perfil.id });
    return null;
  }

  /**
   * O id da cobrança é sorteado ANTES de falar com o MP, e serve a três papéis
   * de uma vez: PK da nossa linha, `external_reference` na notificação e
   * **chave de idempotência**. Sem um id estável decidido por nós, uma
   * retentativa de rede criaria uma segunda cobrança para o mesmo agendamento —
   * e o cliente poderia pagar as duas.
   */
  const cobrancaId = crypto.randomUUID();
  const expiraEm = new Date(
    Date.now() + perfil.sinal_minutos_validade * 60_000,
  );

  const pix = await criarPagamentoPix({
    accessToken: credencial.accessToken,
    valorCentavos,
    descricao: `Sinal — ${dados.servicoNome}`,
    referenciaExterna: cobrancaId,
    expiraEm,
    urlNotificacao: urlDeNotificacao(),
    chaveIdempotencia: cobrancaId,
  });

  /**
   * O dinheiro tem de ir para o dono, e isto é o que verifica.
   *
   * `collector_id` é o dono das credenciais por construção, então divergir aqui
   * significa que o token guardado é de outra conta — troca de credencial, bug
   * de cifra, linha adulterada. Mandar o código assim mesmo seria dinheiro do
   * cliente indo para o lugar errado, com falha silenciosa do nosso lado: o
   * cliente pagaria, alguém receberia, e o dono cobraria o salão.
   */
  if (pix.collectorId !== credencial.contaExternaId) {
    /**
     * Falha FECHADA, inclusive quando o campo não veio.
     *
     * A versão anterior era `if (pix.collectorId && ...)`, e com isso uma
     * resposta sem `collector_id` desligava a verificação em silêncio — uma
     * guarda descrita como "o dinheiro tem de ir para o dono" que se desativa
     * sozinha justamente no caso em que não dá para saber para onde ele vai.
     * Não mandar o código custa um agendamento sem sinal; mandar custa o
     * dinheiro do cliente na conta errada.
     */
    console.error("collector_id divergente na cobrança de sinal", {
      usuario_id: perfil.id,
      esperado: credencial.contaExternaId,
      recebido: pix.collectorId ?? "(ausente)",
    });
    return null;
  }

  const { error: erroCobranca } = await admin.from("cobrancas_sinal").insert({
    id: cobrancaId,
    usuario_id: perfil.id,
    agendamento_id: dados.agendamentoId,
    provedor_pagamento_id: pix.pagamentoId,
    valor_centavos: valorCentavos,
    qr_code: pix.copiaECola,
    expira_em: expiraEm.toISOString(),
  });

  if (erroCobranca) throw erroCobranca;

  /**
   * O agendamento passa a exigir sinal DEPOIS de a cobrança existir.
   *
   * A ordem inversa abriria a janela pior: agendamento marcado como
   * `aguardando`, sem cobrança nenhuma, seria cancelado pela varredura ao fim do
   * prazo — o cliente perderia o horário sem nunca ter recebido um código para
   * pagar.
   */
  const { error: erroAgendamento } = await admin
    .from("agendamentos")
    .update({
      sinal_status: "aguardando",
      sinal_expira_em: expiraEm.toISOString(),
    })
    .eq("usuario_id", perfil.id)
    .eq("id", dados.agendamentoId);

  if (erroAgendamento) throw erroAgendamento;

  return [
    montarTextoCobrancaSinal({
      valorCentavos,
      expiraEm,
      fusoHorario: perfil.fuso_horario,
      servicoNome: dados.servicoNome,
      dataHora: dados.dataHora,
      modelo: modelo?.texto,
      politica: perfil.politica_sinal ?? "",
    }),
    // Sozinho na mensagem: o cliente segura para copiar, e qualquer texto em
    // volta entra na cópia e faz o banco recusar o código.
    montarTextoCodigoPix(pix.copiaECola),
  ];
}
