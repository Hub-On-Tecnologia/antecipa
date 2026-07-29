/**
 * Identidade e autorização do corretor — funções puras, usadas pelo servidor.
 *
 * Vive fora do server.ts de propósito: aquele módulo abre porta e inicializa o
 * Firebase Admin ao ser carregado, o que impede testá-lo por importação. Aqui
 * não há efeito colateral algum, então a lógica que decide QUEM É o usuário e
 * O QUE ELE PODE é testável isoladamente.
 */
import { normalizeCPF, normalizeDate, normalizeName } from './utils';

/** Formato mínimo do token decodificado que estas funções precisam conhecer. */
export interface TokenIdentidade {
  uid: string;
  email?: string;
  email_verified?: boolean;
  admin?: boolean;
  allowed?: boolean;
}

export interface Corretor {
  nome: string;
  dataNascimento: string;
  cpf: string;
  empresa?: string;
  cargo?: string;
  superintendencia?: string;
  loja?: string;
  allFields?: Record<string, string>;
}

/**
 * Perfil ADMIN: consta na allowlist ou tem custom claim.
 *
 * O casamento por e-mail exige email_verified. Sem isso, bastaria registrar uma
 * conta com o e-mail de um administrador, sem nunca provar posse dele, para
 * receber acesso administrativo.
 *
 * Falha fechada: allowlist ausente ou vazia nega todo mundo (INV-8).
 */
export function isUserAllowed(token: TokenIdentidade | null | undefined, allowlistEnv?: string): boolean {
  if (!token) return false;
  if (token.admin === true || token.allowed === true) return true;

  const bruto = allowlistEnv ?? (process.env.ALLOWED_EMAILS || process.env.ALLOWED_USERS || '');
  if (!bruto.trim()) return false;

  const permitidos = bruto.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (permitidos.length === 0) return false;

  const email = (token.email || '').toLowerCase();
  const porEmail = Boolean(email && token.email_verified === true && permitidos.includes(email));
  const porUid = Boolean(token.uid && permitidos.includes(token.uid));

  return porEmail || porUid;
}

/** Lê o CPF cobrindo as variações de nome de coluna que existem na base. */
export function cpfDaLinha(row: Record<string, any>): string {
  return String(row?.cpf ?? row?.CPF ?? row?.cpf_cnpj ?? row?.cpfcnpj ?? row?.documento ?? '');
}

/** Lê o nome cobrindo as variações de nome de coluna. */
export function nomeDaLinha(row: Record<string, any>): string {
  return String(row?.nome ?? row?.NOME ?? row?.nome_corretor ?? '');
}

/** Lê a data de nascimento cobrindo as variações de nome de coluna. */
export function nascimentoDaLinha(row: Record<string, any>): string {
  return String(row?.datanascimento ?? row?.DATANASCIMENTO ?? row?.data_nascimento ?? row?.nascimento ?? '');
}

/**
 * Exibe apenas os dois últimos dígitos, o suficiente para o corretor se
 * reconhecer sem que o CPF completo trafegue até o navegador.
 */
export function maskCpf(cpf: string): string {
  const limpo = String(cpf || '').replace(/\D/g, '');
  return limpo.length >= 2 ? `***.***.***-${limpo.slice(-2)}` : '***';
}

/**
 * Confere se a linha do banco corresponde aos dados informados no primeiro
 * acesso. Os três campos precisam bater — a mesma normalização usada pelo
 * frontend, para que um corretor válido nunca seja recusado por formatação.
 */
export function matchCorretor(
  row: Record<string, any>,
  alvo: { nome: string; dataNascimento: string; cpf: string },
): boolean {
  const alvoCpf = normalizeCPF(String(alvo.cpf ?? ''));
  const alvoNome = normalizeName(String(alvo.nome ?? ''));
  const alvoData = normalizeDate(String(alvo.dataNascimento ?? ''));

  // Campo vazio nunca casa: senão um pedido sem CPF bateria com qualquer
  // linha que também tivesse o campo vazio na base.
  if (!alvoCpf || !alvoNome || !alvoData) return false;

  return (
    normalizeCPF(cpfDaLinha(row)) === alvoCpf &&
    normalizeName(nomeDaLinha(row)) === alvoNome &&
    normalizeDate(nascimentoDaLinha(row)) === alvoData
  );
}

/** Localiza o corretor pelo CPF já normalizado. */
export function acharPorCpf(rows: Record<string, any>[], cpfNormalizado: string): Record<string, any> | null {
  if (!cpfNormalizado) return null;
  return rows.find((row) => normalizeCPF(cpfDaLinha(row)) === cpfNormalizado) ?? null;
}

/**
 * Converte a linha do MariaDB no formato que a interface consome, devolvendo
 * só os campos usados na tela (RS-06, menor privilégio). O CPF vai mascarado.
 */
export function mapCorretor(row: Record<string, any>): Corretor {
  const empresa = String(row?.empresa ?? row?.EMPRESA ?? '');
  const cargo = String(row?.cargo ?? row?.CARGO ?? row?.funcao ?? '');
  const superintendencia = String(row?.superintendencia ?? row?.SUPERINTENDENCIA ?? '');
  const loja = String(row?.loja ?? row?.LOJA ?? '');

  return {
    nome: nomeDaLinha(row),
    dataNascimento: '', // não é mais necessário no cliente
    cpf: maskCpf(cpfDaLinha(row)),
    empresa,
    cargo,
    superintendencia,
    loja,
    allFields: { Empresa: empresa, Cargo: cargo, 'Superintendência': superintendencia, Loja: loja },
  };
}

/**
 * Idade da sessão do portão conferida no servidor.
 *
 * Não basta o maxAge do cookie: esse prazo é guardado pelo navegador, que é o
 * cliente, e portanto não é confiável. Data no futuro também é recusada, para
 * que adiantar o relógio não estenda a sessão.
 */
export function isGateSessionFresh(issuedAt: unknown, agora: number, maxAgeMs: number): boolean {
  const emitidoEm = Number(issuedAt);
  if (!Number.isFinite(emitidoEm) || emitidoEm <= 0) return false;

  const idade = agora - emitidoEm;
  return idade >= 0 && idade <= maxAgeMs;
}
