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

const isPlaceholderUrl = (url: string) => {
  return !url || url.includes("seu-dominio") || url.includes("USER_ID") || url.includes("TOKEN");
};


/**
 * Valida se o usuário autenticado via Firebase consta na allowlist de autorização (RS-04).
 */
function isUserAllowed(decodedToken: DecodedIdToken): boolean {
  if (decodedToken.admin === true || decodedToken.allowed === true) {
    return true;
  }

  const allowedEnv = process.env.ALLOWED_EMAILS || process.env.ALLOWED_USERS || "";
  if (allowedEnv) {
    const allowedList = allowedEnv.split(",").map(item => item.trim().toLowerCase());
    const userEmail = (decodedToken.email || "").toLowerCase();
    const userUid = decodedToken.uid;

    const emailMatches = Boolean(userEmail && decodedToken.email_verified === true && allowedList.includes(userEmail));
    const uidMatches = Boolean(userUid && allowedList.includes(userUid));

    if (emailMatches || uidMatches) {
      return true;
    }
  }

  return false;
}

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
      // RS-04: Exigir allowlist além da autenticação. Conta fora da allowlist -> 403
      if (!isUserAllowed(decodedToken)) {
        console.warn(`[AUTH] path=forbidden user=${decodedToken.uid} endpoint=${req.originalUrl}`);
        return res.status(403).json({ error: "Acesso negado: Conta não autorizada na allowlist." });
      }

      (req as any).user = decodedToken;
      console.log(`[AUTH] path=jwt user=${decodedToken.uid} endpoint=${req.originalUrl}`);
      return next();
    }
  }

  // 2. Fallback: Tentar validar como Token Legado (transição via ACCESS_TOKEN no servidor)
  const legacyToken = customHeader || authHeader;
  const expectedLegacyToken = process.env.ACCESS_TOKEN;

  if (expectedLegacyToken && (legacyToken === expectedLegacyToken || legacyToken === `Bearer ${expectedLegacyToken}`)) {
    console.log(`[AUTH] path=legacy endpoint=${req.originalUrl}`);
    return next();
  }

  // 3. Ambas as vias falharam -> 401
  console.warn(`[AUTH] path=denied ip=${req.ip || req.socket.remoteAddress} endpoint=${req.originalUrl}`);
  return res.status(401).json({ error: "Acesso não autorizado." });
}

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

    const db = getFirestore();
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
    const db = getFirestore();
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

// Security Middleware for Bitrix API proxy endpoints
app.use("/api/bitrix", (req, res, next) => {
  if (req.path === "/debug") {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "Endpoint de debug desativado em ambiente de produção." });
    }
    return next();
  }
  return dualAuthMiddleware(req, res, next);
});

// Security Middleware for DB-API proxy endpoints
app.use("/api/db", (req, res, next) => {
  if (req.path === "/health") {
    return next();
  }
  return dualAuthMiddleware(req, res, next);
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
