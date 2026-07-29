# PRD de Segurança — Antecipa Portal

| Campo | Valor |
|---|---|
| **Documento** | PRD-SEC-001 |
| **Versão** | 1.0 |
| **Data** | 2026-07-28 |
| **Status** | Ativo — regra vinculante |
| **Aplicação** | `antcp-hubon` / antecipa.hubon.tech |
| **Classificação** | Aplicação financeira — dados pessoais (LGPD) |
| **Audiência** | Agentes de IA de codificação + equipe de desenvolvimento |

> **Para o agente de IA:** este documento é normativo. Toda alteração de código neste repositório deve ser conforme às Seções 3 (Invariantes), 5 (Requisitos) e 8 (Proibições). Se uma tarefa solicitada conflitar com este documento, **pare e sinalize o conflito** em vez de implementar. Não relaxe um controle para "fazer funcionar" ou "destravar o build".

---

## 1. Contexto e Problema

O portal expõe dados de comissões e cadastro de corretores. O requisito de negócio determina **acesso exclusivo via aplicativo móvel autorizado**.

A implementação atual usa: (a) um token de acesso estático com prefixo `VITE_`, (b) um token temporário de 1 minuto no Firestore validado no frontend, e (c) checagem de `Referer`.

**Diagnóstico:** nenhum dos três é um controle de segurança.

- `VITE_*` é inlinado no bundle JS em tempo de build → é conteúdo público.
- Validação no frontend é interface, não fronteira — o atacante chama `/api/*` direto.
- `Referer` e headers customizados são dados enviados pelo cliente, e o cliente é o atacante.

---

## 2. Objetivos

| # | Objetivo | Métrica de sucesso |
|---|---|---|
| **O1** | Zero segredos no bundle cliente | `grep` no `dist/` não retorna nenhum segredo |
| **O2** | Toda requisição a `/api/*` autenticada e autorizada no servidor | 0 endpoints sem middleware de auth (exceto `/health`) |
| **O3** | Acesso restrito ao app autorizado por mecanismo verificável | App Check obrigatório e enforced |
| **O4** | Nenhum usuário acessa dado de outro usuário | Teste de IDOR retorna 403 |
| **O5** | Rollout sem interrupção de serviço | 0 incidentes; rollback < 5 min |

### Fora de escopo (v1)

Criptografia de dados em repouso no MariaDB; MFA; SIEM; hardening de rede WireGuard.

---

## 3. Invariantes de Segurança (inegociáveis)

Estas regras não têm exceção. Nenhuma prioridade de prazo as sobrepõe.

- **INV-1** — Segredo nunca trafega para o cliente. Se está no bundle, não é segredo.
- **INV-2** — A fronteira de segurança é o servidor. Controle no frontend é UX, nunca autorização.
- **INV-3** — Nada enviado pelo cliente é confiável como prova de identidade ou origem. Isso inclui headers, User-Agent, Referer, campos de body e parâmetros de URL.
- **INV-4** — Autenticação ≠ autorização. Provar *quem é* nunca basta; é preciso provar *que pode*.
- **INV-5** — Criptografia e validação de token usam biblioteca oficial mantida. Implementação própria é proibida.
- **INV-6** — Negar por padrão. Endpoint novo nasce fechado; abre-se explicitamente.
- **INV-7** — Todo segredo que já esteve exposto é considerado comprometido permanentemente e deve ser rotacionado, não reutilizado.

---

## 4. Modelo de Ameaças

| ID | Ameaça | Vetor | Severidade | Mitigação |
|---|---|---|---|---|
| **T1** | Extração do token do bundle | DevTools → `/api/db/users` | 🔴 Crítica | RS-01, RS-02 |
| **T2** | Bypass do portão via chamada direta à API | `curl` ignorando o frontend | 🔴 Crítica | RS-02, RS-03 |
| **T3** | Forja de header de origem | `curl -H "X-Antecipa-App: ..."` | 🔴 Crítica | RS-05 |
| **T4** | Token JWT de projeto Firebase alheio | Projeto grátis do atacante → token com `aud` diferente | 🔴 Crítica | RS-03 |
| **T5** | Extração massiva de dados pessoais | `SELECT *` da tabela de corretores | 🔴 Crítica | RS-04, RS-06 |
| **T6** | IDOR — ver comissão de outro corretor | Manipular ID na requisição | 🔴 Crítica | RS-04 |
| **T7** | Acesso direto ao Firestore | Config Firebase é pública por design | 🟠 Alta | RS-05, RS-07 |
| **T8** | DoS / cunhagem em `access_tokens` | Regras do Firestore sem auth | 🟠 Alta | RS-07 |
| **T9** | Vazamento de token via logs/histórico/Referer | Token na query string | 🟠 Alta | RS-08 |
| **T10** | Forja de trilha de auditoria | Log escrito pelo cliente | 🟡 Média | RS-10 |
| **T11** | Força bruta / abuso de endpoint | Ausência de rate limit | 🟡 Média | RS-09 |

