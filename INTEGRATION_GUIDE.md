# Guia de Integração e Acesso Restrito (Antecipa Portal)

**Antecipa Soluções Financeiras**  
**Razão Social:** Antecipa Soluções Financeiras Ltda.  
**CNPJ:** 12.670.349/0001-10  

---

Este documento detalha o sistema de controle de acesso por redirecionamento seguro implementado no portal **Antecipa**. Isto foi desenvolvido especificamente para ocultar métodos de entrada do usuário final e garantir que corretores acessem o portal exclusivamente a partir de botões integrados na plataforma/aplicativo da empresa.

---

## 🔒 Como Funciona o Acesso

O sistema valida a permissão de acesso analisando a procedência da requisição no momento do carregamento da interface. Ele checa a existência de um **token de segurança** nos parâmetros de busca (query parameters) ou a origem de um **domínio referenciador** (HTTP Referrer) autorizado.

Assim que o acesso é liberado uma vez, o estado é armazenado em `sessionStorage` para manter a navegação ativa ao longo da sessão da aba do navegador.

### Critérios de Validação (Qualquer um abaixo libera o portal):
1. **Query Token:** Passado na URL (`?token=...`).
2. **Referenciador (HTTP Referrer):** Se o usuário estiver navegando a partir de um domínio corporativo aprovado.
3. **Sessão Ativa:** `sessionStorage.getItem('portal_access_allowed') === 'true'`.

---

## 🛠️ Configuração no Aplicativo da Empresa

Para permitir que os usuários entrem no Antecipa Portal a partir do aplicativo da sua empresa, configure o botão de link adicionando o query token seguro selecionado.

### Token Recomendado para o App corporativo:
* **Token:** `app_empresa`
* **URL Completa:** `https://<seu-dominio-antecipa>/?token=app_empresa`

### Exemplos Práticos de Implementação:

#### 💻 HTML Comum / React / Vue (Frontend Web)
```html
<a 
  href="https://<seu-dominio-antecipa>/?token=app_empresa" 
  target="_blank" 
  rel="noopener noreferrer" 
  class="btn-antecipa-link"
>
  Acessar Portal Antecipa
</a>
```

#### 📱 Aplicativos iOS & Android (WebViews ou Links Externos)
Certifique-se de carregar a URL anexando o parâmetro correspondente:
* iOS (Swift): `URL(string: "https://<seu-dominio-antecipa>/?token=app_empresa")`
* Android (Kotlin): `Uri.parse("https://<seu-dominio-antecipa>/?token=app_empresa")`

---

## 🔑 Tokens Suportados e Configurações de Origem

As seguintes configurações estão programadas no arquivo `/src/App.tsx` para validação interna:

| Parâmetro de Query / Referrer | Valor Válido | Descrição |
|:---|:---|:---|
| **Query Tokens** | `app_empresa`<br>`sistema_interno`<br>`antecipa_portal`<br>`secure_btn`<br>`bitrix` | Identificadores autorizados para o parâmetro `?token=`, `?ref=` ou `?src=`. |
| **Referrers de Origem (HTTP Referrer)** | Contendo: `meuapp`, `app-empresa`, `antecipabroker`, `bitrix`, `crm` | Substrings amigáveis de URLs de origem corporativas que liberam o portal sem necessidade de token na URL. |

---

## 🧪 Como Testar/Liberar em Desenvolvimento

Para testar ou demonstrar o funcionamento do portal localmente ou em homologação:
1. Acesse o endereço do ambiente: `http://localhost:3000` (Verá a tela de acesso bloqueado).
2. Adicione o token de segurança na barra de endereços para simular o redirecionamento:
   * `http://localhost:3000/?token=app_empresa`
3. O portal será imediatamente liberado para a tela de login.

---

> **Aviso de Confidencialidade:** Mantenha este arquivo de documentação restrito ao repositório de desenvolvimento e não o exponha em servidores públicos ou documentações abertas para o usuário final.
