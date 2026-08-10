"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2Icon, QrCodeIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SEGUNDOS_RETENTATIVA,
  SEGUNDOS_VALIDADE_QR,
  classificarLeituraQr,
} from "@/lib/qr-pareamento";
import { normalizarNumeroWhatsApp } from "@/lib/telefone";
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
 * Renovações automáticas antes de exigir ação do dono.
 *
 * **Buscar o QR não consome o `QRCODE_LIMIT`** — o comentário anterior aqui
 * dizia que sim, e estava errado. Medido contra a 2.3.7: três
 * `GET /instance/connect` seguidos deixaram `count` em 4, porque numa
 * instância em `connecting` o endpoint devolve o QR em cache e não força
 * rotação nenhuma. Quem queima o orçamento é o relógio de 45s do próprio
 * servidor, com ou sem aba aberta.
 *
 * O limite continua valendo, por outro motivo: parar de disparar Server Action
 * numa aba que ficou esquecida aberta. Depois dele a tela passa a `qr_expirado`
 * e espera um clique.
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
  | {
      nome: "qr_visivel";
      qr: string;
      codigoPareamento: string | null;
      /**
       * Contador que sobe a cada código **novo** exibido.
       *
       * É o que ancora a contagem regressiva, e não o nome do estado.
       * Ancorada em `estado.nome`, ela dependia de a renovação passar
       * visivelmente por `preparando` para o efeito remontar — e quando a
       * resposta chega rápido o React agrupa as duas atualizações, o nome
       * nunca muda, o efeito não remonta e a contagem morre depois da
       * primeira renovação, com o QR congelado na tela. Com a sequência a
       * remontagem é explícita: código novo, contagem nova.
       */
      sequencia: number;
    }
  | { nome: "qr_expirado" }
  | { nome: "erro"; mensagem: string };

