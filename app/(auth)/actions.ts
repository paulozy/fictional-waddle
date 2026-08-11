"use server";

import { redirect } from "next/navigation";
import { urlAbsoluta } from "@/lib/site";
import {
  ROTA_LOGIN,
  ROTA_PADRAO_LOGADO,
  ROTA_REGISTRO_CONFIRMAR,
  ROTA_REGISTRO_ESTABELECIMENTO,
  ROTA_REGISTRO_WHATSAPP,
} from "@/lib/supabase/proxy";
import { criarClienteServidor, exigirUsuario } from "@/lib/supabase/server";
import { contaTalvezCriada, mensagemDeCadastro } from "./mensagens";
import {
  lerCredenciais,
  lerEmail,
  lerEstabelecimento,
  lerNovaSenha,
  lerPlano,
  lerTelefone,
  type EstadoAuth,
} from "./schema";

/**
 * Para onde o link do e-mail volta. Uma constante, porque o mesmo caminho é
 * usado por `signUp` e por `resetPasswordForEmail`, e ele precisa estar na
 * allowlist de Redirect URLs do projeto Supabase — divergir num dos dois
 * lugares dá "requested path is invalid" só em produção.
 */
const RETORNO_EMAIL = "/auth/confirmar";

export async function entrar(
  _estado: EstadoAuth,
  formData: FormData,
): Promise<EstadoAuth> {
  const parsed = lerCredenciais(formData);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0].message };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.senha,
  });

  // Mensagem genérica de propósito: não revelar se o e-mail existe na base.
  if (error) return { erro: "E-mail ou senha não conferem." };

  redirect(ROTA_PADRAO_LOGADO);
}

export async function criarConta(
  _estado: EstadoAuth,
  formData: FormData,
): Promise<EstadoAuth> {
  const parsed = lerCredenciais(formData);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0].message };
  }

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.senha,
    options: {
      /**
       * Sem isto o link do e-mail volta para a raiz do site, onde não há nada
       * que troque o token por sessão — e o dono cai na landing, deslogado,
       * achando que o cadastro falhou.
       */
      emailRedirectTo: urlAbsoluta(`${RETORNO_EMAIL}?fluxo=cadastro`),
    },
  });

  if (error) {
    /**
     * Log **antes** da mensagem, e com o distintivo de "conta provavelmente já
     * gravada": é o único registro que liga um dono que reclama a uma falha de
     * infraestrutura nossa (SMTP fora, por exemplo). Sem ele, sobra um 500 no
     * painel do Supabase e nenhum rastro do lado da aplicação.
     */
    console.error("registro: signUp recusado", {
      codigo: error.code,
      bruta: error.message,
      contaTalvezCriada: contaTalvezCriada(error.code),
    });
    return { erro: mensagemDeCadastro(error.code) };
  }

  /**
   * Com confirmação de e-mail ligada, `signUp` **não** cria sessão — e os passos
   * 2 e 3 escrevem em `perfis` e na Evolution, que exigem uma. Então o wizard se
   * parte aqui: o dono confirma o e-mail e o link cai no passo 2 já logado.
   *
   * Com a confirmação desligada (é o caso do `supabase/config.toml` local) a
   * sessão já existe e o cadastro segue sem interrupção.
   */
  if (!data.session) {
    const destino = new URLSearchParams({ email: parsed.data.email });
    redirect(`${ROTA_REGISTRO_CONFIRMAR}?${destino}`);
  }

  redirect(ROTA_REGISTRO_ESTABELECIMENTO);
}

