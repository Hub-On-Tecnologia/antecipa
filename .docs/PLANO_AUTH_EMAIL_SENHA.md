# 🔑 PLANO DE AÇÃO — Migração da autenticação para e-mail e senha

> **Status:** proposta, aguardando aprovação do Pedro
> **Data:** 2026-07-30
> **Decisão de origem:** o login Google nunca cobriu 100% do quadro — corretor sem
> conta Google simplesmente não entra. A escolha é migrar para credencial própria.

---

## 1. Achados que mudam o desenho

Quatro medições feitas antes de escrever este plano. Elas alteram o esforço e o
risco em relação ao que se imaginava.

| # | Achado | Consequência |
|---|---|---|
| 1 | **Só existe 1 vínculo e 2 solicitações no Firestore** (`user_bindings: 1`, `promised_commissions: 2`) | **Não há migração de base.** O sistema ainda é pré-lançamento. Cai por terra o risco de perder histórico e a necessidade de account linking. |
| 2 | A base `corpstek_corretores` tem **`email`, `email_contato`, `email_social`, `telefone`, `telefone_1`, `telefone_2`** | Dá para ancorar o cadastro no contato que a **Antecipa já tem**, em vez de aceitar um e-mail digitado pelo usuário. Muda tudo (ver §3). |
| 3 | A base tem a flag **`enable_app`** | Já existe um controle de quem pode usar o app. Deve ser usado como porta do cadastro. |
| 4 | Toda a autorização é **agnóstica de provedor** | Regras do Firestore, `dualAuthMiddleware`, `/api/auth/me`, `user_bindings` — tudo funciona por `uid` e ID Token. Trocar o provedor **não toca em nada disso**. |

O achado 4 é o mais importante para dimensionar: o Firebase emite o mesmo ID
Token independente de o login ter sido Google ou senha. O raio de impacto é a
**tela de login e o fluxo de primeiro acesso** — não a autorização.

---

## 1.1 Resultados da Task 0 — executada em 2026-07-30

Consulta agregada na `corpstek_corretores`, sem trazer dado pessoal.

| Métrica | Resultado |
|---|---|
| Corretores ativos | **91** |
| Com algum e-mail | 88 (96,7%) |
| Com algum telefone | **91 (100%)** |
| Sem contato nenhum | **0** |
| Com data de nascimento | 91 (100%) |
| Com CPF | 91 (100%) |
| Grupos de e-mail duplicado | **0** |
| `enable_app = 1` | **50** |
| `enable_app = 0` | **41** |

### O que isso confirma

- **O plano é viável para 100% da base.** Ninguém fica sem canal de entrega, e
  todos têm os três dados exigidos no primeiro acesso (nome, nascimento, CPF).
- **WhatsApp deve ser o canal principal, não a alternativa.** Telefone tem
  cobertura de 100%; e-mail, de 96,7%. Se o e-mail fosse o único canal, 3
  corretores ativos ficariam de fora sem nenhuma saída automática.
- **A colisão de e-mail não se confirmou** (0 duplicados). Ainda assim, manter
  CPF como identificador de login continua valendo, pelo motivo original: o
  corretor não precisa lembrar qual dos três e-mails está cadastrado.

### ⚠️ Achado que exige decisão de negócio

**`enable_app` está desligado para 41 dos 91 corretores ativos — 45% da base.**

O plano previa usar essa flag como pré-requisito do cadastro. Do jeito que
está, isso barraria quase metade dos corretores ativos no primeiro acesso.

Antes de usá-la é preciso responder: essa flag governa **este** portal ou o app
parceiro? Ela é preenchida por quem, e quando? Três caminhos:

1. **Não usar a flag** — o critério de acesso continua sendo "corretor ativo no
   MariaDB", como já é hoje no `/api/auth/me`. Mais simples, não regride nada.
2. **Usar a flag** — só depois de o administrativo revisar os 41 registros.
3. **Usar como aviso, não como bloqueio** — registra no log de auditoria quem
   entrou com a flag desligada, sem impedir o acesso.

**Recomendação: caminho 1 agora, reavaliar depois do piloto.** O sistema hoje
não consulta `enable_app`; adotá-la agora seria introduzir uma regressão de
acesso no mesmo passo em que se troca a autenticação — dois riscos no mesmo
corte, contra o que o próprio `SECURITY_PRD.md` recomenda.

## 1.2 Resultados parciais da Task 1 — evolution-api

- Os containers `evolution-api`, `evolution-redis` e `evolution-postgres` estão
  **de pé na VPS há 4 dias**, com a API na porta interna 8080.
- **Não existe nenhuma variável de evolution no `.env` do Antecipa.** A
  instância pertence a outro projeto hospedado na mesma máquina.

