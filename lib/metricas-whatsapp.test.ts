import { describe, expect, it } from "vitest";
import {
  dataHoraLocal,
  janelasDoDia,
  tempoRelativo,
} from "./metricas-whatsapp";

const SP = "America/Sao_Paulo";

describe("janelasDoDia", () => {
  it("corta o dia à meia-noite do negócio, não à de UTC", () => {
    // 2026-08-09T02:00Z é 08/08 23:00 em São Paulo: ainda é ontem para o dono.
    const { inicioHoje, inicioOntem } = janelasDoDia(
      new Date("2026-08-09T02:00:00Z"),
      SP,
    );

    // Meia-noite de 08/08 em SP = 03:00Z.
    expect(inicioHoje.toISOString()).toBe("2026-08-08T03:00:00.000Z");
    expect(inicioOntem.toISOString()).toBe("2026-08-07T03:00:00.000Z");
  });

  it("põe o lembrete das 23h dentro da janela de ontem", () => {
    /**
     * É o caso que motiva o módulo. O cron dispara de manhã, mas um lembrete
     * atrasado pode sair às 23h; contado em UTC ele cairia no dia seguinte e o
     * painel diria "0 lembretes ontem" numa noite em que oito saíram.
     */
    const agora = new Date("2026-08-09T14:00:00Z"); // 11:00 em SP, dia 09
    const { inicioHoje, inicioOntem } = janelasDoDia(agora, SP);
    const lembrete = new Date("2026-08-09T02:00:00Z"); // 08/08 23:00 em SP

    expect(lembrete >= inicioOntem).toBe(true);
    expect(lembrete < inicioHoje).toBe(true);
  });

  it("mantém 24h entre as duas janelas fora do horário de verão", () => {
    const { inicioHoje, inicioOntem } = janelasDoDia(
      new Date("2026-08-09T14:00:00Z"),
      SP,
    );
    expect(inicioHoje.getTime() - inicioOntem.getTime()).toBe(86_400_000);
  });

  it("respeita um fuso diferente do padrão", () => {
    // Manaus é UTC-4: a meia-noite local cai às 04:00Z.
    const { inicioHoje } = janelasDoDia(
      new Date("2026-08-09T14:00:00Z"),
      "America/Manaus",
    );
    expect(inicioHoje.toISOString()).toBe("2026-08-09T04:00:00.000Z");
  });
});

describe("tempoRelativo", () => {
  const agora = new Date("2026-08-09T14:00:00Z");

  it("devolve null quando o evento nunca aconteceu", () => {
    expect(tempoRelativo(null, agora, SP)).toBeNull();
  });

  it("resume o último minuto em vez de dizer 'há 0 minutos'", () => {
    expect(tempoRelativo(new Date("2026-08-09T13:59:30Z"), agora, SP)).toBe(
      "agora há pouco",
    );
  });

  it("usa minutos, horas e dias conforme a distância", () => {
    expect(tempoRelativo(new Date("2026-08-09T13:54:00Z"), agora, SP)).toBe(
      "há 6 minutos",
    );
    expect(tempoRelativo(new Date("2026-08-09T11:00:00Z"), agora, SP)).toBe(
      "há 3 horas",
    );
    expect(tempoRelativo(new Date("2026-08-07T14:00:00Z"), agora, SP)).toBe(
      "anteontem",
    );
  });

  it("vira data absoluta depois de um mês", () => {
    // "há 47 dias" não informa nada; a data, sim.
    expect(tempoRelativo(new Date("2026-06-23T14:00:00Z"), agora, SP)).toBe(
      "23/06/2026",
    );
  });
});

describe("dataHoraLocal", () => {
  it("formata no fuso do negócio, não no do processo", () => {
    expect(dataHoraLocal(new Date("2026-08-02T12:14:00Z"), SP)).toBe(
      "02/08, 09:14",
    );
  });
});
