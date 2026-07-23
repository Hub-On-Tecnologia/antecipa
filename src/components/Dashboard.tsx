import { useEffect, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { fetchReceivables, Receivable } from '../services/sheetsService';
import { createBitrixDeal, fetchExistingDeals, mapBitrixStageToStatus, mapBitrixStageToLabel, parseBitrixCurrency, PV_FIELD, BITRIX_FIELDS, UserAuth } from '../services/bitrixService';
import { 
  savePromisedCommission, 
  fetchPromisedCommissions, 
  deletePromisedCommission, 
  logAccess,
  saveAdvancementWithCollateral,
  deletePromisedCommissionsBulk,
  updateCommissionsStatusBulk
} from '../services/firebaseService';
import { Loader2, DollarSign, List, ArrowRight, Wallet, History, CheckCircle2, AlertCircle, Shield, Clock, RefreshCw, FileSignature, Search } from 'lucide-react';
import { cn } from '../lib/utils';
import ProposalModal from './ProposalModal';
import NotificationCenter from './NotificationCenter';
import CollateralModal from './CollateralModal';
import SuccessModal from './SuccessModal';

interface DashboardProps {
  userInfo: UserAuth;
  firebaseUserId: string;
  firebaseUserEmail: string;
  theme?: 'dark' | 'light';
}

interface GroupedReceivable {
  id: string;
  items: Receivable[];
  totalAvailable: number;
  totalPromised: number;
  mainInfo: Receivable;
}

export default function Dashboard({ userInfo, firebaseUserId, firebaseUserEmail, theme = 'dark' }: DashboardProps) {
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestStatus, setRequestStatus] = useState<Record<string, 'idle' | 'loading' | 'success' | 'error' | 'already'>>({});
  const [existingDeals, setExistingDeals] = useState<any[]>([]);
  const [promisedFromDb, setPromisedFromDb] = useState<any[]>([]);
  const [isProposalOpen, setIsProposalOpen] = useState(false);
  const [activeProposal, setActiveProposal] = useState<any>(null);
  
  const [isCollateralModalOpen, setIsCollateralModalOpen] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<{ item: Receivable, uniqueId: string } | null>(null);
 
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [hasUsedCollateral, setHasUsedCollateral] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'available' | 'requested' | 'collateral'>('available');

  /**
   * helpers para identificar o estado real de um item baseado no cruzamento
   * de dados da Planilha (Sheets) e do Banco de Dados (Firestore).
   * Suporta adiantamentos TOTAIS e PARCIAIS.
   */
  const getRequestsForReceivable = useCallback((item: Receivable) => {
    return promisedFromDb.filter(p => 
      !p.isCollateral && 
      p.status !== 'rejected' &&
      String(p.pvId) === String(item.id) && 
      String(p.previsaoMes) === String(item.previsaoMes) && 
      String(p.previsaoAno) === String(item.previsaoAno)
    );
  }, [promisedFromDb]);

  const getAlreadyAdvancedAmount = useCallback((item: Receivable) => {
    const reqs = getRequestsForReceivable(item);
    return reqs.reduce((sum, p) => {
      const val = p.advanceAmount !== undefined ? Number(p.advanceAmount) : Number(p.amount || 0);
      return sum + val;
    }, 0);
  }, [getRequestsForReceivable]);

  const getAvailableAmount = useCallback((item: Receivable) => {
    const isPago = item.status.toLowerCase().includes('pago');
    if (isPago) return 0;

    // Se o título estiver alocado como garantia de outra antecipação ativa, não fica disponível
    const isCollateral = promisedFromDb.some(p => 
      p.isCollateral && 
      p.status !== 'rejected' && 
      String(p.pvId) === String(item.id) && 
      String(p.previsaoMes) === String(item.previsaoMes) && 
      String(p.previsaoAno) === String(item.previsaoAno)
    );
    if (isCollateral) return 0;

    const alreadyAdvanced = getAlreadyAdvancedAmount(item);
    return Math.max(0, item.valorNumeric - alreadyAdvanced);
  }, [promisedFromDb, getAlreadyAdvancedAmount]);

  const isActuallyRequested = useCallback((item: Receivable) => {
    return getAlreadyAdvancedAmount(item) > 0;
  }, [getAlreadyAdvancedAmount]);

  const isActuallyCollateral = useCallback((item: Receivable) => {
    const dbEntry = promisedFromDb.find(p => 
      p.isCollateral && 
      p.status !== 'rejected' && 
      String(p.pvId) === String(item.id) && 
      String(p.previsaoMes) === String(item.previsaoMes) && 
      String(p.previsaoAno) === String(item.previsaoAno)
    );
    if (!dbEntry) return false;
    
    if (dbEntry.collateralFor) {
       const parent = promisedFromDb.find(p => p.receivableId === dbEntry.collateralFor);
       if (!parent || parent.status === 'rejected') return false;
    }
    
    return true;
  }, [promisedFromDb]);

  const isActuallyAvailable = useCallback((item: Receivable) => {
    return getAvailableAmount(item) > 0.01;
  }, [getAvailableAmount]);

  /**
   * Sincronização em Três Camadas:
   * 1. Busca Ativos na Planilha Google (Sheets)
   * 2. Busca Solicitações no Banco de Dados (Firestore)
   * 3. Busca Status em Tempo Real no CRM (Bitrix24)
   * 4. Centraliza e Atualiza divergências em lote (Lote/Bulk)
   */
  async function syncAndLoad() {
    setLoading(true);
    try {
      logAccess(firebaseUserId, firebaseUserEmail, userInfo.nome, 'CONSULTA_COMISSOES');

      const [data, dbPromised] = await Promise.all([
        fetchReceivables(userInfo),
        fetchPromisedCommissions(firebaseUserId)
      ]);
      
      setReceivables(data);
      setPromisedFromDb(dbPromised);
      
      let bitrixDeals: any[] = [];
      let fetchSucceeded = false;
      const pvIds = Array.from(new Set(data.map(r => r.id))) as string[];
      const dealIds = Array.from(new Set(dbPromised.map(p => p.bitrixDealId).filter(Boolean))) as string[];
      
      if (pvIds.length > 0 || dealIds.length > 0) {
        try {
          bitrixDeals = await fetchExistingDeals(pvIds, dealIds);
          setExistingDeals(bitrixDeals);
          fetchSucceeded = true;
        } catch (bitrixErr) {
          console.warn('Falha ao sincronizar com Bitrix (tratado):', bitrixErr);
        }
      } else {
        fetchSucceeded = true;
      }

      if (fetchSucceeded) {
        const toUpdate: any[] = [];
        const toDelete: string[] = [];

        for (const dbComm of dbPromised) {
          let relatedDeal: any = null;
          
          // 1. Prioridade: Busca pelo ID do Deal no Bitrix24 salvo no registro
          if (dbComm.bitrixDealId) {
            relatedDeal = bitrixDeals.find((d: any) => String(d.ID) === String(dbComm.bitrixDealId));
          }
          
          // 2. Fallback: Busca por PV + Previsão se o ID do Deal não estiver salvo
          if (!relatedDeal) {
            const previsionPattern = `PREVISÃO: ${dbComm.previsaoMes}/${dbComm.previsaoAno}`;
            const matchingDeals = bitrixDeals.filter((d: any) => {
               const hasPV = String(d[PV_FIELD]) === String(dbComm.pvId);
               const comments = String(d.COMMENTS || '');
               return hasPV && comments.includes(previsionPattern);
            });
            
            // Se houver mais de um, tenta bater pelo valor da oportunidade ou pega o mais recente
            relatedDeal = matchingDeals.find((d: any) => Number(d.OPPORTUNITY) === Number(dbComm.advanceAmount || dbComm.amount)) ||
                          matchingDeals.sort((a, b) => Number(b.ID) - Number(a.ID))[0];
          }
          
          if (relatedDeal) {
            const currentBitrixStatus = mapBitrixStageToStatus(relatedDeal.STAGE_ID);
            const currentBitrixLabel = mapBitrixStageToLabel(relatedDeal.STAGE_ID);
            
            if (currentBitrixStatus !== dbComm.status || currentBitrixLabel !== dbComm.stageName || (!dbComm.bitrixDealId && relatedDeal.ID)) {
              toUpdate.push({ 
                id: dbComm.receivableId, 
                status: currentBitrixStatus, 
                stageName: currentBitrixLabel,
                bitrixDealId: String(relatedDeal.ID)
              });
            }
          } else {
            // Se o registro não existe no Bitrix e não é um colateral (que não tem deal próprio)
            if (!dbComm.isCollateral) {
              toDelete.push(dbComm.receivableId);
            }
          }

          // Verificação de órfãos: Colateral cujo título pai sumiu ou foi negado
          if (dbComm.isCollateral && dbComm.collateralFor) {
             const parentInDb = dbPromised.find(p => p.receivableId === dbComm.collateralFor);
             if (!parentInDb) {
                toDelete.push(dbComm.receivableId);
             } else {
                const parentPattern = `PREVISÃO: ${parentInDb.previsaoMes}/${parentInDb.previsaoAno}`;
                const parentDeal = bitrixDeals.find(d => 
                  String(d[PV_FIELD]) === String(parentInDb.pvId) && 
                  String(d.COMMENTS || '').includes(parentPattern)
                );
                if (!parentDeal || mapBitrixStageToStatus(parentDeal.STAGE_ID) === 'rejected') {
                  toDelete.push(dbComm.receivableId);
                }
             }
          }
        }
        
        // Executa atualizações em lote para performance e consistência
        if (toUpdate.length > 0) await updateCommissionsStatusBulk(toUpdate);
        if (toDelete.length > 0) await deletePromisedCommissionsBulk(Array.from(new Set(toDelete)));
        
        if (toUpdate.length > 0 || toDelete.length > 0) {
          const freshDb = await fetchPromisedCommissions(firebaseUserId);
          setPromisedFromDb(freshDb);
        }
        setRequestStatus({});
      }
    } catch (err) {
      console.error('Erro no ciclo de vida do Dashboard:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    syncAndLoad();
  }, [userInfo.nome, firebaseUserId]);

  /**
   * Memoização dos ativos filtrados e agrupados para evitar cálculos custosos
   * em re-renderizações desnecessárias (ex: digitação na busca).
   */
  const groups = useMemo(() => {
    const filtered = receivables.filter(item => {
      // 1. Filtro de Texto Global
      const term = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm || (
        item.nome.toLowerCase().includes(term) ||
        (item.cliente && item.cliente.toLowerCase().includes(term)) ||
        item.id.toLowerCase().includes(term) ||
        (item.empreendimento && item.empreendimento.toLowerCase().includes(term)) ||
        (item.blocoUnidade && item.blocoUnidade.toLowerCase().includes(term)) ||
        (item.construtora && item.construtora.toLowerCase().includes(term))
      );
      if (!matchesSearch) return false;

      // 2. Filtro de Aba Ativa
      if (activeTab === 'available') return isActuallyAvailable(item);
      if (activeTab === 'requested') return isActuallyRequested(item);
      if (activeTab === 'collateral') return isActuallyCollateral(item);
      return true;
    });

    const grouped = filtered.reduce((acc, curr) => {
      if (!acc[curr.id]) {
        acc[curr.id] = { id: curr.id, items: [], totalAvailable: 0, totalPromised: 0, mainInfo: curr };
      }
      acc[curr.id].items.push(curr);
      
      acc[curr.id].totalPromised += getAlreadyAdvancedAmount(curr);
      acc[curr.id].totalAvailable += getAvailableAmount(curr);
      return acc;
    }, {} as Record<string, GroupedReceivable>);

    return Object.values(grouped);
  }, [receivables, searchTerm, activeTab, isActuallyAvailable, isActuallyRequested, isActuallyCollateral, getAlreadyAdvancedAmount, getAvailableAmount]);

  // Estatísticas rápidas para o cabeçalho
  const stats = useMemo(() => ({
    available: receivables.filter(isActuallyAvailable).length,
    requested: receivables.filter(isActuallyRequested).length,
    collateral: receivables.filter(isActuallyCollateral).length,
  }), [receivables, isActuallyAvailable, isActuallyRequested, isActuallyCollateral]);

  /**
   * Processa a solicitação de antecipação.
   * Envia para o Bitrix (CRM) e registra no Firestore (App).
   */
  const handleRequestSingle = async (
    receivable: Receivable, 
    uniqueId: string, 
    collateral: Receivable[] = [], 
    advanceType: 'TOTAL' | 'PARCIAL' = 'TOTAL',
    advanceAmount: number = receivable.valorNumeric
  ) => {
    setRequestStatus(prev => ({ ...prev, [uniqueId]: 'loading' }));
    try {
      const alreadyAdvanced = getAlreadyAdvancedAmount(receivable);
      logAccess(firebaseUserId, firebaseUserEmail, userInfo.nome, `SOLICITACAO_ANTECIPACAO_${advanceType}: PV ${receivable.id} - R$ ${advanceAmount}`);

      // 1. Tentar enviar para o CRM Administrativo (Bitrix) de forma segura
      let bitrixErrorOccurred = false;
      let bitrixDealId: string | null = null;
      try {
        const bitrixRes = await createBitrixDeal(receivable, userInfo, collateral, advanceType, advanceAmount, alreadyAdvanced);
        if (bitrixRes && bitrixRes.result) {
          bitrixDealId = String(bitrixRes.result);
        }
      } catch (bitrixErr) {
        console.error('Erro de envio ao Bitrix (CORS ou rede):', bitrixErr);
        bitrixErrorOccurred = true;
      }
      
      // 2. Registrar no Banco de Dados do Portal (Firestore) - Sempre salvamos
      if (collateral.length > 0) {
        await saveAdvancementWithCollateral(receivable, collateral, firebaseUserId, bitrixDealId, advanceType, advanceAmount);
      } else {
        await savePromisedCommission(receivable, firebaseUserId, false, null, bitrixDealId, advanceType, advanceAmount);
      }
      
      // Feedback Visual de Sucesso
      setRequestStatus(prev => ({ ...prev, [uniqueId]: 'success' }));
      setHasUsedCollateral(collateral.length > 0);
      setIsSuccessModalOpen(true);
      
      // Sincronização imediata dos estados locais para evitar delay de sync
      try {
        const fetchDealsPromise = bitrixErrorOccurred 
          ? Promise.resolve([]) 
          : fetchExistingDeals(
              [receivable.id, ...collateral.map(c => c.id)],
              bitrixDealId ? [bitrixDealId] : []
            ).catch(() => []);
        
        const [newDeals, newDbPromised] = await Promise.all([
          fetchDealsPromise,
          fetchPromisedCommissions(firebaseUserId)
        ]);
        setExistingDeals(prev => [...prev, ...newDeals]);
        setPromisedFromDb(newDbPromised);
      } catch (syncErr) {
        console.error('Erro ao recarregar estados pós-solicitação:', syncErr);
        const newDbPromised = await fetchPromisedCommissions(firebaseUserId);
        setPromisedFromDb(newDbPromised);
      }
    } catch (error) {
      console.error('Erro na solicitação:', error);
      setRequestStatus(prev => ({ ...prev, [uniqueId]: 'error' }));
      setTimeout(() => setRequestStatus(prev => ({ ...prev, [uniqueId]: 'idle' })), 3000);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  if (loading) {
    return (
      <div className={cn(
        "flex flex-col items-center justify-center p-20 animate-pulse transition-colors",
        theme === 'dark' ? "text-white/20" : "text-slate-400"
      )}>
        <Loader2 className="animate-spin mb-4" size={48} />
        <p className="text-[10px] uppercase tracking-[0.3em] font-bold">Sincronizando Ativos...</p>
      </div>
    );
  }

  return (
    <div className="space-y-12 animate-fadeIn">
      {/* Resumo Financeiro */}
      <div className={cn(
        "grid grid-cols-1 md:grid-cols-3 gap-1 rounded-sm overflow-hidden border transition-all duration-300",
        theme === 'dark' 
          ? "bg-white/5 border-white/5" 
          : "bg-slate-200 border-slate-200 shadow-sm"
      )}>
        <div className={cn(
          "p-6 sm:p-10 flex flex-col justify-between group transition-colors relative",
          theme === 'dark' ? "bg-[#111111] hover:bg-white/[0.02]" : "bg-white hover:bg-slate-50/50"
        )}>
          <div>
            <p className={cn(
              "text-[10px] font-bold uppercase tracking-[0.3em] mb-4 flex items-center gap-2",
              theme === 'dark' ? "text-white/30" : "text-slate-500"
            )}>
              <Wallet size={12} /> Disponíveis
            </p>
            <h3 className={cn("text-3xl sm:text-4xl md:text-5xl font-light mb-2", theme === 'dark' ? "text-white" : "text-slate-800")}>
              {stats.available}
            </h3>
          </div>
          <div className="mt-4 sm:mt-8 flex items-center gap-3 text-[10px] font-bold text-emerald-400 tracking-widest uppercase">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Pronto para Antecipação
          </div>
        </div>
        
        <div className={cn(
          "p-6 sm:p-10 flex flex-col justify-between group transition-colors",
          theme === 'dark' ? "bg-[#111111] hover:bg-white/[0.02]" : "bg-white hover:bg-slate-50/50"
        )}>
          <div>
            <p className={cn(
              "text-[10px] font-bold uppercase tracking-[0.3em] mb-4 flex items-center gap-2",
              theme === 'dark' ? "text-amber-500/40" : "text-amber-600/60"
            )}>
              <Clock size={12} /> Solicitados
            </p>
            <h3 className={cn("text-3xl sm:text-4xl md:text-5xl font-light mb-2", theme === 'dark' ? "text-amber-500/80" : "text-amber-600")}>
              {stats.requested}
            </h3>
          </div>
          <div className={cn("mt-4 sm:mt-8 text-[10px] font-bold tracking-widest uppercase", theme === 'dark' ? "text-white/20" : "text-slate-400")}>
            Aguardando Liberação
          </div>
        </div>

        <div className={cn(
          "p-6 sm:p-10 flex flex-col justify-between group transition-colors",
          theme === 'dark' ? "bg-[#111111] hover:bg-white/[0.02]" : "bg-white hover:bg-slate-50/50"
        )}>
          <div>
            <p className={cn(
              "text-[10px] font-bold uppercase tracking-[0.3em] mb-4 flex items-center gap-2",
              theme === 'dark' ? "text-blue-500/40" : "text-blue-600/60"
            )}>
              <Shield size={12} /> Em Garantia
            </p>
            <h3 className={cn("text-3xl sm:text-4xl md:text-5xl font-light mb-2", theme === 'dark' ? "text-blue-500/80" : "text-blue-600")}>
              {stats.collateral}
            </h3>
          </div>
          <div className={cn("mt-4 sm:mt-8 text-[10px] font-bold tracking-widest uppercase", theme === 'dark' ? "text-white/20" : "text-slate-400")}>
            Ativos Vinculados
          </div>
        </div>
      </div>

      {/* Menu de Abas */}
      <div className={cn(
        "flex border-b space-x-8 px-2 overflow-x-auto no-scrollbar transition-all duration-300",
        theme === 'dark' ? "border-white/5" : "border-slate-200"
      )}>
        {[
          { id: 'available', label: 'Títulos Disponíveis', icon: Wallet, count: stats.available, color: 'emerald' },
          { id: 'requested', label: 'Em Solicitação', icon: Clock, count: stats.requested, color: 'amber' },
          { id: 'collateral', label: 'Títulos em Garantia', icon: Shield, count: stats.collateral, color: 'blue' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "flex items-center gap-2 sm:gap-3 py-4 px-2 sm:py-6 sm:px-4 text-[10px] uppercase font-bold tracking-wider sm:tracking-[0.2em] transition-all relative group shrink-0",
              activeTab === tab.id 
                ? (theme === 'dark' ? "text-white" : "text-slate-900") 
                : (theme === 'dark' ? "text-white/20 hover:text-white/40" : "text-slate-400 hover:text-slate-600")
            )}
          >
            <tab.icon size={14} className={cn(
              activeTab === tab.id ? 
              (tab.id === 'available' ? 'text-emerald-500' : tab.id === 'requested' ? 'text-amber-500' : 'text-blue-500') : 
              (theme === 'dark' ? "text-white/10" : "text-slate-300")
            )} />
            {tab.label}
            <span className={cn(
              "px-1.5 py-0.5 rounded-full text-[8px] border transition-colors",
              activeTab === tab.id 
                ? (theme === 'dark' ? "bg-white/10 border-white/20 text-white" : "bg-slate-100 border-slate-200 text-slate-700") 
                : (theme === 'dark' ? "bg-white/5 border-white/10 text-white/30" : "bg-slate-50 border-slate-200 text-slate-400")
            )}>
              {tab.count}
            </span>
            {activeTab === tab.id && (
              <motion.div 
                layoutId="activeTab"
                className={cn(
                  "absolute bottom-0 left-0 right-0 h-0.5",
                  tab.id === 'available' ? 'bg-emerald-500' : tab.id === 'requested' ? 'bg-amber-500' : 'bg-blue-500'
                )} 
              />
            )}
          </button>
        ))}
      </div>

      {/* Lista de Recebíveis Agrupados */}
      <div className="space-y-8">
        <div className="flex flex-col space-y-6">
          <div className={cn(
            "flex flex-col md:flex-row md:items-center justify-between border-b pb-4 gap-4 transition-colors",
            theme === 'dark' ? "border-white/5" : "border-slate-200"
          )}>
            <div className="flex items-center gap-4">
              <h2 className={cn(
                "text-[10px] uppercase tracking-[0.5em] font-bold flex items-center gap-2",
                theme === 'dark' ? "text-white/40" : "text-slate-500"
              )}>
                <List size={14} /> Detalhamento por PV
              </h2>
              <div className="flex items-center gap-2">
                <NotificationCenter userId={firebaseUserId} theme={theme} />
                <button 
                  onClick={syncAndLoad} 
                  disabled={loading}
                  className={cn(
                    "text-[9px] uppercase tracking-widest transition-all flex items-center gap-2 px-3 py-1.5 rounded-full border",
                    theme === 'dark' 
                      ? "text-white/20 hover:text-white/60 bg-white/5 border-white/5" 
                      : "text-slate-500 hover:text-slate-800 bg-slate-50 border-slate-200 active:bg-slate-100"
                  )}
                >
                  <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
                  Sincronizar Operações
                </button>
              </div>
            </div>
            <span className={cn("text-[9px] font-mono uppercase tracking-tighter hidden md:block", theme === 'dark' ? "text-white/20" : "text-slate-400")}>Filtro: {userInfo.nome}</span>
          </div>

          {/* Barra de Busca */}
          <div className="relative group">
            <div className={cn(
              "absolute inset-y-0 left-4 flex items-center pointer-events-none transition-colors",
              theme === 'dark' ? "text-white/20 group-focus-within:text-white/60" : "text-slate-450 group-focus-within:text-slate-700"
            )}>
              <Search size={18} />
            </div>
            <input
              type="text"
              placeholder="BUSCAR POR CLIENTE, PV, EMPREENDIMENTO OU UNIDADE..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={cn(
                "w-full border p-4 pl-12 rounded-sm text-[11px] font-bold tracking-[0.2em] focus:outline-none transition-all placeholder:text-white/10 uppercase",
                theme === 'dark' 
                  ? "bg-white/[0.03] border-white/10 text-white focus:bg-white/[0.05] focus:border-white/20 placeholder:text-white/20" 
                  : "bg-slate-50 border-slate-200 text-slate-800 focus:bg-white focus:border-slate-300 placeholder:text-slate-400"
              )}
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className={cn(
                  "absolute inset-y-0 right-4 flex items-center text-[9px] font-bold transition-colors uppercase tracking-widest",
                  theme === 'dark' ? "text-white/20 hover:text-white/60" : "text-slate-400 hover:text-slate-700"
                )}
              >
                Limpar
              </button>
            )}
          </div>
        </div>

        {groups.length === 0 ? (
          <div className={cn(
            "border rounded-sm p-12 text-center",
            theme === 'dark' ? "bg-white/5 border-white/5" : "bg-slate-50 border-slate-200"
          )}>
            <p className={cn("text-sm tracking-widest italic", theme === 'dark' ? "text-white/30" : "text-slate-450")}>
              Nenhum recebível localizado para os critérios da busca.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group, gIdx) => (
              <motion.div 
                key={group.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: gIdx * 0.1 }}
                className={cn(
                  "border rounded-sm overflow-hidden transition-all duration-300",
                  theme === 'dark' ? "bg-[#111111] border-white/5" : "bg-white border-slate-200 shadow-sm"
                )}
              >
                {/* Header do Grupo (PV) */}
                <div className={cn(
                  "p-6 border-b flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all duration-300",
                  theme === 'dark' ? "bg-white/[0.02] border-white/5" : "bg-slate-50/50 border-slate-100"
                )}>
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-10 h-10 flex items-center justify-center rounded-sm transition-colors",
                      theme === 'dark' ? "bg-white/5 text-white/60" : "bg-slate-100 text-slate-500"
                    )}>
                      <History size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-0.5">
                        <span className={cn(
                          "text-[9px] font-mono uppercase tracking-widest",
                          theme === 'dark' ? "text-white/40" : "text-slate-400"
                        )}>ID PV: {group.id}</span>
                        <span className="text-[9px] px-1.5 py-0.5 bg-blue-500/10 text-blue-400 font-bold border border-blue-500/20 rounded-sm uppercase tracking-tighter">
                          {group.mainInfo.construtora}
                        </span>
                        {group.mainInfo.userRole && group.mainInfo.userRole !== 'Corretor' && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/10 text-amber-400 font-bold border border-amber-500/20 rounded-sm uppercase tracking-tighter flex items-center gap-1">
                            <Shield size={10} /> {group.mainInfo.userRole}
                          </span>
                        )}
                      </div>
                      <h4 className={cn("text-sm font-bold uppercase tracking-wide truncate", theme === 'dark' ? "text-white" : "text-slate-800")}>
                        {group.mainInfo.cliente || group.mainInfo.nome}
                      </h4>
                    </div>
                  </div>
                  <div className="flex items-center gap-10">
                    <div className={cn(
                      "text-right flex flex-col items-end pr-8 border-r transition-colors",
                      theme === 'dark' ? "border-white/5" : "border-slate-200"
                    )}>
                      <p className={cn(
                        "text-[9px] font-bold uppercase tracking-[0.2em] mb-1",
                        theme === 'dark' ? "text-white/30" : "text-slate-400 font-semibold"
                      )}>Parcelas Ativas</p>
                      <p className={cn("text-lg font-light", theme === 'dark' ? "text-white" : "text-slate-800")}>{group.items.length}</p>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <p className={cn(
                        "text-[9px] font-bold uppercase tracking-[0.2em] mb-1",
                        theme === 'dark' ? "text-amber-500/40" : "text-amber-600/70"
                      )}>Solicitadas</p>
                      <p className={cn("text-lg font-light text-amber-500/70", theme === 'light' && "text-amber-600")}>
                        {group.items.filter(item => promisedFromDb.some(p => String(p.receivableId) === String(item.id) && p.status !== 'rejected')).length}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Lista de Parcelas dentro do Grupo */}
                <div className={cn("divide-y transition-colors", theme === 'dark' ? "divide-white/5" : "divide-slate-100")}>
                  {group.items.map((item, iIdx) => {
                    const isPago = item.status.toLowerCase().includes('pago');
                    const itemRequests = getRequestsForReceivable(item);
                    
                    const alreadyAdvanced = getAlreadyAdvancedAmount(item);
                    const remainingAvailable = getAvailableAmount(item);
                    const isFullyRequested = remainingAvailable <= 0.01;
                    const uniqueId = item.receivableId;
                    const status = requestStatus[uniqueId] || (isFullyRequested ? 'already' : 'idle');

                    return (
                      <div 
                        key={uniqueId}
                        className={cn(
                          "px-4 sm:px-6 py-4 flex flex-col gap-4 transition-colors",
                          (isPago || isFullyRequested)
                            ? (theme === 'dark' ? "bg-black/20" : "bg-slate-50/50")
                            : (theme === 'dark' ? "hover:bg-white/[0.01]" : "hover:bg-slate-50/20")
                        )}
                      >
                        {/* Detalhes da Parcela Posição Superior */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
                          <div className="flex flex-col md:flex-row md:items-center gap-4 flex-1 min-w-0 w-full">
                            <div className="flex items-center gap-4 shrink-0">
                              <div className={cn(
                                "w-1 h-8 rounded-full",
                                isPago ? (theme === 'dark' ? "bg-white/10" : "bg-slate-300") : 
                                itemRequests.length > 0 ? "bg-amber-500/40" :
                                "bg-blue-500/40 shadow-[0_0_10px_rgba(59,130,246,0.2)]"
                              )} />
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                  <span className={cn(
                                    "text-[10px] font-bold uppercase tracking-widest",
                                    theme === 'dark' ? "text-white/60" : "text-slate-600"
                                  )}>
                                    PARCELA {iIdx + 1} ({formatCurrency(item.valorNumeric)})
                                  </span>
                                  {item.valorOriginalP && !isPago && (
                                    <span className={cn("text-[9px] italic", theme === 'dark' ? "text-white/30" : "text-slate-400")}>{item.valorOriginalP}</span>
                                  )}
                                  {alreadyAdvanced > 0 && !isPago && (
                                    <span className="text-[9px] font-bold uppercase text-amber-400 tracking-wider flex items-center gap-1 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                                      Adiantado: {formatCurrency(alreadyAdvanced)} {remainingAvailable > 0 ? `(Saldo: ${formatCurrency(remainingAvailable)})` : '(100%)'}
                                    </span>
                                  )}
                                  {isPago && (
                                    <span className="text-[9px] font-bold uppercase text-emerald-500/60 tracking-wider flex items-center gap-1">
                                      ✓ Quitado
                                    </span>
                                  )}
                                </div>
                                <div className={cn(
                                  "flex items-center gap-2 mt-0.5 text-[9px] uppercase tracking-widest transition-colors",
                                  theme === 'dark' ? "text-white/20" : "text-slate-400"
                                )}>
                                   <span>Vencimento Estimado:</span>
                                   <span className={cn("font-bold", theme === 'dark' ? "text-white/40" : "text-slate-600")}>{item.previsaoMes}/{item.previsaoAno}</span>
                                </div>
                              </div>
                            </div>
                            
                            <div className={cn(
                              "flex-1 grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 border-l-2 md:border-l pl-4 md:pl-6 transition-colors w-full min-w-0",
                              theme === 'dark' ? "border-white/5" : "border-slate-100"
                            )}>
                              <div className="col-span-2 md:col-span-1 min-w-0">
                                <p className={cn(
                                  "text-[9px] font-bold uppercase tracking-[0.2em] mb-0.5",
                                  theme === 'dark' ? "text-white/20" : "text-slate-400"
                                )}>Empreendimento</p>
                                <p className={cn("text-[11px] uppercase font-medium truncate", theme === 'dark' ? "text-white/80" : "text-slate-700")}>{item.empreendimento || '-'}</p>
                              </div>
                              <div className="col-span-1 min-w-0">
                                <p className={cn(
                                  "text-[9px] font-bold uppercase tracking-[0.2em] mb-0.5",
                                  theme === 'dark' ? "text-white/20" : "text-slate-400"
                                )}>Unidade / Bloco</p>
                                <p className={cn("text-[11px] uppercase font-medium", theme === 'dark' ? "text-white/80" : "text-slate-700")}>{item.blocoUnidade || '-'}</p>
                              </div>
                              <div className="col-span-1 min-w-0">
                                <p className={cn(
                                  "text-[9px] font-bold uppercase tracking-[0.2em] mb-0.5",
                                  theme === 'dark' ? "text-white/20" : "text-slate-400"
                                )}>Cliente</p>
                                <p className={cn("text-[11px] uppercase font-medium truncate", theme === 'dark' ? "text-white/80" : "text-slate-700")}>{item.cliente || item.nome}</p>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-2 shrink-0 w-full md:w-auto mt-2 md:mt-0">
                            {!isPago && remainingAvailable > 0.01 && (
                              <motion.button 
                                key={status}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                onClick={() => {
                                  if (status === 'idle') {
                                    setPendingRequest({ item, uniqueId });
                                    setIsCollateralModalOpen(true);
                                  }
                                }}
                                disabled={status !== 'idle'}
                                className={cn(
                                  "px-3 py-2 rounded-sm text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-2",
                                  status === 'loading' ? (theme === 'dark' ? "bg-white/5 text-white/20" : "bg-slate-100 text-slate-450") :
                                  (theme === 'dark' ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200")
                                )}
                              >
                                {status === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                                <span>{alreadyAdvanced > 0 ? `Adiantar Saldo (${formatCurrency(remainingAvailable)})` : 'Solicitar Antecipação'}</span>
                              </motion.button>
                            )}
                          </div>
                        </div>

                        {/* Exibição Individualizada de Cada Solicitação Realizada */}
                        {itemRequests.length > 0 && (
                          <div className={cn(
                            "mt-2 pt-3 border-t flex flex-col gap-2 rounded-sm p-3 transition-colors",
                            theme === 'dark' ? "bg-white/[0.02] border-white/5" : "bg-slate-50 border-slate-200/60"
                          )}>
                            <p className={cn("text-[9px] font-bold uppercase tracking-[0.2em] mb-1 flex items-center gap-1.5", theme === 'dark' ? "text-amber-400/80" : "text-amber-600")}>
                              <Clock size={12} /> Solicitações Ativas para esta Parcela ({itemRequests.length})
                            </p>
                            <div className="grid grid-cols-1 gap-2">
                              {itemRequests.map((req, rIdx) => {
                                const reqAmount = req.advanceAmount !== undefined ? Number(req.advanceAmount) : Number(req.amount || 0);
                                const isAguardando = req.stageName === 'Aguardando Solicitante' || req.stageName === 'Aguardando Assinatura';
                                
                                return (
                                  <div 
                                    key={req.receivableId || rIdx}
                                    className={cn(
                                      "flex flex-col sm:flex-row sm:items-center justify-between p-2.5 rounded border gap-3 transition-all",
                                      theme === 'dark' ? "bg-black/40 border-white/10" : "bg-white border-slate-200 shadow-2xs"
                                    )}
                                  >
                                    <div className="flex flex-wrap items-center gap-3">
                                      <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                        Solicitação #{rIdx + 1} ({req.advanceType || 'PARCIAL'})
                                      </span>
                                      <span className={cn("text-[11px] font-mono font-bold", theme === 'dark' ? "text-white" : "text-slate-800")}>
                                        {formatCurrency(reqAmount)}
                                      </span>
                                      {req.bitrixDealId && (
                                        <span className={cn("text-[9px] font-mono", theme === 'dark' ? "text-white/40" : "text-slate-400")}>
                                          Bitrix ID: #{req.bitrixDealId}
                                        </span>
                                      )}
                                      <span className={cn(
                                        "text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded flex items-center gap-1",
                                        req.status === 'approved' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                                        req.status === 'rejected' ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" :
                                        "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                      )}>
                                        <Clock size={10} /> {req.stageName || 'Em Análise'}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-2 self-end sm:self-auto">
                                      {isAguardando && (
                                        <button
                                          onClick={() => {
                                            logAccess(firebaseUserId, firebaseUserEmail, userInfo.nome, `VISUALIZACAO_PROPOSTA: PV ${req.pvId} - Deal ${req.bitrixDealId}`);

                                            const deal = existingDeals.find(d => String(d.ID) === String(req.bitrixDealId));
                                            
                                            setActiveProposal({
                                              commissionId: req.receivableId,
                                              pvId: req.pvId,
                                              valorLiberado: deal ? parseBitrixCurrency(deal[BITRIX_FIELDS.VALOR_LIBERADO]) : reqAmount,
                                              observacoes: deal ? deal[BITRIX_FIELDS.OBSERVACOES] : '',
                                              dealId: deal?.ID || req.bitrixDealId,
                                              itemDetails: item
                                            });
                                            setIsProposalOpen(true);
                                          }}
                                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[9px] font-bold uppercase tracking-widest rounded-sm flex items-center gap-1.5 shadow-sm"
                                        >
                                          <FileSignature size={12} /> Ver Proposta
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
      <ProposalModal 
        isOpen={isProposalOpen}
        onClose={() => setIsProposalOpen(false)}
        proposal={activeProposal}
        userInfo={{ ...userInfo, email: firebaseUserEmail }}
        onSuccess={syncAndLoad}
        theme={theme}
      />
      {pendingRequest && (
        <CollateralModal
          isOpen={isCollateralModalOpen}
          onClose={() => {
            setIsCollateralModalOpen(false);
            setPendingRequest(null);
          }}
          primaryReceivable={pendingRequest.item}
          availableReceivables={receivables.filter(isActuallyAvailable)}
          alreadyAdvancedAmount={getAlreadyAdvancedAmount(pendingRequest.item)}
          availableAmount={getAvailableAmount(pendingRequest.item)}
          onConfirm={(collateral, advanceType, advanceAmount) => {
            handleRequestSingle(
              pendingRequest.item, 
              pendingRequest.uniqueId, 
              collateral, 
              advanceType, 
              advanceAmount
            );
          }}
          theme={theme}
        />
      )}
      <SuccessModal
        isOpen={isSuccessModalOpen}
        onClose={() => setIsSuccessModalOpen(false)}
        hasCollateral={hasUsedCollateral}
        theme={theme}
      />
    </div>
  );
}
