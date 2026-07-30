import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import crypto from "crypto";

import fs from "fs";
import { initializeApp, cert, getApps, getApp, App } from "firebase-admin/app";
import { getAuth, DecodedIdToken } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
// Mesmas funções usadas pelo frontend: a normalização precisa ser idêntica dos
// dois lados, senão um corretor válido falharia na vinculação.
import { normalizeCPF } from "./src/lib/utils";
// Lógica de identidade/autorização vive em módulo sem efeito colateral para
// poder ser testada sem subir o servidor.
import {
  isUserAllowed, maskCpf, cpfDaLinha, mapCorretor, matchCorretor, acharPorCpf,
  isGateSessionFresh, TokenIdentidade,
} from "./src/lib/identity";

// Load environment variables
dotenv.config();

// Initialize Firebase Admin SDK for server-side JWT verification (RS-03)
function initFirebaseAdmin(): App | null {
  if (getApps().length > 0) return getApp();

  try {
    let appInstance: App;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      appInstance = initializeApp({
        credential: cert(serviceAccount),
      });
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH && fs.existsSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)) {
      const serviceAccount = JSON.parse(fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, "utf-8"));
      appInstance = initializeApp({
        credential: cert(serviceAccount),
      });
    } else {
      // Default initialization (uses GOOGLE_APPLICATION_CREDENTIALS or default GCP metadata)
      appInstance = initializeApp();
    }

    return appInstance;
  } catch (err: any) {
    const errorMsg = `[Firebase Admin] CRITICAL: Falha na inicialização do SDK: ${err.message}`;
    if (process.env.NODE_ENV === "production") {
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    console.warn(errorMsg);
    return null;
  }
}

const firebaseAdminApp = initFirebaseAdmin();

/**
 * Valida a credencial do Admin SDK com uma chamada real antes de servir tráfego (RS-03).
 *
 * initializeApp() não contata o Google — uma credencial inválida só falharia
 * depois, dentro de verifyIdToken(), que retorna null e faz o tráfego cair
 * silenciosamente no caminho legado (RS-12). Em produção isso precisa impedir
 * o processo de subir, nunca degradar em silêncio (INV-8).
 *
 * Deve ser chamada com await: createCustomToken() é assíncrona, e uma rejeição
 * não aguardada escapa de qualquer try/catch síncrono ao redor.
 */
async function assertFirebaseCredentials(): Promise<void> {
  const isProduction = process.env.NODE_ENV === "production";

  if (!firebaseAdminApp && getApps().length === 0) {
    const msg = "[Firebase Admin] CRITICAL: SDK não inicializado — nenhuma credencial disponível.";
    if (isProduction) throw new Error(msg);
    console.warn(msg);
    return;
  }

  try {
    await getAuth().createCustomToken("probe_init_check");
    console.log("[Firebase Admin] Credencial validada com sucesso.");
  } catch (err: any) {
    const msg = `[Firebase Admin] CRITICAL: credencial inválida ou sem permissão de assinatura: ${err.message}`;
    if (isProduction) throw new Error(msg);
    console.warn(msg);
  }
}

/**
 * Este projeto usa um Firestore NOMEADO, não o banco "(default)".
 *
 * getFirestore() sem argumento aponta para "(default)", que não existe aqui —
 * toda operação falharia com NOT_FOUND e o endpoint devolveria 500. O frontend
 * já resolvia isso via VITE_FIREBASE_FIRESTORE_DATABASE_ID; o servidor tem de
 * usar o mesmo ID. Aceita a variável sem prefixo (preferida no servidor) e cai
 * na VITE_, que é config pública e já existe no .env do VPS.
 */
const FIRESTORE_DATABASE_ID =
  process.env.FIREBASE_FIRESTORE_DATABASE_ID ||
  process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID ||
  "(default)";

function firestore() {
  return FIRESTORE_DATABASE_ID === "(default)"
    ? getFirestore()
    : getFirestore(FIRESTORE_DATABASE_ID);
}

/**
 * Verifica um ID Token do Firebase usando firebase-admin (RS-03).
 * Retorna o token decodificado ou null se inválido/inexistente.
 */
