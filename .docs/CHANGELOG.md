# 📝 CHANGELOG — ANTECIPA PORTAL

> Histórico de alterações do projeto.
> Mantido pelo Gestor de Projeto.
> Formato: mais recente primeiro.

---

## [2026-07-23] — Setup da Estrutura de Documentação e Agentes de IA

**Tipo:** Infra / Documentação
**Arquivos:**
- `.docs/AGENTS.md` (NOVO) — definição e protocolos de todos os agentes
- `.docs/DECISIONS.md` (NOVO) — log de decisões DEC-001 a DEC-007
- `.docs/CHANGELOG.md` (NOVO) — este arquivo
- `.docs/ORCHESTRATOR.md` (NOVO) — instruções do agente Orquestrador
- `.docs/architecture/OVERVIEW.md` (NOVO) — visão geral da arquitetura
- `.docs/architecture/SECURITY.md` (NOVO) — modelo de segurança e autenticação
- `.docs/modules/auth/README.md` (NOVO)
- `.docs/modules/receivables/README.md` (NOVO)
- `.docs/modules/bitrix/README.md` (NOVO)
- `.docs/modules/firebase/README.md` (NOVO)
- `.docs/modules/advancement/README.md` (NOVO)

**Por quê:**
Pedro solicitou a criação de um sistema formal de agentes de IA com documentação
estruturada para garantir rastreabilidade e recuperação de contexto entre sessões.
O objetivo é que qualquer IA futura consiga retomar o projeto sem perder contexto.

**Agentes de IA definidos:**
| Agente | Papel |
|---|---|
| `project-manager` | Memória institucional, CHANGELOG, DECISIONS, módulos |
| `janitor` | Qualidade de código, linting, testes, dead code |
| `tech-lead` | Arquitetura, decisões técnicas, implementação |
| `reviewer` | Revisão de PRs, conformidade com decisões registradas |

**Impacto:**
- Sem impacto no código de produção
- Melhora significativa na manutenibilidade a longo prazo
- Permite que IAs futuras recuperem contexto rapidamente

**Decisões tomadas:** DEC-001 a DEC-007 (ver DECISIONS.md)

> [!NOTE]
> `architecture/DATA_FLOW.md` foi planejado mas **não criado** nesta sessão.

---

## [2026-07-23] — Migração de Workspace

**Tipo:** Config
**Por quê:**
Pedro moveu o projeto para `C:\Users\pedro\Desktop\Antigravity\Antecipa`

**Problema identificado:**
`.env` com entradas duplicadas conflitantes (ver DEC-006).

**Pendência:** Limpar o `.env` (baixo risco, alta prioridade)

---

## [Data anterior] — Dashboard de Recebíveis com Agrupamento por PV

**Tipo:** Feature
**Arquivos:**
- `src/components/Dashboard.tsx`
- `src/services/sheetsService.ts`

**Por quê:**
Corretores podem ter múltiplas parcelas para o mesmo PV.
O sistema precisa agrupar e mostrar status de cada parcela individualmente.

**Impacto:**
- Dashboard agrupa recebíveis por ID de PV
- Parcelas pagas aparecem com status "Quitado" (riscadas)
- Total exibido considera apenas parcelas pendentes

---

## [Data anterior] — Sistema de Roles (Corretor / Líder / Diretor / Super)

**Tipo:** Feature
**Arquivos:**
- `src/services/sheetsService.ts`

**Por quê:**
Diferentes níveis hierárquicos precisam de visões diferentes dos recebíveis.

**Impacto:**
- Corretores veem apenas suas comissões
- Líderes veem time + próprias
- Diretores veem loja
- Superintendentes veem tudo

---

## [Data anterior] — Integração Bitrix24 (crm.deal.add)

**Tipo:** Feature
**Arquivos:**
- `src/services/bitrixService.ts`

**Por quê:**
Solicitações de antecipação devem criar deals no CRM da empresa.

**Campos mapeados:**
- `UF_CRM_1758140731010` → PV
- `COMMENTS` → Resumo completo da negociação

---

## [Data anterior] — Firebase Firestore para Persistência

**Tipo:** Feature
**Arquivos:**
- `src/services/firebaseService.ts`

**Coleções criadas:**
- `promised_commissions`: solicitações de antecipação
- `notifications`: notificações em tempo real
- `access_logs`: auditoria

---

## [Data anterior] — Login por CPF + Data Nascimento + Nome

**Tipo:** Feature
**Arquivos:**
- `src/components/LoginForm.tsx`
- `src/services/sheetsService.ts`

**Por quê:**
Autenticação sem senha para facilitar acesso de corretores.
Validação feita contra a planilha Google Sheets (guia usuários).

---

## [Data anterior] — Design Theme: Elegant Dark

**Tipo:** Design
**Arquivos:**
- `src/index.css`
- `src/App.tsx`
- `src/components/LoginForm.tsx`

**Por quê:**
Escolha visual do portal: tema escuro, corporativo, minimalista.

---

*Mantido por: Gestor de Projeto*
