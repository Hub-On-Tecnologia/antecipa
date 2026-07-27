import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Enable JSON bodies with a larger limit for base64 file uploads
app.use(express.json({ limit: "50mb" }));

const isPlaceholderUrl = (url: string) => {
  return !url || url.includes("seu-dominio") || url.includes("USER_ID") || url.includes("TOKEN");
};

// Security Middleware for Bitrix API proxy endpoints
app.use("/api/bitrix", (req, res, next) => {
  if (req.path === "/debug") {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "Endpoint de debug desativado em ambiente de produção." });
    }
    return next();
  }

  const token = req.headers["x-access-token"] || req.headers["authorization"];
  const expectedToken = process.env.ACCESS_TOKEN;

  if (!expectedToken || (token !== expectedToken && token !== `Bearer ${expectedToken}`)) {
    return res.status(401).json({ error: "Acesso não autorizado ao proxy de integração Bitrix." });
  }

  next();
});

// Security Middleware for DB-API proxy endpoints
app.use("/api/db", (req, res, next) => {
  if (req.path === "/health") {
    return next();
  }

  const token = req.headers["x-access-token"] || req.headers["authorization"];
  const expectedToken = process.env.ACCESS_TOKEN;

  if (!expectedToken || (token !== expectedToken && token !== `Bearer ${expectedToken}`)) {
    return res.status(401).json({ error: "Acesso não autorizado ao proxy de banco de dados (DB-API)." });
  }

  next();
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

app.post("/api/db/query", async (req, res) => {
  const dbApiUrl = process.env.DB_API_URL || "http://10.0.3.2:8000";
  const dbApiKey = process.env.DB_API_KEY;

  if (!dbApiUrl || !dbApiKey) {
    return res.status(500).json({ error: "Configuração de DB_API_URL ou DB_API_KEY ausente no servidor." });
  }

  const { sql, params } = req.body;
  if (!sql) {
    return res.status(400).json({ error: "Parâmetro 'sql' é obrigatório." });
  }

  // Sanitização e Restrição de Segurança: /api/db/query aceita exclusivamente instruções de leitura (SELECT)
  const normalizedSql = String(sql).trim().toUpperCase();
  if (!normalizedSql.startsWith("SELECT") && !normalizedSql.startsWith("WITH")) {
    return res.status(400).json({ error: "Endpoint restrito a consultas de leitura (SELECT)." });
  }

  try {
    const response = await fetch(`${dbApiUrl}/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": dbApiKey,
      },
      body: JSON.stringify({ sql, params: params || [] }),
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

app.post("/api/db/execute", async (req, res) => {
  const dbApiUrl = process.env.DB_API_URL || "http://10.0.3.2:8000";
  const dbApiKey = process.env.DB_API_KEY;

  if (!dbApiUrl || !dbApiKey) {
    return res.status(500).json({ error: "Configuração de DB_API_URL ou DB_API_KEY ausente no servidor." });
  }

  const { sql, params } = req.body;
  if (!sql) {
    return res.status(400).json({ error: "Parâmetro 'sql' é obrigatório." });
  }

  try {
    const response = await fetch(`${dbApiUrl}/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": dbApiKey,
      },
      body: JSON.stringify({ sql, params: params || [] }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("DB-API Execute Proxy Error:", errorText);
      return res.status(response.status).json({ ok: false, error: "Falha na execução no banco de dados interno." });
    }

    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    console.error("DB-API execute error:", error);
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
  console.error("Failed to start Vite dev server:", err);
});
