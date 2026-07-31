import { describe, it, expect } from 'vitest';
import {
  isUserAllowed,
  cpfDaLinha,
  maskCpf,
  matchCorretor,
  acharPorCpf,
  mapCorretor,
  emailSinteticoDoCpf,
  DOMINIO_CORRETOR,
} from './identity';

/** Linha típica do MariaDB, com os nomes de coluna reais da base. */
const linha = (over: Record<string, any> = {}) => ({
  nome: 'João da Silva',
  datanascimento: '1985-03-14',
  cpfcnpj: '123.456.789-09',
  empresa: 'Corpstek',
  cargo: 'Corretor',
  superintendencia: 'Sul',
  loja: 'Loja 1',
  ...over,
});

describe('isUserAllowed — perfil administrativo', () => {
  it('aceita conta na allowlist com e-mail verificado', () => {
    const token = { uid: 'u1', email: 'admin@hubon.tech', email_verified: true };
    expect(isUserAllowed(token, 'admin@hubon.tech')).toBe(true);
  });

  it('RECUSA e-mail da allowlist que não foi verificado', () => {
    // Sem isso, bastaria registrar uma conta com o e-mail de um administrador,
    // sem nunca provar posse dele, para ganhar acesso administrativo.
    const token = { uid: 'u1', email: 'admin@hubon.tech', email_verified: false };
    expect(isUserAllowed(token, 'admin@hubon.tech')).toBe(false);
  });

  it('RECUSA e-mail da allowlist sem o campo email_verified', () => {
    const token = { uid: 'u1', email: 'admin@hubon.tech' };
    expect(isUserAllowed(token, 'admin@hubon.tech')).toBe(false);
  });

  it('aceita por uid, que não depende de verificação de e-mail', () => {
    const token = { uid: 'uid-abc', email: 'qualquer@gmail.com' };
    expect(isUserAllowed(token, 'uid-abc')).toBe(true);
  });

  it('aceita custom claim de admin', () => {
    expect(isUserAllowed({ uid: 'u1', admin: true }, '')).toBe(true);
    expect(isUserAllowed({ uid: 'u1', allowed: true }, '')).toBe(true);
  });

  it('FALHA FECHADA: allowlist vazia nega todo mundo', () => {
    const token = { uid: 'u1', email: 'alguem@hubon.tech', email_verified: true };
    expect(isUserAllowed(token, '')).toBe(false);
    expect(isUserAllowed(token, '   ')).toBe(false);
    expect(isUserAllowed(token, ',, ,')).toBe(false);
  });

  it('nega token ausente', () => {
    expect(isUserAllowed(null, 'admin@hubon.tech')).toBe(false);
    expect(isUserAllowed(undefined, 'admin@hubon.tech')).toBe(false);
  });

  it('ignora espaços e diferenças de caixa na lista', () => {
    const token = { uid: 'u1', email: 'Admin@Hubon.Tech', email_verified: true };
    expect(isUserAllowed(token, ' outro@x.com , ADMIN@hubon.tech ')).toBe(true);
  });

  it('nega conta que não está na lista', () => {
    const token = { uid: 'u9', email: 'estranho@gmail.com', email_verified: true };
    expect(isUserAllowed(token, 'admin@hubon.tech')).toBe(false);
  });
});

describe('cpfDaLinha — variações de nome de coluna', () => {
  it('encontra o CPF em qualquer uma das colunas conhecidas', () => {
    expect(cpfDaLinha({ cpf: '111' })).toBe('111');
    expect(cpfDaLinha({ CPF: '222' })).toBe('222');
    expect(cpfDaLinha({ cpf_cnpj: '333' })).toBe('333');
    expect(cpfDaLinha({ cpfcnpj: '444' })).toBe('444');
    expect(cpfDaLinha({ documento: '555' })).toBe('555');
  });

  it('devolve string vazia quando não há coluna de CPF', () => {
    expect(cpfDaLinha({ nome: 'X' })).toBe('');
  });
});

describe('maskCpf — o CPF completo nunca chega ao navegador', () => {
  it('mostra apenas os dois últimos dígitos', () => {
    expect(maskCpf('123.456.789-09')).toBe('***.***.***-09');
    expect(maskCpf('12345678909')).toBe('***.***.***-09');
  });

  it('não vaza dígitos quando o valor é curto ou vazio', () => {
    expect(maskCpf('')).toBe('***');
    expect(maskCpf('7')).toBe('***');
  });

  it('o resultado nunca contém o CPF original', () => {
    expect(maskCpf('123.456.789-09')).not.toContain('123');
    expect(maskCpf('123.456.789-09')).not.toContain('456');
  });
});

