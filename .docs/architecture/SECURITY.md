# 🔐 MODELO DE SEGURANÇA — ANTECIPA PORTAL

> Leitura obrigatória antes de qualquer mudança em autenticação,
> regras do Firestore, ou integrações externas.

---

## CAMADAS DE SEGURANÇA

### Camada 1 — Portão de Acesso (VITE_ACCESS_TOKEN)
- Variável de ambiente que atua como "portão" de entrada no portal
- Verifica referrer (Bitrix/CRM) ou sessão anterior
- Se não configurada, portão fica aberto (ambiente de desenvolvimento)

### Camada 2 — Autenticação por Identidade e Integração MariaDB (DB-API)
- Login via CPF + Data de Nascimento + Nome completo.
- Validação primária via banco relacional MariaDB (`corpstek_corretores` via DB-API Proxy em rede privada WireGuard) com timeout de 5s (`AbortSignal.timeout(5000)`).
- Restrição estrita no proxy `/api/db/query` exigindo instruções exclusivamente de leitura (`SELECT`/`WITH`).
- Sanitização total de erros de banco: detalhes de exceção e esquemas SQL são mantidos restritos ao console do servidor Node.js (`console.error`), retornando mensagens genéricas sanitizadas ao navegador.
- Fallback automático e transparente para a planilha Google Sheets (guia usuários) em caso de indisponibilidade da DB-API.
- Normalização de dados: `normalizeCPF` com padronização de **11 dígitos** (`clean.padStart(11, '0')`), `normalizeDate` com suporte a ISO `YYYY-MM-DD` e `normalizeName` (sem acentos/espaços redundantes).

### Camada 3 — Firebase Auth (Google)
- Após validação via MariaDB/Sheets, o usuário é autenticado via Google Auth
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
| Bitrix Webhooks | `.env` | Mantido apenas no servidor Express (nunca no frontend) |
| DB_API_KEY | `.env` | Isolado no servidor Express, enviado em cabeçalho `X-API-Key` via WireGuard |
| GEMINI_API_KEY | `.env` | Nunca no frontend, nunca no GitHub |
| CPF dos usuários | MariaDB / Google Sheets | Só trafega em memória após sanitização com `padStart(11, '0')` |
| Erros de Banco de Dados | `server.ts` | Sanitizados no servidor (erros genéricos enviados ao cliente) |
| Dados de comissão | Google Sheets + Firestore | Acesso via UID do usuário |

---

## REGRAS PARA AGENTES DE IA

1. **NUNCA** sugerir ou escrever chaves de API hardcoded no código
2. **NUNCA** remover validações de segurança (como a checagem de `SELECT` no `/api/db/query`) sem alinhamento com Pedro
3. **SEMPRE** tratar erros de APIs externas e de banco de dados sem expor informações sensíveis ou esquemas de tabela ao cliente
4. **SEMPRE** verificar se o Firestore rules suporta novas operações antes de implementá-las
5. Se detectar chave hardcoded → registrar como `SECURITY` no CHANGELOG e corrigir imediatamente

---

## VULNERABILIDADES CONHECIDAS / TRADE-OFFS ACEITOS

| Item | Trade-off | Aceito em |
|------|-----------|-----------|
| gviz API pública | Planilha precisa estar compartilhada publicamente (usada como fallback) | Sim (dados não críticos por si só) |
| VITE_* vars expostas no bundle | Visíveis no source do browser | Sim (keys do Firebase são semi-públicas) |
| Login sem senha | Facilidade de acesso vs. segurança | Sim (decisão de negócio do Pedro) |

---

*Mantido por: Tech Lead*
*Revisar se houver mudança em: autenticação, Firestore rules, novas integrações*