---

## 5. Requisitos de Segurança

Cada requisito tem **DoD** (Definition of Done) verificável. Requisito sem DoD atendido não está pronto.

---

### RS-01 — Eliminar segredos do bundle cliente

**Prioridade:** P0 🔥

Nenhuma variável de ambiente contendo segredo pode usar o prefixo `VITE_`. Remover `VITE_ACCESS_TOKEN` do código, do `.env`, do `.env.example` e do `.env` do VPS. Remover o fallback `process.env.ACCESS_TOKEN || process.env.VITE_ACCESS_TOKEN` em `server.ts`.

**Exceção permitida:** config pública do Firebase (`VITE_FIREBASE_*`) é pública por design e pode permanecer — desde que RS-05 e RS-07 estejam ativos.

**DoD:**

- [ ] `grep -ri "ACCESS_TOKEN" dist/` → sem resultados
- [ ] `grep -ri "VITE_ACCESS_TOKEN" src/ server.ts .env.example` → sem resultados
- [ ] Nenhum `import.meta.env` referencia segredo
- [ ] `.env` e chaves de service account estão no `.gitignore` e nunca foram commitados (verificar histórico)

---

### RS-02 — Autenticação server-side obrigatória

**Prioridade:** P0 🔥

Todo endpoint sob `/api/*` exige Firebase ID Token válido no header `Authorization: Bearer <token>`, validado por middleware **antes** do handler. Única exceção: `/api/*/health`, que não retorna dado algum.

**DoD:**

- [ ] Requisição sem `Authorization` → **401**
- [ ] Requisição com token malformado/expirado → **401**
- [ ] Middleware aplicado por padrão; endpoints públicos são allowlist explícita
- [ ] Endpoint novo sem auth **falha em teste automatizado**

---

### RS-03 — Validação de JWT com `firebase-admin`

**Prioridade:** P0 🔥

Usar **exclusivamente** `firebase-admin` → `getAuth().verifyIdToken()`. **Proibido** validar com `jsonwebtoken` ou buscar chaves públicas manualmente.

*Motivação:* validação manual erra classicamente em `algorithms`, `aud`, `iss`, endpoint de chaves e rotação de `kid`. Não validar `aud` aceita token de **qualquer projeto Firebase do mundo** (T4).

**DoD:**

- [ ] `firebase-admin` em `dependencies`; `jsonwebtoken` **removido**
- [ ] Credencial do service account carregada de secret server-side — nunca commitada
- [ ] Token de outro projeto Firebase → **401**
- [ ] Token com assinatura adulterada → **401**
- [ ] Token expirado → **401**
- [ ] Frontend faz refresh do ID Token (validade 1h) sem expor 401 ao usuário

---

### RS-04 — Autorização e propriedade do dado

**Prioridade:** P0 🔥

Autenticação não concede acesso. Exigir, além do token válido:

1. **Allowlist** — o `uid`/e-mail deve constar como usuário habilitado (custom claim ou tabela de autorização). Conta Google válida não é suficiente.
2. **Propriedade por registro** — toda leitura/escrita filtra pelo usuário chamador, derivado **do token**, nunca de parâmetro do cliente.

**DoD:**

- [ ] Conta Google válida fora da allowlist → **403**
- [ ] Usuário A requisitando registro de B → **403** (não 200 com dado vazio)
- [ ] Nenhuma query usa identificador de usuário vindo do body ou da query string
- [ ] Teste de IDOR automatizado no CI

---

### RS-05 — Attestation de app via Firebase App Check

**Prioridade:** P2 🛡️ — **é este requisito que satisfaz a DoD de negócio**

Implementar Firebase App Check com **Play Integrity** (Android) e **App Attest/DeviceCheck** (iOS). O app envia `X-Firebase-AppCheck`; o backend valida com `getAppCheck().verifyToken()`.

⚠️ **Habilitar enforcement também no Firestore**, não só no backend próprio — senão o atacante pula o servidor e fala direto com o banco usando a config pública (T7).

*Nota de conformidade:* App Check não é inquebrável (dispositivo rooteado, app modificado), mas é o controle padrão da indústria e **auditável**. É legítimo declará-lo na DoD. Header customizado **não é**.

**DoD:**

