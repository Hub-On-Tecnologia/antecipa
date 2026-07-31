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
import nodemailer, { Transporter } from "nodemailer";
// Mesmas funções usadas pelo frontend: a normalização precisa ser idêntica dos
// dois lados, senão um corretor válido falharia na vinculação.
import { normalizeCPF } from "./src/lib/utils";
// Lógica de identidade/autorização vive em módulo sem efeito colateral para
// poder ser testada sem subir o servidor.
import {
  isUserAllowed, maskCpf, cpfDaLinha, mapCorretor, matchCorretor, acharPorCpf,
  emailSinteticoDoCpf, DOMINIO_CORRETOR, atendePoliticaSenha, emailsDoCorretor,
  TokenIdentidade,
} from "./src/lib/identity";
import { emailPrimeiroAcesso, emailRecuperacaoSenha, ConteudoEmail } from "./src/lib/emails";

// Load environment variables
dotenv.config();

/**
 * Rede de segurança contra rejeição de Promise não tratada.
 *
 * Desde o Node 15, uma rejeição não tratada DERRUBA o processo por padrão —
 * mesmo com try/catch em cada rota, uma falha assíncrona que escape do
 * fluxo esperado (ex.: retry interno de uma biblioteca de banco de dados
 * rejeitando fora do await da aplicação) mata o servidor inteiro por causa
 * de UMA falha pontual. Observado em produção em 2026-07-30: um erro
 * transitório do Firestore (banco em cota compartilhada) derrubou o
 * processo; o PM2 reiniciou sozinho, mas toda requisição em andamento
 * naquele instante foi perdida.
 *
 * Logar sem encerrar troca "servidor inteiro cai por uma falha pontual" por
 * "uma requisição falha, as outras continuam". uncaughtException continua
 * fatal de propósito — nesse caso o estado do processo é indefinido demais
 * para confiar, e é papel do PM2 reiniciar (autorestart: true).
 */
process.on("unhandledRejection", (reason: any) => {
  console.error("[Server] Rejeição não tratada (processo continua):", reason?.message || reason);
});

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
 * Portão de acesso (RS-08): uso único de verdade, sem sessão persistente.
 *
 * Decisão de produto: o token expira em 1 minuto e é destruído no consumo.
 * Não existe estado de acesso guardado no servidor além disso — o app é
 * responsável por gerar um token novo toda vez que abrir ou recarregar a
 * tela do portal, não apenas na primeira vez.
 *
 * (Uma versão anterior manteve uma sessão de 8h via cookie assinado para que
 * a recarga da WebView não expulsasse o usuário. Foi revertida a pedido do
 * produto: prefere-se a janela de exposição mínima do uso único a uma sessão
 * de longa duração, mesmo assinada.)
 */
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

/* ------------------------------------------------------------------------- *
 * AUTENTICAÇÃO POR SENHA — Task 3 do .docs/PLANO_AUTH_EMAIL_SENHA.md
 *
 * O corretor NUNCA informa o e-mail dele. Ele prova quem é com nome +
 * nascimento + CPF (a mesma conferência do /api/auth/bind, já testada) e o
 * link de definição de senha é enviado para o contato QUE JÁ ESTÁ NA BASE.
 * Isso cria um fator de posse que o fluxo Google não tem: hoje, quem souber
 * esses três dados vincula qualquer conta a qualquer corretor.
 *
 * O identificador da credencial é derivado do CPF (emailSinteticoDoCpf), então
 * o corretor entra com CPF + senha e o front monta o identificador sozinho,
 * sem consultar o servidor — não existe oráculo de enumeração.
 * ------------------------------------------------------------------------- */

/**
 * Interruptor geral. Enquanto estiver desligado, os endpoints respondem 503 e
 * nada é criado. Permite subir o código para a VPS antes de o provedor
 * E-mail/senha estar habilitado no Console do Firebase (Task 2), mantendo a
 * disciplina de um commit por passo sem expor um fluxo pela metade.
 */
const AUTH_SENHA_ATIVA = String(process.env.AUTH_SENHA_ENABLED || "").trim() === "1";

/** Domínio do identificador sintético — não recebe e-mail de verdade. */
const DOMINIO_CREDENCIAL = process.env.AUTH_CORRETOR_EMAIL_DOMAIN || DOMINIO_CORRETOR;

/**
 * Imprime o link de ativação no log do servidor. Padrão DESLIGADO: link de
 * definição de senha é credencial, e o PRD proíbe segredo em log (item 9).
 * Existe só para o piloto, antes de a entrega por WhatsApp ficar pronta.
 */
