"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { EstadoConexao } from "@/lib/tipos";
import { gerarQrCode, verificarConexao } from "./actions";

/** Enquanto o QR está na tela, verificar de 5 em 5s é suficiente e barato. */
const INTERVALO_VERIFICACAO_MS = 5_000;

export function PainelConexao({
  estadoInicial,
}: {
  estadoInicial: EstadoConexao;
}) {
  const router = useRouter();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [codigoPareamento, setCodigoPareamento] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, iniciarGeracao] = useTransition();

  function solicitarQrCode() {
    setErro(null);
    iniciarGeracao(async () => {
      const resultado = await gerarQrCode();
      setQrCode(resultado.qrCodeBase64);
      setCodigoPareamento(resultado.codigoPareamento);
      setErro(resultado.erro);
      if (!resultado.qrCodeBase64 && !resultado.erro) router.refresh();
    });
  }

  // Verifica o pareamento enquanto o QR estiver visível. Para assim que conecta.
  useEffect(() => {
    if (!qrCode) return;

    const timer = setInterval(async () => {
      const { estado } = await verificarConexao();
      if (estado === "conectado") {
        setQrCode(null);
        router.refresh();
      }
    }, INTERVALO_VERIFICACAO_MS);

    return () => clearInterval(timer);
  }, [qrCode, router]);

  if (estadoInicial === "conectado" && !qrCode) {
    return (
      <div className="mt-6 rounded-xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950">
        <p className="font-medium text-emerald-900 dark:text-emerald-200">
          WhatsApp conectado
        </p>
        <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300">
          O bot já está respondendo pelo número do seu estabelecimento.
        </p>
        <button
          type="button"
          onClick={solicitarQrCode}
          disabled={gerando}
          className="mt-3 text-sm text-emerald-900 underline underline-offset-4 disabled:opacity-60 dark:text-emerald-200"
        >
          Conectar outro número
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {!qrCode && (
        <button
          type="button"
          onClick={solicitarQrCode}
          disabled={gerando}
          className="h-11 rounded-lg bg-emerald-700 px-5 font-medium text-white transition-colors hover:bg-emerald-800 disabled:opacity-60"
        >
          {gerando ? "Gerando QR code…" : "Gerar QR code"}
        </button>
      )}

      {qrCode && (
        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
            <li>Abra o WhatsApp no celular do estabelecimento.</li>
            <li>
              Toque em <strong>Aparelhos conectados</strong> →{" "}
              <strong>Conectar aparelho</strong>.
            </li>
            <li>Aponte a câmera para o código abaixo.</li>
          </ol>

          <Image
            src={
              qrCode.startsWith("data:")
                ? qrCode
                : `data:image/png;base64,${qrCode}`
            }
            alt="QR code para conectar o WhatsApp"
            width={264}
            height={264}
            unoptimized
            className="rounded-lg bg-white p-2"
          />

          {codigoPareamento && (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              Se preferir digitar, use o código:{" "}
              <code className="font-mono font-medium">{codigoPareamento}</code>
            </p>
          )}

          <div className="mt-4 flex items-center gap-4">
            <p className="text-sm text-zinc-500">
              Aguardando leitura… a tela atualiza sozinha.
            </p>
            <button
              type="button"
              onClick={solicitarQrCode}
              disabled={gerando}
              className="text-sm text-zinc-600 underline underline-offset-4 disabled:opacity-60 dark:text-zinc-400"
            >
              Gerar outro
            </button>
          </div>
        </div>
      )}

      {erro && (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {erro}
        </p>
      )}
    </div>
  );
}
