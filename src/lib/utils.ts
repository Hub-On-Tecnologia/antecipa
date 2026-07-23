import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizeCPF(cpf: string): string {
  return cpf.replace(/\D/g, '');
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
