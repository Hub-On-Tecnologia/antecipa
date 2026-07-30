import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Code, 
  Copy, 
  Check, 
  ExternalLink, 
  ShieldCheck, 
  ArrowRight, 
  Lock, 
  Server, 
  Terminal, 
  Smartphone, 
  Globe,
  Sun,
  Moon,
  Home,
  BookOpen,
  Settings
} from 'lucide-react';
import { cn } from '../lib/utils';

interface TutorialPageProps {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

type TabType = 'nodejs' | 'python' | 'php' | 'bitrix';

export default function TutorialPage({ theme, toggleTheme }: TutorialPageProps) {
  const [activeTab, setActiveTab] = useState<TabType>('nodejs');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const codeSnippets = {
    nodejs: `// 1. Instale o SDK do Firebase Admin
// npm install firebase-admin

const admin = require("firebase-admin");
const crypto = require("crypto");

// Inicialize o SDK (Use as credenciais do seu projeto)
admin.initializeApp({
  credential: admin.credential.applicationDefault() // Ou use serviceAccountKey.json
});

// ATENCAO: este projeto usa um Firestore NOMEADO, nao o banco "(default)".
// Sem passar o databaseId o SDK aponta para "(default)" e toda gravacao falha
// com NOT_FOUND.
const DATABASE_ID = "${import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || '(default)'}";
const db = admin.firestore(undefined, DATABASE_ID);

/**
 * Gera um link de acesso temporário e seguro para o Portal Antecipa
 * @returns {Promise<string>} URL de acesso de uso único
 */
async function gerarLinkAcesso() {
  // 1. Gera um identificador aleatorio CRIPTOGRAFICO.
  //    Nao use Math.random(): ele e previsivel e um token adivinhavel
  //    permitiria abrir o portal sem passar pelo app.
  const token = "token_" + crypto.randomBytes(16).toString("hex");
  
  // 2. Registra o token no Firestore com data de criação do servidor
  const tokenRef = db.collection("access_tokens").doc(token);
  await tokenRef.set({
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // 3. Monta a URL de redirecionamento do seu Webview
  const baseUrl = "${window.location.origin}";
  return \`\${baseUrl}/?token=\${token}\`;
}`,
    python: `# 1. Instale o SDK do Firebase Admin
# pip install firebase-admin

import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore
import secrets

# Inicialize o SDK
cred = credentials.ApplicationDefault()
firebase_admin.initialize_app(cred)

# ATENCAO: este projeto usa um Firestore NOMEADO, nao o banco "(default)".
# Sem informar o database_id o SDK aponta para "(default)" e toda gravacao
# falha com NOT_FOUND.
DATABASE_ID = "${import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || '(default)'}"
db = firestore.client(database_id=DATABASE_ID)

def gerar_link_acesso():
    # 1. Gera um token aleatório seguro de 16 bytes (hex)
    token = "token_" + secrets.token_hex(12)
    
    # 2. Registra no Firestore com o timestamp do servidor
    token_ref = db.collection("access_tokens").document(token)
    token_ref.set({
        "createdAt": firestore.SERVER_TIMESTAMP
    })
    
    # 3. Retorna a URL para carregar no Webview
    base_url = "${window.location.origin}"
    return f"{base_url}/?token={token}"`,
    php: `<?php
// 1. Instale a biblioteca do Firestore via Composer
// composer require google/cloud-firestore

use Google\\Cloud\\Firestore\\FirestoreClient;
use Google\\Cloud\\Firestore\\FieldValue;

/**
 * Gera o link seguro para abrir a Webview do Portal
 */
function gerarLinkAcesso() {
    // ATENCAO: informe o database — este projeto usa um Firestore NOMEADO,
    // nao o banco "(default)".
    $db = new FirestoreClient([
        'projectId' => '${import.meta.env.VITE_FIREBASE_PROJECT_ID || 'gen-lang-client-0436981001'}',
        'database' => '${import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || '(default)'}'
    ]);

    // 1. Gera um token aleatório seguro de uso único
    $token = "token_" . bin2hex(random_bytes(12));

    // 2. Grava no Firestore com o timestamp do SERVIDOR.
    //    Com new DateTime() valeria o relogio da sua maquina: qualquer
    //    defasagem faz o token nascer expirado ou durar mais de 1 minuto.
    $tokenRef = $db->collection('access_tokens')->document($token);
    $tokenRef->set([
        'createdAt' => FieldValue::serverTimestamp()
    ]);

    // 3. Monta e retorna o link de acesso seguro
    $baseUrl = "${window.location.origin}";
    return $baseUrl . "/?token=" . $token;
}`,
    bitrix: `/*
  INTEGRAÇÃO VIA FLUXO DE AUTOMAÇÃO NO BITRIX24
  Você pode automatizar a geração no Bitrix24 usando um webhook de saída 
  ou um robô de automação (RPA/Business Process) que chama sua própria API:
*/

1. Crie uma rota na sua API corporativa (ex: /api/gerar-link-portal)
2. Quando um negócio (Deal) for ganho, faça o Bitrix24 chamar sua API via webhook.
3. Sua API gera o token seguro via SDK do Firebase (ver abas acima).
4. Sua API atualiza o campo do Deal no Bitrix24 com o link gerado:
   
   POST https://seu-dominio-bitrix.com/rest/crm.deal.update
   {
     "id": 12345,
     "fields": {
       "UF_CRM_LINK_PORTAL": "https://seu-portal-antecipa.com/?token=token_abc123"
     }
   }

5. No aplicativo mobile ou CRM, ao clicar no botão "Abrir Portal", 
   basta carregar essa URL de uso único.`
  };

  return (
    <div className={cn(
      "min-h-screen font-sans transition-colors duration-300 w-full relative pb-20",
      theme === 'dark' ? "bg-[#0A0A0A] text-white" : "bg-[#F4F4F6] text-slate-900"
    )}>
      {/* Decorative background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px] pointer-events-none" />

      {/* Header Bar */}
      <header className={cn(
        "sticky top-0 z-30 backdrop-blur-md border-b transition-colors duration-300",
        theme === 'dark' ? "bg-[#0A0A0A]/80 border-white/5" : "bg-[#F4F4F6]/80 border-slate-200"
      )}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-sm bg-emerald-500/10 text-emerald-500">
              <ShieldCheck size={20} />
            </div>
            <div>
              <span className="text-[10px] tracking-[0.2em] uppercase font-bold opacity-40 block">Guia de Integração</span>
              <span className="text-sm font-semibold tracking-tight uppercase">Antecipa Portal</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Voltar para o Portal */}
            <button
              onClick={() => window.location.href = window.location.origin}
              className={cn(
                "px-4 py-2 border text-xs uppercase tracking-wider rounded-sm transition-all active:scale-95 flex items-center gap-2 font-semibold",
                theme === 'dark' 
                  ? "border-white/10 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white" 
                  : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 shadow-sm"
              )}
            >
              <Home size={12} />
              <span>Ir para o Portal</span>
            </button>

            {/* Gerador de testes */}
            <button
              onClick={() => window.location.href = `${window.location.origin}/gerar-codigo`}
              className={cn(
                "px-4 py-2 text-xs uppercase tracking-wider rounded-sm transition-all active:scale-95 flex items-center gap-2 font-bold",
                theme === 'dark' 
                  ? "bg-emerald-500 hover:bg-emerald-600 text-black" 
                  : "bg-[#0A0A0A] hover:bg-black text-white"
              )}
            >
              <span>Testar Simulador</span>
              <ArrowRight size={12} />
            </button>

            {/* Theme Switcher */}
            <button
              onClick={toggleTheme}
              className={cn(
                "p-2.5 border rounded-sm transition-all active:scale-95 flex items-center justify-center",
                theme === 'dark' 
                  ? "border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white" 
                  : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              )}
              title={theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-6 pt-12 grid grid-cols-1 lg:grid-cols-3 gap-12 relative z-10">
        
        {/* Left Column: Conceptual Guidance */}
        <div className="lg:col-span-1 space-y-8">
          <div>
            <span className={cn(
              "text-[9px] uppercase tracking-[0.3em] font-bold px-2 py-1 rounded-sm",
              theme === 'dark' ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-600"
            )}>
              SEGURANÇA DE PRODUÇÃO
            </span>
            <h1 className="text-3xl font-light tracking-tight uppercase mt-4 mb-3">
              Fluxo de <span className="font-semibold">Uso Único</span>
            </h1>
            <p className={cn(
              "text-xs leading-relaxed",
              theme === 'dark' ? "text-white/60" : "text-slate-500"
            )}>
              Para evitar o vazamento de chaves ou login manual de credenciais no Webview do app móvel ou CRM, implementamos o conceito de <strong>Token Temporário Expirável</strong>.
            </p>
          </div>

          {/* Core Concept Breakdown */}
          <div className="space-y-4">
            <h3 className="text-xs uppercase tracking-wider font-bold opacity-60">Como funciona o fluxo?</h3>
            
            {/* Step cards */}
            <div className={cn(
              "p-5 border rounded-sm space-y-2 relative overflow-hidden",
              theme === 'dark' ? "bg-white/[0.02] border-white/5" : "bg-white border-slate-100 shadow-sm"
            )}>
              <div className="flex items-center gap-2.5 text-xs font-semibold">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-bold">1</span>
                <span>Geração em Ambiente Seguro</span>
              </div>
              <p className={cn(
                "text-[11px] leading-relaxed",
                theme === 'dark' ? "text-white/50" : "text-slate-500"
              )}>
                Seu servidor de backend (fora do cliente) gera uma string aleatória segura (ex: <code>token_A1b2C3d4...</code>).
              </p>
            </div>

            <div className={cn(
              "p-5 border rounded-sm space-y-2 relative overflow-hidden",
              theme === 'dark' ? "bg-white/[0.02] border-white/5" : "bg-white border-slate-100 shadow-sm"
            )}>
              <div className="flex items-center gap-2.5 text-xs font-semibold">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-bold">2</span>
                <span>Registro no Banco Firestore</span>
              </div>
              <p className={cn(
                "text-[11px] leading-relaxed",
                theme === 'dark' ? "text-white/50" : "text-slate-500"
              )}>
                O servidor registra essa chave no documento <code>access_tokens/&#123;token_id&#125;</code> com o campo <code>createdAt</code> preenchido com a data do servidor do Firebase.
              </p>
            </div>

            <div className={cn(
              "p-5 border rounded-sm space-y-2 relative overflow-hidden",
              theme === 'dark' ? "bg-white/[0.02] border-white/5" : "bg-white border-slate-100 shadow-sm"
            )}>
              <div className="flex items-center gap-2.5 text-xs font-semibold">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-bold">3</span>
                <span>Entrada no Webview (Uso Único)</span>
              </div>
              <p className={cn(
                "text-[11px] leading-relaxed",
                theme === 'dark' ? "text-white/50" : "text-slate-500"
              )}>
                Ao carregar a URL com o parâmetro <code>?token=...</code>, o Portal valida o tempo decorrido (máx 1 minuto) e <strong>deleta o registro imediatamente</strong>. <strong>Não existe sessão persistente</strong>: qualquer recarga da tela do portal exige um token novo. Seu app deve chamar <code>gerarLinkAcesso()</code> toda vez que abrir ou recarregar essa tela — não apenas na primeira vez.
              </p>
            </div>
          </div>

          {/* Avisos críticos de integração */}
          <div className={cn(
            "p-5 rounded-sm border space-y-4",
            theme === 'dark' ? "bg-amber-500/[0.03] border-amber-500/20" : "bg-amber-50 border-amber-200"
          )}>
            <h4 className="text-xs font-bold text-amber-500 uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck size={12} />
              <span>Teste isto antes de finalizar a integração</span>
            </h4>

            <div className="space-y-1.5">
              <p className={cn("text-[11px] font-semibold", theme === 'dark' ? "text-white/80" : "text-slate-700")}>
                1. Login do Google dentro da sua Webview
              </p>
              <p className={cn(
                "text-[11px] leading-relaxed",
                theme === 'dark' ? "text-white/50" : "text-slate-500"
              )}>
                O corretor faz login com a conta Google <strong>dentro</strong> da tela do portal. Por política própria do Google (anti-phishing), esse login pode ser <strong>bloqueado</strong> se o Google detectar uma Webview genérica embutida (Android <code>WebView</code> / iOS <code>WKWebView</code> puros) — o corretor veria algo como "Este navegador ou app pode não ser seguro", mesmo com o portal funcionando corretamente. Teste esse passo cedo. Se travar, abra essa etapa numa <strong>Custom Tab</strong> (Android) ou <strong>SFSafariViewController</strong> (iOS) em vez da Webview pura.
              </p>
            </div>

            <div className="space-y-1.5">
              <p className={cn("text-[11px] font-semibold", theme === 'dark' ? "text-white/80" : "text-slate-700")}>
                2. Token novo a cada abertura da tela
              </p>
              <p className={cn(
                "text-[11px] leading-relaxed",
                theme === 'dark' ? "text-white/50" : "text-slate-500"
              )}>
                Não existe sessão de longa duração no servidor. Se o app reabrir a tela do portal (inclusive após voltar de segundo plano) carregando a mesma URL já usada, o corretor será bloqueado. Gere um link novo toda vez.
              </p>
            </div>

            <div className="space-y-1.5">
              <p className={cn("text-[11px] font-semibold", theme === 'dark' ? "text-white/80" : "text-slate-700")}>
                3. Próxima fase: App Check (ainda não obrigatório)
              </p>
              <p className={cn(
                "text-[11px] leading-relaxed",
                theme === 'dark' ? "text-white/50" : "text-slate-500"
              )}>
                Vamos exigir futuramente o Firebase App Check (Play Integrity no Android, App Attest no iOS) para atestar que o acesso vem do app genuíno. Não é necessário hoje, mas evite decisões de arquitetura na Webview que dificultem adicionar isso depois.
              </p>
            </div>
          </div>

          {/* Quick FAQ */}
          <div className={cn(
            "p-5 rounded-sm border",
            theme === 'dark' ? "bg-emerald-500/[0.02] border-emerald-500/10" : "bg-emerald-50/20 border-emerald-500/10"
          )}>
            <h4 className="text-xs font-bold text-emerald-500 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Lock size={12} />
              <span>Dica do Desenvolvedor</span>
            </h4>
            <p className={cn(
              "text-[11px] leading-relaxed",
              theme === 'dark' ? "text-white/60" : "text-slate-600"
                )}>
              Pergunte ao seu desenvolvedor se ele já possui o Firebase configurado em outro sistema. Se sim, ele só precisará adicionar uma função no servidor dele para inserir o código. O portal tratará de deletar e autenticar!
            </p>
          </div>
        </div>

        {/* Right Column (2 spans): Code Examples and Documentation */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Code block selector */}
          <div className={cn(
            "p-6 border rounded-sm transition-all duration-300",
            theme === 'dark' ? "bg-[#111]/90 border-white/5" : "bg-white border-slate-200 shadow-lg"
          )}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-lg font-semibold uppercase tracking-tight flex items-center gap-2">
                  <Code size={16} className="text-emerald-500" />
                  <span>Código de Exemplo Prático</span>
                </h2>
                <p className={cn(
                  "text-xs mt-1",
                  theme === 'dark' ? "text-white/50" : "text-slate-500"
                )}>
                  Selecione a linguagem do seu servidor de backend ou aplicativo para integrar:
                </p>
              </div>

              {/* Tabs list */}
              <div className={cn(
                "p-1 rounded-sm flex items-center gap-1 self-start",
                theme === 'dark' ? "bg-white/5" : "bg-slate-100"
              )}>
                {(['nodejs', 'python', 'php', 'bitrix'] as TabType[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      "px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider rounded-sm transition-all",
                      activeTab === tab
                        ? theme === 'dark'
                          ? "bg-white text-black shadow-md"
                          : "bg-white text-slate-900 shadow-sm"
                        : theme === 'dark'
                          ? "text-white/55 hover:text-white hover:bg-white/5"
                          : "text-slate-500 hover:text-slate-900 hover:bg-slate-200/50"
                    )}
                  >
                    {tab === 'nodejs' && 'Node.js'}
                    {tab === 'python' && 'Python'}
                    {tab === 'php' && 'PHP'}
                    {tab === 'bitrix' && 'Bitrix24'}
                  </button>
                ))}
              </div>
            </div>

