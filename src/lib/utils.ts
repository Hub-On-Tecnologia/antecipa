import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizeCPF(cpf: string): string {
  const clean = String(cpf || '').replace(/\D/g, '');
  return clean ? clean.padStart(11, '0') : '';
}

export function normalizeDate(date: string): string {
  if (!date) return '';
  const clean = date.trim();
  // Se estiver no formato ISO (YYYY-MM-DD)
  const isoMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day}${month}${year}`;
  }
  return clean.replace(/\D/g, '');
}


export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Máscara de CPF enquanto o usuário digita: 000.000.000-00 */
export function formatarCPF(valor: string): string {
  return String(valor || '')
    .replace(/\D/g, '')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})/, '$1-$2')
    .replace(/(-\d{2})\d+?$/, '$1');
}

/**
 * Valida CPF pelos dígitos verificadores.
 *
 * Serve para separar erro de digitação de credencial errada. Sem isso, quem
 * troca um número no CPF recebe "CPF ou senha incorretos" e vai tentar
 * lembrar a senha, quando o problema estava no campo de cima. A conferência é
 * puramente aritmética e não consulta nada — não revela se o CPF é cliente.
 */
export function cpfEhValido(cpf: string): boolean {
  const limpo = String(cpf || '').replace(/\D/g, '');
  if (limpo.length !== 11) return false;
  // Sequências como 111.111.111-11 passam na aritmética, mas não são válidas.
  if (/^(\d)\1{10}$/.test(limpo)) return false;

  const digito = (ate: number): number => {
    let soma = 0;
    for (let i = 0; i < ate; i++) {
      soma += Number(limpo[i]) * (ate + 1 - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return digito(9) === Number(limpo[9]) && digito(10) === Number(limpo[10]);
}

/** Confere se a data está completa e é um dia real do calendário. */
export function dataBREhValida(data: string): boolean {
  const m = String(data || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return false;
  const [, d, mes, ano] = m.map(Number) as unknown as [string, number, number, number];
  if (mes < 1 || mes > 12 || d < 1) return false;
  const anoAtual = new Date().getFullYear();
  if (ano < 1900 || ano > anoAtual) return false;
  return d <= new Date(ano, mes, 0).getDate();
}

/** Máscara de data enquanto o usuário digita: 00/00/0000 */
export function formatarDataBR(valor: string): string {
  return String(valor || '')
    .replace(/\D/g, '')
    .replace(/(\d{2})(\d)/, '$1/$2')
    .replace(/(\d{2})(\d)/, '$1/$2')
    .replace(/(\/\d{4})\d+?$/, '$1');
}
