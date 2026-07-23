# 📦 MÓDULO: UI & DESIGN SYSTEM (ui)

## Responsabilidade
Gerenciamento do sistema de design, estilos visuais, alternância de temas (Dark/Light) e fluxo de componentes de interface do usuário do Antecipa Portal.

## Arquivos
| Arquivo | Papel |
|---------|-------|
| `src/index.css` | Importação do Tailwind v4, fonte Inter e variáveis de tema |
| `src/App.tsx` | Estado global do tema (`theme`), container de layout e rotas visuais |
| `src/components/LoginForm.tsx` | Tela de autenticação por CPF, Data de Nascimento e Nome |
| `src/components/Dashboard.tsx` | Painel de controle de recebíveis com cards e filtros por cargo |
| `src/components/ProposalModal.tsx` | Modal de simulação e solicitação de antecipação |
| `src/components/CollateralModal.tsx` | Modal de seleção e visualização de títulos em garantia |
| `src/components/SuccessModal.tsx` | Modal de confirmação e sucesso de envio |
| `src/components/NotificationCenter.tsx` | Painel flutuante de notificações em tempo real |
| `src/components/InstitutionalPage.tsx` | Página institucional com informações do portal |
| `src/components/TutorialPage.tsx` | Guia interativo de utilização do sistema |
| `src/components/QAPanel.tsx` | Painel administrativo de QA e geração de tokens temporários |
| `src/components/Footer.tsx` | Rodapé com suporte a alternância de tema e suporte |

## Tecnologias e Fundamentos de Design

### 1. Tailwind CSS v4
- Configuração moderna utilizando `@import "tailwindcss";` no `index.css`.
- Tipografia base configurada com a fonte **Inter** via Google Fonts.
- Paleta dark nativa elegante (`#0A0A0A` de fundo principal, `#111111` para cards/containers) e paleta light limpa (`#F4F4F6` de fundo, `#FFFFFF` para cards).

### 2. Micro-animações com Framer Motion (`motion`)
- Uso de `motion.div`, `motion.button` e `AnimatePresence` para transições suaves entre estados.
- Feedback tátil em botões (`whileHover`, `whileTap`) e animações de entrada (`initial`, `animate`, `exit`).

### 3. Sistema de Temas (Dark / Light)
- **Persistência Local:** O estado do tema é mantido no `localStorage` sob a chave `antecipa_theme`.
- **Tema Padrão:** Dark Mode (`dark`).
- **Alternância:** Alternado via função `toggleTheme()` e propagado via prop `theme` (`'dark' | 'light'`) para todos os componentes.

### 4. Arquitetura de Componentes de Modal
- **Efeitos Visuais:** Efeito backdrop blur (`backdrop-blur-md`), bordas sutis e sombras dinâmicas adaptáveis ao tema ativo.
- **ProposalModal:** Permite a simulação de antecipação total ou parcial, calculando valores líquidos, taxas e prazos.
- **CollateralModal:** Gerencia a adição e exibição de recebíveis oferecidos em garantia.
- **SuccessModal:** Exibe o status da operação enviada com ícones animados e detalhes da proposta registrada no Bitrix24/Firestore.

## Estado de Saúde
✅ Design System Tailwind v4 funcional | Animações Framer Motion ativas | Suporte Dark/Light persistente em localStorage | Modais integrados | Última verificação: 2026-07-23
