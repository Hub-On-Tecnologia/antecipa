import { Receivable, UserData } from './sheetsService';

export type UserAuth = UserData;

/**
 * NOTA DE SEGURANÇA:
 * No Vercel/ambientes de hospedagem Frontend, as variáveis de ambiente prefixadas com VITE_ 
 * são injetadas no build e permanecem expostas no bundle JavaScript do navegador.
 * Para uma produção com segurança máxima, o ideal é criar uma Edge Function ou API Route
 * no servidor (ex: /api/bitrix-proxy) que faça o proxy seguro das chamadas, 
 * mantendo as chaves e tokens confidenciais estritamente protegidos no servidor.
 */

const CATEGORY_ID = 89;
export const PV_FIELD = 'UF_CRM_1758140731010';

export function isPlaceholderUrl(url: string) {
  return !url || url.includes("seu-dominio") || url.includes("USER_ID") || url.includes("TOKEN");
}

export async function secureBitrixFetch(endpoint: string, options: RequestInit) {
  const token = import.meta.env.VITE_ACCESS_TOKEN || '';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['x-access-token'] = token;
  }

  try {
    const response = await fetch(endpoint, {
      ...options,
      headers
    });
    return response;
  } catch (error: any) {
    console.error(`[secureBitrixFetch] Erro na comunicação com o proxy backend (${endpoint}):`, error);
    throw new Error(`Falha de comunicação com o servidor proxy do Bitrix: ${error?.message || error}. Verifique a conectividade com o servidor.`);
  }
}

export async function getBitrixDeal(dealId: string) {
  try {
    const response = await secureBitrixFetch('/api/bitrix/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: dealId })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`Erro na busca individual do Deal ${dealId} (${response.status}):`, errorText);
      return null;
    }
    const data = await response.json();
    return data.result || null;
  } catch (error) {
    console.warn(`Erro de rede/cors ao buscar deal individual ${dealId}:`, error);
    return null;
  }
}

export async function fetchExistingDeals(pvIds: string[], dealIds: string[] = []) {
  try {
    const promises: Promise<any[]>[] = [];

    // Consulta 1: Por IDs de Negócio específicos usando crm.deal.get (alta precisão, livre de bloqueios 403 de listagem)
    if (dealIds && dealIds.length > 0) {
      const getPromises = dealIds.map(id => 
        getBitrixDeal(id).then(deal => (deal ? [deal] : []))
      );
      promises.push(
        Promise.all(getPromises).then(results => results.flat())
      );
    }

    // Consulta 2: Por PV IDs usando crm.deal.list (como fallback para retrocompatibilidade de deals antigos)
    if (pvIds && pvIds.length > 0) {
      promises.push(
        secureBitrixFetch('/api/bitrix/list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filter: {
              "=CATEGORY_ID": CATEGORY_ID,
              [PV_FIELD]: pvIds
            },
            select: ['ID', 'TITLE', 'COMMENTS', 'STAGE_ID', PV_FIELD, 'UF_CRM_1712601553', 'UF_CRM_1712601748']
          })
        })
        .then(async res => {
          if (!res.ok) {
            const err = await res.text();
            console.warn('Erro na busca por PV_FIELD (listagem desabilitada ou restrita):', err);
            return [];
          }
          const data = await res.json();
          return data.result || [];
        })
        .catch(() => [])
      );
    }

    if (promises.length === 0) return [];

    const results = await Promise.all(promises);
    const mergedDeals: any[] = [];
    const seenIds = new Set<string>();

    for (const batch of results) {
      for (const deal of batch) {
        if (!deal || !deal.ID) continue;
        const dealIdStr = String(deal.ID);
        if (!seenIds.has(dealIdStr)) {
          seenIds.add(dealIdStr);
          mergedDeals.push(deal);
        }
      }
    }

    return mergedDeals;
  } catch (error) {
    console.warn('Erro ao buscar deals existentes (tratado):', error);
    throw error;
  }
}