export function PainelConexao({
  estadoInicial,
  numeroInicial,
  iniciarAutomaticamente = false,
}: {
  estadoInicial: EstadoConexao;
  /**
   * Número já normalizado, vindo do passo 3 do cadastro por `?numero=`. Sem
   * isto o dono digitaria o mesmo número duas vezes seguidas, em duas telas.
   */
  numeroInicial?: string;
  /**
   * Dispara a primeira busca de QR sozinho, uma vez. Só o passo 3 do cadastro
   * liga isto (`?iniciar=1`), porque lá o dono acabou de clicar em "Gerar QR
   * code" — chegar numa tela com um botão pedindo o mesmo clique de novo leria
   * como se o primeiro não tivesse funcionado.
   */
  iniciarAutomaticamente?: boolean;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ nome: "ocioso" });
  /** Segundos: decorridos na espera, restantes quando o QR está na tela. */
  const [contador, setContador] = useState(0);

  // Em ref porque o polling não deve reiniciar quando a contagem muda.
  const renovacoesRef = useRef(0);
  /**
   * Número já normalizado da tentativa em curso, para a renovação automática
   * reusar. Em ref e não em estado: nenhuma renderização depende dele, e em
   * estado ele reiniciaria o efeito de contagem a cada renovação.
   */
  const numeroRef = useRef<string | undefined>(undefined);
  /** O dono já conectado clicou em "Conectar outro número". */
  const [trocando, setTrocando] = useState(false);

  /** `count` do último código exibido — a linha de base da comparação. */
  const regeracoesRef = useRef<number | null>(null);
  /** Sobe a cada código novo na tela; é o que remonta a contagem. */
  const sequenciaRef = useRef(0);
  /**
   * Há uma busca em voo. Sem isto, uma resposta mais lenta que o intervalo de
   * retentativa empilharia chamadas à Evolution em paralelo.
   */
  const buscandoRef = useRef(false);

  const solicitar = useCallback(
    async (motivo: "manual" | "renovacao", numero?: string) => {
      if (buscandoRef.current) return;
      buscandoRef.current = true;

      try {
        if (motivo === "manual") {
          renovacoesRef.current = 0;
          // Sessão nova: nada na tela com que comparar a contagem.
          regeracoesRef.current = null;
          /**
           * Só sobrescreve com o que veio. "Gerar novo código" e "Tentar de
           * novo" chamam com `numeroRef.current`, mas um `undefined` acidental
           * apagaria o número da tentativa em curso — e sem número a Evolution
           * volta a devolver `pairingCode: null`, deixando quem está no celular
           * de novo sem caminho.
           */
          if (numero) numeroRef.current = numero;

          // Zerar aqui, e não num efeito: manipulador de evento pode chamar
          // setState à vontade.
          setContador(0);
          setEstado({ nome: "preparando" });
        }
        /**
         * A renovação **não** passa por `preparando`: o QR atual fica na tela
         * durante a busca. Antes ela derrubava o código e mostrava o spinner a
         * cada ciclo — e agora que a busca frequentemente volta em cache, isso
         * viraria um piscar a cada dois segundos.
         */

        /**
         * Pedido manual derruba a sessão antes de pedir o código; renovação
         * não. A assimetria é o conserto de "Conectar outro número": com a
         * instância em `open` (ou presa em `connecting`), a Evolution devolve
         * o código **em cache do número anterior**, ou nada — e a tela lia o
         * nada como "já pareado" e voltava ao cartão verde sem dizer nada.
         *
         * Do outro lado, reiniciar numa renovação derrubaria a sessão que o
         * dono está pareando naquele exato instante, de dois em dois segundos.
         */
        const resultado = await gerarQrCode(
          numeroRef.current,
          motivo === "manual",
        );

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

        /**
         * O servidor devolveu o mesmo código de antes? Então ele ainda não
         * rodou o relógio de 45s dele, e reiniciar a contagem aqui seria
         * exatamente o erro de fase que faz a tela exibir QR morto. Sai sem
         * tocar em nada — o intervalo insiste daqui a pouco.
         */
        const decisao = classificarLeituraQr(
          regeracoesRef.current,
          resultado.regeracoes,
        );
        if (motivo === "renovacao" && decisao.tipo === "repetido") return;

        regeracoesRef.current = resultado.regeracoes;
        // Só código novo conta contra o teto: senão as retentativas de dois em
        // dois segundos esgotariam as renovações em menos de dez.
        if (motivo === "renovacao") renovacoesRef.current += 1;

        setContador(SEGUNDOS_VALIDADE_QR);
        setEstado({
          nome: "qr_visivel",
          qr: resultado.qrCodeBase64,
          codigoPareamento: resultado.codigoPareamento,
          sequencia: (sequenciaRef.current += 1),
        });
      } finally {
        buscandoRef.current = false;
      }
    },
    [router],
  );

  /**
   * Arranque automático vindo do passo 3 do cadastro.
   *
   * `useRef` como trava, e não só o array de dependências: em desenvolvimento o
   * Strict Mode monta o componente duas vezes, e sem a trava a segunda montagem
   * abriria uma segunda sessão Baileys — a mais caras das chamadas da Evolution.
   * Não dispara quando o número já está conectado: ali a tela é o box verde, e
   * gerar QR derrubaria a sessão que está funcionando.
   */
  const arrancouRef = useRef(false);
  useEffect(() => {
    if (arrancouRef.current) return;
    if (!iniciarAutomaticamente || !numeroInicial) return;
    if (estadoInicial === "conectado") return;

    arrancouRef.current = true;
    void solicitar("manual", numeroInicial);
  }, [estadoInicial, iniciarAutomaticamente, numeroInicial, solicitar]);

  /** Espera: conta para cima, só para a cópia mudar depois de alguns segundos. */
  useEffect(() => {
    if (estado.nome !== "preparando") return;

    const timer = setInterval(() => setContador((s) => s + 1), 1_000);
    return () => clearInterval(timer);
  }, [estado.nome]);

  /**
   * Âncora da contagem: muda quando um código **novo** entra na tela.
   *
   * Extraído para fora do array de dependências para ficar legível — é este
   * valor, e não `estado.nome`, que precisa reiniciar o relógio.
   */
  const sequenciaDoQr =
    estado.nome === "qr_visivel" ? estado.sequencia : null;

  /**
   * QR na tela: conta para baixo e, no zero, renova ou desiste.
   *
   * A contagem vive numa variável local do efeito, não dentro do atualizador de
   * `setContador`. A diferença importa: atualizador precisa ser puro, e o React
   * pode executá-lo duas vezes em StrictMode — decidir a renovação lá dentro
   * dispararia duas chamadas à Evolution.
   *
   * Aqui a renovação sai do callback do intervalo, que é um sistema externo e o
   * único dos três lugares em que esse efeito colateral é legítimo.
   *
   * O intervalo **não** é cancelado ao chegar a zero, e isso é deliberado. Uma
   * busca costuma voltar com o mesmo código em cache, porque o servidor roda o
   * relógio dele; cancelar ali deixaria a tela com um QR morto e nenhum
   * mecanismo vivo para trocá-lo. Em vez disso a contagem segue para números
   * negativos, insistindo a cada `SEGUNDOS_RETENTATIVA`, até o servidor rodar
   * — e aí `sequenciaDoQr` muda, o efeito remonta e o relógio recomeça cheio.
   */
  useEffect(() => {
    if (sequenciaDoQr === null) return;

    let restante = SEGUNDOS_VALIDADE_QR;

    const timer = setInterval(() => {
      restante -= 1;
      // Não mostrar número negativo: para o dono, "0s" e "faltam -6s" são a
      // mesma informação, e só a primeira é legível.
      setContador(Math.max(0, restante));

      if (restante > 0) return;

      if (renovacoesRef.current >= MAX_RENOVACOES_AUTO) {
        clearInterval(timer);
        setEstado({ nome: "qr_expirado" });
        return;
      }

      if (restante % SEGUNDOS_RETENTATIVA === 0) void solicitar("renovacao");
    }, 1_000);

    return () => clearInterval(timer);
  }, [sequenciaDoQr, solicitar]);

  /**
   * Polling do estado real da conexão.
   *
   * Existe apesar do webhook `CONNECTION_UPDATE`: webhook se perde, e aí o dono
   * fica olhando um QR que já foi lido. O passo abre em 2s (logo após a leitura
   * é quando a resposta importa) e afrouxa para 5s, com teto e pausa em aba
   * oculta — antes eram 5s fixos para sempre, enquanto a aba existisse.
   */
  useEffect(() => {
    // `qr_expirado` continua observado: o dono pode ter lido o código nos
    // últimos segundos de validade, e a conexão chega depois de a tela já ter
    // desistido de renovar.
    const observando =
      estado.nome === "qr_visivel" || estado.nome === "qr_expirado";

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

        /**
         * `conectando` **não** significa que alguém leu o código.
         *
         * Havia aqui uma transição para um estado "Código lido / Sincronizando"
         * disparada por `conectando`, com um comentário afirmando que esse
         * estado só aparecia depois da leitura. Era falso, e o efeito era
         * determinístico: o painel anunciava leitura ~2s depois de o QR
         * aparecer, sem ninguém ter escaneado nada.
         *
         * `connecting` é o estado **inicial** do socket Baileys — emitido na
         * abertura, antes de existir QR. Medido contra a 2.3.7: o
         * `CONNECTION_UPDATE` chega 327ms depois do create, e
         * `/instance/connectionState` responde `connecting` por toda a sessão
         * de pareamento, do socket aberto até virar `open`. O tipo do Baileys
         * tem só três valores (`open`/`connecting`/`close`) e nenhum distingue
         * "QR exibido" de "QR lido".
         *
         * Detectar a leitura de verdade não é possível nesta versão: o Baileys
         * emite `isNewLogin` no `pair-success`, mas a Evolution descarta o
         * campo e não o expõe em endpoint nem em webhook. Entre a leitura e o
         * `open` ela é muda. Então aqui não se faz nada: a tela segue em
         * "Aguardando a conexão", com o QR à vista, até o estado virar
         * `conectado`.
         *
         * Não reintroduzir um estado intermediário sem um sinal real. Além de
         * mentir, o antigo era um sumidouro: derrubava o QR da tela, matava a
         * contagem regressiva (e com ela a renovação automática e o
         * `qr_expirado`), e não tinha botão nenhum para sair.
         */
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

  if (estadoInicial === "conectado" && estado.nome === "ocioso" && !trocando) {
    return (
      <div className="mt-6 flex max-w-2xl flex-col gap-4 rounded-xl border border-confirmado-borda bg-confirmado p-5 sm:flex-row sm:items-center">
        {/* O ponto é decorativo: o estado já está dito por extenso ao lado. */}
        <span
          aria-hidden
          className="hidden size-2.5 shrink-0 rounded-full bg-confirmado-tinta sm:block"
        />
        <div className="flex-1">
          <p className="font-medium text-confirmado-tinta">WhatsApp conectado</p>
          <p className="mt-1 text-sm leading-relaxed text-confirmado-tinta">
            O bot já está respondendo pelo número do seu estabelecimento.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setTrocando(true)}
          className="flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-confirmado-borda bg-card px-4 text-sm text-confirmado-tinta transition-colors hover:bg-accent"
        >
          Conectar outro número
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {estado.nome === "ocioso" && (
        <FormularioNumero
          onEnviar={(numero) => void solicitar("manual", numero)}
          valorInicial={numeroInicial}
          /**
           * Só quem veio do cartão verde tem uma conexão a perder — e agora
           * perde de verdade: gerar o código novo encerra a sessão atual,
           * porque a Evolution só honra um número diferente com a instância em
           * `close`. Dizer isso antes é o mínimo; o dono pode estar em horário
           * de atendimento, com o bot respondendo cliente.
           */
          trocandoConexaoAtiva={trocando}
          aoDesistir={trocando ? () => setTrocando(false) : undefined}
        />
      )}

      {estado.nome === "preparando" && <Preparando segundos={contador} />}

      {(estado.nome === "qr_visivel" || estado.nome === "qr_expirado") && (
        <div className="max-w-md rounded-lg border border-border bg-card p-4">
          {/**
           * Duas receitas, porque são dois caminhos diferentes — e o padrão
           * muda com o aparelho.
           *
           * No celular o QR é logicamente impossível: o código está na mesma
           * tela que precisaria fotografá-lo. Ali o código de pareamento não é
           * alternativa, é **o** caminho, e é ele que aparece primeiro. No
           * computador vale o inverso, que é o fluxo que todo mundo conhece.
           */}
          <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-muted-foreground md:hidden">
            <li>Abra o WhatsApp no celular do estabelecimento.</li>
            <li>
              Toque em <strong>Aparelhos conectados</strong> →{" "}
              <strong>Conectar aparelho</strong> →{" "}
              <strong>Conectar com número de telefone</strong>.
            </li>
            <li>Digite o código abaixo.</li>
          </ol>

          <ol className="mb-3 hidden list-decimal space-y-1 pl-5 text-sm text-muted-foreground md:block">
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
            <QrExpirado aoGerar={() => void solicitar("manual", numeroRef.current)} />
          )}
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
            onClick={() => void solicitar("manual", numeroRef.current)}
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
    <div className="flex flex-col">
      {/**
       * A ordem se inverte por CSS, sem duplicar markup nem medir a tela em
       * JavaScript. No celular o código vem primeiro porque é o único caminho
       * viável; no computador o QR volta ao topo.
       */}
      {codigoPareamento && (
        <div className="order-1 md:order-3 md:mt-3">
          <p className="text-sm text-muted-foreground">
            Digite este código no WhatsApp:
          </p>
          <p className="mt-1 font-mono text-2xl font-medium tracking-[0.2em] tabular-nums md:text-base md:tracking-normal">
            {codigoPareamento}
          </p>
        </div>
      )}

      <div className={`order-2 ${codigoPareamento ? "mt-4 md:order-1 md:mt-0" : "md:order-1"}`}>
        {/* No celular o QR é a alternativa "estou em outro computador", e o
            cabeçalho precisa dizer isso — senão ele lê como o caminho
            principal, que ali não funciona. */}
        {codigoPareamento && (
          <p className="mb-2 text-xs text-muted-foreground md:hidden">
            Está com o painel aberto em outro computador? Dá para ler o QR:
          </p>
        )}

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
            aria-label="Tempo restante deste código"
          >
            <div
              className="h-full bg-agora transition-[width] duration-1000 ease-linear"
              style={{ width: `${fracao}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">
            {codigoPareamento
              ? `Este código vale por mais ${restante}s — depois disso um novo aparece sozinho.`
              : `Este QR code vale por mais ${restante}s — depois disso um novo aparece sozinho.`}
          </p>
        </div>
      </div>

      <p
        className="order-4 mt-3 text-sm text-muted-foreground"
        aria-live="polite"
      >
        Aguardando a conexão… a tela atualiza sozinha.
      </p>
    </div>
  );
}

/**
 * Pergunta o número antes de gerar.
 *
 * Não é burocracia acrescentada: sem o número a Evolution nunca chama
 * `requestPairingCode` e devolve `pairingCode: null`, o que deixava o dono no
 * celular sem caminho nenhum — o QR está no mesmo aparelho que precisaria
 * fotografá-lo. De quebra, o campo torna concreta a checagem que a página já
 * pedia em prosa ("use o número do negócio, não o pessoal").
 */
function FormularioNumero({
  onEnviar,
  valorInicial = "",
  trocandoConexaoAtiva = false,
  aoDesistir,
}: {
  onEnviar: (numero: string) => void;
  valorInicial?: string;
  /** Há uma sessão funcionando que este formulário vai encerrar. */
  trocandoConexaoAtiva?: boolean;
  /** Volta ao cartão de conectado sem tocar na sessão. */
  aoDesistir?: () => void;
}) {
  const [valor, setValor] = useState(valorInicial);
  const [erro, setErro] = useState<string | null>(null);

  return (
    <form
      className="max-w-md"
      onSubmit={(evento) => {
        evento.preventDefault();

        const resultado = normalizarNumeroWhatsApp(valor);
        if (!resultado.valido) {
          setErro(resultado.erro);
          return;
        }

        setErro(null);
        onEnviar(resultado.numero);
      }}
    >
      {trocandoConexaoAtiva && (
        <p className="mb-4 rounded-lg border border-aviso/40 bg-aviso-suave p-3 text-sm leading-relaxed text-aviso">
          Ao gerar o código, a conexão atual é encerrada e o bot para de
          responder até o novo número ser pareado. Se estiver em horário de
          atendimento, faça a troca com o celular em mãos.
        </p>
      )}

      <label htmlFor="numero-whatsapp" className="block text-sm font-medium">
        Qual o número deste WhatsApp?
      </label>
      <p id="numero-whatsapp-dica" className="mt-1 text-xs text-muted-foreground">
        Com DDD. É para onde o WhatsApp manda o código de conexão.
      </p>

      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <Input
          id="numero-whatsapp"
          name="numero"
          type="tel"
          // `inputMode="tel"` abre o teclado de discagem, que tem o `+` e os
          // dígitos grandes — melhor que o alfanumérico para 11 números.
          inputMode="tel"
          autoComplete="tel"
          enterKeyHint="go"
          placeholder="(11) 99999-8888"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          aria-invalid={erro ? true : undefined}
          aria-describedby={
            erro ? "numero-whatsapp-erro" : "numero-whatsapp-dica"
          }
          className="sm:max-w-52"
        />
        <Button type="submit">
          <QrCodeIcon className="size-4" />
          Conectar
        </Button>
        {/* Sem isto, quem clicou em "Conectar outro número" por engano só
            voltava recarregando a página. */}
        {aoDesistir && (
          <Button type="button" variant="ghost" onClick={aoDesistir}>
            Cancelar
          </Button>
        )}
      </div>

      {erro && (
        <p
          id="numero-whatsapp-erro"
          role="alert"
          className="mt-2 text-sm text-destructive"
        >
          {erro}
        </p>
      )}
    </form>
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
