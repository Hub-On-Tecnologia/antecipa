# 📋 LOG DE DECISÕES — ANTECIPA PORTAL

> Toda decisão que impacte arquitetura, fluxo de dados, integrações, regras de negócio
> ou comportamento de IAs deve ser registrada aqui.
> Formato: mais recente primeiro.

---

## DEC-012 — 2026-07-23 | Conexão DB-API MariaDB via WireGuard para Base de Colaboradores, Restrições de Segurança e Mapeamento Resiliente do Campo CPF/CNPJ

**Solicitado por:** Pedro (Dono do Projeto)
**Decidido por:** Pedro + Orquestrador

**Contexto:**
Por motivos de segurança e topologia de rede na VPS Hostinger, a aplicação não se conecta diretamente na porta do MariaDB (3306). A comunicação ocorre via proxy REST interno (`DB-API`) acessível no IP `http://10.0.3.2:8000` via túnel WireGuard. Além disso, a estrutura de colunas da tabela `corpstek_corretores` pode apresentar variações no nome do campo de documento (`cpfcnpj`, `cpf_cnpj`, `cpf`, `documento`).

**Decisão:**
1. Criar endpoints no servidor Express (`server.ts`: `/api/db/query`, `/api/db/execute`, `/api/db/health`) protegidos por `x-access-token` (chave `ACCESS_TOKEN` / `VITE_ACCESS_TOKEN`).
2. Encaminhar as requisições do servidor Express para a DB-API utilizando o cabeçalho de autenticação interna `X-API-Key` (`DB_API_KEY`) e a URL base configurada em `DB_API_URL` com suporte a parâmetros sanitizados com `%s`.
3. Aplicar **restrição estrita de leitura** em `/api/db/query` no Express, permitindo estritamente instruções SQL iniciadas por `SELECT` ou `WITH` e bloqueando qualquer comando de mutação com HTTP 400 Bad Request.
4. Garantir a **sanitização estrita de erros de banco**: falhas e exceções do MariaDB são registradas apenas no log interno do servidor Express, retornando mensagens genéricas sanitizadas ao navegador para prevenir vazamento de esquemas ou dados sensíveis.
5. Migrar a busca e validação de colaboradores no `sheetsService.ts` para consultar a tabela `corpstek_corretores` do MariaDB, aplicando os filtros de colaboradores ativos (`administrativo_ativo = 1` e `(data_exclusao IS NULL OR data_exclusao = '1970-01-01 00:00:01')`), utilizando controle de **timeout de 5 segundos** (`AbortSignal.timeout(5000)`) e mantendo fallback gracioso para o Google Sheets em caso de indisponibilidade local ou de rede.
6. Implementar mapeamento resiliente em cascata para o campo de documento/CPF (`row.cpf || row.CPF || row.cpf_cnpj || row.cpfcnpj || row.documento`), garantindo 100% de compatibilidade independente da variação do nome da coluna no schema do MariaDB.
7. Padronizar a normalização de CPF (`normalizeCPF` no `utils.ts`) para extrair apenas dígitos e aplicar preenchimento à esquerda com zeros para **11 dígitos** (`clean.padStart(11, '0')`).
8. Ajustar `normalizeDate` no `utils.ts` para converter datas ISO (`YYYY-MM-DD`) do MariaDB para conciliação automática com o formulário de login (`DD/MM/YYYY`).

**Impacto:**
- Base de colaboradores migrada para o banco de dados relacional oficial (`corpstek_corretores`).
- Proteção contra mutações não autorizadas no proxy de leitura (`/api/db/query`) e eliminação do vazamento de stack traces/erros de banco.
- Mapeamento de CPF/CNPJ ultra-resiliente contra alterações ou variações de schema na tabela com garantia de 11 dígitos via `padStart`.
- Credenciais `DB_API_URL` e `DB_API_KEY` isoladas com segurança no servidor Express da VPS Hostinger.
- Resiliência garantida com timeout de 5s e fallback automático para Google Sheets.

---

## DEC-011 — 2026-07-23 | Sistema de Tokens Descartáveis de 1 Minuto no Firestore


**Solicitado por:** Pedro (Dono do Projeto)
**Decidido por:** Pedro + Orquestrador

**Contexto:**
Necessidade de disponibilizar links de acesso temporário e seguro ao portal (ex: via CRM/Bitrix) sem expor tokens permanentes ou credenciais fixas na URL.

**Decisão:**
1. Criar e validar tokens de uso único no Firestore através da coleção `access_tokens`.
2. Definir tempo de expiração curto de 1 minuto para os tokens gerados para validação de acesso ao portal via link temporário.
3. Consumir e invalidar o token no Firestore imediatamente no primeiro acesso para impedir reutilização.

**Impacto:**
- Acesso simplificado e seguro via links diretos temporários sem comprometer o portão de autenticação.
- Mitigação de riscos de vazamento ou compartilhamento indevido de links de acesso.

