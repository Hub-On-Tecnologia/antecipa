import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, X, AlertTriangle, ShieldCheck } from 'lucide-react';

interface SuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  hasCollateral: boolean;
  theme?: 'dark' | 'light';
}

export default function SuccessModal({ isOpen, onClose, hasCollateral, theme = 'dark' }: SuccessModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        className={
          theme === 'dark' 
            ? "absolute inset-0 bg-black/90 backdrop-blur-xl" 
            : "absolute inset-0 bg-slate-900/30 backdrop-blur-sm"
        }
        onClick={onClose}
      />
      
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className={
          theme === 'dark'
            ? "relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-[#0a0a0a] border border-white/10 rounded-sm shadow-[0_0_50px_rgba(0,0,0,0.5)]"
            : "relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-white border border-slate-200 rounded-sm shadow-2xl"
        }
      >
        <div className="p-6 sm:p-10 text-center">
          <div className="flex justify-center mb-8">
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 12, delay: 0.1 }}
              className={
                theme === 'dark'
                  ? "w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-500"
                  : "w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600"
              }
            >
              <CheckCircle2 size={40} />
            </motion.div>
          </div>

          <h3 className={
            theme === 'dark'
              ? "text-xl font-bold uppercase tracking-[0.2em] mb-4 text-white"
              : "text-xl font-black uppercase tracking-[0.2em] mb-4 text-slate-900"
          }>
            Solicitação Enviada
          </h3>
          <p className={
            theme === 'dark'
              ? "text-sm text-white/40 leading-relaxed mb-8"
              : "text-sm text-slate-500 font-semibold leading-relaxed mb-8"
          }>
            Sua solicitação de antecipação foi encaminhada com sucesso e já está em fila de processamento.
          </p>

          {!hasCollateral ? (
            <div className={
              theme === 'dark'
                ? "bg-amber-500/5 border border-amber-500/20 p-4 sm:p-6 rounded-sm mb-8 text-left"
                : "bg-amber-50 border border-amber-200 p-4 sm:p-6 rounded-sm mb-8 text-left"
            }>
              <div className="flex items-start gap-4">
                <AlertTriangle size={18} className={theme === 'dark' ? "text-amber-500 shrink-0 mt-0.5" : "text-amber-600 shrink-0 mt-0.5"} />
                <div>
                  <p className={
                    theme === 'dark'
                      ? "text-[10px] font-black uppercase tracking-widest text-amber-500 mb-2"
                      : "text-[10px] font-bold uppercase tracking-widest text-amber-700 mb-2"
                  }>
                    Aviso Importante
                  </p>
                  <p className={
                    theme === 'dark'
                      ? "text-[11px] text-amber-500/80 leading-relaxed uppercase font-medium"
                      : "text-[11px] text-amber-800 leading-relaxed uppercase font-semibold"
                  }>
                    Solicitações sem garantia adicional podem ser <span className="font-bold underline decoration-2">negadas por análise de risco</span> ou <span className="font-bold underline decoration-2">perder prioridade</span> na fila de adiantamentos.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className={
              theme === 'dark'
                ? "bg-emerald-500/5 border border-emerald-500/20 p-4 sm:p-6 rounded-sm mb-8 text-left"
                : "bg-emerald-50 border border-emerald-200 p-4 sm:p-6 rounded-sm mb-8 text-left"
            }>
              <div className="flex items-start gap-4">
                <ShieldCheck size={18} className={theme === 'dark' ? "text-emerald-500 shrink-0 mt-0.5" : "text-emerald-600 shrink-0 mt-0.5"} />
                <div>
                  <p className={
                    theme === 'dark'
                      ? "text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-2"
                      : "text-[10px] font-bold uppercase tracking-widest text-emerald-700 mb-2"
                  }>
                    Garantia Atrelada
                  </p>
                  <p className={
                    theme === 'dark'
                      ? "text-[11px] text-emerald-500/80 leading-relaxed uppercase font-medium"
                      : "text-[11px] text-emerald-800 leading-relaxed uppercase font-semibold"
                  }>
                    O uso de títulos em garantia aumenta a segurança da operação e garante maior prioridade no processamento da sua solicitação.
                  </p>
                </div>
              </div>
            </div>
          )}

          <button 
            onClick={onClose}
            className={
              theme === 'dark'
                ? "w-full bg-white text-black py-4 rounded-sm text-[10px] font-black uppercase tracking-[0.3em] hover:bg-white/90 transition-all cursor-pointer"
                : "w-full bg-slate-950 text-white py-4 rounded-sm text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-slate-800 transition-all cursor-pointer"
            }
          >
            Entendido
          </button>
        </div>

        <button 
          onClick={onClose}
          className={
            theme === 'dark'
              ? "absolute top-6 right-6 text-white/20 hover:text-white transition-colors cursor-pointer"
              : "absolute top-6 right-6 text-slate-400 hover:text-slate-800 transition-colors cursor-pointer"
          }
        >
          <X size={20} />
        </button>
      </motion.div>
    </div>
  );
}
