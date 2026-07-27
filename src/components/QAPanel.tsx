import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Search, RefreshCw, X, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, Database, ShieldCheck, Copy, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { PV_FIELD, BITRIX_FIELDS, secureBitrixFetch, parseBitrixCurrency } from '../services/bitrixService';

interface QAPanelProps {
  isOpen: boolean;
  onClose: () => void;
  userInfo: {
    nome: string;
    cpf: string;
    dataNascimento?: string;
  };
  theme?: 'dark' | 'light';
}

export default function QAPanel({ isOpen, onClose, userInfo, theme = 'dark' }: QAPanelProps) {
  // Configuration Status State
  const [envStatus, setEnvStatus] = useState<{
    isPlaceholder: boolean;
    listUrlMasked: string;
    writeUrlMasked: string;
    loading: boolean;
  }>({
    isPlaceholder: false,
    listUrlMasked: '',
    writeUrlMasked: '',
    loading: true
  });

  useEffect(() => {
    async function checkEnv() {
      try {
        const res = await fetch('/api/bitrix/debug');
        if (res.ok && !res.headers.get("content-type")?.includes("text/html")) {
          const data = await res.json();
          const isPl = data.isPlaceholder || data.writeUrlMasked.includes('seu-dominio') || data.listUrlMasked.includes('seu-dominio') || !data.writeUrlMasked || data.writeUrlMasked === 'not defined';
          setEnvStatus({
            isPlaceholder: isPl,
            listUrlMasked: data.listUrlMasked,
            writeUrlMasked: data.writeUrlMasked,
            loading: false
          });
        } else {
          // Fallback para variáveis de ambiente locais do cliente (caso o backend esteja inacessível / Vercel SPA)
          const clientWriteUrl = import.meta.env.VITE_BITRIX_WEBHOOK_WRITE_URL || "";
          const clientListUrl = import.meta.env.VITE_BITRIX_LIST_URL || "";
          const isPl = !clientWriteUrl || !clientListUrl || 
                       clientWriteUrl.includes('seu-dominio') || clientListUrl.includes('seu-dominio') ||
                       clientWriteUrl.includes('USER_ID') || clientListUrl.includes('USER_ID');
          
          const mask = (url: string) => {
            if (!url) return 'não configurado';
            try {
              const u = new URL(url);
              return `${u.protocol}//${u.host}/.../${u.pathname.split('/').pop()}`;
            } catch {
              return url.substring(0, 25) + '...';
            }
          };

          setEnvStatus({
            isPlaceholder: isPl,
            listUrlMasked: mask(clientListUrl),
            writeUrlMasked: mask(clientWriteUrl),
            loading: false
          });
        }
      } catch (err) {
        console.error('Error checking env debug:', err);
        // Fallback local em caso de erro
        const clientWriteUrl = import.meta.env.VITE_BITRIX_WEBHOOK_WRITE_URL || "";
        const clientListUrl = import.meta.env.VITE_BITRIX_LIST_URL || "";
        const isPl = !clientWriteUrl || !clientListUrl || 
                     clientWriteUrl.includes('seu-dominio') || clientListUrl.includes('seu-dominio');
        setEnvStatus({
          isPlaceholder: isPl,
          listUrlMasked: clientListUrl ? 'Configurado (Client)' : 'Não configurado',
          writeUrlMasked: clientWriteUrl ? 'Configurado (Client)' : 'Não configurado',
          loading: false
        });
      }
    }
    checkEnv();
  }, [isOpen]);

  // Step 1: Write state
  const [testPvId, setTestPvId] = useState(() => `QA-${Math.floor(1000 + Math.random() * 9000)}`);
  const [testValor, setTestValor] = useState('12500.00');
  const [testCliente, setTestCliente] = useState('QA Teste Cliente Ltda');
  const [sendLoading, setSendLoading] = useState(false);
  const [sendResult, setSendResult] = useState<any | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showSendPayload, setShowSendPayload] = useState(false);

  // Step 2: Read state
  const [readDealId, setReadDealId] = useState('');
  const [readLoading, setReadLoading] = useState(false);
  const [readResult, setReadResult] = useState<any | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [showReadPayload, setShowReadPayload] = useState(false);

  // Utility states
  const [copiedId, setCopiedId] = useState(false);

  if (!isOpen) return null;

  // Execute Step 1: Send Deal to Bitrix24
  const handleSendTestDeal = async () => {
    setSendLoading(true);
    setSendResult(null);
    setSendError(null);

    const title = `QA TEST - Portal Antecipação - PV ${testPvId}`;
    let comments = `=== TESTE DE CONTROLE DE QUALIDADE (QA) ===\n`;
    comments += `ID PV TESTE: ${testPvId}\n`;
    comments += `CLIENTE: ${testCliente}\n`;
    comments += `VALOR ORIGINAL: R$ ${parseFloat(testValor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
    comments += `SOLICITANTE QA: ${userInfo.nome}\n`;
    comments += `DATA DO TESTE: ${new Date().toLocaleString('pt-BR')}\n`;
    comments += `==========================================`;

    const payload = {
      fields: {
        TITLE: title,
        CATEGORY_ID: 89, // Categoria padrão de Antecipação
        COMMENTS: comments,
        [PV_FIELD]: testPvId,
        OPPORTUNITY: parseFloat(testValor),
        CURRENCY_ID: 'BRL',
        [BITRIX_FIELDS.VALOR_LIBERADO]: parseFloat(testValor) * 0.9, // 90% simulação
        [BITRIX_FIELDS.OBSERVACOES]: "Negociação gerada via Painel de QA Diagnóstico"
      }
    };

    try {
      const response = await secureBitrixFetch('/api/bitrix/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        let errMsg = errText;
        try {
          const parsed = JSON.parse(errText);
          errMsg = parsed.error || parsed.message || errText;
        } catch {
          // fallback to raw
        }
        throw new Error(errMsg || 'Falha na requisição para o proxy de escrita.');
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      setSendResult({
        payload,
        response: data,
        dealId: data.result
      });

      // Auto populate step 2
      if (data.result) {
        setReadDealId(String(data.result));
      }
    } catch (err: any) {
      console.error('Erro no envio de teste QA:', err);
      setSendError(err.message || 'Erro desconhecido ao tentar enviar para o Bitrix24.');
    } finally {
      setSendLoading(false);
    }
  };

  // Execute Step 2: Read Deal from Bitrix24
  const handleReadDeal = async () => {
    if (!readDealId.trim()) {
      setReadError('Por favor, informe o ID do Deal para busca.');
      return;
    }

    setReadLoading(true);
    setReadResult(null);
    setReadError(null);

    try {
      const response = await secureBitrixFetch('/api/bitrix/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: readDealId.trim()
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        let errMsg = errText;
        try {
          const parsed = JSON.parse(errText);
          errMsg = parsed.error || parsed.message || errText;
        } catch {
          // fallback to raw
        }
        throw new Error(errMsg || 'Falha na requisição para o proxy de leitura.');
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      if (!data.result) {
        throw new Error(`Nenhum Deal encontrado com o ID "${readDealId}". Verifique se o ID existe no Bitrix24.`);
      }

      setReadResult({
        deal: data.result,
        rawResponse: data
      });
    } catch (err: any) {
      console.error('Erro na leitura de teste QA:', err);
      setReadError(err.message || 'Erro desconhecido ao tentar ler do Bitrix24.');
    } finally {
      setReadLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className={cn(
          "relative w-full max-w-5xl rounded-lg border overflow-hidden shadow-2xl flex flex-col max-h-[90vh]",
          theme === 'dark' 
            ? "bg-[#0b0b0b] border-white/10 text-white" 
            : "bg-white border-slate-200 text-slate-800"
        )}
      >
        {/* Header */}
        <div className={cn(
          "flex items-center justify-between p-6 border-b shrink-0",
          theme === 'dark' ? "border-white/5 bg-white/[0.01]" : "border-slate-100 bg-slate-50"
        )}>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-sm">
              <Database size={18} className="animate-pulse" />
            </div>
            <div>
              <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-emerald-400">Diagnóstico e QA</h2>
              <p className={cn("text-[11px] font-mono", theme === 'dark' ? "text-white/40" : "text-slate-500")}>
                Painel de Validação em Duas Vias do Webhook Bitrix24
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={cn(
              "p-2 rounded-full transition-colors",
              theme === 'dark' ? "hover:bg-white/5 text-white/50 hover:text-white" : "hover:bg-slate-100 text-slate-400 hover:text-slate-700"
            )}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-8 flex-1 custom-scrollbar">
          
          <div className={cn(
            "p-4 border rounded-sm text-xs flex gap-3 items-start",
            theme === 'dark' ? "bg-emerald-500/5 border-emerald-500/10 text-emerald-400/90" : "bg-emerald-50/50 border-emerald-200 text-emerald-800"
          )}>
            <ShieldCheck size={16} className="shrink-0 mt-0.5" />
            <div>
              <span className="font-bold uppercase tracking-wider block mb-1">Status do Ambiente de Teste</span>
              O portal está configurado com um servidor proxy intermediário (seguro contra CORS) para ler e escrever dados diretamente no seu Bitrix24 de forma confidencial. Utilize os dois passos abaixo para realizar a homologação e monitoramento.
            </div>
          </div>

          {/* Environment Warning Banner */}
          {!envStatus.loading && envStatus.isPlaceholder && (
            <div className={cn(
              "p-6 border rounded-sm text-xs space-y-4",
              theme === 'dark' ? "bg-amber-500/5 border-amber-500/20 text-amber-300" : "bg-amber-50 border-amber-200 text-amber-900"
            )}>
              <div className="flex gap-3 items-start">
                <AlertTriangle size={20} className="text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold uppercase tracking-wider block mb-1 text-sm text-amber-500">
                    Integração em Modo de Exemplo (Placeholder)
                  </span>
                  <p className="leading-relaxed">
                    As variáveis de ambiente do Bitrix24 estão atualmente configuradas com as credenciais padrão de exemplo (<code className="font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">seu-dominio.bitrix24.com.br</code>). Para enviar e ler deals em seu Bitrix24 real, você precisa configurar seu próprio Webhook.
                  </p>
                </div>
              </div>

              <div className={cn("p-4 rounded-sm space-y-3 font-sans border text-[11px]", theme === 'dark' ? "bg-black/40 border-amber-500/10" : "bg-white border-amber-200")}>
                <span className="font-bold uppercase tracking-wider block text-[10px]">Como configurar no AI Studio (Passo a Passo):</span>
                <ol className="list-decimal pl-4 space-y-2 leading-relaxed">
                  <li>
                    Acesse seu painel do <strong>Bitrix24</strong> e vá em <strong className="text-emerald-400">Desenvolvedores</strong> (ou <i>Developer</i>) &rarr; <strong className="text-emerald-400">Integrações</strong> &rarr; <strong className="text-emerald-400">Outro</strong> &rarr; <strong className="text-emerald-400">Webhook de Entrada</strong>.
                  </li>
                  <li>
                    Nas permissões do Webhook (em baixo), adicione a permissão de <strong className="text-emerald-400">CRM</strong>. Salve para gerar as URLs.
                  </li>
                  <li>
                    No <strong>AI Studio</strong>, abra as <strong>Settings (Configurações)</strong> no canto superior direito e clique em <strong>Secrets / Env Variables</strong>.
                  </li>
                  <li>
                    Configure as seguintes variáveis de ambiente com as URLs reais geradas pelo seu Bitrix24:
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 font-mono text-[10px]">
                      <div className={cn("p-2 rounded-sm border", theme === 'dark' ? "bg-[#050505] border-white/5" : "bg-slate-50 border-slate-100")}>
                        <div className="text-[9px] uppercase font-bold text-white/40 mb-1">Para Leitura de Deals:</div>
                        <span className="text-emerald-400 font-bold">VITE_BITRIX_LIST_URL</span>
                        <div className="text-[9px] text-white/30 truncate mt-1">Ex: https://b24-xxxx.bitrix24.com/rest/1/yyyy/crm.deal.list.json</div>
                      </div>
                      <div className={cn("p-2 rounded-sm border", theme === 'dark' ? "bg-[#050505] border-white/5" : "bg-slate-50 border-slate-100")}>
                        <div className="text-[9px] uppercase font-bold text-white/40 mb-1">Para Criação de Deals:</div>
                        <span className="text-emerald-400 font-bold">VITE_BITRIX_WEBHOOK_WRITE_URL</span>
                        <div className="text-[9px] text-white/30 truncate mt-1">Ex: https://b24-xxxx.bitrix24.com/rest/1/yyyy/crm.deal.add.json</div>
                      </div>
                    </div>
                  </li>
                </ol>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            
            {/* COLUMN 1: SEND DEAL */}
            <div className={cn(
              "p-6 rounded-sm border space-y-6",
              theme === 'dark' ? "bg-white/[0.01] border-white/5" : "bg-slate-50/50 border-slate-100"
            )}>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-xs">1</span>
                <h3 className="text-xs font-bold uppercase tracking-widest">Enviar Deal para o Bitrix24</h3>
              </div>
              <p className={cn("text-[11px]", theme === 'dark' ? "text-white/50" : "text-slate-500")}>
                Gere uma negociação fictícia diretamente no seu pipeline de Antecipação para certificar que o webhook possui permissões de gravação.
              </p>

              {/* Form Fields */}
              <div className="space-y-4">
                <div>
                  <label className={cn("block text-[9px] font-bold uppercase tracking-wider mb-1", theme === 'dark' ? "text-white/40" : "text-slate-500")}>ID do PV de Teste</label>
                  <input
                    type="text"
                    value={testPvId}
                    onChange={(e) => setTestPvId(e.target.value)}
                    className={cn(
                      "w-full px-3 py-2 text-xs border rounded-sm focus:outline-none focus:ring-1",
                      theme === 'dark' 
                        ? "bg-black border-white/10 text-white focus:border-emerald-500 focus:ring-emerald-500/20" 
                        : "bg-white border-slate-200 text-slate-800 focus:border-emerald-500 focus:ring-emerald-500/20"
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={cn("block text-[9px] font-bold uppercase tracking-wider mb-1", theme === 'dark' ? "text-white/40" : "text-slate-500")}>Valor do Deal (R$)</label>
                    <input
                      type="number"
                      value={testValor}
                      onChange={(e) => setTestValor(e.target.value)}
                      className={cn(
                        "w-full px-3 py-2 text-xs border rounded-sm focus:outline-none focus:ring-1",
                        theme === 'dark' 
                          ? "bg-black border-white/10 text-white focus:border-emerald-500 focus:ring-emerald-500/20" 
                          : "bg-white border-slate-200 text-slate-800 focus:border-emerald-500 focus:ring-emerald-500/20"
                      )}
                    />
                  </div>
                  <div>
                    <label className={cn("block text-[9px] font-bold uppercase tracking-wider mb-1", theme === 'dark' ? "text-white/40" : "text-slate-500")}>Cliente Simulador</label>
                    <input
                      type="text"
                      value={testCliente}
                      onChange={(e) => setTestCliente(e.target.value)}
                      className={cn(
                        "w-full px-3 py-2 text-xs border rounded-sm focus:outline-none focus:ring-1",
                        theme === 'dark' 
                          ? "bg-black border-white/10 text-white focus:border-emerald-500 focus:ring-emerald-500/20" 
                          : "bg-white border-slate-200 text-slate-800 focus:border-emerald-500 focus:ring-emerald-500/20"
                      )}
                    />
                  </div>
                </div>

                <button
                  onClick={handleSendTestDeal}
                  disabled={sendLoading}
                  className={cn(
                    "w-full py-3 px-4 rounded-sm font-bold text-[10px] uppercase tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-2",
                    sendLoading
                      ? "bg-emerald-500/20 text-emerald-400 cursor-not-allowed"
                      : "bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/10"
                  )}
                >
                  {sendLoading ? (
                    <>
                      <RefreshCw size={12} className="animate-spin" />
                      Disparando Webhook...
                    </>
                  ) : (
                    <>
                      <Send size={12} />
                      Mandar Deal de Teste
                    </>
                  )}
                </button>
              </div>

              {/* Send Result */}
              <AnimatePresence mode="wait">
                {sendError && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="p-4 bg-red-500/5 border border-red-500/10 text-red-400 text-[11px] rounded-sm space-y-2"
                  >
                    <div className="flex items-center gap-2 font-bold text-red-500 uppercase">
                      <AlertTriangle size={14} />
                      Falha ao Enviar
                    </div>
                    <p className="font-mono break-all">{sendError}</p>
                  </motion.div>
                )}

                {sendResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="p-4 bg-emerald-500/5 border border-emerald-500/10 text-[11px] rounded-sm space-y-3"
                  >
                    <div className="flex items-center gap-2 font-bold text-emerald-400 uppercase">
                      <CheckCircle2 size={14} />
                      Mapeado no CRM com Sucesso!
                    </div>

                    <div className={cn("p-3 rounded-sm font-mono flex items-center justify-between", theme === 'dark' ? "bg-black" : "bg-slate-100")}>
                      <div>
                        <span className={cn("text-[9px] uppercase tracking-wider block", theme === 'dark' ? "text-white/40" : "text-slate-400")}>ID do Deal Gerado</span>
                        <span className="text-sm font-bold text-emerald-400">#{sendResult.dealId}</span>
                      </div>
                      <button
                        onClick={() => copyToClipboard(String(sendResult.dealId))}
                        className={cn(
                          "p-1.5 border rounded-sm transition-all flex items-center gap-1 text-[9px] uppercase font-bold",
                          theme === 'dark' ? "border-white/10 hover:bg-white/5" : "border-slate-200 hover:bg-slate-50"
                        )}
                        title="Copiar ID"
                      >
                        {copiedId ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                        {copiedId ? 'Copiado!' : 'Copiar'}
                      </button>
                    </div>

                    {/* Collapsible send json details */}
                    <div>
                      <button
                        onClick={() => setShowSendPayload(!showSendPayload)}
                        className={cn(
                          "flex items-center justify-between w-full py-1 text-[9px] uppercase tracking-wider font-bold",
                          theme === 'dark' ? "text-white/40 hover:text-white" : "text-slate-400 hover:text-slate-700"
                        )}
                      >
                        <span>Ver Payload e Resposta RAW</span>
                        {showSendPayload ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                      </button>
                      {showSendPayload && (
                        <pre className={cn(
                          "p-3 rounded-sm font-mono text-[9px] overflow-auto max-h-[180px] mt-2 border",
                          theme === 'dark' ? "bg-[#050505] border-white/5 text-white/60" : "bg-slate-100 border-slate-200 text-slate-600"
                        )}>
                          {JSON.stringify(sendResult, null, 2)}
                        </pre>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* COLUMN 2: READ DEAL */}
            <div className={cn(
              "p-6 rounded-sm border space-y-6",
              theme === 'dark' ? "bg-white/[0.01] border-white/5" : "bg-slate-50/50 border-slate-100"
            )}>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-xs">2</span>
                <h3 className="text-xs font-bold uppercase tracking-widest">Ler Deal do Bitrix24</h3>
              </div>
              <p className={cn("text-[11px]", theme === 'dark' ? "text-white/50" : "text-slate-500")}>
                Consulte o Deal de forma instantânea para confirmar a resposta de leitura e obter as atualizações feitas no CRM administrativo.
              </p>

              {/* Read form */}
              <div className="space-y-4">
                <div>
                  <label className={cn("block text-[9px] font-bold uppercase tracking-wider mb-1", theme === 'dark' ? "text-white/40" : "text-slate-500")}>ID do Deal (No Bitrix24)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Ex: 48329"
                      value={readDealId}
                      onChange={(e) => setReadDealId(e.target.value)}
                      className={cn(
                        "flex-1 px-3 py-2 text-xs border rounded-sm focus:outline-none focus:ring-1",
                        theme === 'dark' 
                          ? "bg-black border-white/10 text-white focus:border-emerald-500 focus:ring-emerald-500/20" 
                          : "bg-white border-slate-200 text-slate-800 focus:border-emerald-500 focus:ring-emerald-500/20"
                      )}
                    />
                    <button
                      onClick={handleReadDeal}
                      disabled={readLoading || !readDealId.trim()}
                      className={cn(
                        "px-4 rounded-sm font-bold text-[10px] uppercase tracking-widest transition-all active:scale-[0.98] flex items-center gap-2 whitespace-nowrap",
                        readLoading || !readDealId.trim()
                          ? "bg-white/5 border border-white/10 text-white/20 cursor-not-allowed"
                          : "bg-emerald-500 hover:bg-emerald-600 text-white"
                      )}
                    >
                      {readLoading ? <RefreshCw size={12} className="animate-spin" /> : <Search size={12} />}
                      Ler Deal
                    </button>
                  </div>
                </div>
              </div>

              {/* Read result */}
              <AnimatePresence mode="wait">
                {readError && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="p-4 bg-red-500/5 border border-red-500/10 text-red-400 text-[11px] rounded-sm space-y-2"
                  >
                    <div className="flex items-center gap-2 font-bold text-red-500 uppercase">
                      <AlertTriangle size={14} />
                      Falha ao Buscar
                    </div>
                    <p className="font-mono break-all">{readError}</p>
                  </motion.div>
                )}

                {readResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="p-4 bg-emerald-500/5 border border-emerald-500/10 text-[11px] rounded-sm space-y-4"
                  >
                    <div className="flex items-center gap-2 font-bold text-emerald-400 uppercase">
                      <CheckCircle2 size={14} />
                      Dados do Deal Encontrados!
                    </div>

                    {/* Mapped Fields Display */}
                    <div className="space-y-2.5">
                      <div className={cn("grid grid-cols-2 py-1.5 border-b text-[11px]", theme === 'dark' ? "border-white/5" : "border-slate-100")}>
                        <span className={theme === 'dark' ? "text-white/40" : "text-slate-500"}>Título:</span>
                        <span className="font-bold uppercase text-right truncate">{readResult.deal.TITLE}</span>
                      </div>
                      <div className={cn("grid grid-cols-2 py-1.5 border-b text-[11px]", theme === 'dark' ? "border-white/5" : "border-slate-100")}>
                        <span className={theme === 'dark' ? "text-white/40" : "text-slate-500"}>Estágio (STAGE_ID):</span>
                        <span className="font-mono font-bold text-right text-amber-400">{readResult.deal.STAGE_ID}</span>
                      </div>
                      <div className={cn("grid grid-cols-2 py-1.5 border-b text-[11px]", theme === 'dark' ? "border-white/5" : "border-slate-100")}>
                        <span className={theme === 'dark' ? "text-white/40" : "text-slate-500"}>ID do PV Associado:</span>
                        <span className="font-bold text-right font-mono">{readResult.deal[PV_FIELD] || 'Não preenchido'}</span>
                      </div>
                      <div className={cn("grid grid-cols-2 py-1.5 border-b text-[11px]", theme === 'dark' ? "border-white/5" : "border-slate-100")}>
                        <span className={theme === 'dark' ? "text-white/40" : "text-slate-500"}>Valor Liberado (Custom):</span>
                        <span className="font-bold text-right text-emerald-400">
                          {readResult.deal[BITRIX_FIELDS.VALOR_LIBERADO] !== undefined && readResult.deal[BITRIX_FIELDS.VALOR_LIBERADO] !== null
                            ? parseBitrixCurrency(readResult.deal[BITRIX_FIELDS.VALOR_LIBERADO]).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                            : 'Não definido'}
                        </span>
                      </div>
                      <div className={cn("grid grid-cols-2 py-1.5 border-b text-[11px]", theme === 'dark' ? "border-white/5" : "border-slate-100")}>
                        <span className={theme === 'dark' ? "text-white/40" : "text-slate-500"}>Valor Total Oportunidade:</span>
                        <span className="font-bold text-right">
                          {readResult.deal.OPPORTUNITY 
                            ? parseFloat(readResult.deal.OPPORTUNITY).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                            : 'Não preenchido'}
                        </span>
                      </div>
                      <div className="pt-2">
                        <span className={cn("text-[9px] uppercase tracking-wider block mb-1", theme === 'dark' ? "text-white/40" : "text-slate-500")}>Descrição / Comentários Internos:</span>
                        <p className={cn(
                          "p-3 rounded-sm font-mono text-[9px] overflow-auto max-h-[120px] whitespace-pre-wrap border",
                          theme === 'dark' ? "bg-black border-white/5 text-white/55" : "bg-white border-slate-200 text-slate-600"
                        )}>
                          {readResult.deal.COMMENTS || 'Nenhum comentário registrado.'}
                        </p>
                      </div>
                    </div>

                    {/* Collapsible raw json */}
                    <div>
                      <button
                        onClick={() => setShowReadPayload(!showReadPayload)}
                        className={cn(
                          "flex items-center justify-between w-full py-1 text-[9px] uppercase tracking-wider font-bold",
                          theme === 'dark' ? "text-white/40 hover:text-white" : "text-slate-400 hover:text-slate-700"
                        )}
                      >
                        <span>Ver JSON Completo de Resposta</span>
                        {showReadPayload ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                      </button>
                      {showReadPayload && (
                        <pre className={cn(
                          "p-3 rounded-sm font-mono text-[9px] overflow-auto max-h-[180px] mt-2 border",
                          theme === 'dark' ? "bg-[#050505] border-white/5 text-white/60" : "bg-slate-100 border-slate-200 text-slate-600"
                        )}>
                          {JSON.stringify(readResult.rawResponse, null, 2)}
                        </pre>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>

        </div>

        {/* Footer */}
        <div className={cn(
          "p-6 border-t shrink-0 flex items-center justify-between",
          theme === 'dark' ? "border-white/5 bg-white/[0.01]" : "border-slate-100 bg-slate-50"
        )}>
          <span className={cn("text-[9px] uppercase tracking-[0.2em]", theme === 'dark' ? "text-white/20" : "text-slate-400")}>
            Desenvolvimento & Auditoria Ativa
          </span>
          <button
            onClick={onClose}
            className={cn(
              "py-2.5 px-6 rounded-sm font-bold text-[10px] uppercase tracking-widest transition-all hover:opacity-90 active:scale-95 border",
              theme === 'dark' 
                ? "border-white/10 bg-white/5 hover:bg-white/10 text-white" 
                : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
            )}
          >
            Fechar Diagnóstico
          </button>
        </div>
      </motion.div>
    </div>
  );
}