/** Passo 2: nome que o bot usa na conversa, e o fuso que orienta a agenda. */
export async function salvarEstabelecimento(
  _estado: EstadoAuth,
  formData: FormData,
): Promise<EstadoAuth> {
  const parsed = lerEstabelecimento(formData);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0].message };
  }

  const usuarioId = await exigirUsuario();
  const supabase = await criarClienteServidor();

  // `.eq("id", usuarioId)` mesmo com RLS: o client autenticado já não alcançaria
  // outra linha, e sem o filtro um `update` seria uma varredura desnecessária.
  const { error } = await supabase
    .from("perfis")
    .update({
      nome_estabelecimento: parsed.data.nome,
      fuso_horario: parsed.data.fuso,
    })
    .eq("id", usuarioId);

  if (error) {
    console.error("registro: falha ao salvar o perfil", error);
    return { erro: "Não foi possível salvar agora. Tente de novo." };
  }

  /*
    A faixa vai por RPC, e não neste `update`, porque `perfis.plano` está fora do
    `grant update` de `authenticated` de propósito — quem pudesse escrevê-lo se
    autoconcederia a capacidade de cobrar sinal. `escolher_plano_trial` é
    `security definer` **sem parâmetro de identidade** (o alvo é `auth.uid()`
    dentro dela) e só grava para quem está num trial real, em curso e não
    bloqueado. Ver o comentário da migration: a guarda exclui de propósito o VIP
    e o pagante.

    Depois do `update` de nome/fuso, e nunca antes: se a RPC falhar, o cadastro
    segue com o plano no default, que é a direção certa (menos capacidade vira
    conversa comercial; o inverso vira capacidade concedida por engano). O
    contrário deixaria `plano = 'sinal'` num perfil ainda sem nome — e o nome é o
    que o bot usa na mensagem ao cliente.
  */
  const plano = lerPlano(formData);
  const { data: desfecho, error: erroPlano } = await supabase.rpc(
    "escolher_plano_trial",
    { p_plano: plano },
  );

  /*
    Registrado, nunca devolvido à tela.

    `'nao_permitido'` é o caminho de quem tentou trocar fora do trial, e não há o
    que ele possa corrigir no formulário — a troca dele é por mensagem. Falha de
    rede também não vale travar aqui: nome e fuso já estão salvos, e barrar o
    cadastro na escolha de faixa perderia a conta inteira por causa do item mais
    barato de consertar depois.
  */
  if (erroPlano || (desfecho !== "trocado" && desfecho !== "sem_efeito")) {
    console.warn("registro: plano não foi aplicado", {
      usuario_id: usuarioId,
      plano,
      desfecho: desfecho ?? null,
      erro: erroPlano?.message,
    });
  }

  redirect(ROTA_REGISTRO_WHATSAPP);
}

/**
 * Passo 3: valida o número e manda para o painel de pareamento.
 *
 * **Não** gera o QR aqui de propósito. O painel de `conexao-whatsapp` tem
 * contagem de regeneração, expiração de 45s e polling, todos medidos contra a
 * Evolution 2.3.7; uma segunda cópia daquilo numa tela de cadastro divergiria na
 * primeira mudança.
 */
export async function irParaPareamento(
  _estado: EstadoAuth,
  formData: FormData,
): Promise<EstadoAuth> {
  await exigirUsuario();

  const numero = lerTelefone(formData);
  if (!numero.valido) return { erro: numero.erro };

  const query = new URLSearchParams({ numero: numero.numero, iniciar: "1" });
  redirect(`/conexao-whatsapp?${query}`);
}

/**
 * Manda o link de redefinição.
 *
 * A resposta é **sempre a mesma**, com ou sem conta no endereço: uma mensagem
 * que variasse transformaria esta tela num verificador de e-mails cadastrados. O
 * erro real vai para o log do servidor, onde só nós lemos.
 */
export async function enviarLinkRecuperacao(
  _estado: EstadoAuth,
  formData: FormData,
): Promise<EstadoAuth> {
  const parsed = lerEmail(formData);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0].message };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    { redirectTo: urlAbsoluta(`${RETORNO_EMAIL}?fluxo=recuperacao`) },
  );

  if (error) console.error("recuperação: envio recusado", error);

  return {
    aviso:
      "Se existir uma conta com esse e-mail, o link de redefinição chega em instantes. Confira também a caixa de spam.",
  };
}

export async function redefinirSenha(
  _estado: EstadoAuth,
  formData: FormData,
): Promise<EstadoAuth> {
  const parsed = lerNovaSenha(formData);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0].message };
  }

  // A sessão aqui é a de recuperação, criada por `/auth/confirmar`. Sem ela não
  // há em quem gravar — e é o que acontece quando o link expira.
  await exigirUsuario();

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.senha,
  });

  if (error) {
    /**
     * `same_password` é o único que vale traduzir: o Supabase recusa repetir a
     * senha atual, e sem mensagem própria o dono acha que a tela travou.
     */
    if (error.code === "same_password") {
      return { erro: "Escolha uma senha diferente da atual." };
    }
    console.error("redefinição: updateUser recusado", error);
    return { erro: "Não foi possível trocar a senha. Peça um link novo." };
  }

  redirect(ROTA_PADRAO_LOGADO);
}

export async function sair() {
  const supabase = await criarClienteServidor();
  await supabase.auth.signOut();
  redirect(ROTA_LOGIN);
}
