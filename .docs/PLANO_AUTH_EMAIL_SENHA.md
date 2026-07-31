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

**RESPONDIDO em 2026-07-31:** a instância pertence a outro projeto na VPS.
**Não deve ser usada nem alterada.**

Consequência para a **Task 4**: o canal de entrega precisa ser próprio. Duas
saídas, e a escolha é do Pedro:

1. **Instância WhatsApp própria** para a Antecipa (nova Evolution API,
   Cloud API oficial da Meta, ou serviço equivalente). Mantém a cobertura de
   100% medida na Task 0 e usa um canal que o corretor já espera.
2. **E-mail transacional** com domínio próprio (SPF/DKIM em `antecipa.com.br`).
   Cobre 96,7% da base — 3 corretores ativos ficariam sem caminho automático e
   virariam exceção operacional.

Enquanto a Task 4 não tiver canal, o `AUTH_SENHA_ENABLED` deve continuar em
`0`: sem entrega, o corretor não recebe o link e o cadastro não se completa.

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

[x] Task 1  Confirmar a instância evolution-api. → CONCLUÍDA.
            RESPOSTA DO PEDRO (2026-07-31): a instância é de OUTRO PROJETO
            hospedado na mesma VPS. NÃO USAR e não mexer. A Task 4 precisa de
            um canal próprio — ver §1.2.

[x] Task 2  Console Firebase: habilitar provedor E-mail/senha, ligar proteção
            contra enumeração de e-mail e política de senha forte.
            → CONCLUÍDA, ver §5.2. Google permanece habilitado.

[x] Task 3  Servidor: POST /api/auth/register-request e
            POST /api/auth/reset-request — conferência no MariaDB, criação do
            usuário via Admin SDK, geração do link, resposta genérica,
            rate limit estrito. → CONCLUÍDA, ver §5.1.
            Arquivos: server.ts, src/lib/identity.ts (+testes),
                      firestore.rules, .env.example

[x] Task 4  Canal de entrega: envio do link por e-mail. → CONCLUÍDA.
            WhatsApp descartado por decisão do Pedro (2026-07-31).
            Agnóstico de provedor via SMTP. Gmail pessoal em caráter
            provisório até o domínio definitivo ser contratado (ver Task 10).
            Arquivos: server.ts, src/lib/emails.ts (+testes), .env.example

[ ] Task 10 QUANDO O DOMÍNIO DEFINITIVO FOR CONTRATADO — ver §7.1.
            Trocar o remetente provisório, configurar SPF e DKIM e reavaliar
            o assunto/identidade visual do e-mail.
            Risco: baixo, mas sem isso a entrega fica instável

[x] Task 5  Frontend: telas de primeiro acesso, login por CPF+senha e
            recuperação. → CONCLUÍDA, ver §5.3.
            Arquivos: src/components/AcessoSenha.tsx (novo), src/App.tsx,
                      src/services/firebaseService.ts, sheetsService.ts,
                      src/lib/utils.ts (+testes)

[x] Task 6  Decidir e aplicar a persistência de sessão. → CONCLUÍDA.
            DECISÃO: senha a cada acesso (`inMemoryPersistence`).
            Arquivos: src/services/firebaseService.ts

[ ] Task 7  Piloto: 3 a 5 corretores reais fazendo o primeiro acesso ponta a
            ponta, com acompanhamento.
            Risco: baixo

[~] Task 8  Corte do Google. → ANTECIPADA E PARCIAL.
            FEITO: removido do caminho do corretor (commit c5e9def), porque
            manter o botão seria deixar um caminho que quebra dentro da
            WebView — o motivo de toda esta mudança.
            FALTA: o painel de gerar token (admin) ainda usa Google. Não roda
            na WebView e está dormente (allowlist de admin vazia), mas precisa
            de decisão antes de desabilitar o provedor no Console.
            Arquivos: src/App.tsx

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

## 5.2 Task 2 — estado real conferido pela API, não pela tela

O Pedro configurou pelo Console. A conferência foi feita lendo a configuração
do projeto pela API de administração do Identity Toolkit
(`GET /admin/v2/projects/{id}/config`), com a credencial de serviço da VPS.

| Item | Estado |
|---|---|
| Provedor e-mail/senha | `{"enabled": true, "passwordRequired": true}` |
| Proteção contra enumeração | `enableImprovedEmailPrivacy: true` |
| Mínimo de caracteres | 8 |
| Exige minúscula / maiúscula / número | true / true / true |
| **Aplicação da política** | **estava `OFF`** → alterada para `ENFORCE` em 2026-07-31 |

### O que a conferência pegou

A política estava **definida mas inerte**: os requisitos certos, com
`passwordPolicyEnforcementState: "OFF"`. Olhando só a tela do Console, ela
parece configurada.

Pior: essa inércia escondia um bug no código da Task 3. A senha inicial
descartável era gerada com `base64url` puro, cujo alfabeto não garante dígito
nem maiúscula — ~1 chance em 1.500 por cadastro, o que com 91 corretores dá
cerca de 6% de chance de pelo menos uma falha `auth/weak-password`. Enquanto a
política estava OFF, o bug nunca apareceria; ligá-la sem corrigir teria criado
uma falha rara e intermitente no primeiro acesso.