            {/* Code view panel */}
            <div className="relative">
              {/* Copy action */}
              <button
                onClick={() => handleCopy(codeSnippets[activeTab], activeTab)}
                className={cn(
                  "absolute top-4 right-4 z-10 p-2 border rounded-sm transition-all active:scale-95 flex items-center justify-center gap-1.5",
                  theme === 'dark' 
                    ? "border-white/10 bg-[#1e1e1e] hover:bg-[#2e2e2e] text-white/50 hover:text-white" 
                    : "border-slate-200 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-900 shadow-sm"
                )}
                title="Copiar código"
              >
                {copiedText === activeTab ? (
                  <>
                    <Check size={12} className="text-emerald-500" />
                    <span className="text-[9px] uppercase font-bold text-emerald-500">Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy size={12} />
                    <span className="text-[9px] uppercase font-bold">Copiar</span>
                  </>
                )}
              </button>

              {/* Code element */}
              <pre className={cn(
                "p-5 rounded-sm font-mono text-[11px] leading-relaxed overflow-x-auto max-h-[480px]",
                theme === 'dark' ? "bg-black/40 text-white/80 border border-white/5" : "bg-slate-50 text-slate-800 border border-slate-100"
              )}>
                <code>
                  {codeSnippets[activeTab]}
                </code>
              </pre>
            </div>
          </div>