export async function verifyFirebaseIdToken(idToken: string): Promise<DecodedIdToken | null> {
  if (!firebaseAdminApp && getApps().length === 0) {
    return null;
  }
  try {
    const auth = getAuth();
    const decodedToken = await auth.verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    return null;
  }
}


const app = express();
// Configura 'trust proxy' antes de registrar middlewares de IP/rate-limit (necessário para Nginx)
app.set("trust proxy", 1);
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Rate limiter para o endpoint público de consumo de tokens (10 req/min por IP)
const consumeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { valid: false, error: "Muitas tentativas de consumo de token. Tente novamente mais tarde." },
  statusCode: 429,
});

// Enable JSON bodies with a larger limit for base64 file uploads
app.use(express.json({ limit: "50mb" }));

/**
 * Sessão do portão de acesso (RS-08).
 *
 * O token temporário é de uso único e destruído no consumo. Sem uma sessão,
 * qualquer recarga da WebView derrubaria o usuário — o que quebra o uso real
 * dentro do app. A sessão anterior vivia em sessionStorage, que o usuário
 * conseguia forjar pelo DevTools em uma linha.
 *
 * Aqui a sessão é um cookie httpOnly ASSINADO pelo servidor: o navegador não
 * consegue ler nem falsificar, e a validade é reconferida no servidor a cada
 * requisição. INV-2 (a fronteira é o servidor) e INV-5 (assinatura via
 * biblioteca mantida, sem cripto artesanal).
 */
const SESSION_COOKIE = "antecipa_gate";
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8h — um turno de trabalho

function resolveSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;

  const msg =
    "[Session] CRITICAL: SESSION_SECRET ausente ou com menos de 32 caracteres. " +
    "Sem ele os cookies de sessão não podem ser assinados com segurança.";

  if (process.env.NODE_ENV === "production") {
    // INV-8: falhar fechado. Sem segredo forte não há sessão confiável.
    throw new Error(msg);
  }

  console.warn(`${msg} Gerando segredo efêmero para desenvolvimento.`);
  return crypto.randomBytes(48).toString("hex");
}

const SESSION_SECRET = resolveSessionSecret();
app.use(cookieParser(SESSION_SECRET));

/** Emite a sessão do portão após consumo bem-sucedido de um token. */
function issueGateSession(res: express.Response): void {
  res.cookie(SESSION_COOKIE, String(Date.now()), {
    signed: true,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_MS,
    path: "/",
  });
}

/**
 * Valida a sessão do portão. A assinatura é conferida pelo cookie-parser;
 * aqui reconferimos a idade no servidor para não depender apenas do maxAge
 * do navegador, que o cliente controla.
 */
function hasValidGateSession(req: express.Request): boolean {
  const issuedAt = (req as any).signedCookies?.[SESSION_COOKIE];
  return isGateSessionFresh(issuedAt, Date.now(), SESSION_MAX_AGE_MS);
}

const isPlaceholderUrl = (url: string) => {
  return !url || url.includes("seu-dominio") || url.includes("USER_ID") || url.includes("TOKEN");
};


/**
 * Modelo de autorização (RS-04)
 * ------------------------------
 * Há dois perfis distintos, e confundi-los quebra o portal:
 *
 * - ADMIN: consta em ALLOWED_EMAILS ou tem custom claim. Emite tokens de
 *   acesso e consulta a base de corretores. É uma lista curta e manual.
 *
 * - CORRETOR: qualquer conta Google VINCULADA a um corretor ativo no
 *   MariaDB. Não existe lista para manter — quem está ativo na base entra,
 *   quem é desativado perde o acesso automaticamente.
 *
 * Por isso dualAuthMiddleware faz apenas AUTENTICAÇÃO (quem é você). A
 * AUTORIZAÇÃO (o que você pode) fica em requireAdmin / requireBoundBroker,
 * aplicados endpoint a endpoint. Nenhum endpoint sob /api pode ficar só com
 * dualAuthMiddleware — INV-6, negar por padrão.
 */

