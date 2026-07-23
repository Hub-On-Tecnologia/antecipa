import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizeCPF(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

export function normalizeDate(date: string): string {
  return date.replace(/\D/g, '');
}

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}
