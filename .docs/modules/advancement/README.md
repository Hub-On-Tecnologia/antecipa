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
CollateralModal abre
     ├── Tipo: Total (valor cheio) — única modalidade ativa
     ├── Tipo: Parcial — DESATIVADA ("Em construção")
     └── Garantia (opcional): outros PVs como colateral
     ↓
Confirmação → 2 ações paralelas:
     ├── bitrixService.createDeal() → CRM
     └── firebaseService.saveAdvancementWithCollateral() → Firestore
     ↓
SuccessModal exibe resultado
     ↓
NotificationCenter atualiza em tempo real (onSnapshot)
     ↓
Backoffice aprova → ProposalModal (assinatura do contrato)
     └── Sucesso: avisa que o contrato será enviado pelo WhatsApp
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
- **Parcelas da mesma negociação (mesmo PV) NÃO podem ser garantia** de um
  adiantamento: se o negócio for distratado, título e garantia caem juntos.
  Aplicado no filtro `validCandidates` do `CollateralModal.tsx`
- **Antecipação parcial está SUSPENSA** (lançamento 2026-07-30). A modalidade
  aparece como "Em construção" e não é clicável. O código continua no
  `CollateralModal.tsx` atrás da constante `PARTIAL_ADVANCE_ENABLED = false`;
  para reabrir, trocar para `true`. Quando ativa: o `advanceAmount` é menor que
  o `amount` do recebível e a garantia alocada precisa ser **maior** que o
  valor adiantado
- Após a assinatura do contrato, o corretor é avisado de que o **contrato
  assinado será enviado pelo WhatsApp** (envio manual pelo backoffice — não há
  integração automática de WhatsApp no portal)
- O `bitrixDealId` é retornado pelo Bitrix e salvo no Firestore para rastreamento

## Estado de Saúde
✅ Estrutura criada | Verificar fluxo completo em próxima sessão
