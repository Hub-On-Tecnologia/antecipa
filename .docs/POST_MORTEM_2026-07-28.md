# Relatório Pós-Mortem: Incidente de Indisponibilidade e CI/CD

**Data:** 28 de Julho de 2026  
**Status do Incidente:** Resolvido (Sistema 100% operacional no commit `fe0bfb3`)  
**Impacto:** Indisponibilidade temporária da interface web (tela branca por erro de inicialização do Firebase e servidor parado via PM2 durante falha do pipeline).

---

## 1. Resumo Executivo

Durante a implementação do pipeline de integração contínua (GitHub Actions) e de melhorias de segurança (remoção de tokens estáticos e testes unitários), a aplicação apresentou indisponibilidade (tela branca). 

A causa raiz **não foi corrupção de banco de dados nem perda de código**, mas sim uma incompatibilidade entre o processo de compilação do Vite no ambiente isolado do GitHub Actions (onde o arquivo `.env` não existe) e a entrega desse bundle compilado para a VPS.

---

## 2. Análise da Causa Raiz Técnica (O "Porquê" da Tela Branca)

### A. O Funcionamento do Vite (Build Time vs Runtime)
Variáveis de ambiente prefixadas com `VITE_` (como `VITE_FIREBASE_API_KEY`, `VITE_SHEET_ID`) são **embutidas diretamente no código JavaScript gerado durante o comando `npm run build`**.

* **No fluxo manual anterior (VPS):** O comando `npm run build` rodava dentro da VPS, lendo o arquivo `/var/www/antcp-hubon/.env`. As chaves reais eram embutidas no código.
* **No fluxo CI/CD (GitHub Actions):** O arquivo `.env` fica no `.gitignore` por razões de segurança. Quando o GitHub Actions executou o `npm run build`, o Vite não encontrou as variáveis `VITE_FIREBASE_*` e compilou o bundle com valores nulos (`undefined`) ou fallbacks temporários (`'mock-api-key'`).

### B. O Efeito Dominó no Navegador
1. O GitHub Actions gerou o bundle JS contendo `apiKey: undefined` (ou `'mock-api-key'`).
2. O `rsync` enviou esse bundle para a VPS e substituiu a pasta `dist/` funcional.
3. Quando qualquer usuário abria a página, o navegador executava o JavaScript que tentava iniciar o Firebase.
4. O Firebase emitia o erro fatal: `Uncaught FirebaseError: (auth/invalid-api-key)`.
5. Por ser um erro não tratado na inicialização do aplicativo, o React travava antes de renderizar qualquer componente, resultando na **tela branca**.

---

## 3. Análise Crítica dos Erros Cometidos

### A. Erros de Arquitetura / IA (Agente de Desenvolvimento)

1. **Assumir Build em CI sem Injeção de Variáveis de Ambiente:**
   * **Erro:** Tentar fazer o `npm run build` dentro do GitHub Actions sem configurar os secrets das variáveis `VITE_*` no repositório. 
   * **Consequência:** O bundle foi gerado sem credenciais válidas e sobrescreveu a produção funcional.

2. **Acoplamento de Múltiplas Alterações em um Único Ciclo:**
   * **Erro:** Tentar implementar CI/CD + Testes Unitários com Vitest + Refatoração de Autenticação + Remoção de SQL Dinâmico de uma só vez na mesma branch `main`.
   * **Consequência:** Quando ocorreu a primeira falha, ficou difícil isolar se o problema era de rede (SSH), de permissão do Linux, de chave do Firebase ou de código React.

3. **Script de Deploy com Parada sem Fallback Automatizado:**
   * **Erro:** Adicionar `pm2 stop antcp-hubon` antes das etapas de instalação e compilação no VPS.
   * **Consequência:** Se qualquer passo subsequente (como `npm ci` falhando por `ENOTEMPTY` de arquivos travados) falhasse, o processo do PM2 continuava parado, deixando a aplicação offline em vez de manter a versão anterior rodando.

### B. Erros de Processo / Ambiente do Usuário

1. **Deploy Direto em Produção sem Ambiente de Staging:**
   * **Erro:** Fazer testes de pipelines de CI/CD e refatoração de infraestrutura diretamente na branch `main` apontada para a VPS de produção.
   * **Consequência:** Qualquer falha de pipeline afetava imediatamente o ambiente rodando para usuários finais.

2. **Configuração Incompleta das Secrets no GitHub:**
   * O pipeline inicial travou por falta do secret `VPS_HOST` e rejeição de chave SSH pública não autorizada no `authorized_keys` da VPS. Isso consumiu tempo e criou atrito antes mesmo de testarmos a compilação do código.

---

## 4. O que foi feito para Resolver (Rollback Seguro)

1. **Restauração do Repositório (Commit `53fc1f0`):**
   * Todo o código-fonte (`server.ts`, `src/`, `package.json`, `vite.config.ts`) foi revertido exatamente para o commit `fe0bfb3` (última versão 100% estável de ontem).
2. **Remoção do Workflow de Deploy Automático Instável:**
   * O arquivo `.github/workflows/deploy.yml` foi removido temporariamente do repositório para impedir que o GitHub Actions continuasse sobrescrevendo a pasta `dist/` da VPS com compilações sem `.env`.
3. **Recompilação Local no VPS:**
   * Ao executar `git pull && npm ci && npm run build` diretamente no VPS, o Vite leu o arquivo `.env` nativo do servidor, gerou o bundle com as credenciais reais do Firebase e restaurou o sistema ao ar imediatamente.

---

## 5. Recomendações e Próximos Passos Seguros

Para que possamos evoluir a segurança da aplicação (remover `VITE_ACCESS_TOKEN` e SQL dinâmico) sem o risco de novos incidentes, o plano recomendado é:

1. **Build no Próprio VPS (Estratégia mais simples e segura):**
   * Em vez de fazer o `npm run build` no GitHub Actions (onde faltam as variáveis `.env`), o GitHub Actions deve apenas enviar o código-fonte e mandar o VPS compilar localmente usando seu próprio `.env`.
2. **Pipeline com Rollback Automático:**
   * O script do PM2 só deve fazer `pm2 restart` após o `npm run build` ter sido concluído com 100% de sucesso. Se o build falhar, a versão anterior continua no ar.
3. **Trabalho Gradual (1 mudança por PR):**
   * Subir pequenos ajustes isolados, testando a compilação primeiro localmente antes de dar push na branch de produção.