---

## DEC-010 — 2026-07-23 | Blindagem de Segurança e Isolamento de Webhooks no Servidor

**Solicitado por:** Pedro (Dono do Projeto)
**Decidido por:** Pedro + Orquestrador

**Contexto:**
Após auditoria ativa de segurança, identificou-se que as chaves de webhook do Bitrix24 estavam expostas como variáveis `VITE_` no código estático do cliente, e os endpoints do servidor Express `/api/bitrix/*` não possuíam validação de cabeçalho nem restrição de acesso.

**Decisão:**
1. Isolar os webhooks do Bitrix no servidor Express usando variáveis sem o prefixo `VITE_` (`BITRIX_WEBHOOK_URL`, `BITRIX_LIST_URL`, `BITRIX_WEBHOOK_WRITE_URL`).
2. Remover o fallback direto do navegador no `bitrixService.ts`, garantindo que os segredos nunca cheguem ao bundle `.js` compilado.
3. Exigir cabeçalho `x-access-token` nos endpoints `/api/bitrix/*` do `server.ts`.
4. Desativar a rota `/api/bitrix/debug` em ambiente de produção.
5. Blindar as regras da coleção `access_tokens` no `firestore.rules` proibindo listagens públicas.

**Impacto:**
- Segredos do CRM Bitrix24 totalmente protegidos contra inspeção no navegador.
- API do servidor protegida contra uso não autorizado.
- Regras do Firestore endurecidas.

---

## DEC-009 — 2026-07-23 | Deploy e Configuração da VPS Hostinger (antcp-hubon)

**Solicitado por:** Pedro (Dono do Projeto)
**Decidido por:** Pedro + Orquestrador

**Contexto:**
Necessidade de implantar o sistema Antecipa Portal em ambiente de produção na VPS Hostinger com o nome de serviço `antcp-hubon` e roteamento HTTPS.

**Decisão:**
1. Renomear a aplicação de produção para `antcp-hubon` (no `package.json` e `ecosystem.config.cjs`).
2. Configurar o PM2 na VPS (`179.197.64.244`) rodando o servidor Node.js na porta 3001.
3. Integrar com o proxy reverso Traefik existente na VPS para roteamento com certificado SSL (HTTPS) automático.
4. Liberar acessos via:
   - `https://hubon.tech/antecipa` (subpasta ativa)
   - `https://antecipa.hubon.tech` (subdomínio no Traefik).

**Impacto:**
- Aplicação no ar em produção rodando 24/7 com reinício automático via PM2.
- Roteamento seguro via HTTPS ativo.


---

## DEC-008 — 2026-07-23 | Vinculação e Push do Repositório Remoto GitHub

**Solicitado por:** Pedro (Dono do Projeto)
**Decidido por:** Pedro + Raphael Damasceno

**Contexto:**
Necessidade de versionar o Antecipa Portal em um repositório remoto oficial da Hub ON Tecnologia para colaboração, backup e rastreabilidade do código-fonte.

**Decisão:**
Vincular o repositório local ao repositório remoto no GitHub:
- **URL Remota:** `https://github.com/Hub-On-Tecnologia/antecipa.git`
- **Autor dos Commits/Push:** Raphael Damasceno (`raphaelferreira@hubnogueira.com.br`)
- **Branch Principal:** `main`
- **Estratégia de Merge Inicial:** Conciliação (merge) entre a estrutura local inicial e os arquivos padrão do repositório (`Initial commit`).

**Impacto:**
- Código fonte versionado e acessível remotamente no GitHub da empresa
- Histórico de alterações preservado a partir do commit inicial
- Base pronta para fluxos de CI/CD e revisão de código por PR (Pull Requests)

---

## DEC-007 — 2026-07-23 | Estrutura de Agentes de IA

**Solicitado por:** Pedro (Dono do Projeto)
**Decidido por:** Orquestrador + Pedro

**Contexto:**
O projeto atingiu uma complexidade onde múltiplos agentes de IA trabalham em conjunto.
Sem documentação estruturada, o contexto se perde entre sessões e entre agentes.

**Decisão:**
Criar uma estrutura formal de `.docs/` com papéis definidos para cada agente:
- Orquestrador: único que escreve código, alinha regras de negócio com Pedro
- Gestor de Projeto: memória institucional, documenta alterações e decisões
- Faxineiro: monitora bagunça gerada por IAs
- Tech Lead: qualidade de código, QA pós-implementação
- Revisor: guardian do GitHub, última barreira antes do push

**Impacto:**
- Maior rastreabilidade entre sessões de trabalho
- Contexto recuperável por IAs futuras via leitura da pasta `.docs/`
- Redução de erros por falta de alinhamento de negócio

**Regra estabelecida:**
Pedro aprova tasks antes de qualquer implementação relevante.
IAs documentam suas ações ao final de cada sessão.