/**
 * Dual-Accept Security Middleware (RS-12 Fase 1)
 * Aceita requisições autenticadas via:
 * 1. Firebase ID Token (Header "Authorization: Bearer <idToken>") com verificação de Allowlist (RS-04)
 * 2. Token Legado (Header "x-access-token" ou "Authorization" com TOKEN)
 *
 * Loga a via utilizada para monitoramento da migração sem quebrar tráfego legado.
 */
export async function dualAuthMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = typeof req.headers["authorization"] === "string" ? req.headers["authorization"] : undefined;
  const customHeader = typeof req.headers["x-access-token"] === "string" ? req.headers["x-access-token"] : undefined;

  // 1. Tentar validar como Firebase ID Token
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const candidateIdToken = authHeader.substring(7);
    const decodedToken = await verifyFirebaseIdToken(candidateIdToken);

    if (decodedToken) {
      // Apenas autenticação aqui. A autorização é responsabilidade de
      // requireAdmin / requireBoundBroker no próprio endpoint.
      (req as any).user = decodedToken;
      console.log(`[AUTH] path=jwt user=${decodedToken.uid} endpoint=${req.originalUrl}`);
      return next();
    }
  }

  // 2. Fallback: Tentar validar como Token Legado (transição via ACCESS_TOKEN no servidor)
  const legacyToken = customHeader || authHeader;
  const expectedLegacyToken = process.env.ACCESS_TOKEN;

  if (expectedLegacyToken && (legacyToken === expectedLegacyToken || legacyToken === `Bearer ${expectedLegacyToken}`)) {
    // Credencial de servidor: durante a transição do RS-12 vale como admin.
    (req as any).legacyAuth = true;
    console.log(`[AUTH] path=legacy endpoint=${req.originalUrl}`);
    return next();
  }

  // 3. Ambas as vias falharam -> 401
  console.warn(`[AUTH] path=denied ip=${req.ip || req.socket.remoteAddress} endpoint=${req.originalUrl}`);
  return res.status(401).json({ error: "Acesso não autorizado." });
}

/** Exige perfil ADMIN (allowlist). O caminho legado também é tratado como admin. */
export function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = (req as any).user as DecodedIdToken | undefined;

  // Caminho legado (RS-12 Fase 1): não popula req.user e é credencial de
  // servidor, portanto tratado como admin durante a transição.
  if (!user) {
    if ((req as any).legacyAuth === true) return next();
    return res.status(403).json({ error: "Acesso negado: requer conta administrativa." });
  }

  if (!isUserAllowed(user)) {
    console.warn(`[AUTHZ] admin_negado user=${user.uid} endpoint=${req.originalUrl}`);
    return res.status(403).json({ error: "Acesso negado: conta não autorizada." });
  }

  return next();
}

/**
 * Executa uma consulta parametrizada na DB-API. O SQL é sempre montado no
 * servidor; o cliente nunca envia SQL nem fragmento de SQL (RS-06).
 */