describe('matchCorretor — conferência de identidade no primeiro acesso', () => {
  const alvo = { nome: 'João da Silva', dataNascimento: '1985-03-14', cpf: '123.456.789-09' };

  it('reconhece o corretor com os três campos corretos', () => {
    expect(matchCorretor(linha(), alvo)).toBe(true);
  });

  it('tolera diferenças de formatação que não mudam a identidade', () => {
    expect(matchCorretor(linha(), { ...alvo, cpf: '12345678909' })).toBe(true);
    expect(matchCorretor(linha(), { ...alvo, nome: '  joão   DA silva ' })).toBe(true);
    expect(matchCorretor(linha(), { ...alvo, dataNascimento: '14/03/1985' })).toBe(true);
  });

  it('recusa quando o CPF diverge', () => {
    expect(matchCorretor(linha(), { ...alvo, cpf: '999.888.777-66' })).toBe(false);
  });

  it('recusa quando o nome diverge', () => {
    expect(matchCorretor(linha(), { ...alvo, nome: 'Maria Souza' })).toBe(false);
  });

  it('recusa quando a data de nascimento diverge', () => {
    expect(matchCorretor(linha(), { ...alvo, dataNascimento: '1990-01-01' })).toBe(false);
  });

  it('NUNCA casa com campos vazios', () => {
    // Sem esta guarda, um pedido sem CPF casaria com qualquer linha que também
    // tivesse a coluna vazia — e o atacante viraria aquele corretor.
    const vazia = linha({ cpfcnpj: '', nome: '', datanascimento: '' });
    expect(matchCorretor(vazia, { nome: '', dataNascimento: '', cpf: '' })).toBe(false);
    expect(matchCorretor(linha(), { ...alvo, cpf: '' })).toBe(false);
    expect(matchCorretor(linha(), { ...alvo, nome: '' })).toBe(false);
    expect(matchCorretor(linha(), { ...alvo, dataNascimento: '' })).toBe(false);
  });

  it('exige os TRÊS campos: dois certos e um errado não bastam', () => {
    expect(matchCorretor(linha(), { ...alvo, cpf: '999.888.777-66' })).toBe(false);
    expect(matchCorretor(linha(), { ...alvo, nome: 'Outro Nome' })).toBe(false);
  });
});

describe('acharPorCpf', () => {
  const base = [linha({ cpfcnpj: '111.111.111-11' }), linha({ cpfcnpj: '123.456.789-09' })];

  it('encontra pelo CPF normalizado, independente da formatação da base', () => {
    expect(acharPorCpf(base, '12345678909')).not.toBeNull();
  });

  it('devolve null quando o corretor não está mais ativo na base', () => {
    expect(acharPorCpf(base, '99999999999')).toBeNull();
  });

  it('devolve null para CPF vazio em vez de casar com qualquer linha', () => {
    expect(acharPorCpf(base, '')).toBeNull();
  });
});

describe('mapCorretor — só o necessário vai para a interface', () => {
  it('mapeia os campos que a tela usa', () => {
    const c = mapCorretor(linha());
    expect(c.nome).toBe('João da Silva');
    expect(c.empresa).toBe('Corpstek');
    expect(c.cargo).toBe('Corretor');
    expect(c.superintendencia).toBe('Sul');
    expect(c.loja).toBe('Loja 1');
  });

  it('devolve o CPF mascarado, nunca o completo', () => {
    const c = mapCorretor(linha());
    expect(c.cpf).toBe('***.***.***-09');
    expect(JSON.stringify(c)).not.toContain('123.456.789');
    expect(JSON.stringify(c)).not.toContain('12345678909');
  });

  it('não devolve a data de nascimento ao cliente', () => {
    expect(mapCorretor(linha()).dataNascimento).toBe('');
    expect(JSON.stringify(mapCorretor(linha()))).not.toContain('1985');
  });

  it('não carrega colunas extras da linha do banco', () => {
    const c = mapCorretor(linha({ salario: '99999', senha_interna: 'segredo' }));
    const serializado = JSON.stringify(c);
    expect(serializado).not.toContain('99999');
    expect(serializado).not.toContain('segredo');
  });

  it('suporta os nomes de coluna em caixa alta', () => {
    const c = mapCorretor({ NOME: 'Maria', CPF: '98765432100', EMPRESA: 'X' });
    expect(c.nome).toBe('Maria');
    expect(c.empresa).toBe('X');
    expect(c.cpf).toBe('***.***.***-00');
  });
});

describe('emailSinteticoDoCpf — identificador de login por CPF', () => {
  it('deriva o identificador do CPF limpo', () => {
    expect(emailSinteticoDoCpf('12345678909')).toBe(`12345678909@${DOMINIO_CORRETOR}`);
  });

  it('ignora a formatação: pontuado e limpo geram o MESMO identificador', () => {
    // Se divergissem, o corretor criaria a senha por um caminho e não
    // conseguiria entrar pelo outro.
    expect(emailSinteticoDoCpf('123.456.789-09')).toBe(emailSinteticoDoCpf('12345678909'));
  });

  it('completa com zeros à esquerda, igual ao resto do sistema', () => {
    // A base guarda CPF como número em alguns registros, perdendo o zero.
    expect(emailSinteticoDoCpf('1234567890')).toBe(`01234567890@${DOMINIO_CORRETOR}`);
  });

  it('aceita domínio customizado', () => {
    expect(emailSinteticoDoCpf('12345678909', 'x.dev')).toBe('12345678909@x.dev');
  });

  it('devolve vazio para entrada inválida em vez de identificador que casa com qualquer um', () => {
    expect(emailSinteticoDoCpf('')).toBe('');
    expect(emailSinteticoDoCpf('abc')).toBe('');
    expect(emailSinteticoDoCpf('00000000000')).toBe('');
    expect(emailSinteticoDoCpf(null as any)).toBe('');
    expect(emailSinteticoDoCpf(undefined as any)).toBe('');
  });

  it('não vaza o CPF em domínio que receba e-mail de verdade', () => {
    // O domínio é só identificador interno do Firebase; se apontasse para um
    // servidor de e-mail real, o CPF viraria endereço público.
    expect(DOMINIO_CORRETOR).toBe('corretor.antecipa.com.br');
  });
});
