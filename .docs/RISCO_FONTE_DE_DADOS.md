# 🔍 RELATÓRIO DE RISCO — A PLANILHA COMO FONTE DE DADOS

> **Data:** 2026-07-31 · **Contexto:** ~1 semana para o lançamento
> **Motivo:** o próprio cliente informou que a fonte de dados dele não é confiável.
> **Pergunta que este documento responde:** dá para lançar assim?

---

## 1. Resposta curta

**Dá, com uma correção de meio dia.** E ela não depende da planilha melhorar.

O ponto que mudou minha leitura: a planilha **não controla dinheiro**. Ela
controla o que o corretor *vê*. Quem libera valor é o backoffice, no Bitrix,
preenchendo o `VALOR_LIBERADO` — o portal apenas pede.

O que a planilha estraga é uma **trava**, não o pagamento. E essa trava pode ser
reconstruída sobre dado que é nosso e confiável.

---

## 2. Método

Tudo abaixo foi medido no arquivo real (`CR 2025 ATUAL.xlsx`, baixado do
Dropbox em 31/07/2026), não estimado. Onde há incerteza, está dito.

Números de referência do arquivo:

| | |
|---|---|
| Linhas na aba "CR 2025" | 7.846 |
| Recebíveis válidos (PV preenchido e valor > 0) | **950** |
| PVs distintos | **733** |
| Soma dos valores | R$ 7.460.502,80 |

Comparação com o Google Sheet que o portal lê hoje: 881 recebíveis, 662 PVs,
R$ 7.380.250,91. A diferença é atraso da importação manual, não divergência de
conteúdo.

---

## 3. O que realmente depende da planilha

O portal usa a planilha para quatro coisas, com riscos muito diferentes:

| Uso | O que acontece se o dado estiver errado | Gravidade |
|---|---|---|
| **Descoberta** — que recebíveis existem | Corretor não vê algo, ou vê algo a mais | Baixa |
| **Valor** — quanto há a receber | Pede valor errado; backoffice corrige no Bitrix | Média |
| **Identidade** — qual linha é "a mesma" ao longo do tempo | Vínculo se perde | **Alta** |
| **Estado** — quanto já foi adiantado | **Adiantamento em duplicidade** | **Alta** |

As duas últimas são o problema. E são o mesmo problema: o portal deduz "esta
comissão já foi adiantada" cruzando o Firestore com a planilha pela chave
**PV + mês de previsão + ano de previsão**.

O cliente confirmou que **mês e ano mudam**. É exatamente a coluna que sustenta
a trava.

---

## 4. O risco medido

Com a chave atual (PV + mês + ano), no arquivo real:

- **868** chaves distintas para 950 recebíveis
- **50 grupos** onde duas ou mais linhas compartilham a mesma chave
- **132 linhas afetadas — 14% da base**
- **65 linhas (7%) não têm previsão nenhuma**, e todas colidem entre si

Ou seja: **antes de qualquer edição**, uma linha em cada sete já é
indistinguível de outra. Adiantar uma faz as irmãs aparecerem como adiantadas.

E quando alguém edita mês ou ano de uma linha que já tem adiantamento, o
vínculo se desfaz: a linha **volta a aparecer como disponível**, e o corretor
pode pedir de novo. Sem erro, sem log, sem aviso.

### O que NÃO está em risco

Vale dizer com clareza, porque a conversa que gerou este relatório sugeria algo
pior:

- **A ligação com o Bitrix nunca quebra.** O `bitrixDealId` é ID gerado pelo
  Bitrix. Nada na planilha o alcança.
- **A sincronização de status não depende da planilha.** Os dois lados —
  `previsaoMes/Ano` no Firestore e `PREVISÃO:` no comentário do negócio — são
  fotografias tiradas no momento do pedido. A planilha mudar depois não mexe
  em nenhuma delas.
- **Mover, inserir, reordenar ou apagar outras linhas não afeta nada.** O
  identificador posicional (`PV-índice`) vive só na memória da tela e nunca é
  gravado.

---

## 5. O problema de verdade: não existe trava no servidor

Este é o achado mais importante deste relatório.

Verificado no código: **o servidor não checa duplicidade em nenhum momento.**
O cliente grava direto no Firestore, e o `/api/bitrix/add` cria o negócio sem
perguntar se já existe adiantamento ativo para aquele PV.

A única coisa que impede um adiantamento em duplicidade hoje é **o cálculo da
tela** — derivado da planilha. Quando a planilha falha, não sobra nada.

Uma trava que depende de dado que o próprio cliente diz não confiar não é uma
trava.

---

## 6. A correção que muda o jogo

**Conferir duplicidade no servidor, contra o Firestore — que é dado nosso.**

Antes de criar o negócio, o servidor pergunta: *já existe solicitação não
recusada para este PV, deste corretor?* Se existir, recusa ou exige confirmação
explícita.