async function queryDbApi(sql: string, params: any[]): Promise<any[]> {
  const dbApiUrl = process.env.DB_API_URL || "http://10.0.3.2:8000";
  const dbApiKey = process.env.DB_API_KEY;
  if (!dbApiKey) throw new Error("DB_API_KEY ausente no servidor.");

  const response = await fetch(`${dbApiUrl}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": dbApiKey },
    body: JSON.stringify({ sql, params }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`DB-API respondeu ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data : data?.rows || data?.data || [];
}

/**
 * Vínculo conta Google <-> corretor (RS-04).
 *
 * Antes, a identidade do corretor era decidida NO NAVEGADOR: a página baixava
 * a tabela inteira de corretores e comparava nome/nascimento/CPF localmente.
 * Isso entregava CPF e data de nascimento de todos os corretores ativos a
 * qualquer visitante, e não ligava a conta Google ao corretor — qualquer conta
 * podia digitar os dados de qualquer um e se passar por ele.
 *
 * Agora a conferência é do servidor e o resultado vira um vínculo permanente.
 * Duas coleções, ambas negadas ao cliente e escritas só pelo Admin SDK:
 *   user_bindings/{uid} -> { cpf, nome, email, boundAt }
 *   corretor_bindings/{cpf} -> { uid, boundAt }
 * A segunda existe para garantir, de forma atômica, que um corretor não seja
 * reivindicado por duas contas Google diferentes.
 */
type Binding = { cpf: string; nome: string; email: string | null };

/** Corretores ativos. Consulta fica sempre no servidor — nunca vai ao navegador. */
async function fetchCorretoresAtivos(): Promise<any[]> {
  return queryDbApi(
    "SELECT * FROM corpstek_corretores WHERE administrativo_ativo = %s AND (data_exclusao IS NULL OR data_exclusao = %s)",
    [1, "1970-01-01 00:00:01"],
  );
}

async function getBinding(uid: string): Promise<Binding | null> {
  const snap = await firestore().collection("user_bindings").doc(uid).get();
  if (!snap.exists) return null;
  const d = snap.data() || {};
  return { cpf: d.cpf, nome: d.nome, email: d.email ?? null };
}

/** Exige que a conta autenticada esteja vinculada a um corretor ativo. */
export async function requireBoundBroker(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = (req as any).user as DecodedIdToken | undefined;

  if (!user) {
    if ((req as any).legacyAuth === true) return next();
    return res.status(401).json({ error: "Autenticação necessária." });
  }

  // Admin acessa sem precisar de vínculo.
  if (isUserAllowed(user)) return next();

  try {
    const binding = await getBinding(user.uid);
    if (!binding) {
      return res.status(403).json({ error: "Conta ainda não vinculada a um corretor.", needsBinding: true });
    }
    (req as any).broker = binding;
    return next();
  } catch (err: any) {
    console.error("[AUTHZ] Erro ao consultar vínculo:", err.message);
    return res.status(500).json({ error: "Erro ao validar autorização." });
  }
}

// Vincular identidade é alvo de tentativa e erro (nome + nascimento + CPF).
// Limite estrito por IP, bem abaixo do que uma pessoa real precisa.
const bindLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas de vinculação. Aguarde alguns minutos." },
  statusCode: 429,
});

/**
 * GET /api/auth/me
 * Devolve a identidade do corretor a partir do VÍNCULO no servidor.
 * O navegador nunca decide quem é o usuário.
 */
app.get("/api/auth/me", dualAuthMiddleware, async (req, res) => {
  const user = (req as any).user as DecodedIdToken | undefined;
  if (!user) return res.status(401).json({ error: "Autenticação necessária." });

  try {
    const binding = await getBinding(user.uid);
    if (!binding) {
      return res.status(200).json({ isAdmin: isUserAllowed(user), bound: false, broker: null });
    }

    // Relê o cadastro a cada acesso: corretor desativado no CRM perde o
    // acesso automaticamente, sem ninguém precisar mexer em lista nenhuma.
    const rows = await fetchCorretoresAtivos();
    const linha = acharPorCpf(rows, binding.cpf);

    if (!linha) {
      console.warn(`[Auth] Vínculo existe mas corretor não está ativo uid=${user.uid}`);
      return res.status(403).json({ error: "Cadastro de corretor inativo ou não encontrado.", inactive: true });
    }

    return res.status(200).json({ isAdmin: isUserAllowed(user), bound: true, broker: mapCorretor(linha) });
  } catch (err: any) {
    console.error("[Auth] Erro ao consultar vínculo:", err.message);
    return res.status(500).json({ error: "Erro ao consultar vínculo." });
  }
});

/**
 * POST /api/auth/bind
 * Primeiro acesso: confere nome + nascimento + CPF contra o MariaDB e amarra
 * o corretor à conta Google usada. A partir daí, entrar com o Google basta.
 *
 * A conferência é feita AQUI, no servidor. A lista de corretores nunca sai
 * daqui — era esse vazamento que existia antes.
 */
