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
    nodejs: `// Nenhum SDK necessário. Nenhuma credencial do Firebase.
// Você recebe de nós uma CHAVE DE INTEGRACAO e guarda no seu servidor
// (variável de ambiente). Ela só serve para pedir um código de acesso.

const PORTAL = "${window.location.origin}";
const CHAVE = process.env.ANTECIPA_INTEGRATION_KEY; // NUNCA no app/cliente

/**
 * Pede um código de acesso de uso único ao Portal Antecipa.
 * @returns {Promise<string>} URL para carregar na Webview
 */
async function gerarLinkAcesso() {
  const resposta = await fetch(\`\${PORTAL}/api/access-tokens\`, {
    method: "POST",
    headers: { "X-Integration-Key": CHAVE }
  });

  if (!resposta.ok) {
    throw new Error(\`Portal recusou a emissao: HTTP \${resposta.status}\`);
  }

  const { tokenId } = await resposta.json();
  return \`\${PORTAL}/?token=\${tokenId}\`;
}

// IMPORTANTE: chame esta funcao a CADA abertura da tela do portal,
// nao apenas na primeira vez. O codigo vale 1 minuto e e de uso unico.`,

    python: `# Nenhum SDK necessario. Nenhuma credencial do Firebase.
# Voce recebe de nos uma CHAVE DE INTEGRACAO e guarda no seu servidor.

import os
import requests

PORTAL = "${window.location.origin}"
CHAVE = os.environ["ANTECIPA_INTEGRATION_KEY"]  # NUNCA no app/cliente

def gerar_link_acesso():
    """Pede um codigo de acesso de uso unico ao Portal Antecipa."""
    resposta = requests.post(
        f"{PORTAL}/api/access-tokens",
        headers={"X-Integration-Key": CHAVE},
        timeout=10,
    )
    resposta.raise_for_status()

    token_id = resposta.json()["tokenId"]
    return f"{PORTAL}/?token={token_id}"

# IMPORTANTE: chame esta funcao a CADA abertura da tela do portal,
# nao apenas na primeira vez. O codigo vale 1 minuto e e de uso unico.`,

    php: `<?php
// Nenhum SDK necessario. Nenhuma credencial do Firebase.
// Voce recebe de nos uma CHAVE DE INTEGRACAO e guarda no seu servidor.

/**
 * Pede um codigo de acesso de uso unico ao Portal Antecipa.
 */
function gerarLinkAcesso() {
    $portal = "${window.location.origin}";
    $chave  = getenv('ANTECIPA_INTEGRATION_KEY'); // NUNCA no app/cliente

    $ch = curl_init("$portal/api/access-tokens");
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_HTTPHEADER     => ["X-Integration-Key: $chave"],
    ]);

    $corpo  = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($status !== 200) {
        throw new Exception("Portal recusou a emissao: HTTP $status");
    }

    $tokenId = json_decode($corpo, true)['tokenId'];
    return "$portal/?token=$tokenId";
}

// IMPORTANTE: chame esta funcao a CADA abertura da tela do portal,
// nao apenas na primeira vez. O codigo vale 1 minuto e e de uso unico.`,

    bitrix: `/*
  INTEGRACAO VIA FLUXO DE AUTOMACAO NO BITRIX24
*/

1. Guarde a CHAVE DE INTEGRACAO no seu servidor (nunca no Bitrix, nunca
   no app, nunca em campo de Deal).

2. Crie uma rota na sua API corporativa, ex: /api/gerar-link-portal
   Ela chama o Portal Antecipa conforme os exemplos das abas acima.

3. Quando precisar do link, o Bitrix24 chama a SUA rota via webhook de
   saida ou robo de automacao (RPA/Business Process).

4. ATENCAO: nao guarde o link em campo de Deal para uso posterior.
   O codigo expira em 1 minuto e e de uso unico — um link salvo ja
   estara invalido quando alguem clicar nele.

   Em vez disso, o botao "Abrir Portal" deve chamar a sua rota NO MOMENTO
   DO CLIQUE e usar o link recem-gerado.`
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
Seu servidor chama <code>POST /api/access-tokens</code> com o header <code>X-Integration-Key</code>. <strong>Quem gera o código é o nosso servidor</strong> — você não precisa de SDK, de banco de dados nem de credencial do Firebase.
              </p>
            </div>

            <div className={cn(
              "p-5 border rounded-sm space-y-2 relative overflow-hidden",
              theme === 'dark' ? "bg-white/[0.02] border-white/5" : "bg-white border-slate-100 shadow-sm"
            )}>
              <div className="flex items-center gap-2.5 text-xs font-semibold">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-bold">2</span>
                <span>Resposta com o Código</span>
              </div>
              <p className={cn(
                "text-[11px] leading-relaxed",
                theme === 'dark' ? "text-white/50" : "text-slate-500"
              )}>
                Respondemos <code>&#123; "tokenId": "token_..." &#125;</code>. O registro e a expiração ficam do nosso lado — nada disso é responsabilidade sua.
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
              A integração é uma única chamada HTTP autenticada por um header. Não pedimos — e você não deve aceitar — nenhuma credencial de banco de dados ou do Firebase: a chave de integração permite <strong>apenas emitir códigos de acesso</strong>, e é revogável a qualquer momento sem afetar o resto do sistema.
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
              <span>Contrato da API</span>
            </h2>
            <p className={cn(
              "text-xs leading-relaxed mb-4",
              theme === 'dark' ? "text-white/50" : "text-slate-500"
            )}>
              Um único endpoint. A chave vai no header, sempre a partir do seu <strong>servidor</strong> — nunca do app ou do navegador, onde ela ficaria exposta.
            </p>

            <pre className={cn(
              "p-4 rounded-sm font-mono text-[10px] leading-relaxed overflow-x-auto",
              theme === 'dark' ? "bg-black/40 text-emerald-400/80 border border-white/5" : "bg-slate-50 text-emerald-700 border border-slate-100"
            )}>
{`POST ${window.location.origin}/api/access-tokens
X-Integration-Key: <sua-chave-de-integracao>

200 OK
{ "tokenId": "token_a1b2c3..." }

401  chave ausente ou invalida
429  limite de emissoes excedido (30/min)

Depois: abra ${window.location.origin}/?token=<tokenId>
Validade: 1 minuto, uso unico.`}
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
                  <span className={theme === 'dark' ? "text-white/70" : "text-slate-600"}>Receber a chave de integração (solicite ao responsável).</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check size={14} className="text-emerald-500" />
                  <span className={theme === 'dark' ? "text-white/70" : "text-slate-600"}>Um endpoint no seu servidor que faça a chamada e guarde a chave.</span>
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