          {/* Firestore Security Rules Guidance */}
          <div className={cn(
            "p-6 border rounded-sm",
            theme === 'dark' ? "bg-[#111]/90 border-white/5" : "bg-white border-slate-200 shadow-sm"
          )}>
            <h2 className="text-sm font-semibold uppercase tracking-wider mb-3 flex items-center gap-2">
              <Terminal size={14} className="text-emerald-500" />
              <span>Regras de Segurança do Firebase</span>
            </h2>
            <p className={cn(
              "text-xs leading-relaxed mb-4",
              theme === 'dark' ? "text-white/50" : "text-slate-500"
            )}>
              Para segurança máxima e conformidade, o cliente web não possui nenhuma permissão direta sobre a coleção <code>access_tokens</code>. As regras de segurança do seu Firestore (<code>firestore.rules</code>) negam todo o acesso do cliente, pois o ciclo de vida é gerenciado exclusivamente via servidor / Firebase Admin SDK ou endpoint <code>POST /api/access-tokens</code>:
            </p>

            <pre className={cn(
              "p-4 rounded-sm font-mono text-[10px] leading-relaxed overflow-x-auto",
              theme === 'dark' ? "bg-black/40 text-emerald-400/80 border border-white/5" : "bg-slate-50 text-emerald-700 border border-slate-100"
            )}>
{`match /access_tokens/{tokenId} {
  // Nega todo o acesso direto do cliente (Admin SDK ignora as regras no servidor)
  allow get, list, create, update, delete: if false;
}`}
            </pre>
          </div>

