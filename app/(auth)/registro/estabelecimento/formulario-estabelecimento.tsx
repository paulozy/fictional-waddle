"use client";

import { useActionState } from "react";
import { FUSOS } from "@/lib/fusos";
import { salvarEstabelecimento } from "../../actions";
import {
  BotaoPrincipal,
  Cabecalho,
  Campo,
  CampoSelecao,
  Recado,
} from "../../pecas";
import type { EstadoAuth } from "../../schema";
import { Passos } from "../passos";

export function FormularioEstabelecimento({
  nomeInicial,
  fusoInicial,
}: {
  nomeInicial: string;
  fusoInicial: string;
}) {
  const [estado, acao, salvando] = useActionState<EstadoAuth, FormData>(
    salvarEstabelecimento,
    undefined,
  );

  return (
    <>
      <Passos atual={2} />

      <Cabecalho titulo="Sobre o estabelecimento" className="mt-6 lg:mt-6">
        É o nome que aparece para o cliente na conversa com o bot. O fuso orienta
        toda a agenda — os horários que você cadastrar valem nele.
      </Cabecalho>

      {estado?.erro && <Recado tom="erro">{estado.erro}</Recado>}

      <form action={acao} className="mt-8 flex flex-col gap-5">
        <Campo
          id="nome"
          name="nome"
          rotulo="Nome do estabelecimento"
          type="text"
          required
          maxLength={80}
          defaultValue={nomeInicial}
          autoComplete="organization"
          enterKeyHint="next"
          placeholder="Barbearia do Nino"
        />

        <CampoSelecao
          id="fuso"
          name="fuso"
          rotulo="Fuso horário"
          defaultValue={fusoInicial}
        >
          {FUSOS.map((fuso) => (
            <option key={fuso.valor} value={fuso.valor}>
              {fuso.rotulo}
            </option>
          ))}
        </CampoSelecao>

        {/**
         * O design tem um par "Voltar / Continuar" aqui, e o "Voltar" fica de
         * fora **de propósito**: no design a conta ainda não existe no passo 2,
         * então voltar é editar o e-mail. No fluxo real a conta já foi criada e
         * confirmada quando esta tela abre — o passo 1 virou um formulário de
         * criar conta que criaria uma segunda. O botão do navegador continua
         * funcionando para quem quiser reler; o que não existe é um botão nosso
         * levando a um lugar sem sentido.
         */}
        <BotaoPrincipal type="submit" disabled={salvando} className="mt-3">
          {salvando ? "Salvando…" : "Continuar"}
        </BotaoPrincipal>
      </form>
    </>
  );
}
