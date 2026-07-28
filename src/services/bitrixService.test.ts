import { describe, it, expect } from 'vitest';
import {
  mapBitrixStageToStatus,
  mapBitrixStageToLabel,
  parseBitrixCurrency,
} from './bitrixService';

describe('mapBitrixStageToStatus', () => {
  it('retorna "approved" para estágio WON', () => {
    expect(mapBitrixStageToStatus('C89:WON')).toBe('approved');
  });

  it('retorna "approved" para estágio UC_3M0B5Y', () => {
    expect(mapBitrixStageToStatus('C89:UC_3M0B5Y')).toBe('approved');
  });

  it('retorna "rejected" para estágio LOSE', () => {
    expect(mapBitrixStageToStatus('C89:LOSE')).toBe('rejected');
  });

  it('retorna "rejected" para estágio APOLOGY', () => {
    expect(mapBitrixStageToStatus('C89:APOLOGY')).toBe('rejected');
  });

  it('retorna "pending" para estágio NEW', () => {
    expect(mapBitrixStageToStatus('C89:NEW')).toBe('pending');
  });

  it('retorna "pending" para estágio desconhecido', () => {
    expect(mapBitrixStageToStatus('C89:QUALQUER_COISA')).toBe('pending');
  });
});

describe('mapBitrixStageToLabel', () => {
  it('retorna label correto para NEW', () => {
    expect(mapBitrixStageToLabel('C89:NEW')).toBe('Solicitação Encaminhada');
  });

  it('retorna label correto para PREPARATION', () => {
    expect(mapBitrixStageToLabel('C89:PREPARATION')).toBe('Análise de Risco');
  });

  it('retorna label correto para WON', () => {
    expect(mapBitrixStageToLabel('C89:WON')).toBe('Antecipação Realizada');
  });

  it('retorna label correto para LOSE', () => {
    expect(mapBitrixStageToLabel('C89:LOSE')).toBe('Antecipação Negada');
  });

  it('retorna fallback para estágio desconhecido', () => {
    expect(mapBitrixStageToLabel('C89:QUALQUER')).toBe('Em Tratativa Jurídica');
  });
});

describe('parseBitrixCurrency', () => {
  it('parseia número direto', () => {
    expect(parseBitrixCurrency(1500.5)).toBe(1500.5);
  });

  it('parseia string com formato BR (vírgula decimal)', () => {
    expect(parseBitrixCurrency('1.500,75')).toBe(1500.75);
  });

  it('parseia string com formato EN (ponto decimal)', () => {
    expect(parseBitrixCurrency('1500.75')).toBe(1500.75);
  });

  it('retorna 0 para valor nulo', () => {
    expect(parseBitrixCurrency(null)).toBe(0);
  });

  it('retorna 0 para string vazia', () => {
    expect(parseBitrixCurrency('')).toBe(0);
  });

  it('retorna 0 para NaN', () => {
    expect(parseBitrixCurrency(NaN)).toBe(0);
  });

  it('parseia objeto com campo amount', () => {
    expect(parseBitrixCurrency({ amount: 999.99 })).toBe(999.99);
  });
});