          {/* Useful checklist */}
          <div className={cn(
            "p-6 border rounded-sm grid grid-cols-1 md:grid-cols-2 gap-6",
            theme === 'dark' ? "bg-[#111]/90 border-white/5" : "bg-white border-slate-200 shadow-sm"
          )}>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider opacity-60 mb-3">Requisitos do Desenvolvedor</h4>
              <ul className="space-y-2 text-xs">
                <li className="flex items-center gap-2">
                  <Check size={14} className="text-emerald-500" />
                  <span className={theme === 'dark' ? "text-white/70" : "text-slate-600"}>Possuir conta ativa no Firebase Console.</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check size={14} className="text-emerald-500" />
                  <span className={theme === 'dark' ? "text-white/70" : "text-slate-600"}>Chave JSON do Service Account do Firebase.</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check size={14} className="text-emerald-500" />
                  <span className={theme === 'dark' ? "text-white/70" : "text-slate-600"}>Configurar o Webview do App com a URL do portal.</span>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider opacity-60 mb-3">Como Validar a Integração</h4>
              <ul className="space-y-2 text-xs">
                <li className="flex items-center gap-2">
                  <Check size={14} className="text-emerald-500" />
                  <span className={theme === 'dark' ? "text-white/70" : "text-slate-600"}>Use o nosso <a href="/gerar-codigo" className="underline text-emerald-500 hover:text-emerald-400">Simulador de Link</a>.</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check size={14} className="text-emerald-500" />
                  <span className={theme === 'dark' ? "text-white/70" : "text-slate-600"}>Verifique se o token é consumido e some do banco.</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check size={14} className="text-emerald-500" />
                  <span className={theme === 'dark' ? "text-white/70" : "text-slate-600"}>Confirme que recarregar a tela barra o acesso (é o esperado).</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check size={14} className="text-emerald-500" />
                  <span className={theme === 'dark' ? "text-white/70" : "text-slate-600"}><strong>Teste o login Google dentro da sua Webview real</strong>, não só no navegador do computador.</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check size={14} className="text-emerald-500" />
                  <span className={theme === 'dark' ? "text-white/70" : "text-slate-600"}>Confirme que a tela gera link novo mesmo ao reabrir do zero.</span>
                </li>
              </ul>
            </div>
          </div>

        </div>

      </main>
    </div>
  );
}
