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

/** Máscara de data enquanto o usuário digita: 00/00/0000 */
export function formatarDataBR(valor: string): string {
  return String(valor || '')
    .replace(/\D/g, '')
    .replace(/(\d{2})(\d)/, '$1/$2')
    .replace(/(\d{2})(\d)/, '$1/$2')
    .replace(/(\/\d{4})\d+?$/, '$1');
}
