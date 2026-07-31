import { describe, it, expect } from 'vitest';
import {
  normalizarCabecalho,
  mapearColunas,
  valorParaNumero,
  lerRecebiveis,
  assinaturaNegociacao,
} from './planilha';

/** Cabeçalho real do arquivo "CR 2025 ATUAL.xlsx", na ordem em que aparece. */
const CABECALHO = [
  'PV', '', 'EMPREENDIMENTO', 'Unidade', 'Loja', '', 'Construtora', 'Cliente',
  '', 'Corretor', 'Coordenador', 'Gerente', '', '', '', 'VALOR', 'Observação',
  '', '', ' A receber', '', 'Mês de previsão', 'Ano de Previsão',
];

const linha = (over: Record<number, any> = {}) => {
  const l: any[] = new Array(23).fill('');
  l[0] = '7091';
  l[2] = 'RESIDENCIAL X';
  l[3] = '302';
  l[4] = 'LOJA 1';
  l[6] = 'CONSTRUTORA Y';
  l[7] = 'JOAO DA SILVA';
  l[9] = 'MARIA CORRETORA';
  l[15] = '1/3';
  l[16] = 'PENDENTE';
  l[19] = 1500.5;
  l[21] = 'AGO';
  l[22] = '2026';
  Object.entries(over).forEach(([k, v]) => { l[Number(k)] = v; });
  return l;
};

describe('normalizarCabecalho', () => {
  it('tira acento, caixa e espaço sobrando', () => {
    expect(normalizarCabecalho('Mês de previsão')).toBe('mes de previsao');
    expect(normalizarCabecalho(' A receber')).toBe('a receber');
    expect(normalizarCabecalho('Observação')).toBe('observacao');
  });
});

describe('mapearColunas — posição vem do cabeçalho, não do índice fixo', () => {
  it('encontra as 14 colunas no arquivo real', () => {
    const { indices, faltando } = mapearColunas(CABECALHO);
    expect(faltando).toEqual([]);
    expect(indices.pv).toBe(0);
    expect(indices.valor).toBe(19);
    expect(indices.previsaoMes).toBe(21);
  });

  it('acompanha coluna inserida no meio — o motivo de não usar índice fixo', () => {
    const deslocado = [...CABECALHO];
    deslocado.splice(1, 0, 'COLUNA NOVA');
    const { indices, faltando } = mapearColunas(deslocado);
    expect(faltando).toEqual([]);
    expect(indices.valor).toBe(20);
    expect(indices.previsaoAno).toBe(23);
  });

  it('avisa qual campo sumiu em vez de devolver dado pela metade', () => {
    const semValor = CABECALHO.map((c) => (c === ' A receber' ? 'OUTRA COISA' : c));
    expect(mapearColunas(semValor).faltando).toContain('valor');
  });
});

describe('coluna "A receber" duplicada — caso real do arquivo', () => {
  // O arquivo tem DUAS colunas que normalizam para "a receber": a 18 é texto
  // de situação ("RECEBIDO") e a 19 é o valor. Pegar a primeira devolvia ZERO
  // recebivel, sem erro nenhum — o portal apareceria vazio e ninguém saberia
  // por quê. Quem desempata é o conteúdo, não o nome.
  const COM_DUPLICATA = [
    'PV', 'Contrato', 'EMPREENDIMENTO', 'Unidade', 'Loja', 'Equipe', 'Construtora',
    'Cliente', 'VGV', 'Corretor', 'Coordenador', 'Gerente', '% Geral', 'NF', '%NF',
    'VALOR', 'Observação', 'Parcela', 'A RECEBER', ' A receber', 'MG empresa',
    'Mês de previsão', 'Ano de Previsão',
  ];

  const linhaReal = (pv: string, situacao: string, valor: number) => {
    const l: any[] = new Array(23).fill('');
    l[0] = pv; l[2] = 'RES X'; l[3] = '302'; l[7] = 'CLIENTE'; l[9] = 'CORRETOR';
    l[18] = situacao;
    l[19] = valor;
    l[21] = 'AGO'; l[22] = '2026';
    return l;
  };

  it('escolhe a coluna com os números, não a primeira de nome igual', () => {
    const matriz = [
      COM_DUPLICATA,
      linhaReal('7654', 'RECEBIDO', 1500),
      linhaReal('7655', 'RECEBIDO', 2500),
      linhaReal('7656', 'PENDENTE', 3000),
    ];
    const { linhas } = lerRecebiveis(matriz);
    expect(linhas).toHaveLength(3);
    expect(linhas.map((l) => l.valor)).toEqual([1500, 2500, 3000]);
  });

  it('sem essa escolha o resultado seria zero recebível — a falha era silenciosa', () => {
    const { indices, candidatos } = mapearColunas(COM_DUPLICATA);
    expect(candidatos.valor).toEqual([18, 19]);
    expect(indices.valor).toBe(18); // a errada, se ninguém desempatar
  });
});

