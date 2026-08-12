/**
 * Modelos de mensagem do bot personalizados pelo dono. Módulo **puro**.
 *
 * Substituição de `{placeholder}` por valor, com validação na entrada. A regra
 * central é onde o erro acontece: **placeholder desconhecido é recusado na hora de
 * salvar**, não deixado passar para o cliente. Se um `{valro}` chegasse ao banco, o
 * WhatsApp do cliente receberia literalmente `{valro}` — e o dono descobriria pelo
 * cliente, dias depois, sem entender que digitou errado.
 *
 * É o mesmo raciocínio do léxico fechado da conversa: a falha aceitável é "não
 * entendi, corrija", nunca "aceitei algo que você não quis dizer".
 */

/** Chaves de texto que o dono pode personalizar. */
export type ChaveMensagem =
  | "sinal_cobranca"
  | "sinal_recebido"
  | "sinal_expirado";

export const CHAVES_MENSAGEM: ChaveMensagem[] = [
  "sinal_cobranca",
  "sinal_recebido",
  "sinal_expirado",
];

/**
 * Placeholders aceitos por chave.
 *
 * Por chave, e não uma lista global, porque o dado só existe em alguns momentos:
 * `{prazo}` faz sentido ao pedir o sinal e não ao confirmar que ele caiu, e no
 * texto de vencimento não há valor nem horário a citar — o horário acabou de ser
 * liberado. Uma lista global aceitaria `{prazo}` na confirmação e renderizaria
 * vazio, que é o tipo de furo que só aparece em produção.
 */
export const PLACEHOLDERS_POR_CHAVE: Record<ChaveMensagem, string[]> = {
  sinal_cobranca: ["valor", "servico", "quando", "prazo"],
  sinal_recebido: ["valor", "servico", "quando"],
  sinal_expirado: [],
};

/**
 * Placeholders SEM os quais a mensagem deixa de cumprir a função.
 *
 * Não é "todos os que existem": é o dado cuja ausência quebra a mensagem.
 *
 *  - na cobrança, `{valor}` (sem ele o cliente não sabe quanto pagar) e `{prazo}`
 *    — este último porque, sem prazo dito, a expiração do horário vira
 *    reclamação: o cliente não teve como saber que havia consequência;
 *  - na confirmação, `{quando}` — "seu sinal foi recebido" sem dizer qual horário
 *    é ambíguo para quem tem mais de um agendamento.
 *
 * O resto é escolha de estilo do dono e fica livre.
 */
export const OBRIGATORIOS_POR_CHAVE: Record<ChaveMensagem, string[]> = {
  sinal_cobranca: ["valor", "prazo"],
  sinal_recebido: ["quando"],
  sinal_expirado: [],
};

/** Tudo entre chaves, para achar o que o dono escreveu — inclusive o errado. */
const PLACEHOLDER = /\{([^{}]*)\}/g;

export type ResultadoValidacao =
  | { ok: true; texto: string }
  | { ok: false; erro: string };

function listar(nomes: string[]): string {
  return nomes.map((n) => `{${n}}`).join(", ");
}

/**
 * Valida e normaliza um texto que o dono acabou de escrever.
 *
 * `texto` em branco devolve `ok` com string vazia — significa "voltar ao padrão",
 * e é o chamador que traduz isso em apagar a linha. Gravar branco faria o bot
 * enviar mensagem vazia, que a Evolution aceita e o cliente recebe como bolha em
 * branco.
 */
