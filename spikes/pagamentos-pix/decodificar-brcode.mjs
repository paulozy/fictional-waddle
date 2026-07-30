#!/usr/bin/env node
/**
 * Q4 (metade offline): o copia-e-cola é um BR Code EMV bem formado?
 *
 * Parser TLV do payload mais validação do CRC16, sem rede e sem pagar nada.
 * Responde a parte que dá para responder de graça: se o CRC fecha e os campos
 * obrigatórios estão lá, o payload é aceitável para um app de banco. A outra
 * metade — se o pagamento **liquida** — só um Pix real responde, porque test user
 * do Mercado Pago tende a não fechar Pix de verdade.
 *
 * Fonte da estrutura: Manual de Padrões para Iniciação do Pix (BCB), que adota o
 * EMV® QR Code Merchant-Presented. O CRC é CRC-16/CCITT-FALSE (poly 0x1021,
 * init 0xFFFF, sem reflexão), calculado sobre o payload inteiro **incluindo** o
 * "6304" do próprio campo 63.
 *
 * Este é o único arquivo do spike que talvez valha a pena sobreviver: uma asserção
 * de "o payload que mandamos ao cliente é válido" tem valor permanente, porque o
 * modo de falha de um payload torto é o cliente colar no banco e não funcionar —
 * silencioso do nosso lado.
 *
 * Uso: `node spikes/pagamentos-pix/decodificar-brcode.mjs [payload]`
 *      sem argumento, lê o `qr_code` de cobranca.json (gerado por 3-cobranca.mjs)
 *      `--autoteste` roda os vetores conhecidos abaixo, sem rede.
 *
 * O autoteste mora aqui dentro, e não num `*.test.ts`, de propósito: o `include`
 * do Vitest alcança qualquer `*.test.ts` ou `*.spec.tsx` em qualquer pasta, então
 * um arquivo de teste aqui entraria na suíte do produto e destruiria a
 * propriedade que faz este spike seguro — a de não conseguir quebrar build nem
 * teste.
 */

/**
 * Vetores que provam as duas metades independentes, e que existem porque a
 * primeira tentativa de validar isto usou um payload lembrado de cabeça, cujo CRC
 * não fechava — dava para concluir que o código estava errado quando o errado era
 * o vetor. Ambos abaixo são verificáveis:
 *
 * - `123456789` → `29B1` é o **check value publicado do CRC-16/CCITT-FALSE**, e
 *   valida o algoritmo sem depender de nada de Pix.
 * - O BR Code completo valida a **faixa** do cálculo (tudo menos os 4 dígitos
 *   finais, incluindo o "6304") e o parser aninhado, que aqui exercita os
 *   templates 26, 27, 62 e 80 de uma vez.
 */
const VETORES = {
  algoritmo: { entrada: "123456789", esperado: "29B1" },
  brcode:
    "00020104141234567890123426580014BR.GOV.BCB.PIX0136123e4567-e12b-12d1-a456-42665544000027300012BR.COM.OUTRO011001234567895204000053039865406123.455802BR5917NOME DO RECEBEDOR6008BRASILIA61087007490062190515RP12345678-201980390012BR.COM.OUTRO01190123.ABCD.3456.WXYZ6304AD38",
};

import { ARQUIVO_COBRANCA, lerJson, linha, titulo, veredito } from "./comum.mjs";

/** Templates que carregam TLV aninhado, e não valor solto. */
const ANINHADOS = new Set(["26", "27", "62", "80", "81", "82"]);

const ROTULOS = {
  "00": "Payload Format Indicator",
  "01": "Point of Initiation Method",
  26: "Merchant Account Information (Pix)",
  52: "Merchant Category Code",
  53: "Moeda (986 = BRL)",
  54: "Valor",
  58: "País",
  59: "Nome do recebedor",
  60: "Cidade",
  61: "CEP",
  62: "Additional Data Field",
  63: "CRC16",
};

const ROTULOS_26 = {
  "00": "GUI",
  "01": "Chave Pix",
  "02": "Descrição",
  25: "URL (Pix dinâmico)",
};

const ROTULOS_62 = { "05": "Reference Label (txid)" };

