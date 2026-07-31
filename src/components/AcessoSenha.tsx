import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LogIn, Loader2, AlertCircle, CheckCircle2, KeyRound, UserPlus, ArrowLeft } from 'lucide-react';
import { signInWithCpfSenha } from '../services/firebaseService';
import { solicitarPrimeiroAcesso, solicitarRecuperacaoSenha } from '../services/sheetsService';
import { cn, formatarCPF, formatarDataBR } from '../lib/utils';

/**
 * Acesso do corretor por CPF e senha.
 *
 * Três fluxos numa tela só, porque são o mesmo assunto para quem está de fora:
 * entrar, criar a senha no primeiro acesso e recuperar a senha esquecida.
 *
 * O corretor nunca informa e-mail aqui. Nos dois fluxos que disparam envio, o
 * destino sai da base de corretores — é isso que cria o fator de posse.
 */
type Modo = 'entrar' | 'primeiro' | 'recuperar';

export default function AcessoSenha() {
  const [modo, setModo] = useState<Modo>('entrar');
  const [cpf, setCpf] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [dataNascimento, setDataNascimento] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'erro' | 'enviado'>('idle');
  const [mensagem, setMensagem] = useState('');

  const trocarModo = (novo: Modo) => {
    setModo(novo);
    setStatus('idle');
    setMensagem('');
    setSenha('');
  };

  /**
   * O Firebase distingue "usuário não existe" de "senha errada", e repassar
   * isso confirmaria quais CPFs têm cadastro. A mensagem é única de propósito.
   */
  const mensagemDeErro = (codigo: string): string => {
    if (codigo === 'auth/too-many-requests') {
      return 'Muitas tentativas. Aguarde alguns minutos antes de tentar de novo.';
    }
    if (codigo === 'auth/operation-not-allowed') {
      return 'O acesso por senha ainda não está habilitado.';
    }
    if (codigo === 'auth/network-request-failed') {
      return 'Falha de conexão. Verifique sua internet e tente de novo.';
    }
    return 'CPF ou senha incorretos.';
  };

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cpf || !senha) {
      setMensagem('Informe o CPF e a senha.');
      setStatus('erro');
      return;
    }

    setStatus('loading');
    setMensagem('');
    try {
      // O App observa o onAuthStateChanged e resolve o vínculo sozinho.
      await signInWithCpfSenha(cpf, senha);
    } catch (err: any) {
      setMensagem(mensagemDeErro(err?.code || ''));
      setStatus('erro');
    }
  };

  const pedirPrimeiroAcesso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !dataNascimento || !cpf) {
      setMensagem('Preencha nome, data de nascimento e CPF.');
      setStatus('erro');
      return;
    }

    setStatus('loading');
    setMensagem('');
    const r = await solicitarPrimeiroAcesso(nome, dataNascimento, cpf);
    setMensagem(r.message);
    setStatus(r.ok ? 'enviado' : 'erro');
  };

  const pedirRecuperacao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cpf) {
      setMensagem('Informe o CPF.');
      setStatus('erro');
      return;
    }

    setStatus('loading');
    setMensagem('');
    const r = await solicitarRecuperacaoSenha(cpf);
    setMensagem(r.message);
    setStatus(r.ok ? 'enviado' : 'erro');
  };

  const carregando = status === 'loading';

  const campo = "w-full bg-white/5 border border-white/10 px-4 py-4 sm:px-5 sm:py-5 rounded-sm focus:outline-none focus:border-white/40 focus:bg-white/[0.08] transition-all text-sm tracking-widest placeholder:text-white/10 disabled:opacity-40";
  const rotulo = "block text-[10px] uppercase tracking-[0.25em] font-bold text-white/40 ml-0.5";
  const botao = "w-full py-6 font-bold uppercase tracking-[0.3em] text-[11px] transition-all flex items-center justify-center gap-3 rounded-sm";
  const link = "text-[10px] uppercase tracking-[0.2em] font-bold text-white/40 hover:text-white transition-colors flex items-center gap-2";

  return (
    <div className="w-full max-w-lg">
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
        <div className="mb-8 sm:mb-12">
          <h2 className="text-3xl font-semibold mb-3 tracking-tight">
            {modo === 'entrar' && 'Acesso ao Portal'}
            {modo === 'primeiro' && 'Primeiro Acesso'}
            {modo === 'recuperar' && 'Recuperar Senha'}
          </h2>
          <p className="text-sm text-white/40 tracking-wide font-medium">
            {modo === 'entrar' && 'Entre com seu CPF e a senha cadastrada.'}
            {modo === 'primeiro' && 'Confirme seus dados. O link para criar a senha será enviado para o contato do seu cadastro.'}
            {modo === 'recuperar' && 'Informe seu CPF. O link será enviado para o contato do seu cadastro.'}
          </p>
        </div>

        <AnimatePresence mode="wait">
          <motion.form
            key={modo}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            onSubmit={modo === 'entrar' ? entrar : modo === 'primeiro' ? pedirPrimeiroAcesso : pedirRecuperacao}
            className="space-y-5 sm:space-y-8"
          >
            {modo === 'primeiro' && (
              <>
                <div className="space-y-2">
                  <label className={rotulo}>Nome Completo</label>
                  <input
                    type="text"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    disabled={carregando}
                    className={cn(campo, 'uppercase')}
                    placeholder="EX: JOÃO DA SILVA SANTOS"
                  />
                </div>
                <div className="space-y-2">
                  <label className={rotulo}>Data de Nascimento</label>
                  <input
                    type="text"
                    value={dataNascimento}
                    onChange={(e) => setDataNascimento(formatarDataBR(e.target.value))}
                    disabled={carregando}
                    maxLength={10}
                    className={campo}
                    placeholder="00/00/0000"
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <label className={rotulo}>CPF</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="username"
                value={cpf}
                onChange={(e) => setCpf(formatarCPF(e.target.value))}
                disabled={carregando}
                maxLength={14}
                className={campo}
                placeholder="000.000.000-00"
              />
            </div>

            {modo === 'entrar' && (
              <div className="space-y-2">
                <label className={rotulo}>Senha</label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  disabled={carregando}
                  className={campo}
                  placeholder="••••••••"
                />
              </div>
            )}

            <AnimatePresence mode="wait">
              {status === 'erro' && (
                <motion.div
                  key="erro"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center gap-3 text-rose-400 bg-rose-500/5 p-4 border border-rose-500/20"
                >
                  <AlertCircle size={16} className="shrink-0" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">{mensagem}</span>
                </motion.div>
              )}

              {status === 'enviado' && (
                <motion.div
                  key="enviado"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-start gap-3 text-emerald-400 bg-emerald-500/5 p-4 border border-emerald-500/20"
                >
                  <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                  <span className="text-[11px] font-bold uppercase tracking-wider leading-relaxed">{mensagem}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="pt-2">
              <button
                type="submit"
                disabled={carregando}
                className={cn(
                  botao,
                  carregando
                    ? 'bg-white/10 text-white/40 cursor-not-allowed'
                    : 'bg-white text-[#0A0A0A] hover:bg-white/90 active:scale-[0.99] shadow-[0_0_30px_rgba(255,255,255,0.05)]',
                )}
              >
                {carregando ? (
                  <>
                    <Loader2 className="animate-spin" size={16} />
                    <span>{modo === 'entrar' ? 'Entrando' : 'Enviando'}</span>
                  </>
                ) : (
                  <>
                    <span>
                      {modo === 'entrar' && 'Entrar'}
                      {modo === 'primeiro' && 'Enviar Link de Cadastro'}
                      {modo === 'recuperar' && 'Enviar Link de Recuperação'}
                    </span>
                    {modo === 'entrar' ? <LogIn size={16} /> : <KeyRound size={16} />}
                  </>
                )}
              </button>
            </div>
          </motion.form>
        </AnimatePresence>

        <div className="mt-8 pt-6 border-t border-white/5 flex flex-col sm:flex-row gap-4 sm:justify-between">
          {modo === 'entrar' ? (
            <>
              <button type="button" onClick={() => trocarModo('primeiro')} className={link}>
                <UserPlus size={12} /> Primeiro acesso
              </button>
              <button type="button" onClick={() => trocarModo('recuperar')} className={link}>
                <KeyRound size={12} /> Esqueci minha senha
              </button>
            </>
          ) : (
            <button type="button" onClick={() => trocarModo('entrar')} className={link}>
              <ArrowLeft size={12} /> Voltar para o acesso
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
