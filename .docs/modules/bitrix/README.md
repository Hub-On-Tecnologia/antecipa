# 📦 MÓDULO: BITRIX24 (bitrix)

## Responsabilidade
Integração com o CRM Bitrix24 para criação e consulta de deals de antecipação.

## Arquivos
| Arquivo | Papel |
|---------|-------|
| `src/services/bitrixService.ts` | Todos os webhooks e lógica de CRM |

## Webhooks Configurados
| Ação | URL (via env) | Variável |
|------|---------------|----------|
| Criação de deal | `crm.deal.add.json` | `VITE_BITRIX_WEBHOOK_URL` |
| Escrita alternativa | `crm.deal.add.json` | `VITE_BITRIX_WEBHOOK_WRITE_URL` |
| Listagem de deals | `crm.deal.list.json` | `VITE_BITRIX_LIST_URL` |

**Domínio:** `hubnogueira.bitrix24.com.br`

## Mapeamento de Campos (crm.deal.add)
| Campo Bitrix | Valor |
|-------------|-------|
| `TITLE` | "Antecipação - [Nome] - [PV]" |
| `OPPORTUNITY` | Valor numérico solicitado |
| `CURRENCY_ID` | "BRL" |
| `UF_CRM_1758140731010` | ID do PV (campo customizado) |
| `COMMENTS` | Texto completo com todos os campos da planilha |

## Estrutura do COMMENTS
```
[B]SOLICITAÇÃO DE ANTECIPAÇÃO - PORTAL[/B]
------------------------------------------
[B]Usuário:[/B] Nome do Corretor
[B]Tipo:[/B] Total / Parcial
[B]Valor Solicitado:[/B] R$ 0.000,00

[B]DETALHAMENTO:[/B]
Item 1:
- ID/PV: [valor]
- Construtora: [valor]
- Cliente: [valor]
...todos os campos do allFields...
```

## Interface UserAuth
```typescript
interface UserAuth {
  nome: string;
  cpf: string;
  // + outros campos do UserData
}
```

## Regras de Negócio
- Um deal é criado por solicitação de antecipação (não por parcela)
- O PV é o identificador principal (UF_CRM_1758140731010)
- `allFields` do Receivable garante que todos os dados da planilha vão para COMMENTS

## Estado de Saúde
✅ Integração configurada | Última verificação: 2026-07-23
⚠️ `VITE_BITRIX_LIST_URL` duplicado no .env — a URL real está na linha 3, placeholder na 16
