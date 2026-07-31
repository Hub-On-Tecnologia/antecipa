/**
 * Leitura da planilha de comissões (aba "CR 2025").
 *
 * Funções puras: recebem a matriz já extraída do arquivo e devolvem os
 * recebíveis. Quem baixa e abre o xlsx é o server.ts — aqui não há efeito
 * colateral, então a parte que erra silenciosamente é testável.
 *
 * Três decisões que vêm de medições no arquivo real (2026-07-31):
 *
 * 1. AS COLUNAS SÃO ENCONTRADAS PELO CABEÇALHO, não pela posição. O arquivo é
 *    mantido à mão; inserir uma coluna no meio é questão de tempo, e o
 *    mapeamento por índice quebraria calado — todo mundo veria dado errado
 *    sem nenhum erro aparecer.
 *
 * 2. LINHAS OCULTAS CONTAM. O arquivo é salvo com filtro do Excel ativo: na
 *    amostra, 7.843 de 7.846 linhas estavam escondidas por um filtro de PV que
 *    alguém deixou aplicado. Respeitar o que está "visível" deixaria o portal
 *    praticamente vazio. A importação para o Google Sheets também ignora o
 *    filtro — 6.936 linhas lá.
 *
 * 3. A IDENTIDADE É PV + CORRETOR. Previsão, valor e unidade mudam; o PV não,
 *    porque a equipe comercial não consegue alterá-lo. Medido: 548 linhas com
 *    valor geram 344 pares (PV, corretor) — chave única.
 */

export interface LinhaPlanilha {
  pv: string;
  empreendimento: string;
  unidade: string;
  loja: string;
  construtora: string;
  cliente: string;
  corretor: string;
  coordenador: string;
  gerente: string;
  infoParcela: string;
  status: string;
  valor: number;
  previsaoMes: string;
  previsaoAno: string;
}

/**
 * Cabeçalhos aceitos para cada campo, em minúsculas e sem acento.
 *
 * Mais de um por campo de propósito: a planilha é editada à mão e o mesmo
 * campo já apareceu como "A receber" e " A receber".
 */
const CABECALHOS: Record<keyof LinhaPlanilha, string[]> = {
  pv: ['pv'],
  empreendimento: ['empreendimento'],
  unidade: ['unidade', 'bloco/unidade', 'bloco unidade'],
  loja: ['loja'],
  construtora: ['construtora'],
  cliente: ['cliente'],
  corretor: ['corretor'],
  coordenador: ['coordenador', 'lider trainee', 'lidertrainee'],
  gerente: ['gerente', 'lider'],
  infoParcela: ['valor'],
  status: ['observacao', 'observacoes', 'status'],
  valor: ['a receber', 'areceber'],
  previsaoMes: ['mes de previsao', 'mes previsao'],
  previsaoAno: ['ano de previsao', 'ano previsao'],
};

/** Minúsculas, sem acento e sem espaço sobrando — para comparar cabeçalho. */
export function normalizarCabecalho(texto: unknown): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Descobre em que coluna está cada campo. Devolve também o que não encontrou,
 * para quem chama poder recusar o arquivo em vez de servir dado pela metade.
 */
export function mapearColunas(cabecalho: unknown[]): {
  indices: Partial<Record<keyof LinhaPlanilha, number>>;
  candidatos: Partial<Record<keyof LinhaPlanilha, number[]>>;
  faltando: string[];
} {
  const normalizado = cabecalho.map(normalizarCabecalho);
  const indices: Partial<Record<keyof LinhaPlanilha, number>> = {};
  const candidatos: Partial<Record<keyof LinhaPlanilha, number[]>> = {};
  const faltando: string[] = [];

  (Object.keys(CABECALHOS) as (keyof LinhaPlanilha)[]).forEach((campo) => {
    const aceitos = CABECALHOS[campo];
    const achados: number[] = [];
    normalizado.forEach((c, i) => {
      if (c !== '' && aceitos.includes(c)) achados.push(i);
    });

    if (achados.length === 0) {
      faltando.push(campo);
      return;
    }
    candidatos[campo] = achados;
    indices[campo] = achados[0];
  });

  return { indices, candidatos, faltando };
}

/**
 * Escolhe, entre colunas de mesmo nome, a que realmente contém números.
 *
 * A planilha tem DUAS colunas "A receber": uma com texto de situação
 * ("RECEBIDO") e outra com o valor. Normalizadas, viram o mesmo nome, e pegar
 * a primeira devolvia zero recebível — falha silenciosa, sem erro nenhum.
 *
 * Nome empata; dado não. Vence a coluna com mais valores numéricos positivos.
 */
