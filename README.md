# Padrão de Infraestrutura - Hub Nogueira

Este repositório define a estrutura base e as políticas de segurança inegociáveis para todos os projetos de software da Hub Nogueira. Qualquer novo repositório deve ser instanciado a partir deste template ou seguir as configurações do mesmo.

## 1. Política de Acesso e Permissões
O princípio de privilégio mínimo é o padrão da organização.

* **Administração:** A permissão de `Admin` é exclusiva da gestão técnica.
* **Desenvolvimento:** Engenheiros e desenvolvedores recebem estritamente a permissão de `Write` (Escrita).
* **Visibilidade:** A alteração de visibilidade (Público/Privado) e a exclusão do repositório são bloqueadas para não-administradores.

## 2. Regras de Proteção de Branch (Branch Protection)
Imediatamente após a geração de um novo repositório a partir deste template, o administrador deve acessar `Settings > Branches` e espelhar as seguintes travas na branch `main`:

* **Require a pull request before merging:** Ativado. (Obrigatório para qualquer integração de código).
* **Dismiss stale pull request approvals when new commits are pushed:** Ativado. (Previne injeção de código pós-aprovação).
* **Block force pushes:** Ativado. (Garante a integridade e imutabilidade do histórico).
* **Do not allow bypassing the above settings:** Ativado. (A regra aplica-se a todos os usuários, incluindo administradores).

## 3. Fluxo de Integração (Workflow)
O repositório local do desenvolvedor não é a fonte da verdade. O fluxo oficial de desenvolvimento segue as diretrizes abaixo:

1.  O desenvolvimento de qualquer funcionalidade ou correção deve ser feito em uma branch derivada separada (ex: `feature/nome-da-tarefa`, `hotfix/nome-do-erro`).
2.  *Commits* diretos na branch `main` são bloqueados sistemicamente.
3.  A integração de código ocorre exclusivamente via abertura de um *Pull Request* (PR).
4.  O código só é mesclado (*merged*) no ambiente de produção após revisão e aprovação mandatória pela gestão responsável.

## 4. Inicialização de um Novo Projeto Usando Esse Template
Para iniciar um novo repositório em compliance com a Hub Nogueira usando esse template:

1.  Clique no botão **Use this template** > **Create a new repository**.
2.  Defina a nomenclatura oficial do projeto.
3.  Acesse as configurações do novo repositório e ative as travas descritas na Seção 2.
4.  Adicione a equipe de desenvolvimento aplicável via `Settings > Collaborators and teams` com permissão de `Write`.
