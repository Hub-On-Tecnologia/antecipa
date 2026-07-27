# 🔄 FLUXO DE DADOS — ANTECIPA PORTAL

> Este documento detalha como os dados fluem entre as diferentes camadas da aplicação.

---

## 1. FLUXO DE AUTENTICAÇÃO E SESSÃO

```
[ Usuário ] 
    │
    ▼
[ LoginForm.tsx ] (Insere Nome, CPF, Data Nasc)
    │
    ▼
[ sheetsService.ts -> fetchUsers() / authenticateUser() ]
    │
    ├── 1. Consulta Primária: MariaDB via Proxy (/api/db/query) [Timeout: 5s]
    │      - SQL: SELECT * FROM corpstek_corretores WHERE administrativo_ativo = 1 ...
    │      - Mapeamento resiliente: row.cpf || row.cpf_cnpj || row.cpfcnpj || row.documento
    │
    ├── (Em caso de erro/timeout 5s na DB-API) ──► 2. Fallback Gracioso: Google Sheets (guia usuários)
    │
    ├── 3. Normalização & Conciliação
    │      - CPF: normalizeCPF() -> extrai números e aplica padStart(11, '0')
    │      - Data: normalizeDate() -> converte ISO (YYYY-MM-DD) ou DD/MM/YYYY para apenas dígitos
    │      - Nome: normalizeName() -> remove acentos, caixa baixa e colapsa espaços
    │
    ├── (Se credenciais divergentes) ──► Retorna null -> Exibe mensagem amigável no LoginForm
    │
    └── (Se credenciais coincidem) ────► Retorna UserData
                                               │
                                               ▼
                                  [ firebaseService.ts -> signInWithGoogle() / auth ]
                                               │
                                               ▼
                                  [ App.tsx ] (Atualiza estado global da sessão)
```

---

## 2. FLUXO DE CARREGAMENTO DE RECEBÍVEIS

```
[ App.tsx / Dashboard.tsx ] 
    │ (Recebe UserData do usuário logado)
    ▼
[ sheetsService.ts -> fetchReceivables(user) ]
    │
    ├── 1. Faz query na Guia "CR 2025" do Google Sheets via gviz API
    ├── 2. Extrai colunas: ID (PV), Cliente, Construtora, Valores, Previsão, Status
    ├── 3. Determina o papel (userRole): Corretor, Líder, Diretor, Superintendente
    ├── 4. Filtra apenas registros que pertencem ao usuário e possuem valor > 0
    │
    ▼
[ Dashboard.tsx ]
    │
    ├── Agrupa recebíveis pelo ID do PV (Negociação)
    ├── Separa parcelas quitadas (Pagas) de parcelas pendentes
    └── Exibe cards e totais consolidados
```

---

## 3. FLUXO DE SOLICITAÇÃO DE ANTECIPAÇÃO

```
[ Usuário clica em "Solicitar Antecipação" no Dashboard ]
    │
    ▼
[ ProposalModal.tsx ] (Seleciona PV, modalidade Total ou Parcial)
    │
    ├── (Opcional) ──► [ CollateralModal.tsx ] (Adiciona PVs como garantia)
    │
    ▼
[ Confirmação do Usuário ]
    │
    ├─── (Ação 1: CRM) ────────► [ bitrixService.ts -> createBitrixAdvancementDeal() ]
    │                                  │
    │                                  ▼
    │                            [ Bitrix24 Webhook REST ]
    │                            - Cria Deal no CRM
    │                            - Preenche UF_CRM_1758140731010 com o PV
    │                            - Preenche COMMENTS com ficha completa
    │
    └─── (Ação 2: Persistência) ──► [ firebaseService.ts -> saveAdvancementWithCollateral() ]
                                       │
                                       ▼
                                 [ Firestore Database ]
                                 - Grava em `promised_commissions`
                                 - Grava colaterais vinculados
                                 - Cria notificação em `notifications`
    │
    ▼
[ SuccessModal.tsx ] (Exibe confirmação com ID da transação)
```

---

## 4. FLUXO DE SINCRONIZAÇÃO EM TEMPO REAL

```
[ Firestore ] ──(onSnapshot)──► [ NotificationCenter.tsx ]
                                         │
                                         ▼
                                Exibe popup/badge de atualização
                                de status da antecipação
```

---

*Mantido por: Gestor de Projeto + Tech Lead*
*Última atualização: 2026-07-23*