- [ ] `curl` sem token App Check → **401**
- [ ] `curl` com token App Check forjado/expirado → **401**
- [ ] App real em dispositivo real → **200**
- [ ] Enforcement ativo no Firestore Console
- [ ] Regras do Firestore exigem `request.app != null`

---

### RS-06 — Princípio do menor privilégio nas consultas

**Prioridade:** P0 🔥

Proibido `SELECT *`. Colunas declaradas explicitamente, com o mínimo necessário. `GET /api/db/users` deve ser escopado ao chamador — hoje devolve a tabela inteira de corretores (T5). SQL **sempre** fixo no servidor, com parâmetros vinculados; o cliente nunca envia SQL nem fragmento de SQL.

**DoD:**

- [ ] Nenhum `SELECT *` no código
- [ ] `/api/db/users` retorna apenas o escopo autorizado do chamador
- [ ] Campos sensíveis não solicitados não trafegam na resposta
- [ ] Nenhum endpoint aceita SQL, nome de tabela ou nome de coluna vindos do cliente

---

### RS-07 — Regras do Firestore em negar-por-padrão

**Prioridade:** P0 🔥

Corrigir `access_tokens`, hoje aberto:

- `allow get` **sem autenticação** → qualquer um lê
- `allow delete` **sem autenticação** → qualquer um apaga tokens (DoS em login legítimo)
- `allow create: if isSignedIn()` → qualquer autenticado cunha token

Alvo: cliente **não** cria, **não** apaga; leitura exige auth + App Check. Ciclo de vida do token passa a ser server-side.

⚠️ Existe o commit `548dfe4` que declara essa correção, **mas o arquivo atual não a reflete** — perdida em rollback. **Auditar as regras publicadas no Console**, não apenas o arquivo do repositório.

**DoD:**

- [ ] `access_tokens`: `create`/`delete` negados ao cliente; `get` exige `isSignedIn() && request.app != null`
- [ ] Regras do repositório == regras publicadas no Console (verificado manualmente)
- [ ] Testes do emulador Firestore cobrindo cada negação
- [ ] `access_logs` não é escrito pelo cliente (ver RS-10)

---

### RS-08 — Tratamento de token temporário

**Prioridade:** P1 ⚡

O token de 1 minuto é **mecanismo de handoff, não controle de segurança**. Não deve ser contabilizado como camada de proteção nem citado em documento de conformidade.

Se mantido: validação **no backend**, uso único, e não trafegar em query string — `?token=` vaza em log do nginx, histórico do navegador, header `Referer` e analytics. `history.replaceState` limpa depois do fato; o servidor já registrou. Usar fragmento (`#token=`, nunca enviado ao servidor) ou POST, trocando imediatamente por sessão.

**DoD:**

- [ ] Validação ocorre no servidor; o frontend não decide acesso
- [ ] Token não aparece em log de acesso do servidor
- [ ] Segunda tentativa de uso do mesmo token → **401**
- [ ] Token expirado gera mensagem clara ao usuário, não tela branca

---

### RS-09 — Rate limiting e hardening de transporte

**Prioridade:** P2 🛡️

`express-rate-limit` em todos os endpoints de `/api/*`, com limite mais estrito nos de autenticação. `helmet`, HSTS, CSP restritiva e CORS restrito à origem do portal (nunca `*`).

**DoD:**

- [ ] Rajada acima do limite → **429**
- [ ] `helmet` ativo; headers de segurança presentes na resposta
- [ ] CORS não permite origem arbitrária
- [ ] CSP sem `unsafe-inline` em script

---

### RS-10 — Trilha de auditoria server-side

**Prioridade:** P2 🛡️

Aplicação financeira exige auditabilidade. Log escrito **exclusivamente pelo servidor** — hoje `access_logs` é escrito pelo cliente (`firestore.rules:103`), portanto forjável (T10).

Registrar: tentativa de auth (sucesso e falha), acesso a dado sensível, e toda operação de escrita. **Nunca** logar token, segredo ou dado pessoal em texto claro.

**DoD:**

- [ ] Cliente não consegue escrever em `access_logs`
- [ ] Toda negação de auth/authz gera registro server-side
- [ ] Nenhum segredo ou token aparece nos logs
- [ ] Log é imutável para o cliente

---

### RS-11 — Rotação de segredos comprometidos

**Prioridade:** P0 🔥

O `ACCESS_TOKEN` esteve no bundle público. Por **INV-7**, ele e tudo que ele alcançava estão comprometidos. Rotacionar: `ACCESS_TOKEN`, `DB_API_KEY`, e as **URLs de webhook do Bitrix** — que são credenciais bearer embutidas no path da URL, portanto igualmente expostas via o proxy.

