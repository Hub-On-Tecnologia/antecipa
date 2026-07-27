# Plano de ação — Antecipa Portal

Este documento é resultado de uma revisão técnica externa (tech lead) do repositório `Hub-On-Tecnologia/antecipa`. Contém problemas reais encontrados no código, em ordem de prioridade, com contexto suficiente para corrigir sem precisar adivinhar intenção.

**Regra para quem for executar este plano:** trabalhe item por item, na ordem em que aparecem. Não pule para P1/P2 antes de fechar todos os itens de P0. Ao final de cada item, rode `tsc --noEmit` (script `lint` do projeto) e confirme que a aplicação sobe (`npm run dev`) antes de marcar como concluído. Não pare até finalizar todos os itens marcados como P0 e P1. Itens P2 podem ficar para depois, mas devem virar issues/TODOs explícitos se não forem feitos agora.

---

## P0 — Crítico (bloqueia uso em produção com dados reais)

### 1. Endpoint de banco de dados aceita SQL arbitrário vindo do cliente

**Onde:** `server.ts`, rotas `POST /api/db/query` e `POST /api/db/execute`.

**Problema:** As rotas recebem `req.body.sql` e `req.body.params` e repassam direto para a DB-API (`fetch(`${dbApiUrl}/query`, ...)`), sem validar qual comando está sendo enviado. A única barreira é comparação de um token de header. Isso significa que qualquer cliente que tenha o token pode enviar **qualquer instrução SQL** (SELECT em tabelas não previstas, UPDATE, DELETE, etc.), não só a query de login que o app hoje usa (`sheetsService.ts`, função que consulta `corpstek_corretores`).

**Correção obrigatória:**
- Remover a possibilidade de o cliente definir a string SQL. Trocar `/api/db/query` (genérico) por endpoints específicos e fixos no servidor, ex: `POST /api/auth/broker` que recebe `{ cpf, birthDate }` e internamente monta e executa uma query fixa (com bind de parâmetros), sem qualquer parte da SQL vinda do corpo da requisição.
- Auditar todos os usos de `queryDbProxy` em `src/services/sheetsService.ts` e migrar cada chamada para um endpoint dedicado equivalente.
- Depois da migração, apagar as rotas genéricas `/api/db/query` e `/api/db/execute` do `server.ts`. Se algum uso legítimo futuro precisar de flexibilidade, criar um allowlist de queries nomeadas no servidor (ex: um dicionário `QUERY_TEMPLATES` com SQL fixo por nome), nunca aceitar SQL cru do cliente.

**Critério de aceite:** buscar por `req.body.sql` no repo inteiro e não encontrar nenhuma ocorrência restante fora de um template fixo no servidor.

---

### 2. Segredo do servidor está vazado no bundle público (prefixo `VITE_`)

**Onde:** `server.ts` (linhas do middleware de `/api/bitrix` e `/api/db`), `.env.example`, `src/services/bitrixService.ts`, `src/services/sheetsService.ts`, `src/App.tsx`.

**Problema:** O servidor aceita como token válido tanto `process.env.ACCESS_TOKEN` quanto `process.env.VITE_ACCESS_TOKEN`. Só que **qualquer variável com prefixo `VITE_` é embutida em texto puro no JavaScript que roda no navegador** (comportamento padrão do Vite, não é bug de configuração). Ou seja: o mesmo valor que deveria proteger o backend está sendo enviado para todo mundo que abre o site.

**Correção obrigatória:**
- Criar uma variável nova, sem prefixo `VITE_` (ex: `SERVER_ACCESS_TOKEN`), gerada com valor diferente do token usado no cliente (se ainda precisar de algum token no cliente para outra finalidade, tudo bem, mas eles não podem ser o mesmo valor nem uma reutilizar a outra).
- Atualizar `server.ts` para validar **apenas** essa variável nova, removendo o fallback para `VITE_ACCESS_TOKEN`.
- Atualizar `.env.example` para deixar claro, com comentário, que `SERVER_ACCESS_TOKEN` nunca deve ter prefixo `VITE_` e nunca deve ser igual ao `VITE_ACCESS_TOKEN` do portão de UI.
- Gerar um novo valor de produção para esse token (o atual, se já foi usado em produção, deve ser considerado comprometido e trocado).

**Critério de aceite:** buscar por `VITE_ACCESS_TOKEN` em `server.ts` e não encontrar nenhuma ocorrência.

---

## P1 — Alto (corrigir antes de expandir uso para mais usuários/dados)

### 3. Autenticação de usuário fraca (CPF + data de nascimento)

**Onde:** `src/components/LoginForm.tsx`, `src/services/sheetsService.ts` (`authenticateUser`).

