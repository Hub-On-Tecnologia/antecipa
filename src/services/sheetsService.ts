import { normalizeCPF, normalizeDate, normalizeName } from '../lib/utils';

const TAB_NAME = import.meta.env.VITE_SHEET_TAB_USUARIOS ?? 'usuários';
const TAB_CR = import.meta.env.VITE_SHEET_TAB_CR ?? 'CR 2025';

export interface UserData {
  nome: string;
  dataNascimento: string;
  cpf: string;
  empresa?: string;
  cargo?: string;
  superintendencia?: string;
  loja?: string; // Coluna S (usuários)
  allFields?: Record<string, any>;
}

export interface Receivable {
  receivableId: string; // ID único (ex: pv-index)
  id: string;
  nome: string; // Corretor (Coluna J)
  liderTrainee: string; // Coluna K
  lider: string; // Coluna L
  loja: string; // Coluna E
  valor: string;
  valorNumeric: number;
  valorOriginalP: string;
  construtora: string;
  cliente: string;
  empreendimento: string; // Coluna C
  blocoUnidade: string;    // Coluna D
  previsaoMes: string;
  previsaoAno: string;
  infoParcela: string;
  status: string;
  allFields: Record<string, string>;
  userRole?: 'Corretor' | 'Líder Trainee' | 'Líder' | 'Diretor' | 'Superintendente';
}