**Pendente com o Pedro:** a instância é de vocês? Pode ser usada por este
projeto? Existe número de origem dedicado? Enquanto não houver resposta, a
Task 4 (canal de entrega) fica bloqueada — mas ela só entra depois da Task 3,
então não trava o início.

---

## 2. O que muda e o que não muda

### Não muda (nenhuma linha)
- `firestore.rules` — tudo por `request.auth.uid`
- `dualAuthMiddleware`, `requireBoundBroker`, `/api/auth/me` (server.ts)
- `user_bindings` / `corretor_bindings` — o modelo de vínculo continua idêntico
- Dashboard, Bitrix, Sheets, MariaDB, contrato, assinatura
- Portão de token de uso único (`/api/access-tokens`)

### Muda
- `signInWithGoogle()` → login com credencial própria (`firebaseService.ts`)
- `LoginForm.tsx` e a tela de login do `App.tsx` — novas telas
- `/api/auth/bind` ganha um irmão: `/api/auth/register-request`
- Console do Firebase: habilitar provedor **E-mail/senha**, desabilitar Google ao final
- Novo canal de envio (e-mail transacional e/ou WhatsApp)

---

## 3. A decisão central: quem pode criar conta

Esta é a única decisão que pode transformar a migração em problema de segurança.

### O risco de fazer o óbvio

O caminho ingênuo é: qualquer um se cadastra com e-mail e senha, e depois usa o
`/api/auth/bind` atual (nome + nascimento + CPF) para se declarar corretor.

**Isso é mais fraco do que o que existe hoje.** CPF e data de nascimento
circulam em vazamentos no Brasil; não são segredo. Hoje o Google impõe uma
fricção implícita (o atacante precisa de uma conta Google real e rastreável).
Com cadastro aberto, basta um e-mail descartável.

### O desenho proposto: cadastro ancorado no contato que já temos

O corretor **nunca digita o e-mail dele**. O servidor busca o contato na base.

```
1. Corretor informa CPF + nome + data de nascimento
              ↓
2. Servidor confere no MariaDB (mesma lógica de matchCorretor já testada)
   + exige enable_app ativo
              ↓
3. Servidor gera link de definição de senha (Admin SDK)
              ↓
4. Link é enviado para o e-mail E/OU WhatsApp QUE CONSTAM NA BASE
   — nunca para um endereço informado na tela
              ↓
5. Corretor abre o link, define a senha
              ↓
6. Entra com CPF + senha
```

A resposta da etapa 2 é **sempre a mesma**, dados conferindo ou não:
*"Se os dados conferirem, enviamos um link para o contato cadastrado."*
Sem enumeração de CPF, sem revelar qual campo errou.

**Isso é mais seguro que o fluxo Google atual.** Hoje, quem souber CPF + nome +
nascimento vincula *qualquer* conta Google a *qualquer* corretor. No desenho
novo, esses três dados só disparam um link que chega na caixa do corretor de
verdade. Passa a existir um **fator de posse**, que hoje não existe.

### Identificador de login: CPF, não e-mail

O Firebase exige um e-mail como identificador da credencial. Proposta: usar um
endereço sintético derivado do CPF — `<cpf>@corretor.antecipa.com.br` — e
guardar o e-mail real apenas como canal de entrega, no `user_bindings`.

| Vantagem | Por quê |
|---|---|
| Corretor entra com **CPF + senha** | Não precisa lembrar qual dos e-mails cadastrou |
| Sem colisão | A base tem 3 campos de e-mail e pode haver e-mail repetido entre corretores; CPF é único |
| Sem oráculo de enumeração | O front monta o identificador sozinho, sem consultar o servidor |
| Funciona para quem não tem e-mail | A ativação pode ir por WhatsApp |

**Custo:** o reset de senha não pode usar o `sendPasswordResetEmail` do cliente
(ele enviaria para o endereço sintético). O servidor passa a gerar o link com
`generatePasswordResetLink()` e entregar pelo canal certo. É mais código, mas é
o mesmo código do fluxo de ativação — escreve-se uma vez.

### O canal de entrega

Duas opções, não excludentes:

1. **E-mail transacional** — exige domínio próprio com SPF/DKIM em
   `antecipa.com.br`. Sem isso, o remetente padrão do Firebase
   (`noreply@<projeto>.firebaseapp.com`) cai em spam, e aí o fluxo inteiro
   morre silenciosamente. **Dependência dura.**
2. **WhatsApp** — a VPS já roda containers `evolution-api`, `evolution-redis` e
   `evolution-postgres`. Se essa instância for de vocês e puder ser usada, o
   link de ativação e de reset chega por WhatsApp, no telefone que já está na
   base. Isso **elimina a maior fraqueza** do login por senha para este público.
   ⚠️ Confirmar a titularidade dessa instância antes de contar com ela.

