# 📦 MÓDULO: AUTENTICAÇÃO (auth)

## Responsabilidade
Controla quem pode acessar o portal e em qual nível, realizando a validação de colaboradores primariamente via banco de dados relacional MariaDB (tabela `corpstek_corretores` via DB-API Proxy WireGuard com timeout de 5s), com fallback automático e transparente para a planilha Google Sheets.

## Arquivos
| Arquivo | Papel |
|---------|-------|
| `src/components/LoginForm.tsx` | UI do formulário de login (Nome, CPF e Data de Nascimento) |
| `src/services/sheetsService.ts` → `fetchUsers()` / `authenticateUser()` / `queryDbProxy()` | Consulta MariaDB via `/api/db/query` (com timeout de 5s e fallback Google Sheets), mapeamento resiliente e validação de credenciais |
| `src/services/firebaseService.ts` → `signInWithGoogle()` | Auth Firebase pós-validação de credenciais |
| `src/lib/utils.ts` | Utilitários de normalização (`normalizeCPF`, `normalizeDate`, `normalizeName`) |
| `src/App.tsx` | Lógica do portão de acesso e controle de estado do usuário logado |

## Fluxo de Autenticação
1. **Portão de Entrada:** Validação do token de acesso global (`VITE_ACCESS_TOKEN`).
2. **Formulário de Login:** O usuário insere:
   - Nome Completo
   - CPF (formatado/mascarado)
   - Data de Nascimento (formatada `DD/MM/YYYY`)
3. **Consulta Primária (MariaDB via DB-API Proxy WireGuard):**
   - O método `fetchUsers()` invoca `queryDbProxy()`, que realiza `POST /api/db/query` com `AbortSignal.timeout(5000)` (timeout de 5 segundos).
   - Instrução SQL sanitizada executada:
     ```sql
     SELECT * FROM corpstek_corretores WHERE administrativo_ativo = %s AND (data_exclusao IS NULL OR data_exclusao = %s)
     ```
     Parâmetros repassados: `[1, "1970-01-01 00:00:01"]`.
4. **Fallback Gracioso (Google Sheets):**
   - Caso a DB-API Proxy / MariaDB esteja indisponível, retorne erro ou exceda o timeout de 5s, o sistema loga um `console.warn` e consulta transparentemente a guia `"usuários"` da planilha Google Sheets configurada.
5. **Normalização & Validação (`authenticateUser()`):**
   - As datas ISO (`YYYY-MM-DD`) ou formatadas (`DD/MM/YYYY`) são normalizadas pelo `normalizeDate()`.
   - O CPF/CNPJ é sanitizado pelo `normalizeCPF()` que remove caracteres não numéricos (`/\D/g`) e aplica padronização com **11 dígitos** (`clean.padStart(11, '0')`).
   - O nome é normalizado pelo `normalizeName()` removendo acentos, convertendo para minúsculas e colapsando espaços.
6. **Sessão Firebase:** Se as credenciais forem válidas, dispara `signInWithGoogle()` e armazena o perfil do colaborador no estado da aplicação (`UserAuth`).

## Interface UserData (`sheetsService.ts`)
```typescript
export interface UserData {
  nome: string;
  dataNascimento: string;
  cpf: string;
  empresa?: string;
  cargo?: string;           // determina a role (Corretor, Líder, Diretor, etc.)
  superintendencia?: string;
  loja?: string;            // Loja atribuída ao colaborador
  allFields?: Record<string, any>;
}
```

## Mapeamento Resiliente de Colunas (MariaDB `corpstek_corretores`)
Para suportar variações na estrutura de colunas do banco de dados MariaDB sem quebrar a aplicação, o parser utiliza fallbacks encadeados:

| Campo `UserData` | Propriedades MariaDB verificadas (em ordem de prioridade) |
|------------------|----------------------------------------------------------|
| `cpf` (CPF/CNPJ) | `row.cpf \|\| row.CPF \|\| row.cpf_cnpj \|\| row.cpfcnpj \|\| row.documento` |
| `nome`           | `row.nome \|\| row.NOME \|\| row.nome_corretor` |
| `dataNascimento` | `row.datanascimento \|\| row.DATANASCIMENTO \|\| row.data_nascimento \|\| row.nascimento` |
| `empresa`        | `row.empresa \|\| row.EMPRESA` |
| `cargo`          | `row.cargo \|\| row.CARGO \|\| row.funcao` |
| `superintendencia` | `row.superintendencia \|\| row.SUPERINTENDENCIA` |
| `loja`           | `row.loja \|\| row.LOJA` |

## Mapeamento de Colunas — Fallback Google Sheets (Guia "usuários")
| Coluna | Índice | Campo |
|--------|--------|-------|
| D | 3 | Nome completo |
| G | 6 | Data de nascimento |
| N | 13 | CPF |
| S | 18 | Loja |

## Regras de Negócio
- **Filtro de Colaboradores Ativos:** Apenas registros do MariaDB onde `administrativo_ativo = 1` e `(data_exclusao IS NULL OR data_exclusao = '1970-01-01 00:00:01')` são considerados válidos.
- **Normalização de CPF/CNPJ (`padStart(11, '0')`):** A função `normalizeCPF` extrai apenas os dígitos numéricos e preenche com zeros à esquerda até atingir 11 dígitos, garantindo conciliação exata entre o input do usuário e os dados do banco ou planilha.
- **Mapeamento Flexível de CPF/CNPJ (`cpfcnpj`):** O sistema aceita qualquer uma das variações de coluna no MariaDB (`cpf`, `CPF`, `cpf_cnpj`, `cpfcnpj`, `documento`).
- **Timeout de Conexão (5s):** A chamada do cliente para a DB-API possui um timeout estrito de 5 segundos (`AbortSignal.timeout(5000)`), garantindo que instabilidades na rede não travem a experiência do usuário.
- **Normalização de Data:** Converte formato ISO `YYYY-MM-DD` do MariaDB para `DD/MM/YYYY` para conciliar com o input do login.
- **Comparação Segura:** Comparação case-insensitive e insensível a acentos/espaços.
- **Mensagem Genérica de Erro:** Se a combinação de dados falhar, exibe mensagem amigável genérica sem expor qual campo específico divergiu.

## Estado de Saúde
✅ Operacional | MariaDB primário (timeout 5s) | Fallback Google Sheets | Mapeamento `cpfcnpj` resiliente | `padStart(11, '0')` | Última verificação: 2026-07-23