**DoD:**

- [ ] Todos os três rotacionados; valores antigos revogados na origem
- [ ] Valor antigo → **401**
- [ ] Nenhum valor antigo remanescente em `.env`, CI, ou histórico git

---

### RS-12 — Rollout faseado com dual-accept

**Prioridade:** P1 ⚡

⚠️ **Este plano já foi implementado e revertido** — commits `8fdcac1` (implementação) → `4a89869`/`53fc1f0` (rollbacks) → `44fbbcb` (post-mortem). Corte big-bang é proibido.

**Fases obrigatórias:**

1. Backend aceita **token antigo OU JWT válido**; loga qual caminho cada requisição usou.
2. Monitorar até 100% do tráfego real estar no caminho JWT.
3. Desligar o caminho legado.
4. **Só então** remover a variável do `.env` do VPS.

**DoD:**

- [ ] Fase 1 em produção sem aumento de erro
- [ ] Métrica de uso por caminho visível antes do corte
- [ ] Rollback documentado e testado, executável em < 5 min
- [ ] Validação em staging antes de produção
- [ ] Remoção da variável ocorre **após** o código deixar de lê-la

---

## 6. Arquitetura Alvo

```
┌─────────────────────────────────────┐
│  App Móvel (WebView)                │
│  • App Check token (Play Integrity /│
│    App Attest)                      │
│  • Firebase ID Token (login Google) │
└──────────────┬──────────────────────┘
               │ HTTPS
               │ X-Firebase-AppCheck: <token>
               │ Authorization: Bearer <idToken>
               ▼
┌─────────────────────────────────────┐
│  Backend Node/Express (server.ts)   │
│                                     │
│  1. verifyAppCheck()   → é o app?   │
│  2. verifyIdToken()    → quem é?    │
│  3. checkAllowlist()   → pode entrar│
│  4. checkOwnership()   → pode ver   │
│                          ESTE dado? │
│  5. rate limit + audit log          │
└──────────────┬──────────────────────┘
               │ credenciais server-side
               ▼
   ┌───────────┴───────────┐
   ▼                       ▼
MariaDB               Bitrix CRM
(WireGuard)           (webhook)

   Firestore ← App Check enforced +
               regras negar-por-padrão
```

**As três camadas são independentes e todas obrigatórias:**

| Camada | Pergunta | Mecanismo |
|---|---|---|
| App Check | É o meu app autorizado? | Play Integrity / App Attest |
| Firebase Auth | Quem é o usuário? | `verifyIdToken()` via `firebase-admin` |
| Autorização | Pode ver **estes** dados? | Allowlist + propriedade por registro |

---

## 7. Definition of Done — Global

A entrega de segurança só está pronta quando **todos** os itens abaixo passarem.

### Testes de bypass (todos devem falhar em obter dados)

```bash
# Sem credencial alguma
curl https://antecipa.hubon.tech/api/db/users                       # → 401

# Header de app forjado (deve continuar bloqueando)
curl -H "X-Antecipa-App: AntecipaMobileApp/1.0" .../api/db/users    # → 401

# User-Agent de app forjado
curl -A "AntecipaMobileApp/1.0" .../api/db/users                    # → 401

# Referer forjado
curl -H "Referer: https://antecipa.hubon.tech" .../api/db/users     # → 401

# JWT válido de OUTRO projeto Firebase
curl -H "Authorization: Bearer <token_projeto_alheio>" ...          # → 401

# JWT válido, mas conta fora da allowlist
curl -H "Authorization: Bearer <token_valido>" ...                  # → 403

# JWT válido, mas dado de outro usuário
curl -H "Authorization: Bearer <token_A>" .../api/<recurso_de_B>    # → 403

# JWT válido sem App Check
curl -H "Authorization: Bearer <token_valido>" .../api/db/users     # → 401
```

### Checklist final

- [ ] Todos os testes de bypass acima retornam 401/403
- [ ] `grep -ri "secret\|token\|key\|password" dist/` sem achado sensível
- [ ] RS-01 a RS-12 com DoD individual cumprido
- [ ] Regras do Firestore publicadas == arquivo do repositório (verificado no Console)
- [ ] Segredos rotacionados (RS-11)
- [ ] Rollback testado
- [ ] App real em dispositivo real funciona ponta a ponta
- [ ] Revisão externa / pentest antes de declarar conformidade