const LOG_LINK_ATIVACAO = String(process.env.AUTH_LINK_DEBUG || "").trim() === "1";

/**
 * Resposta única, dados conferindo ou não. Se variasse, o endpoint viraria um
 * consultor de CPF: "este CPF é corretor ativo da Antecipa?".
 */
const RESPOSTA_GENERICA = {
  ok: true,
  message: "Se os dados conferirem com um corretor ativo, enviamos um link para o contato cadastrado.",
};

// Mesmo aperto do bindLimiter: são endpoints públicos que consultam a base de
// corretores e disparam envio. Bem abaixo do que uma pessoa real precisa.
const senhaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas. Aguarde alguns minutos." },
  statusCode: 429,
});

/**
 * Garante que exista uma credencial no Firebase para aquele CPF e devolve o
 * link de definição de senha.
 *
 * A senha inicial é aleatória e nunca sai daqui: quem define a senha de
 * verdade é o corretor, pelo link. Criar sem senha alguma impediria gerar o
 * link de redefinição depois.
 */
/* --- Envio de e-mail ------------------------------------------------------
 *
 * Agnóstico de provedor: qualquer SMTP serve (Gmail com senha de app, Brevo,
 * Resend, Zoho, o servidor do próprio domínio). Trocar de provedor é trocar as
 * variáveis do .env, sem tocar em código.
 *
 * Sem SMTP configurado, o sistema NÃO quebra: segue gerando o link e registra
 * no log que não havia canal. Isso mantém o servidor de pé enquanto o domínio
 * definitivo não é contratado.
 */
let transporteEmail: Transporter | null = null;
let transporteResolvido = false;

function obterTransporte(): Transporter | null {
  if (transporteResolvido) return transporteEmail;
  transporteResolvido = true;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn("[Email] SMTP não configurado — nenhum e-mail será enviado.");
    return null;
  }

  const port = Number(process.env.SMTP_PORT || 587);
  transporteEmail = nodemailer.createTransport({
    host,
    port,
    // 465 é TLS implícito; 587 sobe para TLS via STARTTLS.
    secure: String(process.env.SMTP_SECURE || "").trim() === "1" || port === 465,
    auth: { user, pass },
  });

  console.log(`[Email] SMTP configurado host=${host} porta=${port}`);
  return transporteEmail;
}

/**
 * Envia o mesmo conteúdo para cada destino, um a um.
 *
 * Separado de propósito: um endereço morto na base não pode impedir a entrega
 * nos outros, e um e-mail único com três destinatários mostraria a cada caixa
 * os outros endereços do corretor.
 *
 * Nunca lança: falha de e-mail não pode virar erro 500 para o corretor, senão
 * a resposta deixaria de ser genérica e passaria a revelar quem tem cadastro.
 */
async function enviarEmails(destinos: string[], conteudo: ConteudoEmail, contexto: string): Promise<number> {
  const transporte = obterTransporte();
  if (!transporte || destinos.length === 0) return 0;

  const remetente = process.env.SMTP_FROM || process.env.SMTP_USER || "";
  let enviados = 0;

  for (const destino of destinos) {
    try {
      await transporte.sendMail({
        from: remetente,
        to: destino,
        subject: conteudo.assunto,
        text: conteudo.texto,
        html: conteudo.html,
      });
      enviados++;
    } catch (err: any) {
      // Só o domínio no log: o endereço completo é dado pessoal.
      const dominio = destino.split("@")[1] || "?";
      console.error(`[Email] Falha no envio ${contexto} dominio=${dominio}: ${err.message}`);
    }
  }

  return enviados;
}

/**
 * Senha inicial descartável, que ninguém nunca vê — quem define a senha de
 * verdade é o corretor, pelo link.
 *
 * O sufixo fixo garante as três classes exigidas pela política do Console
 * (minúscula, maiúscula e número), que o alfabeto do base64url não assegura.
 * Ele não enfraquece nada: a entropia continua vindo dos 32 bytes aleatórios.
 */
function senhaInicialDescartavel(): string {
  const senha = crypto.randomBytes(32).toString("base64url") + "aA1";
  // Falha fechada: se algum dia a política do Console ficar mais exigente que
  // esta função, é melhor estourar aqui do que criar contas que o corretor não
  // consegue ativar.
  if (!atendePoliticaSenha(senha)) {
    throw new Error("Senha inicial gerada não atende à política de senha.");
  }
  return senha;
}

