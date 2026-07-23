# 📦 MÓDULO: AUTENTICAÇÃO (auth)

## Responsabilidade
Controla quem pode acessar o portal e em qual nível.

## Arquivos
| Arquivo | Papel |
|---------|-------|
| `src/components/LoginForm.tsx` | UI do formulário de login |
| `src/services/sheetsService.ts` → `authenticateUser()` | Valida credenciais via Sheets |
| `src/services/firebaseService.ts` → `signInWithGoogle()` | Auth Firebase pós-validação |
| `src/App.tsx` (linhas ~42-60) | Lógica de portão de acesso |

## Fluxo
1. `VITE_ACCESS_TOKEN` → portão de entrada
2. LoginForm coleta: Nome Completo, CPF (mascarado), Data Nascimento (mascarada)
3. `sheetsService.authenticateUser()` → busca guia "usuários", normaliza e compara
4. Se encontrado → `signInWithGoogle()` → session iniciada
5. `UserAuth` object retornado contém todos os campos da planilha do usuário

## Interface UserData (sheetsService.ts)
```typescript
interface UserData {
  nome: string;
  dataNascimento: string;
  cpf: string;
  empresa?: string;
  cargo?: string;           // determina role (Diretor, Superintendente, etc.)
  superintendencia?: string;
  loja?: string;            // Coluna S da guia usuários
  allFields?: Record<string, any>;
}
```

## Mapeamento de Colunas — Guia "usuários"
| Coluna | Índice | Campo |
|--------|--------|-------|
| D | 3 | Nome completo |
| G | 6 | Data de nascimento |
| N | 13 | CPF |
| S | 18 | Loja |

## Regras de Negócio
- Comparação é case-insensitive e normaliza espaços/acentos
- CPF e Data são comparados apenas com dígitos (sem máscara)
- Se usuário não encontrado → mensagem de erro genérica (não expõe qual campo falhou)

## Estado de Saúde
✅ Funcionando | Última verificação: 2026-07-23