Recomendação: WhatsApp como canal principal, e-mail como alternativa. Vocês já
avisam o corretor que o contrato vai pelo WhatsApp — o canal já é esperado.

---

## 4. Fluxos completos

### Primeiro acesso
`CPF + nome + nascimento` → confere no MariaDB → link por WhatsApp/e-mail →
define senha → vínculo criado → entra.

### Login recorrente
`CPF + senha` → `signInWithEmailAndPassword` → `/api/auth/me` resolve o vínculo
→ dashboard. **Idêntico ao de hoje da metade em diante.**

### Esqueci a senha
`CPF` → resposta genérica → link pelo canal cadastrado → nova senha.

### Corretor sem e-mail nem telefone na base
Não se cadastra sozinho — e está correto. Vira exceção operacional: o
administrativo corrige o cadastro no CRM e o corretor tenta de novo. Vale medir
quantos estão nessa situação **antes** de subir (ver Task 0).

---

## 5. Faseamento

Seguindo o protocolo do `AGENTS.md`: um passo por vez, com teste e commit entre
cada um. Nenhum passo depois do 2 quebra o login atual — o Google continua
ligado até o passo 8.

```
📋 TASKS — Autenticação por e-mail e senha
─────────────────────────────────────────
[x] Task 0  Levantamento: quantos corretores ativos têm e-mail e/ou telefone
            preenchidos e enable_app ligado. → CONCLUÍDA, ver §1.1.
            Plano viável para 100% da base. Achado novo: enable_app desligado
            em 45% dos ativos, exige decisão antes de virar pré-requisito.

[~] Task 1  Confirmar a instância evolution-api: é de vocês? Pode ser usada?
            Existe número de origem dedicado? → PARCIAL, ver §1.2.
            Containers de pé, mas não vinculados a este projeto.
            Aguardando resposta do Pedro.

[ ] Task 2  Console Firebase: habilitar provedor E-mail/senha, ligar proteção
            contra enumeração de e-mail e política de senha forte.
            Google permanece habilitado.
            Risco: baixo

[x] Task 3  Servidor: POST /api/auth/register-request e
            POST /api/auth/reset-request — conferência no MariaDB, criação do
            usuário via Admin SDK, geração do link, resposta genérica,
            rate limit estrito. → CONCLUÍDA, ver §5.1.
            Arquivos: server.ts, src/lib/identity.ts (+testes),
                      firestore.rules, .env.example

[ ] Task 4  Canal de entrega: envio do link por WhatsApp (e/ou e-mail).
            Arquivos: server.ts, .env
            Risco: médio

[ ] Task 5  Frontend: telas de primeiro acesso, login por CPF+senha e
            recuperação. Google segue disponível lado a lado.
            Arquivos: src/components/LoginForm.tsx, src/App.tsx,
                      src/services/firebaseService.ts
            Risco: médio

[ ] Task 6  Decidir e aplicar a persistência de sessão (ver §7).
            Arquivos: src/services/firebaseService.ts
            Risco: baixo

[ ] Task 7  Piloto: 3 a 5 corretores reais fazendo o primeiro acesso ponta a
            ponta, com acompanhamento.
            Risco: baixo

[ ] Task 8  Corte: desabilitar o provedor Google no Console e remover o botão.
            O único vínculo existente hoje é de teste — se for de conta Google,
            é recriado em 2 minutos.
            Arquivos: src/App.tsx, src/services/firebaseService.ts
            Risco: baixo (dado o achado #1)

[ ] Task 9  Limpeza: os access_tokens expirados nunca são apagados (8 parados
            na coleção hoje). Definir TTL ou rotina de limpeza.
            Risco: baixo
```

---

## 5.1 O que a Task 3 entregou

Três endpoints, todos atrás do interruptor `AUTH_SENHA_ENABLED` (padrão **0**):
enquanto ele estiver desligado, respondem 503 e nada é criado. Isso permitiu
subir o código para a VPS antes da Task 2, sem expor um fluxo pela metade.

| Endpoint | Papel |
|---|---|
| `POST /api/auth/register-request` | Primeiro acesso. Público, rate limit 5/15min, resposta sempre genérica. |
| `POST /api/auth/reset-request` | Recuperação. Só pede CPF; o destino sai da base. |
| `POST /api/auth/ativar-vinculo` | Fecha o vínculo no primeiro login com senha. |

### Desvio de escopo: o `ativar-vinculo` não estava no plano

Ao implementar, apareceu um problema que o plano não previa. Se o
`register-request` criasse o vínculo `corretor_bindings/{cpf}` na hora, ele
**ocuparia o CPF antes de o corretor definir a senha** — e, enquanto o login
Google segue ligado, o fluxo antigo passaria a responder 409 para aquele
corretor. Seria uma regressão no meio da transição.

