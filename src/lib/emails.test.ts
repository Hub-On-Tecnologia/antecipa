import { describe, it, expect } from 'vitest';
import { emailPrimeiroAcesso, emailRecuperacaoSenha } from './emails';

const LINK = 'https://exemplo.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=ABC123';

describe('emailPrimeiroAcesso', () => {
  it('leva o link no texto e no HTML', () => {
    const e = emailPrimeiroAcesso('João da Silva Santos', LINK);
    expect(e.texto).toContain(LINK);
    expect(e.html).toContain(LINK);
  });

  it('cumprimenta só pelo primeiro nome', () => {
    const e = emailPrimeiroAcesso('João da Silva Santos', LINK);
    expect(e.texto).toContain('Olá, João.');
    expect(e.texto).not.toContain('Silva');
  });

  it('normaliza nome em caixa alta, como vem da base', () => {
    const e = emailPrimeiroAcesso('MARIA APARECIDA', LINK);
    expect(e.texto).toContain('Olá, Maria.');
  });

  it('não estoura com nome vazio', () => {
    const e = emailPrimeiroAcesso('', LINK);
    expect(e.texto).toContain('Corretor(a)');
  });

  it('não carrega CPF nem nascimento', () => {
    // Caixa de e-mail é encaminhada e impressa: o que não precisa estar lá,
    // não vai. Aqui só entram primeiro nome e link.
    const e = emailPrimeiroAcesso('João da Silva', LINK);
    const tudo = e.assunto + e.texto + e.html;
    expect(tudo).not.toMatch(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/);
    expect(tudo).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it('diz o que fazer se o botão não funcionar', () => {
    const e = emailPrimeiroAcesso('João', LINK);
    expect(e.html).toContain('copie e cole');
  });

  it('orienta quem não pediu o acesso', () => {
    const e = emailPrimeiroAcesso('João', LINK);
    expect(e.texto).toContain('ignore esta mensagem');
    expect(e.html).toContain('ignore esta mensagem');
  });
});

describe('emailRecuperacaoSenha', () => {
  it('leva o link e fala de redefinição, não de criação', () => {
    const e = emailRecuperacaoSenha('Ana Paula', LINK);
    expect(e.texto).toContain(LINK);
    expect(e.assunto.toLowerCase()).toContain('redefini');
    expect(e.html).toContain('Redefinir minha senha');
  });

  it('tem assunto diferente do primeiro acesso', () => {
    // Se fossem iguais, o corretor não saberia qual e-mail abrir.
    expect(emailRecuperacaoSenha('Ana', LINK).assunto)
      .not.toBe(emailPrimeiroAcesso('Ana', LINK).assunto);
  });

  it('não carrega CPF', () => {
    const e = emailRecuperacaoSenha('Ana Paula', LINK);
    expect(e.assunto + e.texto + e.html).not.toMatch(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/);
  });
});