> ⛔ **A DoD de negócio ("acesso exclusivo via app autorizado") só pode ser declarada atendida quando RS-05 estiver em enforcement.** Declará-la com base em header customizado é afirmação factualmente falsa em sistema financeiro — e em auditoria isso é pior do que não ter controle, porque documenta proteção inexistente.

---

## 8. Proibições Explícitas

**Para o agente de IA — nunca faça, sob nenhuma justificativa:**

| ⛔ | Proibição | Porquê |
|---|---|---|
| 1 | Criar variável `VITE_*` com segredo | Vai para o bundle público |
| 2 | Validar autenticação/autorização apenas no frontend | Cliente é o atacante |
| 3 | Tratar header, User-Agent ou Referer como prova de origem | Forjável em 5 segundos |
| 4 | Validar JWT com `jsonwebtoken` ou chaves buscadas à mão | Erra `aud`/`iss`/`alg` |
| 5 | `SELECT *` | Vaza coluna sensível |
| 6 | Aceitar SQL, tabela ou coluna vindos do cliente | Injeção |
| 7 | Usar identificador de usuário vindo do body/query para autorizar | IDOR |
| 8 | Escrever log de auditoria pelo cliente | Forjável |
| 9 | Logar token, segredo ou dado pessoal em texto claro | Vazamento por log |
| 10 | Commitar `.env` ou chave de service account | Vazamento permanente |
| 11 | Desligar App Check "temporariamente" para depurar em produção | Vira permanente |
| 12 | Reutilizar segredo que já esteve exposto | INV-7 |
| 13 | Criar endpoint sem middleware de auth | Negar por padrão |
| 14 | Fazer corte big-bang de autenticação | Já causou incidente |
| 15 | Passar token em query string | Vaza em log/histórico/Referer |

---

## 9. Roadmap de Execução

| Fase | Requisitos | Prazo | Bloqueia |
|---|---|---|---|
| 🔥 **P0** | RS-11 (rotação), RS-07 (regras Firestore), RS-06 (escopo query) | Imediato | Tudo |
| ⚡ **P1** | RS-01, RS-02, RS-03, RS-04, RS-08, RS-12 | Sprint atual | P2 |
| 🛡️ **P2** | RS-05 (App Check), RS-09, RS-10 | Próxima sprint | Conformidade |
| 📋 **P3** | Pentest / revisão externa | Antes de declarar DoD | — |

**Ordem dentro de P0 importa:** rotacionar segredos **antes** de qualquer outra coisa. Enquanto o token antigo valer, todo o resto é irrelevante.

---

## 10. Rastreabilidade

| Requisito | Ameaças mitigadas | Invariantes |
|---|---|---|
| RS-01 | T1 | INV-1 |
| RS-02 | T1, T2 | INV-2, INV-6 |
| RS-03 | T4 | INV-5 |
| RS-04 | T5, T6 | INV-4 |
| RS-05 | T3, T7 | INV-3 |
| RS-06 | T5 | INV-6 |
| RS-07 | T7, T8 | INV-6 |
| RS-08 | T2, T9 | INV-2, INV-3 |
| RS-09 | T11 | INV-6 |
| RS-10 | T10 | INV-2 |
| RS-11 | T1 | INV-7 |
| RS-12 | — | — |

---

## 11. Glossário

- **App Check** — serviço Firebase que atesta criptograficamente que a requisição vem do app genuíno em dispositivo genuíno.
- **Attestation** — prova criptográfica de integridade de app/dispositivo, emitida por Google/Apple. Não é auto-declaração do cliente.
- **Dual-accept** — fase de transição em que o backend aceita credencial antiga e nova simultaneamente, permitindo corte sem downtime.
- **IDOR** *(Insecure Direct Object Reference)* — acessar recurso de outro usuário manipulando identificador na requisição.
- **ID Token** — JWT emitido pelo Firebase Auth após login, validade 1h, prova a identidade do usuário.
- **Negar por padrão** — recurso nasce inacessível; acesso é concedido por regra explícita.

---

## 12. Base Factual e Limitações

**Verificado diretamente no código (2026-07-28):**

- `server.ts` (integral) — middlewares de auth, endpoints do proxy Bitrix e DB-API
- `firestore.rules` (integral) — incluindo o bloco `access_tokens`
- `package.json` — `jsonwebtoken` presente, `firebase-admin` ausente
- `.env.example`, `security_spec.md`, histórico git

**NÃO verificado:**

- `src/App.tsx` e `src/services/*`

O requisito **RS-08** e a caracterização do portão de acesso atual partem da descrição de um plano prévio, não de leitura direta do código. Confirmar antes de agir sobre eles.

**Ao revisar este documento:** atualizar esta seção com o que foi verificado e quando.
