# 📦 MÓDULO: SERVIDOR EXPRESS & PROXY (server)

## Responsabilidade
Servidor Express Node.js responsável por atuar como proxy de integração seguro com a API do CRM Bitrix24 e com a API de Banco de Dados MariaDB (DB-API via WireGuard), além de servir a aplicação estática compilada (Vite/dist) em ambiente de produção.

## Arquivos
| Arquivo | Papel |
|---------|-------|
| `server.ts` | Ponto de entrada do servidor Express, rotas proxy (Bitrix e DB-API), middleware de segurança e servidor estático Vite |

## Arquitetura do Servidor

### 1. Limite Payload JSON (50MB)
- Configurado `express.json({ limit: "50mb" })` para suportar cargas de dados volumosas e uploads de arquivos/anexos codificados em base64.

### 2. Proteção Middleware (`/api/bitrix/*` e `/api/db/*`)
- **Proxy Bitrix (`/api/bitrix/*`):** Exige cabeçalho `x-access-token` ou `Authorization` (`Bearer <token>`), validado contra a variável `ACCESS_TOKEN` (ou `VITE_ACCESS_TOKEN`).
- **Proxy DB-API (`/api/db/*`):** Exige cabeçalho `x-access-token` ou `Authorization` (`Bearer <token>`), validado contra a variável `ACCESS_TOKEN` (ou `VITE_ACCESS_TOKEN`). A rota `/api/db/health` é desprovida de exigência de token para permitir checagem pública de integridade.
- **Desativação do Debug em Produção:** O endpoint `/api/bitrix/debug` é desativado quando `NODE_ENV === "production"`, retornando HTTP 403 Forbidden para prevenir vazamento de dados de configuração e ambiente.

### 3. Endpoints Proxy Bitrix (`/api/bitrix/*`)
| Rota HTTP | Método Bitrix correspondente | Finalidade |
|-----------|------------------------------|------------|
| `POST /api/bitrix/list` | `crm.deal.list.json` | Listagem de negócios no Bitrix |
| `POST /api/bitrix/get` | `crm.deal.get.json` | Busca de negócio por ID |
| `POST /api/bitrix/add` | `crm.deal.add.json` | Criação de novo negócio (antecipação) |
| `POST /api/bitrix/update` | `crm.deal.update.json` | Atualização de negócio |
| `GET /api/bitrix/debug` | Debug local | Verificação de URLs mascaradas (apenas em dev) |

### 4. Endpoints Proxy MariaDB / DB-API (`/api/db/*`)
| Rota HTTP | Endpoint DB-API correspondente | Regras de Segurança & Timeouts | Finalidade |
|-----------|--------------------------------|--------------------------------|------------|
| `GET /api/db/health` | `GET http://10.0.3.2:8000/health` | Sem auth, timeout 5s (`AbortSignal.timeout(5000)`) | Checagem de integridade e conectividade da DB-API |
| `POST /api/db/query` | `POST http://10.0.3.2:8000/query` | Exige auth, **exclusivo SELECT/WITH** (HTTP 400 se outra instrução), timeout 10s, erros sanitizados | Leitura de dados SQL no MariaDB com parâmetros sanitizados (`%s`) |
| `POST /api/db/execute` | `POST http://10.0.3.2:8000/execute` | Exige auth, timeout 10s, erros sanitizados | Execução de comandos/mutações SQL no MariaDB com parâmetros sanitizados (`%s`) |

#### Mecanismos de Segurança e Resiliência da DB-API
- **Chave de Autenticação Interna (`X-API-Key`):** Todas as chamadas repassadas à DB-API enviam obrigatoriamente a variável `DB_API_KEY` via cabeçalho `X-API-Key`.
- **Restrição de Leitura no Express (`/api/db/query`):** Normaliza a instrução SQL em maiúsculas (`sql.trim().toUpperCase()`) e valida se inicia estritamente com `SELECT` ou `WITH`. Qualquer tentativa de enviar `UPDATE`, `DELETE` ou `DROP` via `/api/db/query` é rejeitada imediatamente com HTTP 400 Bad Request.
- **Sanitização estrita de erros de banco:** Falhas na comunicação ou retornos de erro da DB-API são logados detalhadamente apenas no console do servidor Express (`console.error`), enquanto a resposta HTTP para o cliente do navegador retorna apenas mensagens genéricas sanitizadas (`"Falha na consulta ao banco de dados interno."` ou `"Erro de comunicação com o banco de dados."`), impedindo o vazamento de esquemas do banco ou stack traces.
- **Controle de Timeout:** A rota `/api/db/health` define um limite estrito de 5.000ms (5s), enquanto `/api/db/query` e `/api/db/execute` definem 10.000ms (10s) via `AbortSignal.timeout()`.

### 5. Servidor Estático Vite (`dist`) & SPA Fallback
- **Desenvolvimento (`NODE_ENV !== "production"`):** Utiliza middleware do Vite dev server (`createViteServer`).
- **Produção (`NODE_ENV === "production"`):** Serve os arquivos estáticos da pasta `dist/` (com suporte ao prefixo `/antecipa`) e implementa fallback SPA enviando `index.html` para rotas dinâmicas.

## Variáveis de Ambiente de Servidor
- `PORT` (Padrão: 3000 / 3001 na VPS)
- `NODE_ENV` (`production` / `development`)
- `BITRIX_LIST_URL` (URL webhook de leitura Bitrix24)
- `BITRIX_WEBHOOK_WRITE_URL` (URL webhook de escrita Bitrix24)
- `ACCESS_TOKEN` / `VITE_ACCESS_TOKEN` (Chave de autorização das chamadas aos proxies `/api/bitrix` e `/api/db`)
- `DB_API_URL` (URL base do proxy DB-API MariaDB via WireGuard, padrão: `http://10.0.3.2:8000`)
- `DB_API_KEY` (Chave de autenticação HTTP enviada no cabeçalho `X-API-Key` para a DB-API)

## Estado de Saúde
✅ Operacional | Restrição SELECT ativa | Errors sanitizados | Proxies Bitrix & MariaDB via WireGuard protegidos com `x-access-token` | Debug bloqueado em prod | Última verificação: 2026-07-23