Corrigido no commit `71d2392` antes de ligar a aplicação, com teste de
regressão em `atendePoliticaSenha`.

---

## 5.3 O que a Task 5 entregou

Componente novo `AcessoSenha.tsx` com os três fluxos numa tela só — entrar,
primeiro acesso e recuperar senha —, porque para quem está de fora é o mesmo
assunto. O login Google continua ao lado, rebaixado a "outra forma de entrar",
e sai na Task 8.

- **`signInWithCpfSenha`** monta o identificador a partir do CPF **no próprio
  navegador**. Não existe requisição do tipo "qual o e-mail deste CPF?", que
  seria um oráculo de enumeração da base de corretores.
- **Mensagem de erro única.** O Firebase distingue `auth/user-not-found` de
  `auth/wrong-password`; repassar essa diferença confirmaria quais CPFs têm
  cadastro. A tela diz sempre "CPF ou senha incorretos".
- **Vínculo pendente fecha sozinho.** Ao resolver a identidade, o `App.tsx`
  chama o `ativar-vinculo` quando não há vínculo — o corretor não digita nome,
  nascimento e CPF de novo depois de criar a senha.
- **Máscaras de CPF e data extraídas** para `lib/utils` com testes, em vez de
  duplicadas entre o `LoginForm` e a tela nova.

### Verificação visual em produção

Com o interruptor desligado, emiti um token de acesso pela chave de integração,
abri o portal no navegador e exercitei a tela: os três modos alternam, o
formulário de primeiro acesso envia ao servidor e a resposta 503 aparece como
"O cadastro por senha ainda não está disponível". Sem erro no console.

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

## 7. Decisões tomadas em 2026-07-31

| Tema | Decisão |
|---|---|
| Persistência de sessão | **Senha a cada acesso** (`inMemoryPersistence`). Atrito intencional. |
| Canal de entrega | **Não usar WhatsApp agora.** Task 4 vai por e-mail. |
| Destino do link | **Todos os e-mails do cadastro**, não um escolhido pelo corretor. |
| Login Google | **Fora do caminho do corretor.** Some do painel admin em decisão à parte. |
| Mensagens de erro | Específicas em tudo que não revela existência de cadastro. |

### Por que NÃO existe a tela "qual desses é o seu e-mail?"

A ideia foi levantada e descartada por inverter a proteção. Quem chega nessa
tela digitou CPF, nome e nascimento — dados que circulam em vazamentos. Mostrar
as opções de e-mail **entrega o dado a quem só tinha os três primeiros**, em
vez de exigir posse da caixa. Além disso, com opções falsas o endereço real
costuma ser identificável pelo domínio e formato, e a escolha vira acerto de 1
em 3 ou 1 em 4 — com 5 tentativas por janela de 15 minutos.

O problema legítimo por trás da ideia — a base tem três campos de e-mail e não
se sabe qual o corretor lê — foi resolvido enviando para **todos os distintos**
(`emailsDoCorretor`), sem perguntar e sem mostrar nada.

### Por que o Google saiu antes da hora

O plano previa o corte só na Task 8, depois do piloto. Foi antecipado porque
`signInWithPopup` falha com `disallowed_useragent` dentro de WebView — e a
migração de Custom Tab para WebView é justamente o motivo desta mudança de
autenticação. Manter o botão seria manter um caminho com quebra programada.

**Consequência operacional:** enquanto a Task 4 não entregar o e-mail, ninguém
consegue entrar no portal como corretor — não há como receber o link para
criar a senha. Para testes, use o interruptor `AUTH_LINK_DEBUG` na VPS, que
imprime o link no log do servidor.

## 7.1 Pendências para quando o domínio definitivo for contratado (Task 10)

Decisão do Pedro em 2026-07-31: o envio sai por **Gmail pessoal**, em caráter
provisório, só para validar o fluxo. O que fica para a troca de domínio:

| Pendência | Por quê |
|---|---|
| **SPF e DKIM no domínio** | Sem os dois registros no DNS, mesmo remetente próprio cai em spam ou na aba de promoções. É o que mais afeta a entrega — e a falha é silenciosa: o corretor simplesmente não recebe e liga reclamando que o cadastro não funciona. |
| **Trocar o remetente** | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` e `SMTP_FROM` no `.env` da VPS. Nenhuma linha de código muda — o envio é agnóstico de provedor de propósito. |
| **Sair do Gmail pessoal** | Conta pessoal tem limite de envio diário, mistura o operacional com o particular e some se a pessoa sair da empresa. |
| **Identidade visual do e-mail** | O template atual é sóbrio e sem logo. Com domínio próprio vale revisar assunto e marca. |
| **DMARC** | Depois de SPF e DKIM estáveis, fecha o ciclo contra falsificação do domínio. |

### Ainda em aberto

1. **O portal continua exclusivo do app parceiro?** Se sim, o portão de token
   segue sendo a única barreira ao acesso direto pelo navegador.
2. **Como o administrador entra** no painel de gerar token depois que o Google
   sair de vez. Hoje a allowlist está vazia, então o painel está dormente.

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
