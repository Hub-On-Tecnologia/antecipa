import { describe, it, expect } from 'vitest';
import { normalizeCPF, normalizeDate, normalizeName, formatarCPF, formatarDataBR, cpfEhValido, dataBREhValida } from './utils';

describe('normalizeCPF', () => {
  it('remove pontuação e retorna só dígitos', () => {
    expect(normalizeCPF('123.456.789-09')).toBe('12345678909');
  });

  it('completa com zeros à esquerda se tiver menos de 11 dígitos', () => {
    expect(normalizeCPF('123')).toBe('00000000123');
  });

  it('retorna string vazia para entrada vazia', () => {
    expect(normalizeCPF('')).toBe('');
  });

  it('lida com undefined/null convertido para string', () => {
    expect(normalizeCPF(String(null))).toBe('');
  });
});

describe('normalizeDate', () => {
  it('converte data ISO (YYYY-MM-DD) para DDMMYYYY', () => {
    expect(normalizeDate('1990-05-20')).toBe('20051990');
  });

  it('mantém data já sem separadores', () => {
    expect(normalizeDate('20051990')).toBe('20051990');
  });

  it('retorna string vazia para entrada vazia', () => {
    expect(normalizeDate('')).toBe('');
  });

  it('remove caracteres não numéricos de formatos desconhecidos', () => {
    expect(normalizeDate('20/05/1990')).toBe('20051990');
  });
});

describe('normalizeName', () => {
  it('converte para minúsculas e remove espaços extras', () => {
    expect(normalizeName('  João   Silva  ')).toBe('joão silva');
  });

  it('colapsa múltiplos espaços internos em um único', () => {
    expect(normalizeName('Ana   Paula   Lima')).toBe('ana paula lima');
  });

  it('lida com string já normalizada', () => {
    expect(normalizeName('pedro souza')).toBe('pedro souza');
  });
});

describe('formatarCPF — máscara de digitação', () => {
  it('aplica a máscara progressivamente', () => {
    expect(formatarCPF('123')).toBe('123');
    expect(formatarCPF('1234')).toBe('123.4');
    expect(formatarCPF('1234567')).toBe('123.456.7');
    expect(formatarCPF('12345678909')).toBe('123.456.789-09');
  });

  it('ignora letras e trunca o excedente', () => {
    expect(formatarCPF('abc12345678909999')).toBe('123.456.789-09');
  });

  it('o resultado ainda normaliza para o mesmo CPF', () => {
    // A máscara é só visual: o que vai ao servidor passa por normalizeCPF.
    expect(normalizeCPF(formatarCPF('12345678909'))).toBe('12345678909');
  });

  it('não estoura com vazio', () => {
    expect(formatarCPF('')).toBe('');
  });
});

describe('cpfEhValido — dígitos verificadores', () => {
  it('aceita CPF válido com e sem pontuação', () => {
    expect(cpfEhValido('123.456.789-09')).toBe(true);
    expect(cpfEhValido('12345678909')).toBe(true);
  });

  it('recusa dígito verificador errado', () => {
    expect(cpfEhValido('12345678900')).toBe(false);
  });

  it('recusa sequência repetida, que passa na aritmética mas não vale', () => {
    expect(cpfEhValido('11111111111')).toBe(false);
    expect(cpfEhValido('00000000000')).toBe(false);
  });

  it('recusa tamanho errado e entrada vazia', () => {
    expect(cpfEhValido('123456789')).toBe(false);
    expect(cpfEhValido('')).toBe(false);
    expect(cpfEhValido(null as any)).toBe(false);
  });
});

describe('dataBREhValida — data real do calendário', () => {
  it('aceita data completa e existente', () => {
    expect(dataBREhValida('14/03/1985')).toBe(true);
    expect(dataBREhValida('29/02/2024')).toBe(true); // bissexto
  });

  it('recusa dia que não existe no mês', () => {
    expect(dataBREhValida('31/04/1990')).toBe(false);
    expect(dataBREhValida('29/02/2023')).toBe(false); // não bissexto
  });

  it('recusa mês fora da faixa e formato incompleto', () => {
    expect(dataBREhValida('10/13/1990')).toBe(false);
    expect(dataBREhValida('14/03')).toBe(false);
    expect(dataBREhValida('')).toBe(false);
  });

  it('recusa ano absurdo ou no futuro', () => {
    expect(dataBREhValida('01/01/1899')).toBe(false);
    expect(dataBREhValida(`01/01/${new Date().getFullYear() + 1}`)).toBe(false);
  });
});

describe('formatarDataBR — máscara de digitação', () => {
  it('aplica a máscara progressivamente', () => {
    expect(formatarDataBR('14')).toBe('14');
    expect(formatarDataBR('1403')).toBe('14/03');
    expect(formatarDataBR('14031985')).toBe('14/03/1985');
  });

  it('trunca o excedente', () => {
    expect(formatarDataBR('140319851234')).toBe('14/03/1985');
  });

  it('não estoura com vazio', () => {
    expect(formatarDataBR('')).toBe('');
  });
});
