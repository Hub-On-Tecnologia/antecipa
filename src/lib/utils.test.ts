import { describe, it, expect } from 'vitest';
import { normalizeCPF, normalizeDate, normalizeName } from './utils';

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