/**
 * Mapeia o STAGE_ID do Bitrix para os status internos
 */
export function mapBitrixStageToStatus(stageId: string): 'pending' | 'approved' | 'rejected' {
  const stage = String(stageId).toUpperCase();
  
  // Antecipação Realizada (Sucesso)
  if (stage.includes('WON') || stage.includes('UC_3M0B5Y') || stage.includes('UC_XR93F9')) {
    return 'approved';
  }
  
  // Antecipação Negada / Perda / Problemas Técnicos
  if (stage.includes('LOSE') || stage.includes('REJECT') || stage.includes('APOLOGY')) {
    return 'rejected';
  }
  
  // Qualquer outra etapa em andamento (NEW, PREPARATION, PREPAYMENT_INVOIC, EXECUTING, UC_289A3T, FINAL_INVOICE)
  return 'pending';
}

/**
 * Mapeia o STAGE_ID do Bitrix para uma etiqueta legível
 */
export function mapBitrixStageToLabel(stageId: string): string {
  const stage = String(stageId).toUpperCase();
  
  // Mapeamento oficial para a Categoria 89 do Bitrix24:
  if (stage.includes('NEW')) return 'Solicitação Encaminhada';
  if (stage.includes('PREPARATION')) return 'Análise de Risco';
  if (stage.includes('PREPAYMENT_INVOIC') || stage.includes('UC_O67T1I')) return 'Aguardando Solicitante';
  
  if (stage.includes('EXECUTING') || stage.includes('UC_289A3T') || stage.includes('FINAL_INVOICE')) {
    return 'Em Tratativa Jurídica';
  }
  
  if (stage.includes('UC_3M0B5Y') || stage.includes('UC_XR93F9') || stage.includes('WON')) {
    return 'Antecipação Realizada';
  }

  if (stage.includes('LOSE')) return 'Antecipação Negada';
  if (stage.includes('APOLOGY')) return 'Problemas Técnicos';
  
  return 'Em Tratativa Jurídica';
}

export function parseBitrixCurrency(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (typeof val === 'object') {
    if (val.amount !== undefined) {
      return parseBitrixCurrency(val.amount);
    }
    if (val.VALUE !== undefined) {
      return parseBitrixCurrency(val.VALUE);
    }
    if (val.value !== undefined) {
      return parseBitrixCurrency(val.value);
    }
  }
  if (typeof val === 'string') {
    const firstPart = val.split('|')[0].trim();
    let cleanStr = firstPart.replace(/\s/g, '');
    if (cleanStr.includes(',') && cleanStr.includes('.')) {
      cleanStr = cleanStr.replace(/\./g, '').replace(',', '.');
    } else if (cleanStr.includes(',')) {
      cleanStr = cleanStr.replace(',', '.');
    }
    const parsed = parseFloat(cleanStr);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

export const BITRIX_FIELDS = {
  PV: PV_FIELD,
  VALOR_LIBERADO: 'UF_CRM_1784745327232', 
  OBSERVACOES: 'UF_CRM_1784745533159',
  FILE_ATTACHMENT: 'UF_CRM_1749578923'
};

export async function updateBitrixDealWithFile(dealId: string, base64File: string, fileName: string) {
  try {
    const response = await secureBitrixFetch('/api/bitrix/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: dealId,
        fields: {
          [BITRIX_FIELDS.FILE_ATTACHMENT]: {
            fileData: [fileName, base64File]
          },
          STAGE_ID: 'C89:EXECUTING'
        }
      })
    });
    const result = await response.json();
    if (result.error) throw new Error(result.error_description || result.error);
    return result;
  } catch (error) {
    console.error('Erro ao anexar arquivo no Bitrix:', error);
    throw error;
  }
}

export async function rejectBitrixDeal(dealId: string) {
  try {
    const response = await secureBitrixFetch('/api/bitrix/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: dealId,
        fields: {
          STAGE_ID: 'C89:LOSE'
        }
      })
    });
    const result = await response.json();
    if (result.error) throw new Error(result.error_description || result.error);
    return result;
  } catch (error) {
    console.error('Erro ao recusar negócio no Bitrix:', error);
    throw error;
  }
}

