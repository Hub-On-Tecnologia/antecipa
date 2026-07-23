# 📦 MÓDULO: SOLICITAÇÃO DE ANTECIPAÇÃO (advancement)

## Responsabilidade
Gerencia o fluxo completo de solicitação de antecipação de comissões.

## Arquivos
| Arquivo | Papel |
|---------|-------|
| `src/components/ProposalModal.tsx` | Modal principal de solicitação |
| `src/components/CollateralModal.tsx` | Modal de títulos em garantia |
| `src/components/SuccessModal.tsx` | Confirmação pós-solicitação |
| `src/services/bitrixService.ts` | Envio para CRM |
| `src/services/firebaseService.ts` → `savePromisedCommission()` | Persistência |

## Fluxo de Solicitação

```
Dashboard → usuário seleciona PV
     ↓
ProposalModal abre
     ├── Tipo: Total (valor cheio)
     └── Tipo: Parcial (usuário define valor)
     ↓
CollateralModal (opcional)
     └── Usuário pode adicionar outros PVs como garantia
     ↓
Confirmação → 2 ações paralelas:
     ├── bitrixService.createDeal() → CRM
     └── firebaseService.saveAdvancementWithCollateral() → Firestore
     ↓
SuccessModal exibe resultado
     ↓
NotificationCenter atualiza em tempo real (onSnapshot)
```

## Estados de uma Solicitação
| Status | stageName | Descrição |
|--------|-----------|-----------|
| `pending` | "Solicitação Encaminhada" | Recém criada |
| `pending` | "Solicitação Parcial Encaminhada" | Antecipação parcial |
| `pending` | "Título em Garantia" | PV usado como colateral |
| `approved` | (varia) | Aprovada pelo backoffice |
| `rejected` | (varia) | Negada pelo backoffice |

## Regras de Negócio (IMPORTANTE — alinhar com Pedro antes de mudar)
- Uma solicitação pode ter **colaterais** (outros PVs como garantia)
- O colateral é salvo como documento separado no Firestore com `isCollateral: true`
- Colaterais estão vinculados à solicitação principal via `collateralFor`
- Antecipação parcial: o `advanceAmount` é menor que o `amount` do recebível
- O `bitrixDealId` é retornado pelo Bitrix e salvo no Firestore para rastreamento

## Estado de Saúde
✅ Estrutura criada | Verificar fluxo completo em próxima sessão