app.post("/api/auth/bind", bindLimiter, dualAuthMiddleware, async (req, res) => {
  const user = (req as any).user as DecodedIdToken | undefined;
  if (!user) return res.status(401).json({ error: "Faça login com o Google antes de vincular." });

  const { nome, dataNascimento, cpf } = req.body || {};
  if (!nome || !dataNascimento || !cpf) {
    return res.status(400).json({ error: "Informe nome, data de nascimento e CPF." });
  }

  try {
    const db = firestore();

    // Já vinculado? Idempotente.
    const existing = await getBinding(user.uid);
    const rows = await fetchCorretoresAtivos();

    if (existing) {
      const linha = acharPorCpf(rows, existing.cpf);
      if (!linha) return res.status(403).json({ error: "Cadastro de corretor inativo.", inactive: true });
      return res.status(200).json({ bound: true, broker: mapCorretor(linha) });
    }

    const alvoCpf = normalizeCPF(String(cpf));
    const encontrado = rows.find((row: any) => matchCorretor(row, { nome, dataNascimento, cpf }));

    if (!encontrado) {
      console.warn(`[Auth] Vinculação negada uid=${user.uid} ip=${req.ip}`);
      // Mensagem genérica de propósito: não revelar qual campo errou nem se o
      // CPF existe na base.
      return res.status(403).json({ error: "Dados não conferem com um corretor ativo." });
    }

    const nomeEncontrado = String(encontrado.nome || encontrado.NOME || encontrado.nome_corretor || "");

    // Transação: um corretor não pode ser reivindicado por duas contas.
    const corretorRef = db.collection("corretor_bindings").doc(alvoCpf);
    const userRef = db.collection("user_bindings").doc(user.uid);

    const resultado = await db.runTransaction<{ ok: boolean; erro?: string }>(async (tx) => {
      const jaVinculado = await tx.get(corretorRef);
      if (jaVinculado.exists && jaVinculado.data()?.uid !== user.uid) {
        return { ok: false, erro: "Este corretor já está vinculado a outra conta Google." };
      }

      tx.set(corretorRef, { uid: user.uid, boundAt: FieldValue.serverTimestamp() });
      tx.set(userRef, {
        cpf: alvoCpf,
        nome: nomeEncontrado,
        email: user.email || null,
        boundAt: FieldValue.serverTimestamp(),
      });
      return { ok: true };
    });

    if (!resultado.ok) {
      console.warn(`[Auth] Vínculo em conflito uid=${user.uid}`);
      return res.status(409).json({ error: resultado.erro });
    }

    console.log(`[Auth] Vínculo criado uid=${user.uid}`);
    return res.status(200).json({ bound: true, broker: mapCorretor(encontrado) });
  } catch (err: any) {
    console.error("[Auth] Erro na vinculação:", err.message);
    return res.status(500).json({ error: "Erro ao validar seus dados. Tente novamente." });
  }
});

/**
 * GET /api/access-tokens/verify-user
 * Verifica se o usuário autenticado no Firebase é permitido na allowlist.
 * Comentário obrigatório:
 * Este check é UX, não segurança. A fronteira real é a allowlist em POST /api/access-tokens. Nunca confiar apenas neste retorno.
 */
app.get("/api/access-tokens/verify-user", dualAuthMiddleware, (req, res) => {
  const user = (req as any).user as DecodedIdToken | undefined;
  if (!user || !isUserAllowed(user)) {
    return res.status(403).json({ allowed: false, error: "Conta não autorizada na allowlist." });
  }
  return res.status(200).json({ allowed: true, uid: user.uid, email: user.email });
});

/**
 * POST /api/access-tokens
 * Emissão de token de acesso no servidor com fonte criptográfica.
 * Protegido por dualAuthMiddleware E isUserAllowed (allowlist).
 */
app.post("/api/access-tokens", dualAuthMiddleware, async (req, res) => {
  try {
    const user = (req as any).user as DecodedIdToken | undefined;
    if (!user || !isUserAllowed(user)) {
      return res.status(403).json({ error: "Acesso negado: Conta não autorizada na allowlist." });
    }

    const uuid = crypto.randomUUID().replace(/-/g, "");
    const tokenId = `token_${uuid}`;

    const db = firestore();
    await db.collection("access_tokens").doc(tokenId).set({
      createdAt: FieldValue.serverTimestamp(),
      createdBy: user.uid,
      createdByEmail: user.email || null,
    });

    console.log(`[AccessTokens] Token gerado no servidor: ${tokenId} por ${user.uid}`);
    return res.status(200).json({ tokenId });
  } catch (err: any) {
    console.error("[AccessTokens] Erro ao gerar token de acesso:", err);
    return res.status(500).json({ error: "Erro interno ao gerar token de acesso." });
  }
});