async function fetchFromSheet(tab: string): Promise<any> {
  const sheetId = import.meta.env.VITE_SHEET_ID;
  if (!sheetId) {
    throw new Error("ID da planilha não configurado");
  }
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(tab)}`;
  const response = await fetch(url);
  const text = await response.text();
  return JSON.parse(text.substring(47, text.length - 2));
}

export async function fetchUsers(): Promise<UserData[]> {
  try {
    const jsonData = await fetchFromSheet(TAB_NAME);
    const rows = jsonData.table.rows;
    const cols = jsonData.table.cols;

    return rows.map((row: any) => {
      const nomeCell = row.c[3]?.v || '';
      const dataCell = row.c[6]?.f || row.c[6]?.v || '';
      const cpfCell = row.c[13]?.f || row.c[13]?.v || '';
      
      const allFields: Record<string, any> = {};
      let empresa = '';
      let cargo = '';
      let superintendencia = '';
      let loja = '';

      row.c.forEach((cell: any, idx: number) => {
        const label = cols[idx]?.label || `Col${idx}`;
        const val = cell?.v || '';
        allFields[label] = val;

        const lowLabel = label.toLowerCase();
        if (lowLabel.includes('empresa')) empresa = String(val);
        if (lowLabel.includes('cargo') || lowLabel.includes('função')) cargo = String(val);
        if (lowLabel.includes('superintendência')) superintendencia = String(val);
      });

      // Especificamente Coluna S para Loja (index 18)
      loja = String(row.c[18]?.v || '');

      return {
        nome: String(nomeCell),
        dataNascimento: String(dataCell),
        cpf: String(cpfCell),
        empresa,
        cargo,
        superintendencia,
        loja,
        allFields
      };
    });
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
    return [];
  }
}

/**
 * Busca os recebíveis (comissões) para um usuário específico.
 * Filtra com base no nome do corretor, líder ou cargo de gestão.
 */
export async function fetchReceivables(user: UserData): Promise<Receivable[]> {
  try {
    const jsonData = await fetchFromSheet(TAB_CR);
    const cols = jsonData.table.cols;
    const rows = jsonData.table.rows;
    const searchName = normalizeName(user.nome);

    // Identifica se o usuário possui cargo de gestão
    // Diretores e Superintendentes têm visão ampliada (por loja ou total)
    const isDiretor = user.cargo?.toLowerCase().includes('diretor');
    const isSuper = user.cargo?.toLowerCase().includes('superintendente') || !!user.superintendencia;
    const userLoja = normalizeName(user.loja || '');

    return rows
      .map((row: any, rowIndex: number) => {
        // Mapeamento das colunas da planilha "CR 2025"
        // Baseado na estrutura observada: 0:PV, 2:Empreendimento, 3:Unidade, 4:Loja, 6:Construtora, 7:Cliente, 9:Corretor, 10:LíderTrai, 11:Líder, 15:InfoParcela, 16:Status, 19:Valor, 21:Mês, 22:Ano
        const id = row.c[0]?.v || '';
        const indexE_loja = row.c[4]?.v || '';
        const empreendimento = row.c[2]?.v || '';
        const blocoUnidade = row.c[3]?.v || '';
        const construtora = row.c[6]?.v || '';
        const cliente = row.c[7]?.v || '';
        const nome = row.c[9]?.v || '';
        const liderTrainee = row.c[10]?.v || '';
        const lider = row.c[11]?.v || '';
        const valorOriginalP = row.c[15]?.f || row.c[15]?.v || '';
        const status = row.c[16]?.v || '';
        const valorRaw = row.c[19]?.v || 0;
        const valorStr = row.c[19]?.f || row.c[19]?.v || '0,00';
        const previsaoMes = row.c[21]?.v || '';
        const previsaoAno = row.c[22]?.v || '';

        // Coleta todos os campos para envio ao CRM (Bitrix) como histórico
        const allFields: Record<string, string> = {};
        row.c.forEach((cell: any, idx: number) => {
          const colLabel = cols[idx]?.label || `Coluna ${idx}`;
          const val = cell?.f || cell?.v || '';
          allFields[colLabel] = String(val);
        });

        const item: Receivable = {
          receivableId: `${id}-${rowIndex}`,
          id: String(id),
          nome: String(nome),
          liderTrainee: String(liderTrainee),
          lider: String(lider),
          loja: String(indexE_loja),
          valor: String(valorStr),
          valorNumeric: Number(valorRaw),
          valorOriginalP: String(valorOriginalP),
          construtora: String(construtora),
          cliente: String(cliente),
          empreendimento: String(empreendimento),
          blocoUnidade: String(blocoUnidade),
          previsaoMes: String(previsaoMes),
          previsaoAno: String(previsaoAno),
          infoParcela: String(valorOriginalP),
          status: String(status),
          allFields
        };

        // Lógica de Atribuição de Papel (Role Assignment)
        // Define se o usuário atual tem "permissão" de ver este registro e em qual qualidade
        const normalizedLoja = normalizeName(item.loja);
        
        if (normalizeName(item.nome) === searchName) {
          item.userRole = 'Corretor';
        } else if (normalizeName(item.liderTrainee) === searchName) {
          item.userRole = 'Líder Trainee';
        } else if (normalizeName(item.lider) === searchName) {
          item.userRole = 'Líder';
        } else if (isDiretor && normalizedLoja === userLoja && userLoja) {
          item.userRole = 'Diretor';
        } else if (isSuper) {
          item.userRole = 'Superintendente';
        }

        return item;
      })
      .filter((item: Receivable) => {
        // Filtro de segurança: só retorna o que o usuário pode ver e que tem valor
        const hasRole = !!item.userRole;
        const isNotZero = item.valorNumeric > 0;
        return hasRole && isNotZero;
      });
  } catch (error) {
    console.error('Erro ao buscar recebíveis:', error);
    return [];
  }
}

export async function authenticateUser(nome: string, dataNascimento: string, cpf: string): Promise<UserData | null> {
  const users = await fetchUsers();
  
  const targetNome = normalizeName(nome);
  const targetData = normalizeDate(dataNascimento);
  const targetCPF = normalizeCPF(cpf);

  const foundUser = users.find(user => {
    return (
      normalizeName(user.nome) === targetNome &&
      normalizeDate(user.dataNascimento) === targetData &&
      normalizeCPF(user.cpf) === targetCPF
    );
  });

  return foundUser || null;
}
