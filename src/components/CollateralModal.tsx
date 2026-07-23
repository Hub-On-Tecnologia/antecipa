import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Shield, CheckCircle2, AlertCircle, Info, DollarSign, Percent, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';
import { Receivable } from '../services/sheetsService';

interface CollateralModalProps {
  isOpen: boolean;
  onClose: () => void;
  primaryReceivable: Receivable;
  availableReceivables: Receivable[];
  alreadyAdvancedAmount?: number;
  availableAmount?: number;
  onConfirm: (
    collateral: Receivable[], 
    advanceType: 'TOTAL' | 'PARCIAL', 
    advanceAmount: number
  ) => void;
  theme?: 'dark' | 'light';
}

export default function CollateralModal({ 
  isOpen, 
  onClose, 
  primaryReceivable, 
  availableReceivables, 
  alreadyAdvancedAmount = 0,
  availableAmount,
  onConfirm, 
  theme = 'dark' 
}: CollateralModalProps) {
  const maxAvailable = availableAmount !== undefined ? availableAmount : primaryReceivable.valorNumeric;
  
  const [advanceType, setAdvanceType] = useState<'TOTAL' | 'PARCIAL'>('TOTAL');
  const [partialValue, setPartialValue] = useState<number>(maxAvailable);
  const [partialInputStr, setPartialInputStr] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Reinicializa estados ao abrir modal para um novo título
  useEffect(() => {
    if (isOpen) {
      setAdvanceType('TOTAL');
      setPartialValue(maxAvailable);
      setPartialInputStr(maxAvailable.toString());
      setSelectedIds([]);
    }
  }, [isOpen, primaryReceivable, maxAvailable]);

  // Filtra candidatos a garantia (outros títulos do usuário com saldo disponível > 0)
  const validCandidates = availableReceivables.filter(r => {
    return r.receivableId !== primaryReceivable.receivableId && 
           r.id !== primaryReceivable.id;
  });

  const selectedCollaterals = validCandidates.filter(r => selectedIds.includes(r.receivableId));
  const totalCollateralValue = selectedCollaterals.reduce((acc, curr) => acc + curr.valorNumeric, 0);

  const effectiveAdvanceAmount = advanceType === 'TOTAL' ? maxAvailable : partialValue;

  // Validação estrita da Regra de Negócio:
  // Se PARCIAL: valor adiantado deve ser > 0 e <= maxAvailable, E a garantia DEVE ser MAIOR que o valor adiantado!
  const isPartialValidValue = effectiveAdvanceAmount > 0 && effectiveAdvanceAmount <= maxAvailable;
  const isCollateralSufficient = advanceType === 'TOTAL' || (totalCollateralValue > effectiveAdvanceAmount);
  
  const isValidToSubmit = advanceType === 'TOTAL' 
    ? true 
    : (isPartialValidValue && isCollateralSufficient);

  const toggleSelection = (r: Receivable) => {
    const uid = r.receivableId;
    setSelectedIds(prev => 
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  const handlePartialInputChange = (valStr: string) => {
    setPartialInputStr(valStr);
    const cleanStr = valStr.replace(/[^\d.,]/g, '').replace(',', '.');
    const num = parseFloat(cleanStr);
    if (!isNaN(num)) {
      setPartialValue(Math.min(num, maxAvailable));
    } else {
      setPartialValue(0);
    }
  };

  const setPercentage = (pct: number) => {
    const calc = Math.round((maxAvailable * pct) * 100) / 100;
    setPartialValue(calc);
    setPartialInputStr(calc.toString());
  };

  const handleConfirm = () => {
    if (!isValidToSubmit) return;
    onConfirm(selectedCollaterals, advanceType, effectiveAdvanceAmount);
    onClose();
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        className={cn(
          "fixed inset-0 transition-opacity duration-300",
          theme === 'dark' ? "bg-black/90 backdrop-blur-md" : "bg-slate-900/40 backdrop-blur-sm"
        )}
        onClick={onClose}
      />
      
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={cn(
          "relative w-full max-w-2xl max-h-[90vh] overflow-y-auto border rounded-lg shadow-2xl transition-all duration-300 z-10 my-auto",
          theme === 'dark' ? "bg-[#0a0a0a] border-white/10 text-white" : "bg-white border-slate-200 text-slate-800"
        )}
      >
        <div className="p-5 sm:p-7">
          {/* Header */}
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/10">
            <div>
              <h2 className={cn(
                "text-xs font-bold uppercase tracking-[0.3em] flex items-center gap-2",
                theme === 'dark' ? "text-amber-400" : "text-amber-600 font-extrabold"
              )}>
                <Shield size={16} className="text-amber-500" /> Solicitação de Antecipação
              </h2>
              <p className={cn("text-[10px] mt-1 uppercase font-mono", theme === 'dark' ? "text-white/40" : "text-slate-500")}>
                PV: {primaryReceivable.id} • Previsão: {primaryReceivable.previsaoMes}/{primaryReceivable.previsaoAno}
              </p>
            </div>
            <button onClick={onClose} className={cn("transition-colors cursor-pointer p-1 rounded-full hover:bg-white/10", theme === 'dark' ? "text-white/40 hover:text-white" : "text-slate-400 hover:text-slate-800")}>
              <X size={20} />
            </button>
          </div>

          {/* Target Title Summary */}
          <div className={cn(
            "p-5 rounded-lg border mb-6",
            theme === 'dark' ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200"
          )}>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
              <div>
                <p className={cn("text-[10px] uppercase tracking-widest font-semibold", theme === 'dark' ? "text-white/40" : "text-slate-500")}>Cliente / Empreendimento</p>
                <p className={cn("text-base font-semibold mt-0.5", theme === 'dark' ? "text-white" : "text-slate-800")}>{primaryReceivable.cliente}</p>
                <p className={cn("text-xs mt-0.5", theme === 'dark' ? "text-white/60" : "text-slate-600")}>{primaryReceivable.empreendimento} {primaryReceivable.blocoUnidade && `(${primaryReceivable.blocoUnidade})`}</p>
              </div>
              <div className="text-left sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-white/5">
                <p className={cn("text-[10px] uppercase tracking-widest font-semibold", theme === 'dark' ? "text-white/40" : "text-slate-500")}>Saldo Disponível</p>
                <p className={cn("text-xl font-bold font-mono", theme === 'dark' ? "text-emerald-400" : "text-emerald-600")}>
                  {formatCurrency(maxAvailable)}
                </p>
                {alreadyAdvancedAmount > 0 && (
                  <p className={cn("text-[10px] uppercase font-mono mt-0.5", theme === 'dark' ? "text-white/30" : "text-slate-400")}>
                    Já adiantado: {formatCurrency(alreadyAdvancedAmount)}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* STEP 1: Modalidade de Adiantamento */}
          <div className="mb-6">
            <label className={cn("block text-[11px] font-bold uppercase tracking-wider mb-3", theme === 'dark' ? "text-white/70" : "text-slate-700")}>
              1. Escolha a Modalidade do Adiantamento
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAdvanceType('TOTAL')}
                className={cn(
                  "p-4 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between",
                  advanceType === 'TOTAL'
                    ? "border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30"
                    : (theme === 'dark' ? "border-white/10 hover:border-white/20 bg-white/5" : "border-slate-200 hover:border-slate-300 bg-slate-50")
                )}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-400">TOTAL</span>
                  {advanceType === 'TOTAL' && <CheckCircle2 size={16} className="text-blue-500" />}
                </div>
                <p className={cn("text-sm font-semibold", theme === 'dark' ? "text-white" : "text-slate-800")}>
                  {formatCurrency(maxAvailable)}
                </p>
                <p className={cn("text-[10px] mt-1 leading-tight", theme === 'dark' ? "text-white/40" : "text-slate-500")}>
                  Adiantamento integral do saldo disponível do título.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAdvanceType('PARCIAL');
                  if (partialValue === maxAvailable) {
                    setPercentage(0.5); // Default 50% for partial
                  }
                }}
                className={cn(
                  "p-4 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between",
                  advanceType === 'PARCIAL'
                    ? "border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/30"
                    : (theme === 'dark' ? "border-white/10 hover:border-white/20 bg-white/5" : "border-slate-200 hover:border-slate-300 bg-slate-50")
                )}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-400">PARCIAL</span>
                  {advanceType === 'PARCIAL' && <CheckCircle2 size={16} className="text-amber-500" />}
                </div>
                <p className={cn("text-sm font-semibold", theme === 'dark' ? "text-white" : "text-slate-800")}>
                  Personalizado
                </p>
                <p className={cn("text-[10px] mt-1 leading-tight", theme === 'dark' ? "text-white/40" : "text-slate-500")}>
                  Exige alocação de garantia superior ao valor antecipado.
                </p>
              </button>
            </div>
          </div>

          {/* STEP 1.5: Configuração do Valor Parcial (Se PARCIAL) */}
          {advanceType === 'PARCIAL' && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className={cn(
                "p-4 rounded-lg border mb-6 transition-all",
                theme === 'dark' ? "bg-amber-500/5 border-amber-500/20" : "bg-amber-50/80 border-amber-200"
              )}
            >
              <div className="flex justify-between items-center mb-2">
                <label className={cn("text-xs font-bold uppercase tracking-wider flex items-center gap-1.5", theme === 'dark' ? "text-amber-400" : "text-amber-800")}>
                  <DollarSign size={14} /> Valor do Adiantamento Parcial
                </label>
                <span className={cn("text-[10px] font-mono", theme === 'dark' ? "text-white/40" : "text-slate-500")}>
                  Máx: {formatCurrency(maxAvailable)}
                </span>
              </div>

              {/* Atalhos de Percentual */}
              <div className="flex gap-2 mb-3">
                {[0.25, 0.50, 0.75].map(pct => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setPercentage(pct)}
                    className={cn(
                      "flex-1 py-1 px-2 rounded text-[10px] font-bold font-mono border transition-all cursor-pointer",
                      Math.abs(partialValue - (maxAvailable * pct)) < 1
                        ? "bg-amber-500 text-black border-amber-500"
                        : (theme === 'dark' ? "bg-white/5 border-white/10 hover:bg-white/10 text-white/70" : "bg-white border-slate-200 hover:bg-slate-100 text-slate-700")
                    )}
                  >
                    {pct * 100}% ({formatCurrency(maxAvailable * pct)})
                  </button>
                ))}
              </div>

              {/* Input Numérico */}
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono font-bold opacity-40">R$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={maxAvailable}
                  value={partialInputStr}
                  onChange={(e) => handlePartialInputChange(e.target.value)}
                  placeholder="0,00"
                  className={cn(
                    "w-full pl-9 pr-4 py-2.5 rounded border text-sm font-mono font-bold transition-all focus:outline-none focus:ring-2 focus:ring-amber-500",
                    theme === 'dark' ? "bg-black/50 border-white/20 text-white" : "bg-white border-slate-300 text-slate-900"
                  )}
                />
              </div>

              {!isPartialValidValue && (
                <p className="text-[11px] text-red-500 mt-2 font-medium flex items-center gap-1">
                  <AlertCircle size={12} /> O valor deve ser maior que R$ 0,00 e até {formatCurrency(maxAvailable)}.
                </p>
              )}
            </motion.div>
          )}

          {/* STEP 2: Garantia Alocada */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <label className={cn("text-[11px] font-bold uppercase tracking-wider flex items-center gap-2", theme === 'dark' ? "text-white/70" : "text-slate-700")}>
                2. Seleção de Garantia {advanceType === 'PARCIAL' ? <span className="text-amber-500 font-extrabold">(Obrigatória e &gt; Valor Adiantado)</span> : <span className="text-white/40 font-normal">(Opcional)</span>}
              </label>
              <span className={cn("text-[10px] uppercase font-mono", theme === 'dark' ? "text-white/40" : "text-slate-500")}>
                {validCandidates.length} Disponíveis
              </span>
            </div>

            {/* Candidate List */}
            <div className={cn(
              "border rounded-lg max-h-[200px] overflow-y-auto divide-y custom-scrollbar transition-colors duration-300 mb-3",
              theme === 'dark' ? "bg-[#111] border-white/10 divide-white/5" : "bg-slate-50 border-slate-200 divide-slate-200"
            )}>
              {validCandidates.length === 0 ? (
                <div className="p-8 text-center">
                  <Info size={20} className={cn("mx-auto mb-2 opacity-40")} />
                  <p className={cn("text-xs uppercase tracking-wider opacity-60 font-medium")}>
                    Não há outros títulos disponíveis para oferecer como garantia.
                  </p>
                </div>
              ) : (
                validCandidates.map((r) => {
                  const uid = r.receivableId;
                  const isSelected = selectedIds.includes(uid);
                  return (
                    <div 
                      key={uid}
                      onClick={() => toggleSelection(r)}
                      className={cn(
                        "p-3 flex items-center justify-between cursor-pointer transition-colors group",
                        isSelected 
                          ? (theme === 'dark' ? "bg-amber-500/15" : "bg-amber-100/60") 
                          : (theme === 'dark' ? "hover:bg-white/5" : "hover:bg-slate-100/50")
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                          isSelected 
                            ? "bg-amber-500 border-amber-500 text-black" 
                            : (theme === 'dark' ? "border-white/20 group-hover:border-white/40" : "border-slate-300 group-hover:border-slate-400")
                        )}>
                          {isSelected && <CheckCircle2 size={12} />}
                        </div>
                        <div>
                          <p className={cn("text-xs font-semibold uppercase", theme === 'dark' ? "text-white/90" : "text-slate-800")}>{r.cliente}</p>
                          <p className={cn("text-[9px] uppercase font-mono mt-0.5", theme === 'dark' ? "text-white/40" : "text-slate-500")}>PV: {r.id} • {r.previsaoMes}/{r.previsaoAno}</p>
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <p className={cn("text-xs font-bold", isSelected ? "text-amber-500" : (theme === 'dark' ? "text-white/70" : "text-slate-700"))}>
                          {r.valor}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Total Collateral vs Requested Advance Comparison */}
            <div className={cn(
              "p-3 rounded-lg border text-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 font-mono",
              isCollateralSufficient
                ? (theme === 'dark' ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-800")
                : (theme === 'dark' ? "bg-red-500/10 border-red-500/30 text-red-400" : "bg-red-50 border-red-200 text-red-800")
            )}>
              <div className="flex items-center gap-2">
                {isCollateralSufficient ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                <span>
                  Garantia Alocada: <strong>{formatCurrency(totalCollateralValue)}</strong>
                </span>
              </div>
              <div>
                Adiantamento: <strong>{formatCurrency(effectiveAdvanceAmount)}</strong>
              </div>
            </div>

            {/* Error Message for Insufficient Collateral in Partial Mode */}
            {advanceType === 'PARCIAL' && !isCollateralSufficient && (
              <p className="text-[11px] text-red-500 font-medium mt-2 flex items-start gap-1.5 leading-tight">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>
                  <strong>Regra de Garantia:</strong> Para adiantamento parcial, o valor total da garantia alocada ({formatCurrency(totalCollateralValue)}) deve ser estritamente <strong>MAIOR</strong> que o valor do adiantamento ({formatCurrency(effectiveAdvanceAmount)}). Selecione mais títulos acima.
                </span>
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 mt-8 pt-4 border-t border-white/10">
            <button 
              type="button"
              onClick={onClose}
              className={cn(
                "flex-1 py-3 rounded-lg border transition-all text-xs font-bold uppercase tracking-wider cursor-pointer",
                theme === 'dark' 
                  ? "border-white/10 hover:bg-white/5 text-white/60" 
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              )}
            >
              Cancelar
            </button>
            
            <button 
              type="button"
              disabled={!isValidToSubmit}
              onClick={handleConfirm}
              className={cn(
                "flex-1 sm:flex-[2] py-3 rounded-lg transition-all flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider cursor-pointer shadow-lg",
                isValidToSubmit
                  ? "bg-amber-500 hover:bg-amber-400 text-black font-extrabold"
                  : "bg-gray-600/30 text-white/30 border border-white/5 cursor-not-allowed"
              )}
            >
              <CheckCircle2 size={16} /> Confirmar Adiantamento {advanceType} ({formatCurrency(effectiveAdvanceAmount)})
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