describe('valorParaNumero', () => {
  it('aceita número direto da célula', () => {
    expect(valorParaNumero(1500.5)).toBe(1500.5);
  });

  it('aceita texto no formato brasileiro', () => {
    expect(valorParaNumero('R$ 1.234,56')).toBe(1234.56);
    expect(valorParaNumero('1.234,56')).toBe(1234.56);
  });

  it('não confunde separador de milhar com decimal', () => {
    // "1.234" sem vírgula é mil duzentos e trinta e quatro na planilha, mas o
    // Number() do JS leria 1.234. Só há vírgula quando há decimal.
    expect(valorParaNumero('1234')).toBe(1234);
  });

  it('devolve zero para lixo, em vez de NaN', () => {
    expect(valorParaNumero('')).toBe(0);
    expect(valorParaNumero('-')).toBe(0);
    expect(valorParaNumero(null)).toBe(0);
    expect(valorParaNumero(undefined)).toBe(0);
  });
});

describe('lerRecebiveis', () => {
  it('lê uma linha completa', () => {
    const { linhas, faltando } = lerRecebiveis([CABECALHO, linha()]);
    expect(faltando).toEqual([]);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      pv: '7091', cliente: 'JOAO DA SILVA', corretor: 'MARIA CORRETORA',
      valor: 1500.5, previsaoMes: 'AGO', previsaoAno: '2026',
    });
  });

  it('NÃO pula linha oculta: o arquivo é salvo com filtro do Excel ativo', () => {
    // Na amostra real, 7.843 de 7.846 linhas estavam escondidas por um filtro
    // que alguém deixou aplicado. Respeitar isso esvaziaria o portal.
    const matriz = [CABECALHO, linha(), linha({ 0: '7092' }), linha({ 0: '7093' })];
    expect(lerRecebiveis(matriz).linhas).toHaveLength(3);
  });

  it('descarta linha sem PV e linha com valor zero ou negativo', () => {
    const matriz = [
      CABECALHO,
      linha(),
      linha({ 0: '' }),
      linha({ 0: '7092', 19: 0 }),
      linha({ 0: '7093', 19: -50 }),
    ];
    const { linhas } = lerRecebiveis(matriz);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].pv).toBe('7091');
  });

  it('recusa o arquivo inteiro quando falta coluna, sem servir dado parcial', () => {
    const ruim = CABECALHO.map((c) => (c === 'PV' ? 'ID' : c));
    const r = lerRecebiveis([ruim, linha()]);
    expect(r.linhas).toEqual([]);
    expect(r.faltando).toContain('pv');
  });

  it('não estoura com matriz vazia', () => {
    expect(lerRecebiveis([]).linhas).toEqual([]);
    expect(lerRecebiveis(null as any).linhas).toEqual([]);
  });
});

describe('assinaturaNegociacao — reencontrar PV recriado após distrato', () => {
  it('ignora caixa e acento, que variam na digitação manual', () => {
    const a = assinaturaNegociacao({ cliente: 'João Silva', empreendimento: 'Residencial X', unidade: '302' });
    const b = assinaturaNegociacao({ cliente: 'JOAO SILVA', empreendimento: 'RESIDENCIAL X', unidade: '302' });
    expect(a).toBe(b);
  });

  it('separa unidades diferentes do mesmo cliente e empreendimento', () => {
    const u302 = assinaturaNegociacao({ cliente: 'Ana', empreendimento: 'Res X', unidade: '302' });
    const u303 = assinaturaNegociacao({ cliente: 'Ana', empreendimento: 'Res X', unidade: '303' });
    expect(u302).not.toBe(u303);
  });
});