/**
 * POST /api/access-tokens/consume
 * Validação e consumo atômico (uso único) do token de acesso via runTransaction do Firestore.
 * NÃO está atrás de dualAuthMiddleware (endpoint público do portão).
 * Protegido por rate-limiting (consumeLimiter).
 */
app.post("/api/access-tokens/consume", consumeLimiter, async (req, res) => {
  const { tokenId } = req.body || {};
  if (!tokenId || typeof tokenId !== "string" || tokenId.length > 128) {
    return res.status(401).json({ valid: false, error: "Token inválido ou inexistente." });
  }

  try {
    const db = firestore();
    const docRef = db.collection("access_tokens").doc(tokenId);

    // O resultado é RETORNADO pela transação, nunca escrito em estado externo.
    // O Firestore reexecuta o callback em caso de contenção; variáveis de fora
    // sobreviveriam à retentativa e uma tentativa anterior poderia validar um
    // token já consumido por outra requisição (uso duplo).
    const result = await db.runTransaction<{ valid: boolean; error: string }>(async (transaction) => {
      const docSnap = await transaction.get(docRef);
      if (!docSnap.exists) {
        return { valid: false, error: "Token inválido ou inexistente." };
      }

      const data = docSnap.data();
      const createdAt = data?.createdAt;

      // Deleção atômica dentro da transação para garantir uso único concorrente
      transaction.delete(docRef);

      if (!createdAt) {
        return { valid: false, error: "Token inválido sem data de criação." };
      }

      let createdTime = Date.now();
      if (typeof createdAt.toMillis === "function") {
        createdTime = createdAt.toMillis();
      } else if (createdAt.seconds) {
        createdTime = createdAt.seconds * 1000;
      } else if (typeof createdAt === "number") {
        createdTime = createdAt;
      } else if (createdAt instanceof Date) {
        createdTime = createdAt.getTime();
      }

      const diff = Date.now() - createdTime;

      // Janela de 1 minuto (60000ms) com 5s de tolerância para relógios dessincronizados
      if (diff >= -5000 && diff <= 60000) {
        return { valid: true, error: "" };
      }
      return { valid: false, error: "Token de acesso expirado." };
    });

    if (result.valid) {
      // Troca imediata do token de uso único por uma sessão assinada (RS-08),
      // para que recarregar a WebView não derrube o usuário.
      issueGateSession(res);
      console.log(`[AccessTokens] Token consumido com sucesso (atômico): ${tokenId}`);
      return res.status(200).json({ valid: true });
    } else {
      console.warn(`[AccessTokens] Falha ao consumir token ${tokenId}: ${result.error}`);
      return res.status(401).json({ valid: false, error: result.error || "Token inválido ou inexistente." });
    }
  } catch (err: any) {
    console.error("[AccessTokens] Erro atômico no consumo de token:", err);
    return res.status(500).json({ valid: false, error: "Erro interno na validação do token." });
  }
});

/**
 * GET /api/session
 * Informa se a sessão do portão ainda é válida. Chamado ao carregar a página
 * antes de exigir um token novo — é o que permite recarregar a WebView sem
 * perder o acesso. A decisão é do servidor; o cliente apenas pergunta.
 */
app.get("/api/session", (req, res) => {
  return res.status(200).json({ valid: hasValidGateSession(req) });
});

/**
 * POST /api/session/logout
 * Encerra a sessão do portão.
 */
app.post("/api/session/logout", (req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  return res.status(200).json({ ok: true });
});

// Bitrix: autenticar e, em seguida, exigir vínculo com corretor ativo (RS-04).
app.use("/api/bitrix", (req, res, next) => {
  if (req.path === "/debug") {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "Endpoint de debug desativado em ambiente de produção." });
    }
    return next();
  }
  return dualAuthMiddleware(req, res, () => requireBoundBroker(req, res, next));
});

