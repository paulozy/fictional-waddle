"use server";

import { revalidatePath } from "next/cache";
import {
  ErroEvolutionApi,
  configurarWebhook,
  criarInstancia,
  desconectarInstancia,
  obterEstadoConexao,
  obterQrCode,
  type EstadoConexao,
} from "@/lib/evolution-api";
import { criarClienteServidor, exigirUsuario } from "@/lib/supabase/server";

export type ResultadoQrCode = {
  qrCodeBase64: string | null;
  codigoPareamento: string | null;
  erro: string | null;
  /** Quantas vezes a Evolution já regerou o QR nesta sessão. Ver `obterQrCode`. */
  regeracoes: number | null;
  /** Verdadeiro quando a instância precisou ser criada — o caminho lento. */
  instanciaCriada: boolean;
};

/** O nome da instância é sempre o usuario_id — mapeamento direto no webhook. */
async function nomeDaInstancia(): Promise<string> {
  return exigirUsuario();
}

function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ErroEvolutionApi) {
    // Sem log, um 4xx/5xx da Evolution vira mensagem genérica e ninguém
    // descobre a causa.
    console.error("conexao-whatsapp: Evolution API recusou", {
      status: erro.status,
      licencaAusente: erro.licencaAusente,
      corpo: erro.corpo,
    });

    return erro.licencaAusente
      ? "O servidor da Evolution API está sem licença ativa. Verifique a versão instalada (a V0 usa a 2.3.7)."
      : `Não foi possível falar com o servidor de WhatsApp (HTTP ${erro.status}). Tente de novo em instantes.`;
  }

  // Este galho pega env var ausente, timeout de fetch, URL malformada. Engolir
  // a exceção aqui deixava o dono com "erro inesperado" e nada no log.
  console.error("conexao-whatsapp: falha inesperada", erro);

  const detalhe =
    erro instanceof Error ? `${erro.name}: ${erro.message}` : String(erro);

  return `Erro inesperado ao preparar a conexão — ${detalhe}`;
}

/** Espera bruta pelo `close` depois do logout. Medido: chega em ~2s. */
const TENTATIVAS_ESPERAR_CLOSE = 8;
const INTERVALO_ESPERAR_CLOSE_MS = 500;

/**
 * Derruba a sessão atual e espera a instância chegar em `close`.
 *
 * A espera não é paranoia: o `close` é **assíncrono** ao 200 do logout, e pedir
 * o QR antes dele devolve o código em cache — que é o bug que este caminho
 * existe para consertar. Sai calada em qualquer falha (404 é primeiro acesso;
 * o resto quem trata é o `obterQrCode` logo em seguida, com mensagem própria).
 */
async function reiniciarSessao(instancia: string): Promise<void> {
  try {
    await desconectarInstancia(instancia);
  } catch (erro) {
    if (!(erro instanceof ErroEvolutionApi && erro.status === 404)) {
      console.error("conexao-whatsapp: logout falhou", erro);
    }
    return;
  }

  for (let i = 0; i < TENTATIVAS_ESPERAR_CLOSE; i += 1) {
    await new Promise((r) => setTimeout(r, INTERVALO_ESPERAR_CLOSE_MS));
    try {
      if ((await obterEstadoConexao(instancia)) !== "conectado") return;
    } catch {
      return;
    }
  }
}

/**
 * Devolve um QR code para pareamento, criando a instância se ela ainda não
 * existir.
 *
 * Tenta conectar antes de criar: em reconexão (chip trocado, sessão caída) a
 * instância já existe e recriar perderia a configuração de webhook.
 */
export async function gerarQrCode(
  /**
   * Número do WhatsApp que vai ser pareado, já normalizado pela tela. Sem ele
   * a Evolution devolve `pairingCode: null` e sobra só o QR — que no celular
   * não é caminho nenhum, porque o código está no mesmo aparelho que
   * precisaria lê-lo.
   */
  numero?: string,
  /**
   * Encerra a sessão atual antes de pedir o código.
   *
   * Ligado nos pedidos **manuais** do dono ("Conectar outro número", "Gerar
   * novo QR code", "Tentar de novo") e desligado nas renovações automáticas.
   * Sem isto, "Conectar outro número" não funcionava de jeito nenhum: com a
   * instância em `open` o connect não devolve QR, a tela lia isso como "já
   * pareado" e voltava ao cartão verde — sem erro, sem QR, sem pista. Ver
   * `desconectarInstancia` para a tabela de estado × resposta.
   *
   * A renovação **não** pode reiniciar: ela roda de dois em dois segundos com
   * o QR na cara do dono, e derrubaria a sessão que ele está pareando naquele
   * instante.
   */
  reiniciar = false,
): Promise<ResultadoQrCode> {
  const instancia = await nomeDaInstancia();

  if (reiniciar) await reiniciarSessao(instancia);

  try {
    const qr = await obterQrCode(instancia, numero);

    if (qr.base64) {
      /**
       * Reregistra o webhook mesmo quando a instância já existia.
       *
       * A config pode ter derivado: instância criada fora do app, segredo
       * rotacionado, ou `WEBHOOK_BASE_URL` mudado (endereço de túnel muda a cada
       * sessão em dev). Sem isto, a instância continuaria mandando webhook para
       * o lugar errado — ou com o segredo antigo, levando 401 — e o único
       * sintoma seria o bot silencioso. A chamada é idempotente.
       */
      await configurarWebhook(instancia);

      return {
        qrCodeBase64: qr.base64,
        codigoPareamento: qr.codigoPareamento,
        erro: null,
        regeracoes: qr.regeracoes,
        instanciaCriada: false,
      };
    }

    // Instância existe mas não devolveu QR: pode já estar conectada.
    const estado = await obterEstadoConexao(instancia);
    if (estado === "conectado") {
      /**
       * Ainda conectada **depois** de um logout pedido: o logout não pegou.
       * Devolver "sem QR e sem erro" aqui é o que fazia a tela voltar ao cartão
       * verde em silêncio, como se o clique não existisse — o dono repetia o
       * gesto e nada acontecia. Erro explícito, então, mesmo sendo raro.
       */
      if (reiniciar) {
        return {
          qrCodeBase64: null,
          codigoPareamento: null,
          erro: "Não foi possível encerrar a conexão atual para trocar de número. Tente de novo em instantes.",
          regeracoes: null,
          instanciaCriada: false,
        };
      }

      await registrarEstado(instancia, "conectado");
      revalidatePath("/conexao-whatsapp");
      return {
        qrCodeBase64: null,
        codigoPareamento: null,
        erro: null,
        regeracoes: null,
        instanciaCriada: false,
      };
    }

    return {
      qrCodeBase64: null,
      codigoPareamento: null,
      erro: "O servidor não devolveu um QR code. Tente novamente.",
      regeracoes: null,
      instanciaCriada: false,
    };
  } catch (erro) {
    // 404 = instância ainda não existe: é o caminho do primeiro acesso.
    if (erro instanceof ErroEvolutionApi && erro.status === 404) {
      return criarEConectar(instancia, numero);
    }

    return {
      qrCodeBase64: null,
      codigoPareamento: null,
      erro: mensagemDeErro(erro),
      regeracoes: null,
      instanciaCriada: false,
    };
  }
}

