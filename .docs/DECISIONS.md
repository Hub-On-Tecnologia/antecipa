# 📋 LOG DE DECISÕES — ANTECIPA PORTAL

> Toda decisão que impacte arquitetura, fluxo de dados, integrações, regras de negócio
> ou comportamento de IAs deve ser registrada aqui.
> Formato: mais recente primeiro.

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