// Security Middleware for DB-API proxy endpoints
// DB-API: expõe a base de corretores. Restrito a ADMIN — nenhum corretor
// precisa da lista, e era exatamente esse dump que vazava CPF e data de
// nascimento de todo mundo para o navegador (RS-06).
app.use("/api/db", (req, res, next) => {
  if (req.path === "/health") {
    return next();
  }
  return dualAuthMiddleware(req, res, () => requireAdmin(req, res, next));
});


// DB-API Proxy Endpoints (MariaDB via WireGuard)
app.get("/api/db/health", async (req, res) => {
  const dbApiUrl = process.env.DB_API_URL || "http://10.0.3.2:8000";
  try {
    const response = await fetch(`${dbApiUrl}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    console.error("DB-API healthcheck error:", error);
    res.status(500).json({ ok: false, error: "DB-API healthcheck indisponível." });
  }
});

app.get("/api/db/users", async (req, res) => {
  const dbApiUrl = process.env.DB_API_URL || "http://10.0.3.2:8000";
  const dbApiKey = process.env.DB_API_KEY;

  if (!dbApiKey) {
    return res.status(500).json({ error: "Configuração DB_API_KEY ausente no servidor." });
  }

  // Query fixa no servidor — o cliente nunca envia SQL
  const sql = "SELECT * FROM corpstek_corretores WHERE administrativo_ativo = %s AND (data_exclusao IS NULL OR data_exclusao = %s)";
  const params = [1, "1970-01-01 00:00:01"];

  try {
    const response = await fetch(`${dbApiUrl}/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": dbApiKey,
      },
      body: JSON.stringify({ sql, params }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("DB-API Query Proxy Error:", errorText);
      return res.status(response.status).json({ ok: false, error: "Falha na consulta ao banco de dados interno." });
    }

    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    console.error("DB-API query error:", error);
    res.status(500).json({ ok: false, error: "Erro de comunicação com o banco de dados." });
  }
});


// Secure Debug Route to verify environment variables (dev only)
app.get("/api/bitrix/debug", (req, res) => {
  const listUrl = process.env.BITRIX_LIST_URL || process.env.VITE_BITRIX_LIST_URL || "";
  const writeUrl = process.env.BITRIX_WEBHOOK_WRITE_URL || process.env.VITE_BITRIX_WEBHOOK_WRITE_URL || "";
  
  const maskUrl = (url: string) => {
    if (!url) return "not defined";
    try {
      const parsed = new URL(url);
      const paths = parsed.pathname.split("/");
      const maskedPaths = paths.map(p => (p.length > 5 ? p.substring(0, 3) + "***" : p));
      parsed.pathname = maskedPaths.join("/");
      return parsed.toString();
    } catch {
      return url.substring(0, 15) + "...(invalid URL)";
    }
  };

  res.json({
    listUrlMasked: maskUrl(listUrl),
    writeUrlMasked: maskUrl(writeUrl),
    isPlaceholder: isPlaceholderUrl(listUrl) || isPlaceholderUrl(writeUrl),
    envKeys: Object.keys(process.env).filter(k => k.includes("BITRIX")),
    nodeEnv: process.env.NODE_ENV || "not-production"
  });
});

// Bitrix API Endpoints Proxy
app.post("/api/bitrix/list", async (req, res) => {
  const listUrl = process.env.BITRIX_LIST_URL || process.env.VITE_BITRIX_LIST_URL;
  if (!listUrl) {
    return res.status(500).json({ error: "Configuração de integração Bitrix não encontrada (BITRIX_LIST_URL)." });
  }

  if (isPlaceholderUrl(listUrl)) {
    return res.status(400).json({ 
      error: "Ambiente de Teste: Configure suas variáveis reais do Bitrix24 no servidor para habilitar esta integração."
    });
  }

  try {
    const response = await fetch(listUrl, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
      },
      body: JSON.stringify(req.body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: `Bitrix API Error: ${errorText}` });
    }

    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    console.error("Proxy list error:", error);
    res.status(500).json({ error: error.message || "Erro desconhecido no proxy de listagem." });
  }
});

