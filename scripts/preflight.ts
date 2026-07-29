/**
 * Preflight de deploy — valida o ambiente ANTES de reiniciar o servidor.
 *
 * Existe porque descobrimos em 2026-07-29 que o Firebase Admin nunca teve
 * credencial no VPS: o servidor subia normalmente e falhava calado, com 100%
 * do tráfego caindo no caminho legado sem ninguém perceber. Um deploy do
 * código novo teria derrubado o site.
 *
 * Uso no VPS, antes do pm2 restart:
 *   npm run preflight
 *
 * Sai com código 1 se faltar qualquer coisa obrigatória, o que interrompe a
 * cadeia de deploy (&&) antes do restart. NUNCA imprime valor de segredo.
 */
import dotenv from "dotenv";
import fs from "fs";
import { initializeApp, cert, getApps, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

dotenv.config();

type Check = { nome: string; ok: boolean; detalhe: string; fatal: boolean };
const checks: Check[] = [];

function registrar(nome: string, ok: boolean, detalhe: string, fatal = true) {
  checks.push({ nome, ok, detalhe, fatal });
}

// --- 1. Segredo de sessão do portão (RS-08) ---
const sessionSecret = process.env.SESSION_SECRET || "";
registrar(
  "SESSION_SECRET",
  sessionSecret.length >= 32,
  sessionSecret.length === 0
    ? "ausente — o servidor não sobe sem ele"
    : sessionSecret.length < 32
      ? `curto demais (${sessionSecret.length} caracteres, mínimo 32)`
      : "definido e com tamanho adequado",
);

// --- 2. Credencial do Firebase Admin (RS-03) ---
const inlineCred = process.env.FIREBASE_SERVICE_ACCOUNT;
const pathCred = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
const adcCred = process.env.GOOGLE_APPLICATION_CREDENTIALS;

let credencialConfigurada = false;
let detalheCred = "nenhuma das variáveis de credencial está definida";

if (inlineCred) {
  try {
    JSON.parse(inlineCred);
    credencialConfigurada = true;
    detalheCred = "via FIREBASE_SERVICE_ACCOUNT (JSON inline)";
  } catch {
    detalheCred = "FIREBASE_SERVICE_ACCOUNT existe mas não é um JSON válido";
  }
} else if (pathCred) {
  if (fs.existsSync(pathCred)) {
    credencialConfigurada = true;
    detalheCred = `via arquivo em ${pathCred}`;
  } else {
    detalheCred = `FIREBASE_SERVICE_ACCOUNT_PATH aponta para ${pathCred}, que não existe`;
  }
} else if (adcCred) {
  credencialConfigurada = fs.existsSync(adcCred);
  detalheCred = credencialConfigurada
    ? `via GOOGLE_APPLICATION_CREDENTIALS em ${adcCred}`
    : `GOOGLE_APPLICATION_CREDENTIALS aponta para ${adcCred}, que não existe`;
}

registrar("Credencial Firebase configurada", credencialConfigurada, detalheCred);

// --- 3. A credencial FUNCIONA de verdade? ---
// Estar configurada não basta: uma chave revogada ou de outro projeto passaria
// na checagem acima e falharia só em produção.
async function validarCredencial(): Promise<void> {
  if (!credencialConfigurada) {
    registrar("Credencial Firebase válida", false, "pulado — não há credencial para testar");
    return;
  }

  try {
    let app: App;
    if (getApps().length > 0) {
      app = getApps()[0];
    } else if (inlineCred) {
      app = initializeApp({ credential: cert(JSON.parse(inlineCred)) });
    } else if (pathCred) {
      app = initializeApp({ credential: cert(JSON.parse(fs.readFileSync(pathCred, "utf-8"))) });
    } else {
      app = initializeApp();
    }

    await getAuth(app).createCustomToken("preflight_probe");
    registrar("Credencial Firebase válida", true, "assinatura de token funcionou");
  } catch (err: any) {
    registrar("Credencial Firebase válida", false, `falhou: ${err.message}`);
  }
}

// --- 4. Integrações de backend ---
registrar(
  "DB_API_KEY",
  Boolean(process.env.DB_API_KEY),
  process.env.DB_API_KEY ? "definida" : "ausente — /api/db/users retornará erro 500",
);

registrar(
  "BITRIX_LIST_URL",
  Boolean(process.env.BITRIX_LIST_URL || process.env.VITE_BITRIX_LIST_URL),
  process.env.BITRIX_LIST_URL || process.env.VITE_BITRIX_LIST_URL
    ? "definida"
    : "ausente — a integração Bitrix ficará indisponível",
);

// --- 5. Allowlist de autorização (RS-04) ---
const allowlist = process.env.ALLOWED_EMAILS || process.env.ALLOWED_USERS || "";
const totalAllowlist = allowlist.split(",").map(s => s.trim()).filter(Boolean).length;
registrar(
  "Allowlist de usuários",
  totalAllowlist > 0,
  totalAllowlist > 0
    ? `${totalAllowlist} entrada(s) — só estas contas acessam a API`
    : "vazia — TODA conta Google receberá 403. Ninguém consegue usar o portal.",
);

// --- 6. Token legado (transição do RS-12) ---
registrar(
  "ACCESS_TOKEN (legado)",
  Boolean(process.env.ACCESS_TOKEN),
  process.env.ACCESS_TOKEN
    ? "presente — caminho legado do dual-accept ainda ativo"
    : "ausente — apenas o caminho Firebase funcionará",
  false, // não é fatal: a ausência é o estado final desejado
);

async function main() {
  await validarCredencial();

  console.log("\n=== PREFLIGHT DE DEPLOY ===\n");

  let houveFalhaFatal = false;

  for (const c of checks) {
    const icone = c.ok ? "✅" : c.fatal ? "❌" : "⚠️ ";
    console.log(`${icone} ${c.nome}`);
    console.log(`   ${c.detalhe}\n`);
    if (!c.ok && c.fatal) houveFalhaFatal = true;
  }

  if (houveFalhaFatal) {
    console.error("=============================================");
    console.error("DEPLOY BLOQUEADO — corrija os itens ❌ acima.");
    console.error("O servidor NÃO subiria com esta configuração.");
    console.error("=============================================\n");
    process.exit(1);
  }

  console.log("=============================================");
  console.log("Ambiente OK — seguro prosseguir com o restart.");
  console.log("=============================================\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Erro inesperado no preflight:", err.message);
  process.exit(1);
});
