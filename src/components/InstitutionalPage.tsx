import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, ShieldCheck, Target, Users, Send, CheckCircle2, RotateCcw } from 'lucide-react';
import Footer from './Footer';

interface InstitutionalPageProps {
  onBack: () => void;
}

export default function InstitutionalPage({ onBack }: InstitutionalPageProps) {
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [tipoSolicitacao, setTipoSolicitacao] = useState('duvida');
  const [corpoTexto, setCorpoTexto] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Simple telephone formatting helper
  const handleTelefoneChange = (value: string) => {
    // Only allow numbers
    const numbersOnly = value.replace(/\D/g, '');
    let formatted = '';
    if (numbersOnly.length <= 11) {
      if (numbersOnly.length > 2) {
        formatted += `(${numbersOnly.slice(0, 2)}) `;
        if (numbersOnly.length > 7) {
          formatted += `${numbersOnly.slice(2, 7)}-${numbersOnly.slice(7)}`;
        } else {
          formatted += numbersOnly.slice(2);
        }
      } else {
        formatted += numbersOnly;
      }
      setTelefone(formatted);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome || !telefone || !corpoTexto) return;

    setLoading(true);

    // Simulate sending flow
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
    }, 1200);
  };

  const handleReset = () => {
    setNome('');
    setTelefone('');
    setTipoSolicitacao('duvida');
    setCorpoTexto('');
    setSubmitted(false);
  };

  return (
    <div className="min-h-screen bg-white text-black selection:bg-black/5 selection:text-black">
      {/* Navbar / Header */}
      <nav className="border-b border-black/5 p-6 md:p-8 flex items-center justify-between sticky top-0 bg-white/80 backdrop-blur-md z-50">
        <div className="flex items-center gap-4">
          <img 
            src="https://i.postimg.cc/T3gMF7f5/ANTECIPA-LOGO-1-removebg-preview.png" 
            alt="Antecipa Logo" 
            className="h-12 w-auto object-contain" 
            referrerPolicy="no-referrer"
          />
        </div>
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-[0.2em] text-black/60 hover:text-black transition-colors"
        >
          <ArrowLeft size={14} /> Voltar para o Portal
        </button>
      </nav>

      {/* Hero Section */}
      <header className="p-8 md:p-24 bg-[#F9F9F9] border-b border-black/5">
        <div className="max-w-5xl mx-auto">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-6xl md:text-8xl font-light tracking-tight mb-8 uppercase"
          >
            Sobre a <br/><span className="font-semibold italic">Antecipa.</span>
          </motion.h1>
          <p className="text-xl md:text-2xl text-black/60 max-w-2xl font-light leading-relaxed">
            Transformamos a liquidez de recebíveis em combustível para o crescimento do seu negócio.
          </p>
        </div>
      </header>

      {/* Content Sections */}
      <main className="p-8 md:p-24 space-y-32 max-w-5xl mx-auto">
        {/* Mission / Vision */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-16">
          <div className="space-y-6">
            <div className="w-12 h-12 bg-black text-white flex items-center justify-center rounded-sm">
              <Target size={24} />
            </div>
            <h3 className="text-xs font-bold uppercase tracking-[0.2em]">Nossa Missão</h3>
            <p className="text-sm text-black/60 leading-relaxed font-medium uppercase text-justify">
              Prover soluções financeiras ágeis e seguras, democratizando o acesso ao capital de giro para corretores e imobiliárias em todo o Brasil.
            </p>
          </div>
          <div className="space-y-6">
            <div className="w-12 h-12 bg-black text-white flex items-center justify-center rounded-sm">
              <ShieldCheck size={24} />
            </div>
            <h3 className="text-xs font-bold uppercase tracking-[0.2em]">Segurança</h3>
            <p className="text-sm text-black/60 leading-relaxed font-medium uppercase text-justify">
              Operamos com os mais altos padrões de compliance e tecnologia robusta para garantir que cada transação de antecipação seja imutável e transparente.
            </p>
          </div>
          <div className="space-y-6">
            <div className="w-12 h-12 bg-black text-white flex items-center justify-center rounded-sm">
              <Users size={24} />
            </div>
            <h3 className="text-xs font-bold uppercase tracking-[0.2em]">Foco no Cliente</h3>
            <p className="text-sm text-black/60 leading-relaxed font-medium uppercase text-justify">
              Entendemos a dinâmica do mercado imobiliário e construímos ferramentas que simplificam o dia a dia de quem faz o mercado acontecer.
            </p>
          </div>
        </section>

        {/* Contact Form Section */}
        <section className="border-t border-black/10 pt-16 grid grid-cols-1 md:grid-cols-5 gap-16">
          <div className="md:col-span-2 space-y-6">
            <span className="text-[9px] uppercase tracking-[0.4em] font-bold text-black/40 block">FALE CONOSCO</span>
            <h2 className="text-4xl font-light uppercase tracking-tight leading-none">
              Canal de <br/><span className="font-semibold">Atendimento</span>
            </h2>
            <p className="text-sm text-black/60 leading-relaxed font-medium uppercase text-justify">
              Deseja fazer uma crítica, elogio, tirar dúvidas ou sugerir melhorias? Preencha o formulário e sua mensagem será encaminhada diretamente para nossa equipe de atendimento.
            </p>
          </div>

          <div className="md:col-span-3">
            {submitted ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-8 border border-neutral-200 rounded-sm bg-[#fafafa] flex flex-col items-center text-center space-y-6 h-full justify-center"
              >
                <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center">
                  <CheckCircle2 size={32} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold uppercase tracking-tight">Solicitação Enviada!</h3>
                  <p className="text-xs text-black/60 max-w-sm leading-relaxed font-medium uppercase">
                    Sua mensagem foi enviada com sucesso e encaminhada aos nossos especialistas para análise.
                  </p>
                </div>
                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 border border-black/10 px-6 py-3 text-[10px] uppercase font-bold tracking-[0.2em] hover:bg-black hover:text-white transition-all rounded-sm active:scale-95"
                >
                  <RotateCcw size={12} /> Enviar Nova Mensagem
                </button>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Nome */}
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-black/50 block">Nome Completo</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Ana Silva"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      className="w-full border-b border-black/20 focus:border-black py-2.5 text-sm font-medium outline-none transition-colors placeholder:text-black/25 bg-transparent"
                    />
                  </div>

                  {/* Telefone */}
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-black/50 block">Telefone</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: (11) 98765-4321"
                      value={telefone}
                      onChange={(e) => handleTelefoneChange(e.target.value)}
                      className="w-full border-b border-black/20 focus:border-black py-2.5 text-sm font-medium outline-none transition-colors placeholder:text-black/25 bg-transparent"
                    />
                  </div>
                </div>

                {/* Tipo de Solicitação */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-black/50 block">Tipo da Solicitação</label>
                  <select
                    value={tipoSolicitacao}
                    onChange={(e) => setTipoSolicitacao(e.target.value)}
                    className="w-full border-b border-black/20 focus:border-black py-2.5 text-sm font-medium outline-none bg-transparent transition-colors cursor-pointer"
                  >
                    <option value="duvida">Dúvidas / Suporte</option>
                    <option value="elogio">Elogio</option>
                    <option value="critica">Crítica / Reclamação</option>
                    <option value="sugestao">Sugestão de Melhorias</option>
                    <option value="outros">Outros Assuntos</option>
                  </select>
                </div>

                {/* Corpo do Texto */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-black/50 block">Corpo do Texto / Mensagem</label>
                  <textarea
                    required
                    rows={4}
                    placeholder="Escreva detalhadamente sua mensagem aqui..."
                    value={corpoTexto}
                    onChange={(e) => setCorpoTexto(e.target.value)}
                    className="w-full border-b border-black/20 focus:border-black py-2.5 text-sm font-medium outline-none transition-colors placeholder:text-black/25 bg-transparent resize-none leading-relaxed"
                  />
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-black hover:bg-neutral-800 disabled:bg-neutral-300 text-white flex items-center justify-center gap-2.5 py-4 text-[10px] uppercase tracking-[0.2em] font-bold transition-all rounded-sm active:scale-95 disabled:scale-100 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>Enviando...</span>
                    </>
                  ) : (
                    <>
                      <Send size={12} />
                      <span>Enviar Solicitação</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