async function prepararCredencial(cpfNormalizado: string): Promise<{ uid: string; link: string } | null> {
  const identificador = emailSinteticoDoCpf(cpfNormalizado, DOMINIO_CREDENCIAL);
  if (!identificador) return null;

  const auth = getAuth();
  let uid: string;

  try {
    const existente = await auth.getUserByEmail(identificador);
    uid = existente.uid;
  } catch (err: any) {
    if (err?.code !== "auth/user-not-found") throw err;
    const criado = await auth.createUser({
      email: identificador,
      emailVerified: false,
      password: senhaInicialDescartavel(),
    });
    uid = criado.uid;
    console.log(`[AuthSenha] Credencial criada uid=${uid} cpf=${maskCpf(cpfNormalizado)}`);
  }

  const link = await auth.generatePasswordResetLink(identificador);
  return { uid, link };
}

/**
 * Registra a intenção de ativação. O vínculo corretor<->conta NÃO é criado
 * aqui de propósito: enquanto o login Google segue ligado, criar o vínculo
 * antes de o corretor definir a senha ocuparia o CPF e faria o fluxo antigo
 * responder 409 para quem ainda usa o Google.
 *
 * O vínculo é fechado em POST /api/auth/ativar-vinculo, no primeiro login com
 * senha — usando a identidade que JÁ foi conferida aqui contra o MariaDB.
 */
async function registrarPendencia(uid: string, cpfNormalizado: string, nome: string) {
  await firestore().collection("registro_pendente").doc(uid).set({
    cpf: cpfNormalizado,
    nome,
    criadoEm: FieldValue.serverTimestamp(),
  });
}

/**
 * POST /api/auth/register-request
 * Primeiro acesso. Público, com rate limit e resposta sempre genérica.
 */
app.post("/api/auth/register-request", senhaLimiter, async (req, res) => {
  if (!AUTH_SENHA_ATIVA) {
    return res.status(503).json({ error: "Cadastro por senha ainda não está disponível." });
  }

  const { nome, dataNascimento, cpf } = req.body || {};
  if (!nome || !dataNascimento || !cpf) {
    return res.status(400).json({ error: "Informe nome, data de nascimento e CPF." });
  }

  try {
    const rows = await fetchCorretoresAtivos();
    const encontrado = rows.find((row: any) => matchCorretor(row, { nome, dataNascimento, cpf }));

    // Dados não conferem: mesma resposta do caminho feliz, mesmo custo de
    // consulta ao banco. Só o log sabe a diferença.
    if (!encontrado) {
      console.warn(`[AuthSenha] Cadastro negado cpf=${maskCpf(String(cpf))} ip=${req.ip}`);
      return res.status(200).json(RESPOSTA_GENERICA);
    }

    const alvoCpf = normalizeCPF(String(cpf));
    const preparada = await prepararCredencial(alvoCpf);
    if (!preparada) {
      console.warn(`[AuthSenha] CPF inválido para identificador ip=${req.ip}`);
      return res.status(200).json(RESPOSTA_GENERICA);
    }

    const nomeBase = String(encontrado.nome || encontrado.NOME || encontrado.nome_corretor || "");
    await registrarPendencia(preparada.uid, alvoCpf, nomeBase);

    // Decisão de 2026-07-31: envia para TODOS os e-mails do cadastro, em vez
    // de perguntar ao corretor qual é o dele — a pergunta entregaria o dado a
    // quem só sabe CPF, nome e nascimento.
    const destinos = emailsDoCorretor(encontrado);

    if (destinos.length === 0) {
      // 3 dos 91 corretores ativos estão nessa situação (Task 0). Não é erro
      // de sistema: é cadastro incompleto, que o administrativo precisa
      // corrigir no CRM antes de o corretor conseguir entrar.
      console.warn(`[AuthSenha] Corretor sem e-mail no cadastro cpf=${maskCpf(alvoCpf)}`);
    }

    const enviados = await enviarEmails(
      destinos,
      emailPrimeiroAcesso(nomeBase, preparada.link),
      "primeiro-acesso",
    );
    console.log(
      `[AuthSenha] Primeiro acesso cpf=${maskCpf(alvoCpf)} uid=${preparada.uid} destinos=${destinos.length} enviados=${enviados}`,
    );
    if (LOG_LINK_ATIVACAO) console.log(`[AuthSenha][DEBUG] ${preparada.link}`);

    return res.status(200).json(RESPOSTA_GENERICA);
  } catch (err: any) {
    console.error("[AuthSenha] Erro no cadastro:", err.message);
    return res.status(500).json({ error: "Erro ao processar a solicitação. Tente novamente." });
  }
});