app.post("/api/bitrix/get", async (req, res) => {
  const writeUrl = process.env.BITRIX_WEBHOOK_WRITE_URL || process.env.VITE_BITRIX_WEBHOOK_WRITE_URL;
  const listUrl = process.env.BITRIX_LIST_URL || process.env.VITE_BITRIX_LIST_URL;
  
  const baseUrl = writeUrl || listUrl;
  if (!baseUrl) {
    return res.status(500).json({ error: "Configuração de integração Bitrix não encontrada." });
  }

  if (isPlaceholderUrl(baseUrl)) {
    return res.status(400).json({ 
      error: "Ambiente de Teste: Configure suas variáveis reais do Bitrix24 no servidor para habilitar esta integração."
    });
  }

  // Deduze a URL do crm.deal.get.json a partir do add ou do list
  let getUrl = baseUrl;
  if (writeUrl) {
    getUrl = writeUrl.replace('crm.deal.add.json', 'crm.deal.get.json');
  } else if (listUrl) {
    getUrl = listUrl.replace('crm.deal.list.json', 'crm.deal.get.json');
  }

  try {
    const response = await fetch(getUrl, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
      },
      body: JSON.stringify(req.body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: `Bitrix API Error: ${errorText}` });
    }

    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    console.error("Proxy get error:", error);
    res.status(500).json({ error: error.message || "Erro desconhecido no proxy de busca individual." });
  }
});

app.post("/api/bitrix/add", async (req, res) => {
  const writeUrl = process.env.BITRIX_WEBHOOK_WRITE_URL || process.env.VITE_BITRIX_WEBHOOK_WRITE_URL;
  if (!writeUrl) {
    return res.status(500).json({ error: "Configuração de integração Bitrix não encontrada (BITRIX_WEBHOOK_WRITE_URL)." });
  }

  if (isPlaceholderUrl(writeUrl)) {
    return res.status(400).json({ 
      error: "Ambiente de Teste: Configure suas variáveis reais do Bitrix24 no servidor para habilitar esta integração."
    });
  }

  try {
    const response = await fetch(writeUrl, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
      },
      body: JSON.stringify(req.body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: `Bitrix API Error: ${errorText}` });
    }

    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    console.error("Proxy add error:", error);
    res.status(500).json({ error: error.message || "Erro desconhecido no proxy de adição." });
  }
});

app.post("/api/bitrix/update", async (req, res) => {
  const writeUrl = process.env.BITRIX_WEBHOOK_WRITE_URL || process.env.VITE_BITRIX_WEBHOOK_WRITE_URL;
  if (!writeUrl) {
    return res.status(500).json({ error: "Configuração de integração Bitrix não encontrada (BITRIX_WEBHOOK_WRITE_URL)." });
  }

  if (isPlaceholderUrl(writeUrl)) {
    return res.status(400).json({ 
      error: "Ambiente de Teste: Configure suas variáveis reais do Bitrix24 no servidor para habilitar esta integração."
    });
  }
  const updateUrl = writeUrl.replace('crm.deal.add.json', 'crm.deal.update.json');

  try {
    const response = await fetch(updateUrl, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
      },
      body: JSON.stringify(req.body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: `Bitrix API Error: ${errorText}` });
    }

    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    console.error("Proxy update error:", error);
    res.status(500).json({ error: error.message || "Erro desconhecido no proxy." });
  }
});

// Vite middleware for development / serving static files for production
async function setupVite() {
  // Falha ruidosa ANTES de aceitar tráfego: com credencial inválida o servidor
  // não deve subir em produção (RS-03 / INV-8).
  await assertFirebaseCredentials();

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.use("/antecipa", express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
  });
}

setupVite().catch((err) => {
  console.error("[Server] Falha fatal na inicialização:", err);
  // Encerra com código de erro para o PM2 registrar a falha em vez de
  // deixar um processo vivo sem listener.
  process.exit(1);
});