**Problema:** O login usa apenas CPF e data de nascimento como credencial. Nenhum dos dois é secreto de fato (aparecem em currículos, RH, grupos internos, vazamentos de terceiros). Isso funciona como identificação, não como autenticação.

**Correção mínima recomendada (sem redesenhar tudo):**
- Adicionar um terceiro fator que só o próprio usuário tenha: um código enviado por e-mail corporativo ou WhatsApp cadastrado (OTP de uso único), antes de liberar o dashboard.
- Aplicar rate limiting real no servidor para tentativas de login por CPF (o app já tem um lockout client-side em `localStorage` — isso é cosmético, precisa ser feito também no servidor, já que localStorage é trivialmente resetável).
- Médio prazo: migrar para Firebase Authentication de fato (o projeto já usa Firebase para outras coisas) em vez de CPF/data de nascimento cru.

### 4. Planilha do Google Sheets acessada diretamente do navegador

**Onde:** `src/services/sheetsService.ts`, função `fetchFromSheet` (usa endpoint público `docs.google.com/.../gviz/tq`).

**Problema:** Para esse endpoint funcionar sem OAuth, a planilha precisa estar com link de visualização público. Isso significa que qualquer pessoa com a URL (que também vaza no bundle via `VITE_SHEET_ID`) consegue ler nome, CPF, data de nascimento e dados de comissão de todos os corretores, fora do app.

**Correção obrigatória:**
- Mover a leitura da planilha para o backend (`server.ts`), usando a Google Sheets API oficial com uma service account (sem precisar deixar a planilha pública).
- O frontend passa a chamar um endpoint próprio (`/api/sheets/usuarios`, `/api/sheets/cr`) que faz essa leitura no servidor e devolve só os dados que o usuário autenticado tem permissão de ver.
- Depois disso, tornar a planilha privada novamente.

---

## P2 — Médio (qualidade e manutenibilidade, não bloqueia produção)

### 5. Ausência de testes automatizados e CI
- O script `lint` hoje só roda `tsc --noEmit` (checagem de tipo), não é lint de verdade.
- Adicionar Vitest com pelo menos: testes das funções puras de `bitrixService.ts` (`parseBitrixCurrency`, `mapBitrixStageToStatus`, `isAlreadyRequested`) e de `sheetsService.ts` (normalizações).
- Adicionar um workflow simples de GitHub Actions rodando `npm run lint` e os testes em cada PR.

### 6. Múltiplos caminhos de deploy conflitantes
- O repo tem `vercel.json`, `Dockerfile`, `deploy-vps.sh`, `ecosystem.config.cjs` (PM2) e `nginx.conf.example` simultaneamente.
- Decidir **um** ambiente de produção real, remover ou mover para uma pasta `docs/deploy-alternatives/` os demais, e documentar no README qual é o oficial.

### 7. Componentes grandes demais
- `Dashboard.tsx` (~44K), `ProposalModal.tsx` (~48K), `App.tsx` (~36K), `QAPanel.tsx` (~36K) concentram estado, regras de negócio e UI no mesmo arquivo.
- Extrair hooks customizados (`useReceivables`, `useBitrixDeals`, `useAuthGate`) e subcomponentes menores. Não precisa ser tudo de uma vez — pode ser feito arquivo por arquivo conforme forem sendo mexidos por outras tarefas.

---

## O que NÃO mexer (já está bom)

- `firestore.rules`: default deny, validação de schema, checagem de dono por `request.auth.uid`, proteção contra campos extras — está correto e bem pensado. Não simplificar nem remover validações ao tentar consertar outra coisa.
- Uso de proxy de backend para o Bitrix (`/api/bitrix/*`) em vez de chamar o webhook direto do navegador — manter esse padrão e replicar para o Google Sheets (item 4 acima).

---

## Checklist final antes de considerar este plano concluído

- [ ] Nenhuma rota aceita SQL vindo do corpo da requisição (`grep -r "req.body.sql"` vazio)
- [ ] `server.ts` não lê mais `VITE_ACCESS_TOKEN` em nenhuma validação
- [ ] Token de servidor novo gerado e configurado (o antigo tratado como comprometido)
- [ ] Login tem pelo menos um fator adicional além de CPF + data de nascimento, ou rate limit real no servidor
- [ ] Leitura da planilha do Google Sheets passa pelo backend, planilha voltou a ser privada
- [ ] `npm run lint` (tsc) passa sem erros
- [ ] `npm run dev` sobe sem erros e o fluxo de login → dashboard → solicitação de antecipação funciona de ponta a ponta manualmente
