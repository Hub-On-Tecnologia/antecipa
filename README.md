# Antecipa Portal (antecipa-hubon)

Este projeto utiliza **React + TypeScript + Vite** integrado ao Firebase (Firestore e Authentication).

## 🔒 Segurança de Credenciais & Configuração Local

Para garantir a segurança do projeto e evitar o vazamento de credenciais em repositórios públicos, o arquivo original de configuração do Firebase (`firebase-applet-config.json`) foi adicionado ao `.gitignore` e não deve ser commitado.

As credenciais do Firebase são carregadas de forma segura através de variáveis de ambiente com o prefixo `VITE_`.

### Passo a Passo para Configuração Local:

1. **Crie o arquivo de ambiente local**:
   Duplique o arquivo `.env.example` na raiz do projeto e renomeie-o para `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. **Preencha as variáveis de ambiente**:
   Abra o seu arquivo `.env.local` e insira as credenciais do seu projeto Firebase correspondentes:
   ```env
   VITE_FIREBASE_API_KEY="SUA_API_KEY"
   VITE_FIREBASE_AUTH_DOMAIN="SEU_AUTH_DOMAIN"
   VITE_FIREBASE_PROJECT_ID="SEU_PROJECT_ID"
   VITE_FIREBASE_FIRESTORE_DATABASE_ID="seu-database-id-ou-(default)"
   VITE_FIREBASE_STORAGE_BUCKET="SEU_STORAGE_BUCKET"
   VITE_FIREBASE_MESSAGING_SENDER_ID="SEU_MESSAGING_SENDER_ID"
   VITE_FIREBASE_APP_ID="SEU_APP_ID"
   ```

### 🔑 Configurações do Portão de Acesso, Integração Bitrix24 & Google Sheets

Adicione também as seguintes variáveis ao seu arquivo `.env.local` para habilitar a validação do portão de acesso de links, o envio de operações para o CRM Bitrix24 e a sincronização com as planilhas do Google Sheets:

```env
# Token de acesso ao Portal
VITE_ACCESS_TOKEN="seu_token_secreto_aqui"

# Integrações Bitrix24
VITE_BITRIX_WEBHOOK_WRITE_URL="https://seu-dominio.bitrix24.com.br/rest/USER_ID/TOKEN/crm.deal.add.json"
VITE_BITRIX_LIST_URL="https://seu-dominio.bitrix24.com.br/rest/USER_ID/TOKEN/crm.deal.list.json"

# Configurações do Google Sheets
VITE_SHEET_ID="ID_DA_SUA_PLANILHA_GOOGLE"
VITE_SHEET_TAB_USUARIOS="usuários"
VITE_SHEET_TAB_CR="CR 2025"
```

---

*Nota: Certifique-se de nunca commitar arquivos `.env.local` ou credenciais diretamente no repositório público.*