Por que isso resolve de verdade:

- **Não usa a planilha.** O Firestore é escrito por nós, com identidade
  conferida pelo servidor. Nada nele depende de alguém não mexer numa célula.
- **Vale mesmo se a tela errar.** Hoje a trava está no lugar mais frágil — o
  navegador, sobre dado de terceiro. Passa para o lugar mais forte.
- **É pequena.** Uma consulta ao Firestore no `/api/bitrix/add`, que já tem o
  vínculo do corretor em mãos.

Com isso, o pior caso da planilha deixa de ser "adiantamento duplicado" e passa
a ser "corretor vê saldo errado na tela" — que é chato, não é dinheiro.

### Complemento: ancorar em PV + corretor

Medido: 736 pares (PV + corretor) para 950 linhas — chave estável, porque a
equipe comercial não consegue alterar o PV.

Nota sobre os números: com essa chave, 89 grupos reúnem 303 linhas. **Isso não é
ambiguidade** — são as parcelas do mesmo PV, agrupadas de propósito num
recebível só, com o valor somado. É o desenho funcionando, não colisão.

Ganho: mês, ano, valor e unidade deixam de carregar identidade. Editar qualquer
um deles passa a ser inofensivo.

### Complemento: adiantamento órfão precisa aparecer

Se o PV sumir da planilha (distrato e recriação com outro número), hoje o
adiantamento **desaparece da tela** — enquanto o dinheiro saiu e o negócio segue
vivo no Bitrix. É o caso em que a operação mais precisa agir, e é o único em que
ela fica cega.

A assinatura **cliente + empreendimento + unidade** identifica isso: medido,
733 assinaturas para 733 PVs, sem uma colisão. Serve para **sugerir a um humano**
que o PV novo é a venda recriada — nunca para religar sozinho, porque é outra
negociação e o contrato prevê devolução em caso de distrato (Cláusula 3.2).

---

## 7. Outros itens abertos para o lançamento

Fora a fonte de dados, o que ficou pendente:

| Item | Estado | Bloqueia o lançamento? |
|---|---|---|
| Entrega de e-mail pelo Gmail pessoal | Funciona, sem SPF/DKIM próprios | **Sim** — link cai em spam |
| Piloto com corretores reais | Nunca aconteceu | **Sim** |
| Webhooks antigos do Bitrix | Rotacionados, **não revogados** | **Sim** — credencial viva em repositório público |
| `getBitrixDeal` confunde "deal apagado" com "falha ao consultar" | Aberto | Não, mas apaga dado por erro de rede |
| Adiantamento órfão invisível | Aberto | Não, mas cega a operação |

---

## 8. Recomendação para os 7 dias

Em ordem de retorno por esforço:

1. **Trava de duplicidade no servidor** — meio dia. É o item que tira o
   dinheiro do caminho da planilha. Se só uma coisa for feita, é esta.
2. **Revogar os webhooks antigos** — minutos. Credencial viva exposta.
3. **Ancorar em PV + corretor** — um dia. Elimina 14% de ambiguidade e torna
   edição de mês/ano inofensiva.
4. **E-mail com domínio próprio (SPF/DKIM)** — depende de contratação.
   Sem isso, parte dos corretores não recebe o link e conclui que não funciona.
5. **Piloto com 3 a 5 corretores** — depois do item 4, nunca antes.
6. **Fonte no Dropbox** — o leitor já está pronto e testado (`src/lib/planilha.ts`).
   Ganha ~69 recebíveis e R$ 80 mil que o Google Sheet ainda não tem.
7. **Órfão aparecer** e **distinguir "apagado" de "não consegui ler"**.

---

## 9. O que eu não recomendo

**Adiar o lançamento por causa da planilha.** O risco real é concentrado num
ponto só, e esse ponto se resolve sem tocar na planilha. Adiar por isso seria
tratar sintoma.

**Tentar convencer a operação a mudar de processo agora.** Está decidido com
aval do C-level, e a uma semana do lançamento é a pior hora possível para
reabrir. O desenho proposto funciona com a planilha do jeito que ela é.

**Confiar na tela como controle financeiro.** É o erro que está no código hoje.
Controle fica no servidor, sobre dado próprio.

---

## 10. Incertezas deste relatório

Honestidade sobre os limites do que foi medido:

- As medições são de **uma fotografia** do arquivo (31/07). Não sei com que
  frequência mês e ano mudam na prática — sei que mudam, porque o cliente disse.
- **Não testei o fluxo completo com corretor real.** Existem 2 solicitações no
  Firestore, ambas de teste. Nenhum dos riscos descritos chegou a se manifestar.
- Não avaliei o `RELATORIO`, a outra aba do arquivo. O portal não a usa.
- A ordem da seção 8 assume que o lançamento é firme para a semana de 03/08. Se
  houver folga, os itens 6 e 7 valem mais do que a posição sugere.
