/**
 * Conteúdo dos e-mails de acesso ao portal.
 *
 * Funções puras, sem efeito colateral, para poderem ser testadas sem SMTP
 * nenhum. Quem envia é o server.ts.
 *
 * Regra que vale para os dois: o e-mail vai para a caixa do próprio corretor,
 * mas ainda assim não carrega CPF, data de nascimento nem qualquer dado além
 * do primeiro nome. Caixa de e-mail é encaminhada, impressa e compartilhada;
 * o que não precisa estar lá não vai.
 */

export interface ConteudoEmail {
  assunto: string;
  texto: string;
  html: string;
}

const RODAPE_TEXTO =
  'Se você não solicitou este acesso, ignore esta mensagem — nenhuma alteração é feita sem que o link seja aberto.\n\n' +
  'Antecipa Soluções Financeiras — CNPJ 12.670.349/0001-10';

/** Só o primeiro nome: o resto não acrescenta nada e é dado pessoal a mais. */
function primeiroNome(nome: string): string {
  const limpo = String(nome ?? '').trim();
  if (!limpo) return 'Corretor(a)';
  const parte = limpo.split(/\s+/)[0];
  return parte.charAt(0).toUpperCase() + parte.slice(1).toLowerCase();
}

function montarHtml(saudacao: string, chamada: string, acao: string, link: string): string {
  return `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:24px;background:#f4f4f6;font-family:Arial,Helvetica,sans-serif;color:#0a0a0a;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:4px;padding:32px;">
    <p style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#8a8a8a;margin:0 0 24px;font-weight:bold;">Antecipa · Portal de Comissões</p>
    <p style="font-size:16px;margin:0 0 16px;">${saudacao}</p>
    <p style="font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 28px;">${chamada}</p>
    <a href="${link}" style="display:inline-block;background:#0a0a0a;color:#ffffff;text-decoration:none;padding:16px 28px;border-radius:3px;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;">${acao}</a>
    <p style="font-size:12px;line-height:1.6;color:#8a8a8a;margin:28px 0 0;">Se o botão não funcionar, copie e cole este endereço no navegador:<br><span style="color:#3a3a3a;word-break:break-all;">${link}</span></p>
    <hr style="border:none;border-top:1px solid #ededed;margin:28px 0;">
    <p style="font-size:11px;line-height:1.6;color:#a0a0a0;margin:0;">Se você não solicitou este acesso, ignore esta mensagem — nenhuma alteração é feita sem que o link seja aberto.</p>
    <p style="font-size:11px;color:#c0c0c0;margin:16px 0 0;">Antecipa Soluções Financeiras · CNPJ 12.670.349/0001-10</p>
  </div>
</body></html>`;
}

/** Primeiro acesso: o corretor ainda não tem senha. */
export function emailPrimeiroAcesso(nome: string, link: string): ConteudoEmail {
  const saudacao = `Olá, ${primeiroNome(nome)}.`;
  const chamada =
    'Recebemos um pedido de primeiro acesso ao Portal de Comissões da Antecipa. ' +
    'Use o botão abaixo para criar a sua senha. Depois disso, entre no portal com o seu CPF e a senha que você escolher.';

  return {
    assunto: 'Antecipa — crie a sua senha de acesso ao portal',
    texto: `${saudacao}\n\n${chamada}\n\n${link}\n\n${RODAPE_TEXTO}`,
    html: montarHtml(saudacao, chamada, 'Criar minha senha', link),
  };
}

/** Recuperação: já existe conta, a senha é que se perdeu. */
export function emailRecuperacaoSenha(nome: string, link: string): ConteudoEmail {
  const saudacao = `Olá, ${primeiroNome(nome)}.`;
  const chamada =
    'Recebemos um pedido de redefinição de senha do Portal de Comissões da Antecipa. ' +
    'Use o botão abaixo para escolher uma senha nova. Depois disso, entre no portal com o seu CPF.';

  return {
    assunto: 'Antecipa — redefinição de senha do portal',
    texto: `${saudacao}\n\n${chamada}\n\n${link}\n\n${RODAPE_TEXTO}`,
    html: montarHtml(saudacao, chamada, 'Redefinir minha senha', link),
  };
}
