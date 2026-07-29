import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocka o módulo inteiro de fetch para não depender de rede
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mocka import.meta.env para não depender do .env
vi.stubGlobal('import', {
  meta: { env: {} }
});

// Importa depois do mock para o módulo pegar os stubs
const { fetchUsers } = await import('./sheetsService');

const makeRow = (overrides: Record<string, any> = {}) => ({
  nome: 'João Silva',
  datanascimento: '1990-05-15',
  cpf: '12345678901',
  empresa: 'Empresa Teste',
  cargo: 'Corretor',
  superintendencia: '',
  loja: 'Loja A',
  ...overrides,
});

const makeResponse = (rows: any[], ok = true, status = 200) =>
  Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve({ ok: true, rows }),
  } as Response);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchUsers — mapeamento de campos do banco', () => {
  it('mapeia campos padrão corretamente', async () => {
    mockFetch.mockReturnValueOnce(makeResponse([makeRow()]));
    const users = await fetchUsers();
    expect(users).toHaveLength(1);
    expect(users[0].nome).toBe('João Silva');
    expect(users[0].dataNascimento).toBe('1990-05-15');
    expect(users[0].cpf).toBe('12345678901');
    expect(users[0].empresa).toBe('Empresa Teste');
    expect(users[0].cargo).toBe('Corretor');
    expect(users[0].loja).toBe('Loja A');
  });

  it('usa campo NOME em maiúsculo como fallback de nome', async () => {
    mockFetch.mockReturnValueOnce(makeResponse([makeRow({ nome: undefined, NOME: 'Maria Souza' })]));
    const users = await fetchUsers();
    expect(users[0].nome).toBe('Maria Souza');
  });

  it('usa campo nome_corretor como último fallback de nome', async () => {
    mockFetch.mockReturnValueOnce(makeResponse([makeRow({ nome: undefined, NOME: undefined, nome_corretor: 'Carlos Lima' })]));
    const users = await fetchUsers();
    expect(users[0].nome).toBe('Carlos Lima');
  });

  it('usa cpfcnpj como fallback de CPF', async () => {
    mockFetch.mockReturnValueOnce(makeResponse([makeRow({ cpf: undefined, CPF: undefined, cpf_cnpj: undefined, cpfcnpj: '98765432100' })]));
    const users = await fetchUsers();
    expect(users[0].cpf).toBe('98765432100');
  });

  it('usa campo documento como último fallback de CPF', async () => {
    mockFetch.mockReturnValueOnce(makeResponse([makeRow({ cpf: undefined, CPF: undefined, cpf_cnpj: undefined, cpfcnpj: undefined, documento: '11122233344' })]));
    const users = await fetchUsers();
    expect(users[0].cpf).toBe('11122233344');
  });

  it('retorna lista vazia quando o banco não tem linhas', async () => {
    mockFetch.mockReturnValueOnce(makeResponse([]));
    const users = await fetchUsers();
    expect(users).toHaveLength(0);
  });

  it('retorna múltiplos usuários corretamente', async () => {
    mockFetch.mockReturnValueOnce(makeResponse([
      makeRow({ nome: 'Ana' }),
      makeRow({ nome: 'Bruno' }),
      makeRow({ nome: 'Carla' }),
    ]));
    const users = await fetchUsers();
    expect(users).toHaveLength(3);
    expect(users.map(u => u.nome)).toEqual(['Ana', 'Bruno', 'Carla']);
  });
});

describe('fetchUsers — tratamento de erro', () => {
  it('lança erro quando o servidor retorna 401', async () => {
    mockFetch.mockReturnValueOnce(makeResponse([], false, 401));
    await expect(fetchUsers()).rejects.toThrow('Erro ao buscar usuários no servidor: 401');
  });

  it('lança erro quando o servidor retorna 500', async () => {
    mockFetch.mockReturnValueOnce(makeResponse([], false, 500));
    await expect(fetchUsers()).rejects.toThrow('Erro ao buscar usuários no servidor: 500');
  });

  it('lança erro quando o fetch falha por timeout/rede', async () => {
    mockFetch.mockRejectedValueOnce(new Error('AbortError: timeout'));
    await expect(fetchUsers()).rejects.toThrow('AbortError: timeout');
  });
});