export function resolverColunaNumerica(matriz: unknown[][], candidatos: number[], amostra = 400): number {
  if (candidatos.length <= 1) return candidatos[0];

  let melhor = candidatos[0];
  let melhorPlacar = -1;

  for (const col of candidatos) {
    let placar = 0;
    for (let i = 1; i < matriz.length && i <= amostra; i++) {
      const linha = matriz[i];
      if (Array.isArray(linha) && valorParaNumero(linha[col]) > 0) placar++;
    }
    if (placar > melhorPlacar) {
      melhorPlacar = placar;
      melhor = col;
    }
  }

  return melhor;
}

/**
 * Converte o valor monetário da planilha em número.
 *
 * A célula pode vir como número (xlsx tipado) ou como texto no formato
 * brasileiro. "R$ 1.234,56" e 1234.56 precisam dar no mesmo lugar.
 */
export function valorParaNumero(bruto: unknown): number {
  if (typeof bruto === 'number') return Number.isFinite(bruto) ? bruto : 0;

  const texto = String(bruto ?? '').trim();
  if (!texto) return 0;

  const limpo = texto.replace(/[^\d,.-]/g, '');
  if (!limpo) return 0;

  // Formato brasileiro: o último separador é a vírgula decimal.
  const temVirgula = limpo.includes(',');
  const normal = temVirgula ? limpo.replace(/\./g, '').replace(',', '.') : limpo;

  const n = Number(normal);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Transforma a matriz da aba em recebíveis.
 *
 * Descarta o que não serve para o portal: linha sem PV e linha com valor zero
 * ou negativo — a mesma regra que o `fetchReceivables` já aplicava sobre o
 * Google Sheets, para a troca de fonte não mudar o que o corretor vê.
 */
export function lerRecebiveis(matriz: unknown[][]): {
  linhas: LinhaPlanilha[];
  faltando: string[];
  totalLidas: number;
} {
  if (!Array.isArray(matriz) || matriz.length === 0) {
    return { linhas: [], faltando: ['cabecalho'], totalLidas: 0 };
  }

  const { indices, candidatos, faltando } = mapearColunas(matriz[0] || []);
  if (faltando.length > 0) return { linhas: [], faltando, totalLidas: 0 };

  // "A receber" aparece duas vezes no arquivo real: uma é texto de situação,
  // a outra é o valor. Quem decide é o conteúdo.
  indices.valor = resolverColunaNumerica(matriz, candidatos.valor || [indices.valor as number]);

  const texto = (linha: unknown[], campo: keyof LinhaPlanilha): string =>
    String(linha[indices[campo] as number] ?? '').trim();

  const linhas: LinhaPlanilha[] = [];
  for (let i = 1; i < matriz.length; i++) {
    const bruta = matriz[i];
    if (!Array.isArray(bruta)) continue;

    const pv = texto(bruta, 'pv');
    if (!pv) continue;

    const valor = valorParaNumero(bruta[indices.valor as number]);
    if (valor <= 0) continue;

    linhas.push({
      pv,
      empreendimento: texto(bruta, 'empreendimento'),
      unidade: texto(bruta, 'unidade'),
      loja: texto(bruta, 'loja'),
      construtora: texto(bruta, 'construtora'),
      cliente: texto(bruta, 'cliente'),
      corretor: texto(bruta, 'corretor'),
      coordenador: texto(bruta, 'coordenador'),
      gerente: texto(bruta, 'gerente'),
      infoParcela: texto(bruta, 'infoParcela'),
      status: texto(bruta, 'status'),
      valor,
      previsaoMes: texto(bruta, 'previsaoMes'),
      previsaoAno: texto(bruta, 'previsaoAno'),
    });
  }

  return { linhas, faltando: [], totalLidas: matriz.length - 1 };
}

/**
 * Assinatura da negociação, para reencontrar um PV que caiu e foi recriado
 * com outro número.
 *
 * Medido no arquivo real: cliente + empreendimento + unidade gera 343
 * assinaturas para 343 PVs — nenhuma colisão. Serve para SUGERIR a ligação a
 * um humano, nunca para religar sozinho: PV novo é outra negociação, e o
 * contrato prevê devolução em caso de distrato (Cláusula 3.2).
 */
export function assinaturaNegociacao(l: Pick<LinhaPlanilha, 'cliente' | 'empreendimento' | 'unidade'>): string {
  return [l.cliente, l.empreendimento, l.unidade]
    .map((p) => normalizarCabecalho(p))
    .join('|');
}
