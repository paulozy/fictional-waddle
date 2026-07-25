"use server";

import { revalidatePath } from "next/cache";
import {
  ErroEvolutionApi,
  configurarWebhook,
  criarInstancia,
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

/**
 * Devolve um QR code para pareamento, criando a instância se ela ainda não
 * existir.
 *
 * Tenta conectar antes de criar: em reconexão (chip trocado, sessão caída) a
 * instância já existe e recriar perderia a configuração de webhook.
 */
export async function gerarQrCode(): Promise<ResultadoQrCode> {
  const instancia = await nomeDaInstancia();

  try {
    const qr = await obterQrCode(instancia);

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
      return criarEConectar(instancia);
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

async function criarEConectar(instancia: string): Promise<ResultadoQrCode> {
  try {
    const criada = await criarInstancia(instancia).catch(async (erro) => {
      /**
       * A instância já existia. Acontece quando uma tentativa anterior criou a
       * instância no servidor mas a resposta não chegou ao app (timeout de
       * rede). Recriar não é possível e não é necessário: basta pedir o QR da
       * que está lá.
       */
      if (erro instanceof ErroEvolutionApi && erro.instanciaJaExiste) {
        await configurarWebhook(instancia);
        return { qrCodeBase64: null, tokenInstancia: null };
      }
      throw erro;
    });

    // O create já registra o webhook, mas reforçar é barato e cobre o caso de a
    // instância ter sido criada fora do app (script, painel).
    await configurarWebhook(instancia);

    if (criada.qrCodeBase64) {
      return {
        qrCodeBase64: criada.qrCodeBase64,
        codigoPareamento: null,
        erro: null,
        regeracoes: 0,
        instanciaCriada: true,
      };
    }

    const qr = await obterQrCode(instancia);
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

async function registrarEstado(usuarioId: string, estado: EstadoConexao) {
  const supabase = await criarClienteServidor();
  await supabase
    .from("perfis")
    .update({ status_conexao_whatsapp: normalizarParaBanco(estado) })
    .eq("id", usuarioId);
}

/** `conectando` é transitório e não é um valor válido na coluna. */
function normalizarParaBanco(estado: EstadoConexao): string {
  return estado === "conectado" ? "conectado" : "desconectado";
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