---

## DEC-006 — 2026-07-23 | Migração de Workspace

**Solicitado por:** Pedro
**Decidido por:** Pedro

**Contexto:**
O projeto estava em `C:\Users\pedro\antigravity\Antecipa---Antecipação-de-Comissão`.
Pedro exportou o projeto e o colocou em `C:\Users\pedro\Desktop\Antigravity\Antecipa`.

**Decisão:**
Trabalhar a partir do novo path. A versão em Desktop é mais recente e completa.

**Arquivos que confirmam a migração:**
- `.env` presente com todas as variáveis configuradas
- Firebase, Bitrix e Sheets todos configurados
- Componentes mais avançados presentes (`ProposalModal`, `CollateralModal`, etc.)

**Problema identificado no .env:**
- `VITE_ACCESS_TOKEN` duplicado (linhas 1 e 14) — sem impacto funcional
- `VITE_BITRIX_LIST_URL` duplicado com placeholder sobrescrevendo URL real (linha 16)
- **Ação necessária:** Limpar o `.env`

---

## DEC-005 — 2026-07-23 | Papéis de Acesso por Cargo (Role-Based Access)

**Solicitado por:** Pedro
**Decidido por:** Orquestrador + Pedro

**Contexto:**
Diferentes colaboradores têm visões diferentes dos recebíveis:
- Corretores veem apenas suas próprias comissões
- Líderes Trainee veem comissões de seus corretores + as próprias
- Líderes veem o time + as próprias
- Diretores veem a loja inteira
- Superintendentes veem tudo

**Decisão:**
Implementar `userRole` no objeto `Receivable` com atribuição automática baseada
nas colunas J (Corretor), K (Líder Trainee) e L (Líder) da planilha CR 2025,
cruzando com o cargo e superintendência do usuário (guia usuários).

**Arquivo impactado:** `src/services/sheetsService.ts`

---

## DEC-004 — (Data anterior) | Integração Bitrix24

**Solicitado por:** Pedro
**Decidido por:** Orquestrador + Pedro

**Contexto:**
O sistema precisa criar deals no Bitrix24 quando uma antecipação é solicitada.

**Decisão:**
Usar os webhooks do domínio `hubnogueira.bitrix24.com.br`:
- Criação: `/rest/382/tz0e5k2s7a44szbv/crm.deal.add.json`
- Listagem: `/rest/382/seypu5ofz14p0ar1/crm.deal.list.json`
- Escrita alternativa: `/rest/382/j5es5yzq4p9hnuf8/crm.deal.add.json`

**Campos mapeados:**
- `UF_CRM_1758140731010` → PV (ID da negociação)
- `COMMENTS` → Texto completo com todos os campos da planilha
- `TITLE` → "Antecipação - [Nome] - [PV]"
- `OPPORTUNITY` → Valor solicitado

---

## DEC-003 — (Data anterior) | Firebase como Banco de Estado

**Contexto:**
Necessidade de persistir solicitações de antecipação e rastrear status ao longo do tempo.

**Decisão:**
Usar Firebase Firestore como banco de estado para:
- Coleção `promised_commissions`: solicitações de antecipação
- Coleção `notifications`: notificações em tempo real para usuários
- Coleção `access_logs`: auditoria de acessos

**Projeto Firebase:** `gen-lang-client-0436981001`
**Database ID:** `ai-studio-458009ee-a488-47a9-a8ab-31ed63f2ea80`

---

## DEC-002 — (Data anterior) | Google Sheets como Fonte de Verdade

**Contexto:**
Base de usuários e recebíveis gerenciada em Google Sheets pela equipe de negócios.
Não há backend próprio para gestão desses dados.

**Decisão:**
Usar a API pública `gviz/tq` do Google Sheets para leitura:
- Planilha: `1uzQAAUN3dbmBK7p14cBTywTYuG3PNLiZVJtLRUtljnU`
- Guia Usuários: autenticação por CPF + Data Nascimento + Nome
- Guia CR 2025: recebíveis com dados de PV, corretor, valor, previsão

**Limitação conhecida:**
- A API gviz é read-only e pública (a planilha precisa estar compartilhada)
- Colunas com máscara retornam o valor formatado em `.f` e o raw em `.v`

---

## DEC-001 — (Data anterior) | Design Theme: Elegant Dark

**Contexto:**
Escolha visual inicial do portal.

**Decisão:**
Tema escuro elegante com:
- Background: `#0A0A0A` (principal), `#111111` (cards)
- Tipografia: Inter (Google Fonts)
- Linguagem visual: minimalista, corporativo, texto uppercase com letter-spacing
- Motion: Framer Motion para transições suaves

---

*Arquivo mantido pelo: Gestor de Projeto*
*Orquestrador deve registrar aqui ao final de sessões com decisões relevantes*