async function criarEConectar(
  instancia: string,
  numero?: string,
): Promise<ResultadoQrCode> {
  try {
    const criada = await criarInstancia(instancia, numero).catch(async (erro) => {
      /**
       * A instância já existia. Acontece quando uma tentativa anterior criou a
       * instância no servidor mas a resposta não chegou ao app (timeout de
       * rede). Recriar não é possível e não é necessário: basta pedir o QR da
       * que está lá.
       */
      if (erro instanceof ErroEvolutionApi && erro.instanciaJaExiste) {
        await configurarWebhook(instancia);
        return {
          qrCodeBase64: null,
          codigoPareamento: null,
          regeracoes: null,
          tokenInstancia: null,
        };
      }
      throw erro;
    });

    // O create já registra o webhook, mas reforçar é barato e cobre o caso de a
    // instância ter sido criada fora do app (script, painel).
    await configurarWebhook(instancia);

    if (criada.qrCodeBase64) {
      return {
        qrCodeBase64: criada.qrCodeBase64,
        // Este é o caminho em que o código de pareamento de fato aparece: a
        // criação com `number` é a única chamada que a Evolution honra
        // enquanto a instância não está em `close`.
        codigoPareamento: criada.codigoPareamento,
        erro: null,
        // O `count` que o servidor informou, não um zero assumido: é a linha
        // de base que diz se a próxima busca trouxe código novo ou cache.
        regeracoes: criada.regeracoes,
        instanciaCriada: true,
      };
    }

    const qr = await obterQrCode(instancia, numero);
    return {
      qrCodeBase64: qr.base64,
      codigoPareamento: qr.codigoPareamento,
      erro: qr.base64 ? null : "Não foi possível gerar o QR code.",
      regeracoes: qr.regeracoes,
      instanciaCriada: true,
    };
  } catch (erro) {
    return {
      qrCodeBase64: null,
      codigoPareamento: null,
      erro: mensagemDeErro(erro),
      regeracoes: null,
      instanciaCriada: true,
    };
  }
}

/**
 * Persiste o estado, **quando ele é uma conclusão**.
 *
 * `conectando` não é: é o estado em que o socket Baileys passa toda a sessão
 * de pareamento. Gravá-lo como `desconectado` — que era o que
 * `normalizarParaBanco` fazia, por a coluna só ter dois valores — significava
 * escrever no banco a cada 2-5s durante todo o pareamento, dizendo "não
 * conectado" sobre uma instância que está justamente conectando. Pior que o
 * ruído: uma escrita em voo podia sobrescrever o `conectado` que o webhook
 * `CONNECTION_UPDATE` acabara de gravar, e o dashboard voltava a mentir até o
 * poll seguinte.
 *
 * Devolve se gravou, porque quem chama precisa saber se houve efeito.
 */
async function registrarEstado(
  usuarioId: string,
  estado: EstadoConexao,
): Promise<boolean> {
  if (estado === "conectando") return false;

  const supabase = await criarClienteServidor();
  await supabase
    .from("perfis")
    .update({ status_conexao_whatsapp: estado })
    .eq("id", usuarioId);

  return true;
}

/**
 * Consulta o estado real e sincroniza `perfis`.
 *
 * A tela chama isto em intervalos enquanto o QR está na cara do usuário: o
 * webhook `CONNECTION_UPDATE` é a fonte de verdade, mas webhook se perde e o
 * dono ficaria olhando um QR já pareado.
 */
export async function verificarConexao(): Promise<{
  estado: EstadoConexao;
  erro: string | null;
}> {
  const instancia = await nomeDaInstancia();

  try {
    const estado = await obterEstadoConexao(instancia);
    await registrarEstado(instancia, estado);

    if (estado === "conectado") revalidatePath("/conexao-whatsapp");

    return { estado, erro: null };
  } catch (erro) {
    if (erro instanceof ErroEvolutionApi && erro.status === 404) {
      return { estado: "desconectado", erro: null };
    }
    return { estado: "desconectado", erro: mensagemDeErro(erro) };
  }
}
