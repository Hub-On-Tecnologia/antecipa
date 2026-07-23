# 🏛️ VISÃO GERAL DA ARQUITETURA — ANTECIPA PORTAL

> Documento de referência para qualquer IA ou desenvolvedor que precise entender
> o sistema antes de fazer qualquer modificação.

---

## O QUE É O SISTEMA

O **Antecipa Portal** é uma aplicação web para corretores de imóveis e suas equipes
solicitarem **antecipação de comissões** (recebíveis).

**Contexto de negócio:**
- Pedro é analista de negócios — não é desenvolvedor
- A equipe gerencia dados em Google Sheets (fonte de verdade)
- O CRM da empresa é o Bitrix24 (hubnogueira.bitrix24.com.br)
- O dono do projeto é quem alinha todas as regras de negócio

---

## STACK TECNOLÓGICA

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| Estilo | Tailwind CSS v4 + CSS puro |
| Animações | Framer Motion (pacote `motion`) |
| Ícones | Lucide React |
| Backend | Express.js (server.ts) — mínimo |
| Banco de Estado | Firebase Firestore |
| Autenticação | Firebase Auth (Google) + validação via Sheets |
| Fonte de Dados | Google Sheets (API gviz/tq — read-only) |
| CRM | Bitrix24 (webhooks REST) |
| Deploy | Vercel (vercel.json presente) |

---

## ESTRUTURA DE PASTAS (src/)

```
src/
├── App.tsx                    ← Roteamento principal, auth state, tema
├── main.tsx                   ← Entry point React
├── index.css                  ← Estilos globais + Tailwind
├── vite-env.d.ts              ← Tipos de variáveis de ambiente
│
├── components/
│   ├── LoginForm.tsx          ← Formulário de login (CPF + Data + Nome)
│   ├── Dashboard.tsx          ← Painel principal de recebíveis
│   ├── ProposalModal.tsx      ← Modal de solicitação de antecipação
│   ├── CollateralModal.tsx    ← Modal para títulos em garantia
│   ├── SuccessModal.tsx       ← Confirmação de solicitação enviada
│   ├── NotificationCenter.tsx ← Central de notificações em tempo real
│   ├── InstitutionalPage.tsx  ← Página institucional
│   ├── TutorialPage.tsx       ← Tutorial de integração
│   ├── QAPanel.tsx            ← Painel QA / geração de token (admin)
│   └── Footer.tsx             ← Rodapé global
│
├── services/
│   ├── sheetsService.ts       ← Leitura da planilha Google (usuários + CR 2025)
│   ├── firebaseService.ts     ← Firestore CRUD + Auth + Notificações
│   └── bitrixService.ts       ← Webhooks Bitrix24 (deals)
│
└── lib/
    └── utils.ts               ← Helpers: cn(), normalizeCPF(), normalizeDate(), normalizeName()
```

---

## FLUXO DE AUTENTICAÇÃO

```
1. Usuário acessa o portal
2. App.tsx verifica VITE_ACCESS_TOKEN (portão de acesso)
   ├── Se não há token configurado → portão aberto
   ├── Se referrer é Bitrix/CRM → acesso permitido (sem digitar token)
   └── Se sessão anterior válida → acesso permitido
3. LoginForm.tsx coleta: Nome, CPF, Data de Nascimento
4. sheetsService.authenticateUser() valida contra guia "usuários"
5. Se válido → Firebase Auth (Google) + sessão iniciada
6. App.tsx atualiza estado: userAuthData + firebaseUser
```

---

## FLUXO DE RECEBÍVEIS

```
1. Usuário autenticado
2. Dashboard.tsx monta
3. sheetsService.fetchReceivables(user) é chamado
4. Busca todos os dados da guia "CR 2025"
5. Aplica lógica de roles:
   - Corretor → filtra pela coluna J (nome)
   - Líder Trainee → filtra pela coluna K
   - Líder → filtra pela coluna L
   - Diretor → filtra por loja
   - Superintendente → vê tudo
6. Agrupa por PV (coluna A)
7. Exibe cards com status de cada parcela
```

---

## FLUXO DE SOLICITAÇÃO DE ANTECIPAÇÃO

```
1. Usuário seleciona PV no Dashboard
2. ProposalModal.tsx abre
3. Usuário confirma (total ou parcial)
4. bitrixService → cria deal no Bitrix24 (crm.deal.add)
5. firebaseService → salva em promised_commissions (Firestore)
6. SuccessModal.tsx exibe confirmação
7. notificações em tempo real via Firestore onSnapshot
```

---

## VARIÁVEIS DE AMBIENTE (obrigatórias)

| Variável | Uso |
|----------|-----|
| `VITE_FIREBASE_API_KEY` | Firebase Auth/Firestore |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth |
| `VITE_FIREBASE_PROJECT_ID` | Firebase |
| `VITE_FIREBASE_FIRESTORE_DATABASE_ID` | Firestore (ID não-padrão) |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase |
| `VITE_FIREBASE_APP_ID` | Firebase |
| `VITE_BITRIX_WEBHOOK_URL` | Criação de deals |
| `VITE_BITRIX_WEBHOOK_WRITE_URL` | Escrita alternativa |
| `VITE_BITRIX_LIST_URL` | Listagem de deals |
| `VITE_SHEET_ID` | ID da planilha Google |
| `VITE_SHEET_TAB_USUARIOS` | Nome da guia de usuários |
| `VITE_SHEET_TAB_CR` | Nome da guia de recebíveis |
| `VITE_ACCESS_TOKEN` | Token de portão de acesso |
| `GEMINI_API_KEY` | IA (Gemini) |

---

*Mantido por: Tech Lead + Gestor de Projeto*
*Atualizar sempre que houver mudança arquitetural*
