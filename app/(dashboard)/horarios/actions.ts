"use server";

import { revalidatePath } from "next/cache";
import { nomeDoDia } from "@/lib/datas";
import { criarClienteServidor, exigirUsuario } from "@/lib/supabase/server";
import {
  faixaInvertida,
  faixasSobrepostas,
  gradeSemanalSchema,
  primeiroErro,
  type DiaDaGrade,
  type EstadoFormulario,
} from "@/lib/validacao/agenda";

/**
 * Substitui a grade semanal inteira.
 *
 * Antes eram duas ações por faixa (criar e excluir), e configurar a semana
 * pedia sete submissões sem nenhuma poder ser editada depois. O editor manda a
 * semana toda de uma vez.
 *
 * **Ordem de escrita: insere e só então apaga.** O `supabase-js` não abre
 * transação, então os dois passos podem se separar. Apagando primeiro, uma falha
 * no insert deixaria o estabelecimento sem horário nenhum e o bot pararia de
 * oferecer agenda — o pior desfecho possível. Na ordem inversa, a falha deixa
 * faixas duplicadas, que `calcularSlots` já deduplica por instante de início
 * (ver `lib/bot/disponibilidade.ts`), e o dono conserta salvando de novo.
 */
export async function definirGrade(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const usuarioId = await exigirUsuario();

  let bruto: unknown;
  try {
    bruto = JSON.parse(String(formData.get("grade") ?? ""));
  } catch {
    return { erro: "Não foi possível ler os horários enviados." };
  }

  const parsed = gradeSemanalSchema.safeParse(bruto);
  if (!parsed.success) return { erro: primeiroErro(parsed.error) };

  const erroDeRegra = validarDias(parsed.data.dias);
  if (erroDeRegra) return { erro: erroDeRegra };

  const supabase = await criarClienteServidor();

  const { data: atuais } = await supabase
    .from("horarios_disponiveis")
    .select("id")
    .eq("usuario_id", usuarioId);

  const linhas = parsed.data.dias.flatMap((dia) =>
    dia.faixas.map((faixa) => ({
      usuario_id: usuarioId,
      dia_semana: dia.diaSemana,
      hora_inicio: faixa.horaInicio,
      hora_fim: faixa.horaFim,
    })),
  );

  if (linhas.length > 0) {
    const { error } = await supabase.from("horarios_disponiveis").insert(linhas);
    if (error) return { erro: "Não foi possível salvar os horários." };
  }

  const idsAntigos = (atuais ?? []).map((linha) => linha.id);
  if (idsAntigos.length > 0) {
    await supabase
      .from("horarios_disponiveis")
      .delete()
      .eq("usuario_id", usuarioId)
      .in("id", idsAntigos);
  }

  revalidatePath("/horarios");
  return { ok: true };
}

/** Regras que o schema não expressa: fim depois do início e sem sobreposição. */
function validarDias(dias: DiaDaGrade[]): string | null {
  for (const dia of dias) {
    const invertida = faixaInvertida(dia.faixas);
    if (invertida) {
      return `Em ${nomeDoDia(dia.diaSemana)}, o horário de fim (${invertida.horaFim}) precisa ser depois do início (${invertida.horaInicio}).`;
    }

    if (faixasSobrepostas(dia.faixas)) {
      return `Em ${nomeDoDia(dia.diaSemana)} há faixas que se sobrepõem.`;
    }
  }

  return null;
}