function crc16(texto) {
  let crc = 0xffff;

  for (const byte of Buffer.from(texto, "utf8")) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * TLV do EMV: 2 dígitos de id, 2 de tamanho, N de valor. Um tamanho que estoura o
 * fim da string é payload corrompido, não campo desconhecido — daí o throw.
 */
function parseTlv(payload) {
  const campos = [];
  let i = 0;

  while (i < payload.length) {
    const id = payload.slice(i, i + 2);
    const tamanho = Number(payload.slice(i + 2, i + 4));

    if (id.length < 2 || !Number.isInteger(tamanho)) {
      throw new Error(`TLV malformado na posição ${i}`);
    }

    const valor = payload.slice(i + 4, i + 4 + tamanho);
    if (valor.length !== tamanho) {
      throw new Error(`campo ${id} anuncia ${tamanho} chars e só tem ${valor.length}`);
    }

    campos.push({ id, valor });
    i += 4 + tamanho;
  }

  return campos;
}

function lerCobranca() {
  try {
    return lerJson(ARQUIVO_COBRANCA).point_of_interaction?.transaction_data?.qr_code;
  } catch {
    return undefined;
  }
}

const argumento = process.argv[2];
const autoteste = argumento === "--autoteste";

if (autoteste) {
  titulo("Autoteste — vetores conhecidos");

  const obtido = crc16(VETORES.algoritmo.entrada);
  const algoritmoOk = obtido === VETORES.algoritmo.esperado;
  veredito(
    "CRC-16/CCITT-FALSE",
    algoritmoOk,
    `crc16(${JSON.stringify(VETORES.algoritmo.entrada)}) = ${obtido}, esperado ${VETORES.algoritmo.esperado}`,
  );

  const faixaOk = crc16(VETORES.brcode.slice(0, -4)) === VETORES.brcode.slice(-4);
  veredito("Faixa do cálculo sobre BR Code real", faixaOk, faixaOk ? "confere" : "diverge");

  if (!algoritmoOk || !faixaOk) process.exit(1);
  linha();
  linha("Vetores ok. Segue para a decodificação do BR Code de referência.");
}

const payload = (autoteste ? VETORES.brcode : (argumento ?? lerCobranca()))?.trim();

if (!payload) {
  linha("Passe o payload como argumento, ou rode 3-cobranca.mjs antes.");
  process.exit(1);
}

titulo("Q4 — estrutura do BR Code");
linha(`${payload.length} caracteres`);
linha();

let campos;
try {
  campos = parseTlv(payload);
} catch (erro) {
  veredito("Q4", false, `payload não parseia: ${erro.message}`);
  process.exit(1);
}

for (const { id, valor } of campos) {
  const rotulo = ROTULOS[id] ?? `campo ${id}`;

  if (ANINHADOS.has(id)) {
    linha(`${id} ${rotulo}:`);
    const sub = id === "26" ? ROTULOS_26 : id === "62" ? ROTULOS_62 : {};
    for (const filho of parseTlv(valor)) {
      linha(`     ${filho.id} ${sub[filho.id] ?? `sub ${filho.id}`}: ${filho.valor}`);
    }
  } else {
    linha(`${id} ${rotulo}: ${valor}`);
  }
}

// O campo 63 é sempre o último e tem tamanho fixo 4, então o trecho a somar é
// tudo menos os 4 dígitos finais.
const semCrc = payload.slice(0, -4);
const crcRecebido = payload.slice(-4).toUpperCase();
const crcCalculado = crc16(semCrc);

const idsPresentes = new Set(campos.map((c) => c.id));
const obrigatorios = ["00", "26", "52", "53", "58", "59", "60", "63"];
const faltando = obrigatorios.filter((id) => !idsPresentes.has(id));

const usoUnico = campos.find((c) => c.id === "01")?.valor === "12";

titulo("Vereditos");
linha(`CRC recebido: ${crcRecebido} | calculado: ${crcCalculado}`);
veredito("CRC16", crcRecebido === crcCalculado, crcRecebido === crcCalculado ? "confere" : "DIVERGE");
veredito(
  "Campos obrigatórios",
  faltando.length === 0,
  faltando.length === 0 ? "todos presentes" : `faltando ${faltando.join(", ")}`,
);
linha(
  `  Point of Initiation: ${usoUnico ? "12 (uso único — é o que queremos para sinal)" : "não é 12; QR reutilizável"}`,
);
veredito(
  "Q4 (offline)",
  crcRecebido === crcCalculado && faltando.length === 0,
  "falta pagar de verdade para fechar Q4",
);
