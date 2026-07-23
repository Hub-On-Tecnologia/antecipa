# 🔐 MODELO DE SEGURANÇA — ANTECIPA PORTAL

> Leitura obrigatória antes de qualquer mudança em autenticação,
> regras do Firestore, ou integrações externas.

---

## CAMADAS DE SEGURANÇA

### Camada 1 — Portão de Acesso (VITE_ACCESS_TOKEN)
- Variável de ambiente que atua como "portão" de entrada no portal
- Verifica referrer (Bitrix/CRM) ou sessão anterior
- Se não configurada, portão fica aberto (ambiente de desenvolvimento)

### Camada 2 — Autenticação por Identidade
- Login via CPF + Data de Nascimento + Nome completo
- Validação cruzada com planilha Google Sheets (guia usuários)
- Normalização de dados para evitar falsos negativos (acentos, espaços, etc.)

### Camada 3 — Firebase Auth (Google)
- Após validação via Sheets, o usuário é autenticado via Google Auth
- UID do Firebase é usado para segmentar dados no Firestore

### Camada 4 — Firestore Security Rules
- Arquivo: `firestore.rules`
- Cada coleção tem regras específicas baseadas no `userId`
- `promised_commissions`: usuário só lê/escreve seus próprios documentos
- `notifications`: usuário só lê suas notificações
- `access_logs`: write-only para usuários autenticados

### Camada 5 — Role-Based Access (Dados)
- Implementado em `sheetsService.fetchReceivables()`
- Corretor → vê apenas suas comissões
- Líder → vê comissões do time + as próprias
- Diretor → vê por loja
- Superintendente → visão total

---

## DADOS SENSÍVEIS

| Dado | Onde está | Proteção |
|------|-----------|----------|
| Firebase API Keys | `.env` (VITE_*) | Não comitar, mas são semi-públicas por natureza |
| Bitrix Webhooks | `.env` (VITE_*) | Nunca hardcoded, nunca no GitHub |
| GEMINI_API_KEY | `.env` | Nunca no frontend, nunca no GitHub |
| CPF dos usuários | Google Sheets | Só trafega em memória, nunca persistido |
| Dados de comissão | Google Sheets + Firestore | Acesso via UID do usuário |

---

## REGRAS PARA AGENTES DE IA

1. **NUNCA** sugerir ou escrever chaves de API hardcoded no código
2. **NUNCA** remover validações de segurança sem alinhamento com Pedro
3. **SEMPRE** verificar se o Firestore rules suporta novas operações antes de implementá-las
4. **SEMPRE** tratar erros de APIs externas sem expor informações sensíveis
5. Se detectar chave hardcoded → registrar como `SECURITY` no CHANGELOG e corrigir imediatamente

---

## VULNERABILIDADES CONHECIDAS / TRADE-OFFS ACEITOS

| Item | Trade-off | Aceito em |
|------|-----------|-----------|
| gviz API pública | Planilha precisa estar compartilhada publicamente | Sim (dados não críticos por si só) |
| VITE_* vars expostas no bundle | Visíveis no source do browser | Sim (keys do Firebase são semi-públicas) |
| Login sem senha | Facilidade de acesso vs. segurança | Sim (decisão de negócio do Pedro) |

---

*Mantido por: Tech Lead*
*Revisar se houver mudança em: autenticação, Firestore rules, novas integrações*
