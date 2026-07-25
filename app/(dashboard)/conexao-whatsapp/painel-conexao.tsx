"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2Icon, QrCodeIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EstadoConexao } from "@/lib/tipos";
import { gerarQrCode, verificarConexao } from "./actions";

/**
 * Painel de pareamento do WhatsApp.
 *
 * O problema que este arquivo resolve não é técnico, é de percepção: criar a
 * instância sobe uma sessão Baileys e leva de 10s a um minuto, e a versão
 * anterior mostrava só "Gerando QR code…" dentro do botão durante toda a espera.
 * Sem nada acontecendo na tela, o dono conclui que travou e recarrega — o que
 * costuma piorar, porque começa outra tentativa.
 *
 * Duas decisões de UX aqui são deliberadas:
 *
 * 1. **Indicador indeterminado com texto honesto, não barra de progresso.** A
 *    duração é desconhecida, e uma barra que finge saber e empaca em 90% custa
 *    mais confiança do que spinner nenhum. Quem carrega a informação é a frase,
 *    que diz o que está acontecendo e quanto deve demorar.
 * 2. **Expiração explícita.** O QR do Baileys morre em segundos. Antes a tela
 *    seguia dizendo "Aguardando leitura…" sobre um código morto, e a leitura
 *    simplesmente não funcionava. Agora o código expira à vista, com contagem.
 */

/**
 * Validade estimada do QR na tela.
 *
 * É heurística: o tempo real varia com a versão do Baileys e com o servidor. Por
 * isso o número peca por baixo — renovar um QR ainda válido é inofensivo, deixar
 * um morto na tela não é.
 */
const SEGUNDOS_VALIDADE_QR = 40;

/**
 * Renovações automáticas antes de exigir ação do dono.
 *
 * O `QRCODE_LIMIT` da Evolution (default 30) é o teto real da sessão de
 * pareamento: estourado, a instância desiste e fica presa em `connecting`.
 * Renovar para sempre enquanto a aba está aberta queimaria esse orçamento sem
 * ninguém olhando a tela.
 */
const MAX_RENOVACOES_AUTO = 3;

/** Ritmo do polling de conexão. Denso no começo, espaçado depois. */
const POLL_RAPIDO_MS = 2_000;
const POLL_LENTO_MS = 5_000;
const JANELA_RAPIDA_MS = 20_000;
/** Teto: sem isso o polling roda para sempre numa aba esquecida aberta. */
const LIMITE_POLLING_MS = 180_000;

/**
 * Contadores ficam **fora** da união de estados, em `contador`.
 *
 * Duas regras do React 19 moldam este desenho. `react-hooks/purity` proíbe ler
 * `Date.now()` durante a renderização, então a contagem não pode ser derivada de
 * um `expiraEm` na hora de desenhar. E `react-hooks/set-state-in-effect` proíbe
 * `setState` síncrono no corpo de um efeito — mas permite dentro do callback de
 * um sistema externo, que é exatamente o que `setInterval` é. Daí o contador
 * viver em estado próprio, zerado no manipulador de evento e movido só pelo
 * intervalo.
 */
type Estado =
  | { nome: "ocioso" }
  | { nome: "preparando" }
  | { nome: "qr_visivel"; qr: string; codigoPareamento: string | null }
  | { nome: "qr_expirado" }
  | { nome: "pareando" }
  | { nome: "erro"; mensagem: string };