export function isAlreadyRequested(receivable: Receivable, existingDeals: any[]) {
  const idSearch = String(receivable.id).trim();
  const valueSearch = receivable.valor.trim();
  const previsionSearch = `PREVISÃO: ${receivable.previsaoMes}/${receivable.previsaoAno}`;

  return existingDeals.some(deal => {
    const dealPV = String(deal[PV_FIELD] || '').trim();
    const comments = String(deal.COMMENTS || '');
    
    const matchesPV = dealPV === idSearch || comments.includes(`ID PV: ${idSearch}`);
    if (!matchesPV) return false;

    // Verifica se a combinação de Valor e Previsão exata existe nos comentários
    // Isso evita que parcelas de mesmo valor mas meses diferentes se misturem
    const hasValue = comments.includes(`VALOR: ${valueSearch}`) || 
                    comments.includes(`VALOR SOLICITADO: ${valueSearch}`) ||
                    comments.includes(`- Valor: ${valueSearch}`);
    
    const hasPrevision = comments.includes(previsionSearch);
    
    return hasValue && hasPrevision;
  });
}

export async function createBitrixDeal(
  receivable: Receivable, 
  userInfo: UserAuth, 
  collateralItems: Receivable[] = [],
  advanceType: 'TOTAL' | 'PARCIAL' = 'TOTAL',
  advanceAmount?: number,
  alreadyAdvancedAmount: number = 0
) {
  const actualAdvanceAmount = advanceAmount !== undefined && advanceAmount > 0 
    ? advanceAmount 
    : receivable.valorNumeric;

  const totalTitleValue = receivable.valorNumeric;
  const remainingValue = Math.max(0, totalTitleValue - alreadyAdvancedAmount - actualAdvanceAmount);

  const title = `Solicitação de Antecipação ${advanceType} - PV ${receivable.id}`;
  
  let comments = `SOLICITAÇÃO DE ANTECIPAÇÃO (${advanceType}) REALIZADA PELO PORTAL\n`;
  comments += `==============================================\n\n`;
  
  comments += `IDENTIFICAÇÃO DO SOLICITANTE:\n`;
  comments += `NOME: ${userInfo.nome}\n`;
  comments += `CPF: ${userInfo.cpf}\n`;
  comments += `DATA NASC.: ${userInfo.dataNascimento}\n\n`;

  comments += `DADOS DA ANTECIPAÇÃO (${advanceType}):\n`;
  comments += `ID PV: ${receivable.id}\n`;
  comments += `CLIENTE: ${receivable.cliente}\n`;
  comments += `CONSTRUTORA: ${receivable.construtora}\n`;
  comments += `TIPO DE ANTECIPAÇÃO: ${advanceType}\n`;
  comments += `VALOR TOTAL ORIGINAL DO TÍTULO: R$ ${totalTitleValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
  if (alreadyAdvancedAmount > 0) {
    comments += `VALOR JÁ ADIANTADO ANTERIORMENTE: R$ ${alreadyAdvancedAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
  }
  comments += `VALOR DA ANTECIPAÇÃO SOLICITADA (${advanceType}): R$ ${actualAdvanceAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
  comments += `SALDO REMANESCENTE DISPONÍVEL APÓS ESTA SOLICITAÇÃO: R$ ${remainingValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
  comments += `PREVISÃO: ${receivable.previsaoMes}/${receivable.previsaoAno}\n\n`;
  
  if (collateralItems.length > 0) {
    const totalCollateralValue = collateralItems.reduce((acc, curr) => acc + curr.valorNumeric, 0);
    comments += `DADOS DOS TÍTULOS EM GARANTIA (COLLATERAL):\n`;
    comments += `VALOR TOTAL DAS GARANTIAS ALOCADAS: R$ ${totalCollateralValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    comments += `----------------------------------------------\n`;
    collateralItems.forEach((c, idx) => {
      comments += `GARANTIA ${idx + 1}:\n`;
      comments += `- ID PV: ${c.id}\n`;
      comments += `- Cliente: ${c.cliente}\n`;
      comments += `- Valor: ${c.valor}\n`;
      comments += `- Previsão: ${c.previsaoMes}/${c.previsaoAno}\n`;
    });
    comments += `\n`;
  }

  comments += `DETALHAMENTO COMPLETO DA PLANILHA:\n`;
  comments += `----------------------------------------------\n`;
  Object.entries(receivable.allFields).forEach(([key, value]) => {
    if (value && value !== 'null' && value !== 'undefined') {
       comments += `${key}: ${value}\n`;
    }
  });
  comments += `\n==============================================\n`;
  comments += `Data da Solicitação: ${new Date().toLocaleString('pt-BR')}`;

  const payload = {
    fields: {
      TITLE: title,
      CATEGORY_ID: CATEGORY_ID,
      COMMENTS: comments,
      [PV_FIELD]: receivable.id,
      OPPORTUNITY: actualAdvanceAmount,
      CURRENCY_ID: 'BRL'
    }
  };

  try {
    const response = await secureBitrixFetch('/api/bitrix/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error('Falha ao enviar para o Bitrix');
    return await response.json();
  } catch (error) {
    console.error('Erro no Bitrix Service:', error);
    throw error;
  }
}

export async function createMultipleBitrixDeals(receivables: Receivable[], userInfo: UserAuth) {
  const groupById: Record<string, Receivable[]> = {};
  receivables.forEach(r => {
    if (!groupById[r.id]) groupById[r.id] = [];
    groupById[r.id].push(r);
  });

  const promises = Object.entries(groupById).map(async ([id, items]) => {
    const totalVal = items.reduce((acc, curr) => acc + curr.valorNumeric, 0);
    const title = `Solicitação de Antecipação Total - PV ${id}`;
    
    let comments = `SOLICITAÇÃO DE ANTECIPAÇÃO TOTAL (MÚLTIPLAS PARCELAS)\n`;
    comments += `==============================================\n\n`;

    comments += `IDENTIFICAÇÃO DO SOLICITANTE:\n`;
    comments += `NOME: ${userInfo.nome}\n`;
    comments += `CPF: ${userInfo.cpf}\n`;
    comments += `DATA NASC.: ${userInfo.dataNascimento}\n\n`;

    comments += `DADOS CONSOLIDADOS:\n`;
    comments += `ID PV: ${id}\n`;
    comments += `TOTAL DE PARCELAS: ${items.length}\n`;
    comments += `VALOR TOTAL: R$ ${totalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n\n`;
    
    items.forEach((item, idx) => {
      comments += `PARCELA ${idx + 1}:\n`;
      comments += `- Valor: ${item.valor}\n`;
      comments += `- Previsão: ${item.previsaoMes}/${item.previsaoAno}\n`;
      comments += `- Status Atual: ${item.status}\n`;
      comments += `----------------------------------------------\n`;
    });

    const payload = {
      fields: {
        TITLE: title,
        CATEGORY_ID: CATEGORY_ID,
        COMMENTS: comments,
        [PV_FIELD]: id,
        OPPORTUNITY: totalVal,
        CURRENCY_ID: 'BRL'
      }
    };

    try {
      const response = await secureBitrixFetch('/api/bitrix/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error(`Falha no Bitrix ao processar PV ${id}: status ${response.status}`);
      }
      return await response.json();
    } catch (err) {
      console.error(`Erro ao criar Deal do Bitrix para o PV ${id}:`, err);
      throw err;
    }
  });

  const results = await Promise.allSettled(promises);
  
  const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  const fulfilled = results.filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled');

  if (rejected.length > 0) {
    throw new Error(`Falha ao registrar solicitações no Bitrix: ${rejected.length} de ${results.length} falharam.`);
  }

  return fulfilled.map(r => r.value);
}

