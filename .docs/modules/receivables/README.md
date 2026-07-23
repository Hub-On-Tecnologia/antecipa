# 📦 MÓDULO: RECEBÍVEIS (receivables)

## Responsabilidade
Busca, filtra e exibe os recebíveis do usuário logado a partir do Google Sheets.

## Arquivos
| Arquivo | Papel |
|---------|-------|
| `src/services/sheetsService.ts` → `fetchReceivables()` | Busca e filtra dados da guia CR 2025 |
| `src/components/Dashboard.tsx` | UI principal com lista de PVs e parcelas |

## Planilha — Guia "CR 2025"
| Coluna | Índice | Campo |
|--------|--------|-------|
| A | 0 | ID PV (identificador da negociação) |
| C | 2 | Empreendimento |
| D | 3 | Bloco / Unidade |
| E | 4 | Loja |
| G | 6 | Construtora |
| H | 7 | Cliente (comprador) |
| J | 9 | Corretor (nome) |
| K | 10 | Líder Trainee |
| L | 11 | Líder |
| P | 15 | Info Parcela (valor total ou "Parcelado") |
| Q | 16 | Status (ex: "Pago", "Pendente") |
| T | 19 | Valor da parcela (recebível) |
| V | 21 | Mês de previsão |
| W | 22 | Ano de previsão |

## Interface Receivable
```typescript
interface Receivable {
  receivableId: string;     // ID único (pv-rowIndex)
  id: string;               // ID do PV (coluna A)
  nome: string;             // Corretor (col J)
  liderTrainee: string;     // Líder Trainee (col K)
  lider: string;            // Líder (col L)
  loja: string;             // Loja (col E)
  valor: string;            // Valor formatado (col T)
  valorNumeric: number;     // Valor numérico bruto (col T)
  valorOriginalP: string;   // Info da parcela (col P)
  construtora: string;      // Construtora (col G)
  cliente: string;          // Cliente (col H)
  empreendimento: string;   // Empreendimento (col C)
  blocoUnidade: string;     // Bloco/Unidade (col D)
  previsaoMes: string;      // Mês (col V)
  previsaoAno: string;      // Ano (col W)
  infoParcela: string;      // Mesmo que valorOriginalP
  status: string;           // Status (col Q) — "Pago" remove do total
  allFields: Record<string, string>; // Todos os campos para o Bitrix
  userRole?: 'Corretor' | 'Líder Trainee' | 'Líder' | 'Diretor' | 'Superintendente';
}
```

## Lógica de Roles
- **Corretor:** `normalizeName(item.nome) === searchName`
- **Líder Trainee:** `normalizeName(item.liderTrainee) === searchName`
- **Líder:** `normalizeName(item.lider) === searchName`
- **Diretor:** cargo contém "diretor" E loja do item === loja do usuário
- **Superintendente:** cargo contém "superintendente" OU tem campo superintendência

## Filtros aplicados
1. `userRole` deve existir (usuário tem permissão de ver)
2. `valorNumeric > 0` (sem zeros)
3. Agrupamento por PV no Dashboard

## Regras de Negócio
- Um PV pode ter múltiplas linhas (parcelas)
- Parcelas com status "Pago" aparecem tachadas e NÃO entram no total
- O total exibido = soma de parcelas pendentes por usuário

## Estado de Saúde
✅ Funcionando | Última verificação: 2026-07-23