export function validarModelo(
  chave: ChaveMensagem,
  texto: string,
  limite = 900,
): ResultadoValidacao {
  const limpo = texto.trim();
  if (limpo === "") return { ok: true, texto: "" };

  if (limpo.length > limite) {
    return {
      ok: false,
      erro: `O texto passou de ${limite} caracteres. Mensagem longa vira "Ler mais" no celular do cliente e esconde justamente o fim, onde está o valor.`,
    };
  }

  const permitidos = PLACEHOLDERS_POR_CHAVE[chave];
  const usados = [...limpo.matchAll(PLACEHOLDER)].map((m) => m[1].trim());
  const desconhecidos = [...new Set(usados)].filter(
    (nome) => !permitidos.includes(nome),
  );

  if (desconhecidos.length > 0) {
    return {
      ok: false,
      erro:
        `Não reconheço ${listar(desconhecidos)}. ` +
        (permitidos.length > 0
          ? `Aqui você pode usar: ${listar(permitidos)}.`
          : "Este texto não aceita nenhum campo automático."),
    };
  }

  /**
   * Obrigatórios ausentes recusam o texto, e é a única validação aqui que julga
   * **conteúdo** e não sintaxe.
   *
   * A alternativa seria aceitar e deixar o dono descobrir depois: uma cobrança sem
   * `{valor}` faz o cliente perguntar quanto é, e uma sem `{prazo}` transforma a
   * expiração em reclamação — o cliente não teve como saber que o horário caía.
   * Barrar na hora de salvar é o único momento em que alguém está olhando.
   */
  const faltando = OBRIGATORIOS_POR_CHAVE[chave].filter(
    (nome) => !usados.includes(nome),
  );

  if (faltando.length > 0) {
    return {
      ok: false,
      erro:
        `Este texto precisa citar ${listar(faltando)}. ` +
        "Sem isso o cliente não recebe a informação que a mensagem existe para dar.",
    };
  }

  return { ok: true, texto: limpo };
}

/**
 * Troca os placeholders pelos valores.
 *
 * Só troca o que conhece: um `{algo}` que tenha escapado da validação (linha
 * gravada antes de uma chave mudar de conjunto, por exemplo) fica **como está** em
 * vez de virar `undefined` ou string vazia no meio da frase. Preferir o texto
 * estranho ao texto mutilado — "sinal de {valor} recebido" ao menos denuncia o
 * problema, enquanto "sinal de  recebido" parece só um erro de digitação do dono.
 */
export function aplicarModelo(
  texto: string,
  valores: Record<string, string>,
): string {
  return texto.replace(PLACEHOLDER, (original, nome: string) => {
    const valor = valores[nome.trim()];
    return valor === undefined ? original : valor;
  });
}

/**
 * Escolhe entre o modelo do dono e o texto padrão do código.
 *
 * Fallback em duas condições — sem linha no banco e linha com texto vazio —
 * porque as duas significam a mesma coisa para o bot, e depender de só uma
 * deixaria o outro caminho mandando mensagem em branco.
 */
export function renderizarOuPadrao(
  modelo: string | null | undefined,
  valores: Record<string, string>,
  padrao: string,
): string {
  const limpo = modelo?.trim();
  if (!limpo) return padrao;

  return aplicarModelo(limpo, valores);
}

/**
 * Quebra o texto em pedaços comuns e placeholders, para destacar as chaves na
 * interface.
 *
 * Pura, e fora do componente, por dois motivos: dá para testar sem navegador, e o
 * destaque precisa marcar **o que o dono escreveu**, inclusive o inválido — um
 * `{valro}` aparece marcado como desconhecido em vez de passar como texto comum,
 * que é justamente a pista visual de que algo está errado antes de salvar.
 */
export type PedacoTexto =
  | { tipo: "texto"; valor: string }
  | { tipo: "campo"; valor: string; nome: string; conhecido: boolean };

export function dividirPlaceholders(
  texto: string,
  permitidos: string[],
): PedacoTexto[] {
  const pedacos: PedacoTexto[] = [];
  let ultimo = 0;

  for (const achado of texto.matchAll(PLACEHOLDER)) {
    const inicio = achado.index ?? 0;

    if (inicio > ultimo) {
      pedacos.push({ tipo: "texto", valor: texto.slice(ultimo, inicio) });
    }

    const nome = achado[1].trim();
    pedacos.push({
      tipo: "campo",
      valor: achado[0],
      nome,
      conhecido: permitidos.includes(nome),
    });

    ultimo = inicio + achado[0].length;
  }

  if (ultimo < texto.length) {
    pedacos.push({ tipo: "texto", valor: texto.slice(ultimo) });
  }

  return pedacos;
}
