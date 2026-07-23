import { useState, useEffect } from 'react';
import { Bell, X, Check, Trash2, Info, CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { subscribeToNotifications, markNotificationAsRead, deleteNotification } from '../services/firebaseService';
import { cn } from '../lib/utils';

interface NotificationCenterProps {
  userId: string;
  theme?: 'dark' | 'light';
}

export default function NotificationCenter({ userId, theme = 'dark' }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    if (!userId) return;
    const unsubscribe = subscribeToNotifications(userId, (data) => {
      setNotifications(data);
    });
    return () => unsubscribe();
  }, [userId]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle2 className="text-emerald-500" size={16} />;
      case 'error': return <AlertCircle className="text-rose-500" size={16} />;
      case 'warning': return <AlertTriangle className="text-amber-500" size={16} />;
      default: return <Info className="text-blue-500" size={16} />;
    }
  };

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "relative p-2 transition-colors cursor-pointer",
          theme === 'dark' ? "text-white/40 hover:text-white" : "text-slate-450 hover:text-slate-800"
        )}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className={cn(
                "absolute right-0 mt-2 w-[320px] max-h-[480px] border rounded-sm shadow-2xl z-50 overflow-hidden flex flex-col transition-all duration-300",
                theme === 'dark' ? "bg-[#0a0a0a] border-white/10" : "bg-white border-slate-200"
              )}
            >
              <div className={cn(
                "p-4 border-b flex justify-between items-center transition-colors",
                theme === 'dark' ? "border-white/5 bg-white/2" : "border-slate-100 bg-slate-50/50"
              )}>
                <h3 className={cn("text-[10px] uppercase font-bold tracking-[0.2em]", theme === 'dark' ? "text-white/60" : "text-slate-500 font-extrabold")}>Notificações</h3>
                <span className={cn("text-[9px] uppercase font-bold", theme === 'dark' ? "text-white/20" : "text-slate-400")}>{notifications.length} total</span>
              </div>

              <div className="overflow-y-auto flex-1">
                {notifications.length === 0 ? (
                  <div className="p-12 text-center">
                    <Bell className={cn("mx-auto mb-3", theme === 'dark' ? "text-white/10" : "text-slate-300")} size={32} />
                    <p className={cn("text-[10px] uppercase tracking-widest", theme === 'dark' ? "text-white/20" : "text-slate-400 font-semibold")}>Nenhuma notificação</p>
                  </div>
                ) : (
                  <div className={cn("divide-y transition-colors", theme === 'dark' ? "divide-white/5" : "divide-slate-100")}>
                    {notifications.map((n) => (
                      <div 
                        key={n.id} 
                        className={cn(
                          "p-4 transition-colors group relative",
                          !n.read 
                            ? (theme === 'dark' ? "bg-blue-500/5" : "bg-blue-100/20") 
                            : (theme === 'dark' ? "hover:bg-white/2" : "hover:bg-slate-50/50")
                        )}
                      >
                        <div className="flex gap-3">
                          <div className="mt-1">{getIcon(n.type)}</div>
                          <div className="flex-1 space-y-1">
                            <h4 className={cn("text-[11px] font-bold", !n.read ? (theme === 'dark' ? "text-white" : "text-slate-900") : (theme === 'dark' ? "text-white/60" : "text-slate-550"))}>
                              {n.title}
                            </h4>
                            <p className={cn("text-[10px] leading-relaxed", theme === 'dark' ? "text-white/40" : "text-slate-500")}>
                              {n.message}
                            </p>
                            <span className={cn("text-[8px] uppercase font-mono", theme === 'dark' ? "text-white/20" : "text-slate-405")}>
                              {n.createdAt?.toDate().toLocaleString('pt-BR')}
                            </span>
                          </div>
                        </div>

                        <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                          {!n.read && (
                            <button 
                              onClick={() => markNotificationAsRead(n.id)}
                              className="p-1.5 text-emerald-500/60 hover:text-emerald-500 hover:bg-emerald-500/10 rounded-sm cursor-pointer"
                              title="Marcar como lida"
                            >
                              <Check size={12} />
                            </button>
                          )}
                          <button 
                            onClick={() => deleteNotification(n.id)}
                            className="p-1.5 text-rose-500/60 hover:text-rose-500 hover:bg-rose-500/10 rounded-sm cursor-pointer"
                            title="Excluir"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