export function PainelConexao({
  estadoInicial,
}: {
  estadoInicial: EstadoConexao;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ nome: "ocioso" });
  /** Segundos: decorridos na espera, restantes quando o QR está na tela. */
  const [contador, setContador] = useState(0);

  // Em ref porque o polling não deve reiniciar quando a contagem muda.
  const renovacoesRef = useRef(0);

  const solicitar = useCallback(
    async (motivo: "manual" | "renovacao") => {
      if (motivo === "manual") renovacoesRef.current = 0;
      else renovacoesRef.current += 1;

      // Zerar aqui, e não num efeito: manipulador de evento pode chamar
      // setState à vontade.
      setContador(0);
      setEstado({ nome: "preparando" });

      const resultado = await gerarQrCode();

      if (resultado.erro) {
        setEstado({ nome: "erro", mensagem: resultado.erro });
        return;
      }

      if (!resultado.qrCodeBase64) {
        // Sem QR e sem erro significa que a instância já está pareada.
        setEstado({ nome: "ocioso" });
        router.refresh();
        return;
      }

      setContador(SEGUNDOS_VALIDADE_QR);
      setEstado({
        nome: "qr_visivel",
        qr: resultado.qrCodeBase64,
        codigoPareamento: resultado.codigoPareamento,
      });
    },
    [router],
  );

  /** Espera: conta para cima, só para a cópia mudar depois de alguns segundos. */
  useEffect(() => {
    if (estado.nome !== "preparando") return;

    const timer = setInterval(() => setContador((s) => s + 1), 1_000);
    return () => clearInterval(timer);
  }, [estado.nome]);

  /**
   * QR na tela: conta para baixo e, no zero, renova ou desiste.
   *
   * A contagem vive numa variável local do efeito, não dentro do atualizador de
   * `setContador`. A diferença importa: atualizador precisa ser puro, e o React
   * pode executá-lo duas vezes em StrictMode — decidir a renovação lá dentro
   * dispararia duas chamadas à Evolution e queimaria o dobro do `QRCODE_LIMIT`.
   *
   * Aqui a renovação sai do callback do intervalo, que é um sistema externo e o
   * único dos três lugares em que esse efeito colateral é legítimo.
   */
  useEffect(() => {
    if (estado.nome !== "qr_visivel") return;

    let restante = SEGUNDOS_VALIDADE_QR;

    const timer = setInterval(() => {
      restante -= 1;
      setContador(restante);

      if (restante > 0) return;

      clearInterval(timer);
      if (renovacoesRef.current < MAX_RENOVACOES_AUTO) {
        void solicitar("renovacao");
      } else {
        setEstado({ nome: "qr_expirado" });
      }
    }, 1_000);

    return () => clearInterval(timer);
  }, [estado.nome, solicitar]);

  /**
   * Polling do estado real da conexão.
   *
   * Existe apesar do webhook `CONNECTION_UPDATE`: webhook se perde, e aí o dono
   * fica olhando um QR que já foi lido. O passo abre em 2s (logo após a leitura
   * é quando a resposta importa) e afrouxa para 5s, com teto e pausa em aba
   * oculta — antes eram 5s fixos para sempre, enquanto a aba existisse.
   */
  useEffect(() => {
    const observando =
      estado.nome === "qr_visivel" ||
      estado.nome === "qr_expirado" ||
      estado.nome === "pareando";

    if (!observando) return;

    const inicio = Date.now(); // dentro do efeito, nao da renderizacao
    let cancelado = false;
    let timer: ReturnType<typeof setTimeout>;

    async function verificar() {
      if (cancelado) return;

      const decorrido = Date.now() - inicio;
      if (decorrido > LIMITE_POLLING_MS) return;

      // Aba em segundo plano não precisa de Server Action a cada 5s.
      if (document.visibilityState === "visible") {
        const { estado: conexao } = await verificarConexao();
        if (cancelado) return;

        if (conexao === "conectado") {
          setEstado({ nome: "ocioso" });
          router.refresh();
          return;
        }

        // `connecting` depois de o QR aparecer significa leitura feita e sessão
        // sincronizando — vale dizer isso em vez de seguir em "aguardando".
        if (conexao === "conectando") setEstado({ nome: "pareando" });
      }

      const passo =
        decorrido < JANELA_RAPIDA_MS ? POLL_RAPIDO_MS : POLL_LENTO_MS;
      timer = setTimeout(verificar, passo);
    }

    timer = setTimeout(verificar, POLL_RAPIDO_MS);

    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [estado.nome, router]);

  if (estadoInicial === "conectado" && estado.nome === "ocioso") {
    return (
      <div className="mt-6 max-w-md rounded-lg border border-confirmado-borda bg-confirmado p-4">
        <p className="font-medium text-confirmado-tinta">WhatsApp conectado</p>
        <p className="mt-1 text-sm text-confirmado-tinta">
          O bot já está respondendo pelo número do seu estabelecimento.
        </p>
        <button
          type="button"
          onClick={() => void solicitar("manual")}
          className="mt-3 text-sm text-confirmado-tinta underline underline-offset-4"
        >
          Conectar outro número
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {estado.nome === "ocioso" && (
        <Button type="button" onClick={() => void solicitar("manual")}>
          <QrCodeIcon className="size-4" />
          Gerar QR code
        </Button>
      )}

      {estado.nome === "preparando" && <Preparando segundos={contador} />}

      {(estado.nome === "qr_visivel" || estado.nome === "qr_expirado") && (
        <div className="max-w-md rounded-lg border border-border bg-card p-4">
          <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Abra o WhatsApp no celular do estabelecimento.</li>
            <li>
              Toque em <strong>Aparelhos conectados</strong> →{" "}
              <strong>Conectar aparelho</strong>.
            </li>
            <li>Aponte a câmera para o código abaixo.</li>
          </ol>

          {/* Reforço no momento da ação. A explicação inteira já está na página;
              aqui é só a última chance de conferir o número certo. */}
          <p className="mb-4 text-xs text-muted-foreground">
            Confira que é o número do negócio — o bot vai responder a todas as
            mensagens que chegarem nele.
          </p>

          {estado.nome === "qr_visivel" ? (
            <QrComContagem
              qr={estado.qr}
              restante={contador}
              codigoPareamento={estado.codigoPareamento}
            />
          ) : (
            <QrExpirado aoGerar={() => void solicitar("manual")} />
          )}
        </div>
      )}

      {estado.nome === "pareando" && (
        <div
          className="flex max-w-md items-center gap-3 rounded-lg border border-confirmado-borda bg-confirmado p-4"
          aria-live="polite"
        >
          <Loader2Icon className="size-4 shrink-0 animate-spin text-confirmado-tinta" />
          <div>
            <p className="font-medium text-confirmado-tinta">Código lido</p>
            <p className="mt-0.5 text-sm text-confirmado-tinta">
              Sincronizando suas conversas. Isso leva alguns segundos.
            </p>
          </div>
        </div>
      )}

      {estado.nome === "erro" && (
        <div className="max-w-md rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <p role="alert" className="text-sm text-destructive">
            {estado.mensagem}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => void solicitar("manual")}
          >
            <RefreshCwIcon className="size-4" />
            Tentar de novo
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * A espera de criação da instância.
 *
 * A frase muda depois de alguns segundos porque a expectativa muda: até uns 6s
 * qualquer requisição parece normal; passando disso, o silêncio precisa ser
 * explicado, senão vira "travou".
 */
function Preparando({ segundos }: { segundos: number }) {
  const demorando = segundos >= 6;

  return (
    <div
      className="flex max-w-md items-start gap-3 rounded-lg border border-border bg-card p-4"
      aria-live="polite"
      aria-busy
    >
      <Loader2Icon className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
      <div>
        <p className="font-medium">
          {demorando
            ? "Preparando seu WhatsApp"
            : "Falando com o servidor de WhatsApp"}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {demorando
            ? "Na primeira conexão isso leva até um minuto. Pode deixar esta tela aberta — o QR code aparece sozinho."
            : "Só um instante."}
        </p>
      </div>
    </div>
  );
}

function QrComContagem({
  qr,
  restante,
  codigoPareamento,
}: {
  qr: string;
  restante: number;
  codigoPareamento: string | null;
}) {
  const fracao = Math.min(100, Math.max(0, (restante / SEGUNDOS_VALIDADE_QR) * 100));

  return (
    <>
      <Image
        src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`}
        alt="QR code para conectar o WhatsApp"
        width={264}
        height={264}
        unoptimized
        // O fundo branco é do leitor, não do tema: um QR sobre papel creme ou
        // sobre fundo escuro perde contraste e a câmera não lê.
        className="rounded-md bg-white p-2"
      />

      <div className="mt-3 max-w-[264px]">
        <div
          className="h-1 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={SEGUNDOS_VALIDADE_QR}
          aria-valuenow={restante}
          aria-label="Tempo restante deste QR code"
        >
          <div
            className="h-full bg-agora transition-[width] duration-1000 ease-linear"
            style={{ width: `${fracao}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">
          Este código vale por mais {restante}s — depois disso um novo aparece
          sozinho.
        </p>
      </div>

      {codigoPareamento && (
        <p className="mt-3 text-sm text-muted-foreground">
          Se preferir digitar, use o código:{" "}
          <code className="font-mono font-medium text-foreground">
            {codigoPareamento}
          </code>
        </p>
      )}

      <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">
        Aguardando a leitura… a tela atualiza sozinha.
      </p>
    </>
  );
}

/**
 * Depois das renovações automáticas, o QR para de se renovar e diz isso.
 *
 * Parar é intencional: cada regeração consome o `QRCODE_LIMIT` da instância, e
 * uma aba esquecida aberta queimaria o orçamento inteiro até a Evolution
 * desistir do pareamento.
 */
function QrExpirado({ aoGerar }: { aoGerar: () => void }) {
  return (
    <div
      className="flex max-w-[264px] flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted p-6 text-center"
      aria-live="polite"
    >
      <p className="text-sm font-medium">QR code expirou</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Ninguém leu o código a tempo. Gere outro para continuar.
      </p>
      <Button type="button" size="sm" className="mt-3" onClick={aoGerar}>
        <RefreshCwIcon className="size-4" />
        Gerar novo QR code
      </Button>
    </div>
  );
}
