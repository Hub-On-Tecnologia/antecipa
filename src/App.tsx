/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LogOut, Shield, LogIn, ArrowRight, Sun, Moon, Lock, ShieldAlert, Key, Sparkles, Loader2, RefreshCw, Terminal } from 'lucide-react';
import LoginForm from './components/LoginForm';
import Dashboard from './components/Dashboard';
import InstitutionalPage from './components/InstitutionalPage';
import TutorialPage from './components/TutorialPage';
import QAPanel from './components/QAPanel';
import { UserAuth } from './services/bitrixService';
import { cn } from './lib/utils';
import { auth, onAuthStateChanged, signInWithGoogle, User } from './services/firebaseService';

export default function App() {
  const [userAuthData, setUserAuthData] = useState<UserAuth | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isValidatingToken, setIsValidatingToken] = useState(false);
  const [isGeneratingToken, setIsGeneratingToken] = useState(false);
  const [isQAPanelOpen, setIsQAPanelOpen] = useState(false);
  const [currentView, setCurrentView] = useState<'main' | 'institutional'>('main');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('antecipa_theme') as 'light' | 'dark') || 'dark';
  });

  const [isGeneratorMode] = useState<boolean>(() => {
    const path = window.location.pathname.replace(/\/$/, "");
    return path === '/qa' || path === '/gerar-codigo' || path === '/gerar-token' || window.location.search.includes('qa=true') || window.location.hash === '#/qa';
  });

  const [isTutorialMode] = useState<boolean>(() => {
    const path = window.location.pathname.replace(/\/$/, "");
    return path === '/tutorial-integracao' || path === '/tutorial' || path === '/docs' || window.location.hash === '#/tutorial';
  });

  const [isAccessAllowed, setIsAccessAllowed] = useState<boolean>(false);

  // Check de UX para exibir/bloquear a interface do gerador
  const [isCheckingAllowlist, setIsCheckingAllowlist] = useState<boolean>(false);
  const [isAllowlistApproved, setIsAllowlistApproved] = useState<boolean | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Portão de acesso: sessão existente primeiro, token de uso único depois (RS-08).
  // Quem decide é sempre o servidor — o cookie de sessão é httpOnly e assinado,
  // então o cliente não consegue ler nem forjar.
  useEffect(() => {
    let cancelled = false;

    async function openGate() {
      if (isAccessAllowed) return;

      setIsValidatingToken(true);
      try {
        // 1. Já existe sessão válida? É isto que faz recarregar a WebView
        //    (ou voltar para o app) não derrubar o usuário.
        const sessionRes = await fetch('/api/session', { credentials: 'same-origin' });
        if (sessionRes.ok) {
          const session = await sessionRes.json();
          if (session.valid) {
            if (!cancelled) setIsAccessAllowed(true);
            return;
          }
        }

        // 2. Sem sessão: exige o token de uso único vindo do app.
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token') || params.get('ref') || params.get('src');
        if (!token) return;

        const response = await fetch('/api/access-tokens/consume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ tokenId: token }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.valid) {
            if (!cancelled) setIsAccessAllowed(true);
            // O token já foi consumido: tira da barra de endereços para não
            // ficar no histórico do navegador nem vazar via header Referer.
            window.history.replaceState({}, document.title, window.location.pathname);
            return;
          }
          console.warn('Token de acesso inválido ou expirado:', data.error);
        } else {
          console.warn('Falha na validação do token (HTTP status):', response.status);
        }
      } catch (err) {
        console.error('Erro ao abrir o portão de acesso:', err);
      } finally {
        if (!cancelled) setIsValidatingToken(false);
      }
    }

    openGate();
    return () => {
      cancelled = true;
    };
  }, [isAccessAllowed]);

  // Check de UX para verificar se o usuário Firebase atual está na allowlist antes de mostrar a UI do gerador
  useEffect(() => {
    async function checkUserAllowlist() {
      if (!firebaseUser || !isGeneratorMode || isAccessAllowed) {
        setIsAllowlistApproved(null);
        return;
      }
      setIsCheckingAllowlist(true);
      try {
        const idToken = await firebaseUser.getIdToken();
        // Este check é UX, não segurança. A fronteira real é a allowlist em POST /api/access-tokens. Nunca confiar apenas neste retorno.
        const res = await fetch('/api/access-tokens/verify-user', {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          setIsAllowlistApproved(data.allowed === true);
        } else {
          setIsAllowlistApproved(false);
        }
      } catch (err) {
        console.error('Erro ao verificar allowlist para UX:', err);
        setIsAllowlistApproved(false);
      } finally {
        setIsCheckingAllowlist(false);
      }
    }

    checkUserAllowlist();
  }, [firebaseUser, isGeneratorMode, isAccessAllowed]);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('antecipa_theme', newTheme);
  };

  const handleLoginSuccess = (userInfo: UserAuth) => {
    setUserAuthData(userInfo);
  };

  const handleLogout = () => {
    setUserAuthData(null);
    auth.signOut();
  };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Falha no login Google', error);
    }
  };

  // Emissão de token no servidor via POST /api/access-tokens
  const handleGenerateAndRedirect = async () => {
    if (!firebaseUser) {
      alert('Sessão expirada. Faça login com o Google primeiro.');
      return;
    }
    setIsGeneratingToken(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      const res = await fetch('/api/access-tokens', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Erro HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.tokenId) {
        window.location.href = `${window.location.origin}/?token=${data.tokenId}`;
      } else {
        throw new Error('Servidor não retornou tokenId.');
      }
    } catch (err: any) {
      console.error('Erro ao gerar token via servidor:', err);
      alert(`Erro ao gerar token: ${err.message || 'Falha na comunicação com o servidor.'}`);
    } finally {
      setIsGeneratingToken(false);
    }
  };

  if (isTutorialMode) {
    return <TutorialPage theme={theme} toggleTheme={toggleTheme} />;
  }

  if (authLoading || isValidatingToken) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center gap-4">
        <Shield className="animate-pulse text-white/20" size={48} />
        {isValidatingToken && (
          <span className="text-[10px] uppercase tracking-[0.3em] text-white/40 animate-pulse font-bold">
            Validando Token de Acesso...
          </span>
        )}
      </div>
    );
  }

  if (!isAccessAllowed) {
    if (isGeneratorMode) {
      return (
        <div className={cn(
          "min-h-screen font-sans flex flex-col items-center justify-center p-6 transition-colors duration-300 w-full relative overflow-hidden",
          theme === 'dark' ? "bg-[#0A0A0A] text-white" : "bg-[#F4F4F6] text-slate-900"
        )}>
          {/* Theme Toggle */}
          <div className="absolute top-6 right-6 z-20">
            <button
              onClick={toggleTheme}
              className={cn(
                "p-3 border rounded-sm transition-all active:scale-95 flex items-center justify-center",
                theme === 'dark' 
                  ? "border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white" 
                  : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-900 shadow-sm"
              )}
              title={theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>

          <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px] pointer-events-none" />

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "w-full max-w-lg rounded-sm p-8 md:p-10 relative overflow-hidden border shadow-2xl transition-all duration-300 z-10 text-center",
              theme === 'dark' 
                ? "bg-[#111111]/90 border-white/5" 
                : "bg-white border-slate-200"
            )}
          >
            {/* Se o usuário NÃO estiver logado no Firebase, exibe Login obrigatório primeiro (DoD) */}
            {!firebaseUser ? (
              <div className="space-y-6">
                <div className="flex justify-center mb-2">
                  <div className={cn(
                    "p-4 rounded-full relative flex items-center justify-center transition-colors",
                    theme === 'dark' ? "bg-amber-500/10 text-amber-500" : "bg-amber-50 text-amber-500"
                  )}>
                    <Lock size={32} strokeWidth={1.5} />
                  </div>
                </div>
                <div className="space-y-2">
                  <span className="text-[9px] uppercase tracking-[0.4em] font-bold text-amber-500 block">
                    AUTENTICAÇÃO NECESSÁRIA
                  </span>
                  <h1 className="text-2xl font-light uppercase tracking-tight">
                    Login de <span className="font-semibold">Gerador</span>
                  </h1>
                  <p className={cn(
                    "text-xs leading-relaxed max-w-md mx-auto",
                    theme === 'dark' ? "text-white/55" : "text-slate-500"
                  )}>
                    Você deve fazer login com sua conta Google corporativa autorizada antes de gerar tokens de acesso.
                  </p>
                </div>
                <button
                  onClick={handleGoogleSignIn}
                  className="w-full py-5 font-bold uppercase tracking-[0.2em] text-[11px] bg-white text-black hover:bg-white/90 transition-all flex items-center justify-center gap-3 rounded-sm shadow-lg"
                >
                  <LogIn size={16} />
                  <span>Login com Google</span>
                </button>
              </div>
            ) : isCheckingAllowlist ? (
              <div className="py-12 space-y-4">
                <Loader2 className="animate-spin mx-auto text-emerald-500" size={32} />
                <span className="text-[10px] uppercase tracking-[0.3em] font-bold text-white/50 block">
                  Verificando Permissões...
                </span>
              </div>
            ) : isAllowlistApproved === false ? (
              <div className="space-y-6">
                <div className="flex justify-center mb-2">
                  <div className={cn(
                    "p-4 rounded-full relative flex items-center justify-center transition-colors",
                    theme === 'dark' ? "bg-rose-500/10 text-rose-500" : "bg-rose-50 text-rose-500"
                  )}>
                    <ShieldAlert size={32} strokeWidth={1.5} />
                  </div>
                </div>
                <div className="space-y-2">
                  <span className="text-[9px] uppercase tracking-[0.4em] font-bold text-rose-500 block">
                    ACESSO NEGADO • ALLOWLIST
                  </span>
                  <h1 className="text-2xl font-light uppercase tracking-tight">
                    Conta não <span className="font-semibold">Autorizada</span>
                  </h1>
                  <p className={cn(
                    "text-xs leading-relaxed max-w-md mx-auto",
                    theme === 'dark' ? "text-white/55" : "text-slate-500"
                  )}>
                    A conta <strong>{firebaseUser.email}</strong> não consta na lista de usuários autorizados a gerar tokens de acesso ao portal.
                  </p>
                </div>
                <button
                  onClick={handleLogout}
                  className={cn(
                    "w-full py-3 border text-[10px] uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-2 rounded-sm",
                    theme === 'dark'
                      ? "border-white/10 text-white/50 hover:bg-white/5 hover:text-white"
                      : "border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                  )}
                >
                  <LogOut size={12} />
                  <span>Desconectar e Trocar de Conta</span>
                </button>
              </div>
            ) : (
              /* Usuário autenticado e aprovado na allowlist: exibe a interface do Gerador */
              <>
                {/* Top glowing QA Icon */}
                <div className="flex justify-center mb-6">
                  <div className={cn(
                    "p-4 rounded-full relative flex items-center justify-center transition-colors",
                    theme === 'dark' ? "bg-emerald-500/10 text-emerald-500" : "bg-emerald-50 text-emerald-500"
                  )}>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500/20 opacity-75"></span>
                    <Sparkles size={32} strokeWidth={1.5} />
                  </div>
                </div>

                <div className="space-y-3 mb-6">
                  <span className={cn(
                    "text-[9px] uppercase tracking-[0.4em] font-bold block",
                    theme === 'dark' ? "text-emerald-400" : "text-emerald-500"
                  )}>
                    MÓDULO DE INTEGRAÇÃO • SIMULADOR
                  </span>
                  <h1 className="text-2xl font-light uppercase tracking-tight">
                    Gerador de <span className="font-semibold">Link de Acesso</span>
                  </h1>
                  <p className={cn(
                    "text-xs leading-relaxed max-w-md mx-auto",
                    theme === 'dark' ? "text-white/55" : "text-slate-500"
                  )}>
                    Gere chaves de acesso temporárias de uso único para simular a abertura segura do portal a partir de sistemas integrados (ex: CRM, Bitrix24, ERP).
                  </p>
                </div>

                {/* Steps & Instructions */}
                <div className={cn(
                  "border-t border-b py-6 my-6 space-y-4 text-left text-xs",
                  theme === 'dark' ? "border-white/5" : "border-slate-100"
                )}>
                  <h3 className="font-semibold uppercase tracking-wider text-[10px] opacity-75">Como funciona o fluxo de produção:</h3>
                  <ul className="space-y-3">
                    <li className="flex gap-3">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-bold shrink-0">1</span>
                      <span className={theme === 'dark' ? "text-white/70" : "text-slate-600"}>
                        Ao clicar no botão, o servidor gera uma chave temporária segura com fonte criptográfica.
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-bold shrink-0">2</span>
                      <span className={theme === 'dark' ? "text-white/70" : "text-slate-600"}>
                        O sistema redireciona para a raiz com a query param <code>?token=...</code>. O portal valida no servidor e a <strong>deleta do banco de dados imediatamente</strong>.
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-bold shrink-0">3</span>
                      <span className={theme === 'dark' ? "text-white/70" : "text-slate-600"}>
                        A chave expira em <strong>1 minuto</strong>. Se tentar reutilizar o mesmo link, o acesso será negado.
                      </span>
                    </li>
                  </ul>
                </div>

                {/* Action Buttons */}
                <div className="space-y-4">
                  <button
                    onClick={handleGenerateAndRedirect}
                    disabled={isGeneratingToken}
                    className={cn(
                      "w-full py-5 font-bold uppercase tracking-[0.2em] text-[11px] transition-all flex items-center justify-center gap-3 rounded-sm",
                      isGeneratingToken
                        ? "bg-white/10 text-white/40 cursor-not-allowed"
                        : theme === 'dark'
                          ? "bg-white text-black hover:bg-white/90 active:scale-[0.99] shadow-lg"
                          : "bg-[#0A0A0A] text-white hover:bg-black/90 active:scale-[0.99] shadow-md"
                    )}
                  >
                    {isGeneratingToken ? (
                      <>
                        <Loader2 className="animate-spin" size={16} />
                        <span>Gerando Chave Segura no Servidor...</span>
                      </>
                    ) : (
                      <>
                        <Key size={16} />
                        <span>Gerar Código & Acessar Portal</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      sessionStorage.clear();
                      window.location.href = window.location.origin;
                    }}
                    className={cn(
                      "w-full py-3 border text-[10px] uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-2 rounded-sm",
                      theme === 'dark'
                        ? "border-white/10 text-white/50 hover:bg-white/5 hover:text-white"
                        : "border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                    )}
                  >
                    <RefreshCw size={12} />
                    <span>Limpar Sessão Ativa / Bloquear Acesso</span>
                  </button>
                </div>

                <div className={cn(
                  "pt-6 border-t text-[9px] uppercase tracking-wider text-center font-semibold mt-6 opacity-30",
                  theme === 'dark' ? "border-white/5 text-white/80" : "border-slate-100 text-slate-700"
                )}>
                  <span>Módulo de Integração • Server-Side Access Tokens</span>
                </div>
              </>
            )}
          </motion.div>
        </div>
      );
    }

    return (
      <div className={cn(
        "min-h-screen font-sans flex flex-col items-center justify-center p-6 transition-colors duration-300 w-full relative overflow-hidden",
        theme === 'dark' ? "bg-[#0A0A0A] text-white" : "bg-[#F4F4F6] text-slate-900"
      )}>
        {/* Theme Toggle in Lock Screen */}
        <div className="absolute top-6 right-6 z-20">
          <button
            onClick={toggleTheme}
            className={cn(
              "p-3 border rounded-sm transition-all active:scale-95 flex items-center justify-center",
              theme === 'dark' 
                ? "border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white" 
                : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-900 shadow-sm"
            )}
            title={theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>

        {/* Decorative Grid Background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px] pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            "w-full max-w-md rounded-sm p-8 md:p-10 relative overflow-hidden border shadow-2xl transition-all duration-300 z-10 text-center",
            theme === 'dark' 
              ? "bg-[#111111]/90 border-white/5" 
              : "bg-white border-slate-200"
          )}
        >
          {/* Top glowing Lock Icon */}
          <div className="flex justify-center mb-6">
            <div className={cn(
              "p-4 rounded-full relative flex items-center justify-center transition-colors",
              theme === 'dark' ? "bg-rose-500/10 text-rose-500" : "bg-rose-50 text-rose-500"
            )}>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500/20 opacity-75"></span>
              <Lock size={32} strokeWidth={1.5} />
            </div>
          </div>

          <div className="space-y-3 mb-6">
            <span className={cn(
              "text-[9px] uppercase tracking-[0.4em] font-bold block",
              theme === 'dark' ? "text-rose-400" : "text-rose-500"
            )}>
              AMBIENTE DE ACESSO RESTRITO
            </span>
            <h1 className="text-2xl font-light uppercase tracking-tight">
              Acesso <span className="font-semibold">Bloqueado</span>
            </h1>
            <p className={cn(
              "text-xs leading-relaxed",
              theme === 'dark' ? "text-white/55" : "text-slate-500"
            )}>
              Este sistema é de uso corporativo restrito e só pode ser aberto diretamente a partir das ferramentas autorizadas e integradas no ecossistema da nossa empresa.
            </p>
          </div>

          <div className={cn(
            "border-t pt-6 space-y-4 text-left",
            theme === 'dark' ? "border-white/5" : "border-slate-100"
          )}>
            <div className="flex items-start gap-3">
              <ShieldAlert className="text-amber-500 shrink-0 mt-0.5" size={16} />
              <div>
                <h4 className="text-[10px] uppercase tracking-widest font-bold">Aviso de Segurança</h4>
                <p className={cn(
                  "text-[11px] leading-relaxed mt-1",
                  theme === 'dark' ? "text-white/40" : "text-slate-500"
                )}>
                  A fim de preservar a integridade das operações e sincronizar as negociações com total confidencialidade, visitas diretas e acessos avulsos através do navegador web comum são restritos por segurança.
                </p>
              </div>
            </div>

            <div className={cn(
              "pt-4 border-t text-[9px] uppercase tracking-wider text-center font-semibold flex flex-col md:flex-row items-center justify-center gap-1 opacity-40",
              theme === 'dark' ? "border-white/5 text-white/80" : "border-slate-100 text-slate-700"
            )}>
              <span>Antecipa Soluções Financeiras</span>
              <span className="hidden md:inline">•</span>
              <span>CNPJ: 12.670.349/0001-10</span>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  const isFullyAuthenticated = firebaseUser && userAuthData;

  return (
    <div className={cn(
      "min-h-screen font-sans overflow-hidden flex flex-col md:flex-row transition-colors duration-300 w-full",
      theme === 'dark' || !isFullyAuthenticated 
        ? "bg-[#0A0A0A] text-white selection:bg-white/20 selection:text-white" 
        : "bg-[#F4F4F6] text-slate-900 selection:bg-slate-200 selection:text-slate-900"
    )}>
      {/* Decorative Background Elements */}
      <div className="fixed top-0 right-0 p-8 z-0 pointer-events-none opacity-20 hidden md:block">
        <div className="text-[10px] font-mono text-white/40 rotate-90 origin-right tracking-widest leading-none">
          LAT: -23.5505 | LONG: -46.6333
        </div>
      </div>
      
      <AnimatePresence mode="wait">
        {currentView === 'institutional' ? (
          <motion.div
            key="institutional"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full"
          >
            <InstitutionalPage onBack={() => setCurrentView('main')} />
          </motion.div>
        ) : !isFullyAuthenticated ? (
          <motion.div
            key="login-layout"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col md:flex-row w-full h-full min-h-screen"
          >
            {/* Left Sidebar / Brand Pane */}
            <div className="w-full md:w-[600px] bg-white border-r border-black/5 p-6 sm:p-12 md:p-16 flex flex-col justify-between shrink-0">
              <div className="flex items-center">
                <img 
                  src="https://i.postimg.cc/T3gMF7f5/ANTECIPA-LOGO-1-removebg-preview.png" 
                  alt="Antecipa Logo" 
                  className="h-20 sm:h-24 w-auto object-contain" 
                  referrerPolicy="no-referrer"
                />
              </div>
              
              <div className="my-8 sm:my-12 md:my-0">
                <motion.h1 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-[32px] sm:text-[42px] md:text-[54px] font-light leading-[1.1] mb-6 sm:mb-8 tracking-tight text-black uppercase"
                >
                  Acesso<br/><span className="font-semibold text-black/30 italic uppercase">Seguro</span><br/>Sincronizado.
                </motion.h1>
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
                  <div className="hidden sm:block h-1 w-12 bg-black opacity-20"></div>
                  <button 
                    onClick={() => setCurrentView('institutional')}
                    className="text-[10px] font-bold uppercase tracking-[0.3em] text-black/40 hover:text-black transition-all flex items-center gap-2 group border-b border-black/5 hover:border-black/20 pb-1"
                  >
                    Sobre Nós & Contato
                    <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                {!firebaseUser ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-4 text-[10px] font-bold tracking-widest text-amber-600">
                      <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
                      <span>CONEXÃO SEGURA PENDENTE</span>
                    </div>
                    <button 
                      onClick={handleGoogleSignIn}
                      className="flex items-center justify-center gap-3 bg-[#0A0A0A] text-white py-5 text-[10px] uppercase tracking-[0.3em] font-bold rounded-sm border border-black hover:bg-black/90 transition-all shadow-[0_10px_40px_rgba(0,0,0,0.1)] group"
                    >
                      <LogIn size={14} className="group-hover:translate-x-1 transition-transform" />
                      Login com Google
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-4 text-[10px] font-bold tracking-widest text-emerald-600">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span>GOOGLE AUTH: CONECTADO</span>
                  </div>
                )}
                 <p className="text-[10px] uppercase tracking-[0.2em] text-black/25 leading-relaxed font-medium">
                  Acesso restrito ao quadro de colaboradores. A autenticação Google é necessária para sincronização em tempo real.
                </p>
                
                <div className="pt-4 border-t border-black/5 flex flex-col gap-0.5 text-[9px] text-black/30 font-semibold uppercase tracking-wider">
                  <span>Antecipa Soluções Financeiras</span>
                  <span>CNPJ: 12.670.349/0001-10</span>
                </div>
              </div>
            </div>

            {/* Main Login Pane */}
            <div className="flex-1 flex items-center justify-center p-6 sm:p-12 md:p-20 bg-[#0A0A0A]">
              <div className={!firebaseUser ? 'opacity-20 pointer-events-none grayscale' : ''}>
                 <LoginForm onLoginSuccess={handleLoginSuccess} />
                 {!firebaseUser && (
                   <div className="mt-8 text-center bg-white/5 border border-white/10 p-6 rounded-sm">
                     <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">Faça login com Google primeiro para liberar o formulário.</p>
                   </div>
                 )}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="dashboard-layout"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "flex-1 flex flex-col items-center justify-center p-3 sm:p-6 min-h-screen relative z-10 transition-colors duration-300",
              theme === 'dark' ? "bg-[#0A0A0A] text-white" : "bg-[#F4F4F6] text-slate-900"
            )}
          >
            <div className={cn(
              "w-full max-w-5xl rounded-sm p-4 sm:p-8 md:p-16 relative overflow-hidden transition-all duration-300",
              theme === 'dark' ? "bg-[#111111] border border-white/5" : "bg-white border border-slate-200/80 shadow-[0_8px_30px_rgb(0,0,0,0.02)]"
            )}>
              {/* Absolutes for style */}
              <div className={cn(
                "absolute top-0 right-0 p-4 sm:p-12 opacity-[0.03] transition-all duration-300",
                theme === 'dark' ? "text-white" : "text-slate-950"
              )}>
                <Shield size={320} strokeWidth={0.5} />
              </div>

              <div className="relative z-10">
                <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10 md:mb-16">
                  <div>
                    <span className={cn(
                      "text-[10px] uppercase tracking-[0.4em] font-bold mb-3 sm:mb-4 block",
                      theme === 'dark' ? "text-white/40" : "text-slate-400"
                    )}>
                      Operações Sincronizadas
                    </span>
                    <h1 className={cn(
                      "text-3xl sm:text-4xl md:text-6xl font-light uppercase tracking-tight",
                      theme === 'dark' ? "text-white" : "text-slate-900"
                    )}>
                      Painel <span className={cn(
                        "font-semibold uppercase ml-1 sm:ml-2",
                        theme === 'dark' ? "text-white" : "text-slate-950"
                      )}>{userAuthData.nome.split(' ')[0]}</span>
                    </h1>
                    {userAuthData.allFields && (
                      <div className="mt-3 sm:mt-4 flex flex-wrap gap-1.5 sm:gap-2">
                         {userAuthData.allFields['Empresa'] && (
                           <span className={cn(
                             "text-[9px] sm:text-[10px] px-1.5 py-0.5 sm:px-2 sm:py-1 font-bold uppercase tracking-widest border transition-colors",
                             theme === 'dark' 
                               ? "bg-white/5 border-white/10 text-white/50" 
                               : "bg-slate-100 border-slate-250 text-slate-600"
                           )}>
                             {userAuthData.allFields['Empresa']}
                           </span>
                         )}
                         {userAuthData.allFields['Cargo'] && (
                           <span className={cn(
                             "text-[9px] sm:text-[10px] px-1.5 py-0.5 sm:px-2 sm:py-1 font-bold uppercase tracking-widest border transition-colors",
                             theme === 'dark'
                               ? "bg-amber-500/10 border-amber-500/20 text-amber-500"
                               : "bg-amber-50 border-amber-300/40 text-amber-700 font-semibold"
                           )}>
                             {userAuthData.allFields['Cargo']}
                           </span>
                         )}
                         {userAuthData.allFields['Superintendência'] && (
                           <span className={cn(
                             "text-[9px] sm:text-[10px] px-1.5 py-0.5 sm:px-2 sm:py-1 font-bold uppercase tracking-widest border transition-colors",
                             theme === 'dark'
                               ? "bg-blue-500/10 border-blue-500/20 text-blue-500"
                               : "bg-blue-50 border-blue-300/40 text-blue-700 font-semibold"
                           )}>
                             {userAuthData.allFields['Superintendência']}
                           </span>
                         )}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4 shrink-0 w-full lg:w-auto">
                    {isGeneratorMode && (
                      <button
                        onClick={() => setIsQAPanelOpen(true)}
                        className={cn(
                          "flex-1 sm:flex-initial flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold transition-all py-2.5 px-4 sm:py-3 sm:px-5 border rounded-sm active:scale-95",
                          theme === 'dark' 
                            ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-400 hover:bg-emerald-500/15" 
                            : "border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 shadow-sm"
                        )}
                        title="Painel de Diagnóstico e QA Bitrix24"
                      >
                        <Terminal size={14} />
                        Diagnóstico & QA
                      </button>
                    )}

                    <button
                      onClick={toggleTheme}
                      className={cn(
                        "p-2.5 sm:p-3 border rounded-sm transition-all active:scale-95 flex items-center justify-center",
                        theme === 'dark' 
                          ? "border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white" 
                          : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-900 shadow-sm"
                      )}
                      aria-label="Alternar Tema"
                      title={theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
                    >
                      {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                    </button>

                    <button 
                      onClick={handleLogout}
                      className={cn(
                        "flex-1 sm:flex-initial flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold transition-all py-2.5 px-4 sm:py-3 sm:px-6 border rounded-sm active:scale-95",
                        theme === 'dark'
                          ? "border-white/10 bg-white/5 text-white/30 hover:bg-white/10 hover:text-white"
                          : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-950 shadow-sm"
                      )}
                    >
                      <LogOut size={14} />
                      Finalizar Sessão
                    </button>
                  </div>
                </header>

                <Dashboard 
                  userInfo={userAuthData} 
                  firebaseUserId={firebaseUser.uid} 
                  firebaseUserEmail={firebaseUser.email || ''} 
                  theme={theme}
                />

                {isQAPanelOpen && userAuthData && (
                  <QAPanel 
                    isOpen={isQAPanelOpen}
                    onClose={() => setIsQAPanelOpen(false)}
                    userInfo={userAuthData}
                    theme={theme}
                  />
                )}
              </div>
            </div>

            <div className={cn(
              "mt-12 flex gap-12 border-t pt-8 w-full max-w-5xl justify-between transition-colors duration-300",
              theme === 'dark' ? "border-white/5" : "border-slate-200"
            )}>
               <div className="flex gap-8">
                 <span className={cn(
                   "text-[9px] uppercase tracking-[0.2em] transition-colors cursor-pointer",
                   theme === 'dark' ? "text-white/20 hover:text-white/40" : "text-slate-400 hover:text-slate-600"
                 )}>
                   Segurança Ativa
                 </span>
                 <span className={cn(
                   "text-[9px] uppercase tracking-[0.2em] transition-colors cursor-pointer",
                   theme === 'dark' ? "text-white/20 hover:text-white/40" : "text-slate-400 hover:text-slate-600"
                 )}>
                   {firebaseUser.email}
                 </span>
               </div>
               <span className={cn(
                 "text-[9px] uppercase tracking-[0.2em] font-mono",
                 theme === 'dark' ? "text-white/10" : "text-slate-300"
               )}>
                 ID: {firebaseUser.uid.slice(0, 8)}...
               </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