/**
 * POST /api/auth/reset-request
 * Recuperação de senha. Só o CPF é pedido; o destino sai da base, nunca da tela.
 */
app.post("/api/auth/reset-request", senhaLimiter, async (req, res) => {
  if (!AUTH_SENHA_ATIVA) {
    return res.status(503).json({ error: "Recuperação de senha ainda não está disponível." });
  }

  const { cpf } = req.body || {};
  if (!cpf) return res.status(400).json({ error: "Informe o CPF." });

  try {
    const alvoCpf = normalizeCPF(String(cpf));
    const rows = await fetchCorretoresAtivos();

    // Corretor precisa estar ATIVO: desligado no CRM não recupera acesso.
    const linha = acharPorCpf(rows, alvoCpf);
    if (!linha) {
      console.warn(`[AuthSenha] Reset negado cpf=${maskCpf(String(cpf))} ip=${req.ip}`);
      return res.status(200).json(RESPOSTA_GENERICA);
    }

    const destinos = emailsDoCorretor(linha);

    const identificador = emailSinteticoDoCpf(alvoCpf, DOMINIO_CREDENCIAL);
    if (!identificador) return res.status(200).json(RESPOSTA_GENERICA);

    try {
      const link = await getAuth().generatePasswordResetLink(identificador);
      const nomeBase = String(linha.nome || linha.NOME || linha.nome_corretor || "");
      const enviados = await enviarEmails(destinos, emailRecuperacaoSenha(nomeBase, link), "recuperacao");
      console.log(
        `[AuthSenha] Recuperação cpf=${maskCpf(alvoCpf)} destinos=${destinos.length} enviados=${enviados}`,
      );
      if (LOG_LINK_ATIVACAO) console.log(`[AuthSenha][DEBUG] ${link}`);
    } catch (err: any) {
      // Corretor ativo que nunca se cadastrou cai aqui. Não é erro: a resposta
      // genérica já não revela se a conta existe.
      if (err?.code !== "auth/user-not-found") throw err;
      console.warn(`[AuthSenha] Reset para conta inexistente cpf=${maskCpf(alvoCpf)}`);
    }

    return res.status(200).json(RESPOSTA_GENERICA);
  } catch (err: any) {
    console.error("[AuthSenha] Erro na recuperação:", err.message);
    return res.status(500).json({ error: "Erro ao processar a solicitação. Tente novamente." });
  }
});

/**
 * POST /api/auth/ativar-vinculo
 * Fecha o vínculo no primeiro login com senha, sem pedir os dados de novo.
 *
 * Exige autenticação: só quem já provou posse do link (definiu a senha e
 * entrou) chega aqui. A identidade em si foi conferida no register-request.
 */
