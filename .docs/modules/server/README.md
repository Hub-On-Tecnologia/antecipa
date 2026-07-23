# 📦 MÓDULO: SERVIDOR EXPRESS & PROXY (server)

## Responsabilidade
Servidor Express Node.js responsável por atuar como proxy de integração seguro com a API do CRM Bitrix24, além de servir a aplicação estática compilada (Vite/dist) em ambiente de produção.

## Arquivos
| Arquivo | Papel |
|---------|-------|
| `server.ts` | Ponto de entrada do servidor Express, rotas proxy, middleware de segurança e servidor estático Vite |

## Arquitetura do Servidor

### 1. Limite Payload JSON (50MB)
- Configurado `express.json({ limit: "50mb" })` para suportar cargas de dados volumosas e uploads de arquivos/anexos codificados em base64.

### 2. Proteção Middleware (`/api/bitrix/*`)
- **Verificação de Acesso:** Todas as chamadas para os endpoints sob `/api/bitrix` exigem o cabeçalho `x-access-token` ou `Authorization` (`Bearer <token>`), validado contra a variável `ACCESS_TOKEN` (ou `VITE_ACCESS_TOKEN`).
- **Desativação do Debug em Produção:** O endpoint `/api/bitrix/debug` é desativado quando `NODE_ENV === "production"`, retornando HTTP 403 Forbidden para prevenir vazamento de dados de configuração e ambiente.

### 3. Endpoints Proxy Bitrix (`/api/bitrix/*`)
| Rota HTTP | Método Bitrix correspondente | Finalidade |
|-----------|------------------------------|------------|
| `POST /api/bitrix/list` | `crm.deal.list.json` | Listagem de negócios no Bitrix |
| `POST /api/bitrix/get` | `crm.deal.get.json` | Busca de negócio por ID |
| `POST /api/bitrix/add` | `crm.deal.add.json` | Criação de novo negócio (antecipação) |
| `POST /api/bitrix/update` | `crm.deal.update.json` | Atualização de negócio |
| `GET /api/bitrix/debug` | Debug local | Verificação de URLs mascaradas (apenas em dev) |

### 4. Servidor Estático Vite (`dist`) & SPA Fallback
- **Desenvolvimento (`NODE_ENV !== "production"`):** Utiliza middleware do Vite dev server (`createViteServer`).
- **Produção (`NODE_ENV === "production"`):** Serve os arquivos estáticos da pasta `dist/` (com suporte ao prefixo `/antecipa`) e implementa fallback SPA enviando `index.html` para rotas dinâmicas.

## Variáveis de Ambiente de Servidor
- `PORT` (Padrão: 3000 / 3001 na VPS)
- `NODE_ENV` (`production` / `development`)
- `BITRIX_LIST_URL` (URL webhook de leitura Bitrix24)
- `BITRIX_WEBHOOK_WRITE_URL` (URL webhook de escrita Bitrix24)
- `ACCESS_TOKEN` / `VITE_ACCESS_TOKEN` (Chave de autorização das chamadas ao proxy)

## Estado de Saúde
✅ Operacional | Isolamento de webhooks ativo | Proteção `x-access-token` ativada | Debug bloqueado em prod | Última verificação: 2026-07-23
