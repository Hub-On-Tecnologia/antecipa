# 📦 MÓDULO: FIREBASE (firebase)

## Responsabilidade
Persistência de estado das solicitações, autenticação Google e notificações em tempo real.

## Arquivos
| Arquivo | Papel |
|---------|-------|
| `src/services/firebaseService.ts` | Toda lógica Firebase |
| `firestore.rules` | Regras de segurança do Firestore |
| `DRAFT_firestore.rules` | Rascunho de novas regras (não ativo) |

## Projeto Firebase
- **Project ID:** `gen-lang-client-0436981001`
- **Database ID:** `ai-studio-458009ee-a488-47a9-a8ab-31ed63f2ea80` (não-padrão!)
- **Auth Domain:** `gen-lang-client-0436981001.firebaseapp.com`

> ⚠️ O Database ID NÃO é o padrão `(default)`. Isso é crítico — sempre usar `VITE_FIREBASE_FIRESTORE_DATABASE_ID`.

## Coleções do Firestore

### `promised_commissions`
```typescript
{
  pvId: string,              // ID do PV
  receivableId: string,      // ID único da solicitação
  amount: number,            // Valor total do recebível
  advanceType: 'TOTAL' | 'PARCIAL',
  advanceAmount: number,     // Valor solicitado para antecipação
  previsaoMes: string,
  previsaoAno: string,
  userId: string,            // Firebase UID
  status: 'pending' | 'approved' | 'rejected',
  stageName: string,         // Fase legível (ex: "Solicitação Encaminhada")
  isCollateral: boolean,     // É título em garantia?
  collateralFor?: string,    // Se colateral, ID da solicitação principal
  bitrixDealId?: string,     // ID do deal no Bitrix
  userRole: string,
  requestedAt: Timestamp,
  updatedAt: Timestamp,
  signatureData?: object     // Assinatura eletrônica se houver
}
```

### `notifications`
```typescript
{
  userId: string,
  title: string,
  message: string,
  type: 'info' | 'success' | 'error' | 'warning',
  read: boolean,
  createdAt: Timestamp
}
```

### `access_logs`
```typescript
{
  userId: string,
  userEmail: string,
  userName: string,
  action: string,
  timestamp: Timestamp
}
```

## Funções Principais
| Função | Descrição |
|--------|-----------|
| `savePromisedCommission()` | Salva solicitação individual |
| `saveAdvancementWithCollateral()` | Salva principal + colaterais em batch |
| `fetchPromisedCommissions()` | Busca solicitações do usuário |
| `updateCommissionStatus()` | Atualiza status com notificação automática |
| `deletePromisedCommissionsBulk()` | Remove em lote |
| `updateCommissionsStatusBulk()` | Atualiza em lote |
| `subscribeToNotifications()` | Listener em tempo real (onSnapshot) |
| `addNotification()` | Cria notificação |
| `markNotificationAsRead()` | Marca como lida |
| `deleteNotification()` | Remove notificação |
| `saveSignature()` | Salva assinatura eletrônica |
| `logAccess()` | Auditoria de acesso |

## Regras de Segurança
Ver: `firestore.rules` e `.docs/architecture/SECURITY.md`

## Estado de Saúde
✅ Configurado | Última verificação: 2026-07-23