app.post("/api/auth/ativar-vinculo", dualAuthMiddleware, async (req, res) => {
  if (!AUTH_SENHA_ATIVA) {
    return res.status(503).json({ error: "Indisponível." });
  }

  const user = (req as any).user as DecodedIdToken | undefined;
  if (!user) return res.status(401).json({ error: "Autenticação necessária." });

  try {
    const db = firestore();

    const jaVinculado = await getBinding(user.uid);
    if (jaVinculado) {
      const linha = acharPorCpf(await fetchCorretoresAtivos(), jaVinculado.cpf);
      if (!linha) return res.status(403).json({ error: "Cadastro de corretor inativo.", inactive: true });
      return res.status(200).json({ bound: true, broker: mapCorretor(linha) });
    }

    const pendenteSnap = await db.collection("registro_pendente").doc(user.uid).get();
    if (!pendenteSnap.exists) {
      return res.status(403).json({ error: "Nenhum cadastro pendente para esta conta.", needsBinding: true });
    }

    const pendente = pendenteSnap.data() || {};
    const alvoCpf = String(pendente.cpf || "");

    const linha = acharPorCpf(await fetchCorretoresAtivos(), alvoCpf);
    if (!linha) return res.status(403).json({ error: "Cadastro de corretor inativo.", inactive: true });

    const corretorRef = db.collection("corretor_bindings").doc(alvoCpf);
    const userRef = db.collection("user_bindings").doc(user.uid);

    const resultado = await db.runTransaction<{ ok: boolean; erro?: string }>(async (tx) => {
      const conflito = await tx.get(corretorRef);
      if (conflito.exists && conflito.data()?.uid !== user.uid) {
        return { ok: false, erro: "Este corretor já está vinculado a outra conta." };
      }
      tx.set(corretorRef, { uid: user.uid, boundAt: FieldValue.serverTimestamp() });
      tx.set(userRef, {
        cpf: alvoCpf,
        nome: String(pendente.nome || ""),
        email: user.email || null,
        boundAt: FieldValue.serverTimestamp(),
      });
      tx.delete(pendenteSnap.ref);
      return { ok: true };
    });

    if (!resultado.ok) {
      console.warn(`[AuthSenha] Vínculo em conflito uid=${user.uid}`);
      return res.status(409).json({ error: resultado.erro });
    }

    console.log(`[AuthSenha] Vínculo criado por senha uid=${user.uid} cpf=${maskCpf(alvoCpf)}`);
    return res.status(200).json({ bound: true, broker: mapCorretor(linha) });
  } catch (err: any) {
    console.error("[AuthSenha] Erro ao ativar vínculo:", err.message);
    return res.status(500).json({ error: "Erro ao concluir o cadastro. Tente novamente." });
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
 * Chave de integração servidor-a-servidor (INTEGRATION_API_KEY).
 *
 * Existe para que o backend do app parceiro possa pedir um código de acesso
 * SEM receber a chave de service account do Firebase. Aquela chave é
 * administrador total do projeto: leria e escreveria todas as comissões,
 * todos os CPFs, todos os vínculos, e poderia emitir token de autenticação
 * se passando por qualquer usuário — além de ignorar as security rules.
 * Entregá-la a um terceiro para que ele apenas gere um código de 1 minuto
 * é desproporcional.
 *
 * Esta chave permite exatamente UMA operação: emitir código de acesso.
 * Nenhuma leitura de dado, nenhum acesso ao banco, revogável trocando a
 * variável de ambiente sem mexer em mais nada.
 */
function integrationKeyIsValid(recebida: unknown): boolean {
  const esperada = process.env.INTEGRATION_API_KEY || "";
  // Falha fechada: sem chave configurada, esta via simplesmente não existe.
  if (esperada.length < 32) return false;
  if (typeof recebida !== "string" || recebida.length === 0) return false;

  const a = Buffer.from(recebida);
  const b = Buffer.from(esperada);
  // Comparação em tempo constante: comparar com === permitiria descobrir a
  // chave caractere por caractere medindo o tempo de resposta.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Emissão de código é uma operação privilegiada; limita abuso mesmo com
// credencial válida (ex.: chave vazada gerando códigos em massa).
const mintLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas emissões de código. Tente novamente em instantes." },
  statusCode: 429,
});

/**
 * POST /api/access-tokens
 * Emite um código de acesso de uso único (válido por 1 minuto).
 *
 * Duas vias de autorização:
 * 1. X-Integration-Key — backend do app parceiro (servidor-a-servidor).
 * 2. Firebase ID Token de conta ADMIN — usado pela tela /gerar-codigo.
 */
app.post("/api/access-tokens", mintLimiter, async (req, res) => {
  const chaveIntegracao = req.headers["x-integration-key"];
  const viaIntegracao = integrationKeyIsValid(chaveIntegracao);

  let emissor = "integracao";
  let emissorUid: string | null = null;

  if (!viaIntegracao) {
    // Sem chave de integração válida: exige admin autenticado.
    // dualAuthMiddleware é async e, ao negar, responde 401 sem chamar next().
    // Basta aguardá-lo e checar se a resposta já saiu — encapsular em Promise
    // que só resolve no next() travaria a requisição no caminho negado.
    await dualAuthMiddleware(req, res, () => {});
    if (res.headersSent) return;

    const user = (req as any).user as DecodedIdToken | undefined;
    if (!user || !isUserAllowed(user)) {
      return res.status(403).json({ error: "Acesso negado: conta não autorizada." });
    }
    emissor = "admin";
    emissorUid = user.uid;
  }

  try {
    const uuid = crypto.randomUUID().replace(/-/g, "");
    const tokenId = `token_${uuid}`;

    const db = firestore();
    await db.collection("access_tokens").doc(tokenId).set({
      createdAt: FieldValue.serverTimestamp(),
      createdBy: emissorUid,
      createdVia: emissor,
    });

    console.log(`[AccessTokens] Código emitido via=${emissor} token=${tokenId}`);
    return res.status(200).json({ tokenId });
  } catch (err: any) {
    console.error("[AccessTokens] Erro ao emitir código de acesso:", err);
    return res.status(500).json({ error: "Erro interno ao emitir código de acesso." });
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
      // Uso único de verdade: nenhuma sessão é emitida. Consumir este token
      // concede acesso apenas ao carregamento de página atual (estado em
      // memória no React); uma recarga exige um token novo do app.
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