Solução: o `register-request` grava uma pendência em `registro_pendente/{uid}`
com o CPF e o nome **já conferidos contra o MariaDB**, e o vínculo só é fechado
no `ativar-vinculo`, após o corretor provar posse do link. A alternativa seria
mandar o corretor digitar nome, nascimento e CPF de novo depois de criar a
senha — funcional, mas com dado duplicado sem motivo.

A coleção `registro_pendente` foi negada ao cliente no `firestore.rules`, como
as duas outras coleções de vínculo.

### Detalhes de segurança aplicados

- **Sem oráculo de enumeração:** resposta idêntica com dados certos ou errados,
  e o mesmo custo de consulta ao banco nos dois caminhos.
- **CPF sempre mascarado no log** (`maskCpf`), nunca em texto claro.
- **Link nunca vai para o log por padrão.** O `AUTH_LINK_DEBUG` existe para o
  piloto e nasce desligado — link de definição de senha é credencial, e o
  `SECURITY_PRD.md` proíbe segredo em log (item 9).
- **Senha inicial aleatória de 32 bytes**, que nunca sai do servidor. Criar a
  conta sem senha alguma impediria gerar o link de redefinição depois.
- **Reset exige corretor ativo:** desligado no CRM não recupera acesso.

---

## 6. Segurança — o que precisa estar ligado

| Item | Onde | Por quê |
|---|---|---|
| Proteção contra enumeração de e-mail | Console Firebase | Sem isso, o Firebase responde diferente para conta existente e inexistente |
| Política de senha | Console Firebase | Mínimo de 8 caracteres, exigir letra e número |
| Rate limit no `register-request` e no `reset-request` | `server.ts` | Mesmo padrão do `bindLimiter` (5 por 15 min por IP) |
| Resposta genérica sempre | `server.ts` | Não revelar se o CPF existe na base |
| `enable_app` como pré-requisito | `server.ts` | Aproveita o controle que o CRM já tem |
| Link de uso único e curta validade | Admin SDK | Padrão do Firebase; validar a janela |
| Log de auditoria de cada emissão | `server.ts` | Quem pediu, para qual CPF, qual canal, quando |

---

## 7. Decisões que dependem de você

1. **A sessão fica salva no navegador?**
   Com senha, o padrão do Firebase é manter o login (`browserLocalPersistence`).
   Vocês removeram de propósito a sessão de 8h no commit `8a15457`. Manter essa
   postura significa `browserSessionPersistence` — o corretor digita a senha a
   cada abertura. Mais seguro, mais atrito.

2. **O portal continua exclusivo do app parceiro?**
   Se sim, o portão de token continua sendo a única barreira ao acesso direto
   pelo navegador. Se não, ele pode ser aposentado, e o portal ganha URL
   própria de login.

3. **Quem é o dono da instância evolution-api na VPS?** (Task 1)

---

## 8. Efeito colateral positivo: resolve o caso da Custom Tab

Sem popup do Google, cai a restrição do `disallowed_useragent` que forçou o uso
de Custom Tab. O app parceiro passa a poder hospedar o portal numa **WebView
própria**, que não tem menu de três pontos nem "abrir no Chrome".

O problema investigado hoje — o corretor promovendo a sessão para o Chrome —
deixa de existir por construção, sem precisar de App Check nem de mudança no
token. Além disso, nesse desenho o App Check com **Play Integrity** passa a ser
viável, que é o que o `SECURITY_PRD.md` (RS-05) sempre assumiu.

---

## 9. Definition of Done

- [ ] Corretor ativo sem conta Google faz primeiro acesso e chega ao dashboard
- [ ] Link de ativação chega pelo canal cadastrado em menos de 1 minuto
- [ ] CPF válido com dados errados → mesma resposta de CPF inexistente
- [ ] 6ª tentativa em 15 minutos → HTTP 429
- [ ] Corretor com `enable_app` desligado → não se cadastra
- [ ] Corretor desativado no CRM → perde acesso no próximo `/api/auth/me`
- [ ] Reset de senha funciona ponta a ponta
- [ ] Um corretor não consegue ver dado de outro (IDOR → 403)
- [ ] `npm run lint`, `npm test` e `npm run build` passando
- [ ] Provedor Google desabilitado no Console (Task 8)

---

## 10. Rollback

Até a Task 8, o rollback é **reverter o frontend**: o provedor Google continua
habilitado e o fluxo antigo volta a funcionar sozinho. Depois da Task 8,
reabilitar o provedor no Console leva menos de um minuto.

Nenhum passo apaga vínculo, solicitação ou assinatura. As coleções
`user_bindings` e `corretor_bindings` só recebem escrita nova.

---

*Documento gerado em 2026-07-30 — aguardando aprovação antes de qualquer implementação.*
