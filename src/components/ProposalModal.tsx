import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2, ShieldCheck, FileText, Send, Loader2, XCircle, AlertCircle, ArrowRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { updateBitrixDealWithFile, rejectBitrixDeal, parseBitrixCurrency } from '../services/bitrixService';
import { saveSignature, updateCommissionStatus } from '../services/firebaseService';

async function getClientIp(): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch('https://api.ipify.org?format=json', {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    const data = await response.json();
    return data.ip || 'IP_NAO_DISPONIVEL';
  } catch (error) {
    clearTimeout(timeoutId);
    return 'IP_NAO_DISPONIVEL';
  }
}

interface ProposalModalProps {
  isOpen: boolean;
  onClose: () => void;
  proposal: {
    commissionId: string;
    pvId: string;
    valorLiberado: number;
    observacoes: string;
    itemDetails: any;
    dealId: string;
  };
  userInfo: {
    nome: string;
    cpf: string;
    email?: string;
  };
  onSuccess: () => void;
  theme?: 'dark' | 'light';
}

export default function ProposalModal({ isOpen, onClose, proposal, userInfo, onSuccess, theme = 'dark' }: ProposalModalProps) {
  const [step, setStep] = useState<'review' | 'details' | 'sign' | 'loading' | 'success' | 'confirm_reject'>('review');
  const [formData, setFormData] = useState({
    nome: userInfo.nome,
    cpf: userInfo.cpf,
    creci: localStorage.getItem('antecipa_creci') || '',
    email: localStorage.getItem('antecipa_email') || userInfo.email || '',
    endereco: localStorage.getItem('antecipa_endereco') || '',
    operacaoTipo: 'VENDA',
    imovel: '',
    cliente: '',
    valorBruto: '',
    percentualCedido: '100',
    formaPagamento: localStorage.getItem('antecipa_formaPagamento') || 'PIX',
    dadosBancarios: localStorage.getItem('antecipa_dadosBancarios') || '',
    concordo: false
  });

  const formatCurrency = (val: any) => {
    const num = parseBitrixCurrency(val);
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
  };

  useEffect(() => {
    if (isOpen && proposal) {
      const details = proposal.itemDetails || {};
      const imovelParts = [details.empreendimento, details.blocoUnidade].filter(Boolean);
      const imovelStr = imovelParts.length > 0 ? imovelParts.join(' - ') : '';
      const clienteStr = details.cliente || details.nome || '';
      const valorBrutoStr = details.valorNumeric ? formatCurrency(details.valorNumeric) : (details.valorOriginalP || details.valor || '');

      setFormData(prev => ({
        ...prev,
        nome: userInfo.nome,
        cpf: userInfo.cpf,
        imovel: imovelStr,
        cliente: clienteStr,
        valorBruto: valorBrutoStr,
        concordo: false
      }));
      setStep('review');
    }
  }, [isOpen, proposal, userInfo]);

  // Persist common fields as user types
  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (['creci', 'email', 'endereco', 'formaPagamento', 'dadosBancarios'].includes(field)) {
      localStorage.setItem(`antecipa_${field}`, value);
    }
  };

  const handleSign = async () => {
    setStep('loading');
    try {
      const now = new Date();
      const fullDateStr = `${now.getDate()} de ${now.toLocaleString('pt-BR', { month: 'long' })} de ${now.getFullYear()}`;
      const ip = await getClientIp();
      const userAgent = navigator.userAgent;
      
      const contractText = `
INSTRUMENTO PARTICULAR DE CESSÃO DE CRÉDITOS DE
COMISSÃO IMOBILIÁRIA COM ANTECIPAÇÃO DE RECEBÍVEIS

QUADRO-RESUMO DA OPERAÇÃO

CEDENTE (CORRETOR): ${formData.nome}, CPF: ${formData.cpf}, CRECI: ${formData.creci}, Endereço: ${formData.endereco}, E-mail: ${formData.email};

CESSIONÁRIA: ANTECIPA SOLUÇÕES FINANCEIRAS LTDA, CNPJ: 12.670.349/0001-10, Endereço: AV GOVERNADOR AGAMENON MAGALHAES, No 4775, Sala 1201 e 1202 - EMPR BOA VISTA, ILHA DO LEITE - RECIFE/PE, E-mail: contato@antecipa.com.br;

OPERAÇÃO VINCULADA: [${formData.operacaoTipo}], Imóvel: ${formData.imovel}, Cliente(s): ${formData.cliente}.

CRÉDITO DE COMISSÃO:
Valor bruto estimado da comissão: ${formData.valorBruto}
Forma De Pagamento Da Antecipação: [${formData.formaPagamento}]
Dados bancários: ${formData.dadosBancarios}.


DAS CLÁUSULAS GERAIS

CLÁUSULA 1 – OBJETO
1.1. O presente instrumento tem por objeto a cessão, em caráter irrevogável e irretratável, pelo(a) CEDENTE à CESSIONÁRIA, dos direitos creditórios decorrentes de comissão imobiliária vinculada à operação descrita no quadro-resumo, incluindo venda, locação, parceria, intermediação ou qualquer outro negócio imobiliário relacionado.
1.2. A cessão compreende o percentual indicado no quadro-resumo, abrangendo principal, atualização monetária, encargos e demais acessórios eventualmente incidentes sobre o crédito cedido.
1.3. O(a) CEDENTE declara que o crédito cedido é legítimo, existente, exigível e livre de ônus, disputas, cessões anteriores, penhoras ou restrições de qualquer natureza.

CLÁUSULA 2 – PAGAMENTO DA ANTECIPAÇÃO
2.1. Em razão da cessão dos créditos, a CESSIONÁRIA realizará o pagamento do valor indicado no quadro-resumo ao(à) CEDENTE, mediante uma das modalidades ali previstas.
2.2. O comprovante de transferência bancária servirá como prova de pagamento e plena quitação da antecipação concedida.
2.3. A antecipação prevista neste instrumento constitui mera liberalidade comercial da CESSIONÁRIA, não gerando obrigação de concessões futuras ao(à) CEDENTE, ainda que haja operações semelhantes posteriores.

CLÁUSULA 3 – RESPONSABILIDADE DO(A) CEDENTE
3.1. O(a) CEDENTE permanece integralmente responsável pela existência, legitimidade, validade, exigibilidade e manutenção do crédito cedido.
3.2. O(a) CEDENTE obriga-se a restituir integralmente os valores antecipados pela CESSIONÁRIA, corrigidos monetariamente e acrescidos dos encargos previstos neste contrato, caso ocorra:
I – Cancelamento, distrato, rescisão ou desfazimento do negócio imobiliário;
II – Inadimplemento relacionado à operação que impeça o recebimento da comissão;
III – Inexistência total ou parcial do crédito;
IV – Redução, retenção, suspensão ou estorno da comissão;
V – Fraude, irregularidade documental ou vício na negociação;
VI – Perda do direito à comissão por ato, omissão ou responsabilidade do(a) CEDENTE;
VII – Contestação judicial ou extrajudicial capaz de comprometer o recebimento do crédito cedido.
3.3. O(a) CEDENTE declara ciência de que a antecipação concedida possui natureza de cessão civil de crédito, com aquisição de recebíveis mediante deságio negocial, não configurando empréstimo, financiamento ou operação de mútuo.

CLÁUSULA 4 – OBRIGAÇÕES DO(A) CEDENTE
4.1. O(a) CEDENTE obriga-se a:
I – não praticar qualquer ato que reduza, inviabilize ou comprometa o recebimento do crédito cedido;
II – comunicar imediatamente qualquer fato capaz de afetar a operação imobiliária ou a comissão;
III – manter seu registro profissional ativo e regular perante o CRECI;
IV – observar integralmente as normas legais, éticas, regulatórias e de compliance aplicáveis à atividade de intermediação imobiliária;
V – fornecer documentos e informações solicitados pela CESSIONÁRIA relacionados à operação objeto deste instrumento.
4.2. Caso o(a) CEDENTE receba diretamente quaisquer valores relacionados ao crédito cedido, obriga-se a repassá-los integralmente à CESSIONÁRIA no prazo máximo de 02 (dois) dias úteis, sob pena de caracterização de retenção indevida de valores.

CLÁUSULA 5 – AUTORIZAÇÃO DE RETENÇÃO E COMPENSAÇÃO
5.1. O(a) CEDENTE autoriza, de forma irrevogável e irretratável, que a CESSIONÁRIA promova a retenção, compensação ou abatimento de valores decorrentes de futuras comissões, premiações, bonificações, repasses ou quaisquer créditos existentes em favor do(a) CEDENTE, até a quitação integral das obrigações previstas neste instrumento.
5.2. A autorização prevista nesta cláusula poderá ser utilizada inclusive em outras operações imobiliárias intermediadas pela CESSIONÁRIA.
5.3. O(a) CEDENTE autoriza a CESSIONÁRIA a comunicar a cessão de crédito à fonte pagadora, administradora, imobiliária parceira, incorporadora ou qualquer terceiro relacionado à operação, para fins de direcionamento dos pagamentos.

CLÁUSULA 6 – INADIMPLEMENTO E PENALIDADES
6.1. O descumprimento de qualquer obrigação prevista neste instrumento acarretará:
I – multa não compensatória correspondente a 10% (dez por cento) sobre o débito atualizado;
II – juros moratórios de 1% (um por cento) ao mês, calculados pro rata die;
III – correção monetária pelo IGPM/FGV, ou outro índice que venha a substituí-lo;
IV – honorários advocatícios, judiciais (20%) ou extrajudiciais (10%), e despesas de cobrança.
6.2. O inadimplemento superior a 05 (cinco) dias úteis autoriza o vencimento antecipado das obrigações eventualmente pendentes.

CLÁUSULA 7 – TÍTULO EXECUTIVO EXTRAJUDICIAL
7.1. As partes reconhecem que o presente instrumento constitui título executivo extrajudicial, nos termos do artigo 784, inciso III, do Código de Processo Civil, sendo líquidas, certas e exigíveis as obrigações nele previstas.

CLÁUSULA 8 – PROTEÇÃO DE DADOS E CONFIDENCIALIDADE
8.1. As partes autorizam o tratamento e compartilhamento de dados pessoais e informações relacionadas à operação para fins de execução contratual, cobrança, prevenção à fraude, exercício regular de direitos, cumprimento de obrigações legais e procedimentos internos da CESSIONÁRIA, observada a Lei nº 13.709/2018 (LGPD).
8.2. O(a) CEDENTE compromete-se a manter sigilo sobre informações comerciais, estratégicas e operacionais da CESSIONÁRIA às quais tiver acesso em razão da presente relação contratual.

CLÁUSULA 9 – ASSINATURA ELETRÔNICA
9.1. As Partes envolvidas neste Instrumento afirmam e declaram que o presente documento poderá ser assinado por meio eletrônico, sendo consideradas válida as referidas assinaturas. As Partes também declaram reconhecerem como válidas as assinaturas eletrônicas feitas através de plataforma digital, quando enviadas para os endereços de e-mail citados nas suas qualificações do presente Instrumento, e reconhecem válidas as assinaturas enviadas para o(s) endereço(s) do(s) seu(s) representante(s), todos para fins deste contrato, nos termos do art. 10 parágrafo 2º da MP2200-2/2001. Dispensadas as testemunhas por declaração expressa e autorização legal.

CLÁUSULA 10 – DISPOSIÇÕES FINAIS
10.1. A eventual tolerância de qualquer das partes quanto ao descumprimento de obrigação contratual será interpretada como mera liberalidade, não implicando novação ou renúncia de direitos.
10.2. A nulidade ou inexigibilidade de qualquer disposição deste instrumento não afetará as demais cláusulas, que permanecerão válidas e eficazes.
10.3. Este instrumento obriga as partes, seus herdeiros e sucessores.
10.4. Fica eleito o foro da Comarca de Recife/PE para dirimir quaisquer controvérsias oriundas deste instrumento, com renúncia expressa a qualquer outro, por mais privilegiado que seja.

E, por estarem justos e contratados, firmam o presente instrumento em uma única via, em conjunto, para que surta todos os seus efeitos.

Recife, ${fullDateStr}.

CEDENTE: ${formData.nome}
CESSIONÁRIA: ANTECIPA SOLUÇÕES FINANCEIRAS LTDA
ANUENTE / INTERVENIENTE:

ASSINADO DIGITALMENTE POR:
NOME: ${formData.nome}
CPF: ${formData.cpf}
IP: ${ip}
DATA/HORA: ${now.toLocaleString('pt-BR')}
`;
      
      const base64Content = btoa(unescape(encodeURIComponent(contractText)));
      const fileName = `Termo_Cessao_PV${proposal.pvId}.txt`;

      try {
        if (proposal.dealId) {
          await updateBitrixDealWithFile(proposal.dealId, base64Content, fileName);
        }
      } catch (bitrixErr) {
        console.error('Erro ao salvar documento assinado no Bitrix (CORS ou rede):', bitrixErr);
      }

      await saveSignature(proposal.commissionId, {
        name: formData.nome,
        document: formData.cpf,
        address: formData.endereco,
        ip,
        userAgent,
        metadata: {
           creci: formData.creci,
           banco: formData.dadosBancarios,
           imovel: formData.imovel,
           cliente: formData.cliente
        }
      });

      setStep('success');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    } catch (error) {
      console.error('Erro no fluxo de assinatura:', error);
      alert('Erro ao processar assinatura. Tente novamente.');
      setStep('sign');
    }
  };

  const handleReject = async () => {
    setStep('loading');
    try {
      if (proposal.dealId) {
        try {
          await rejectBitrixDeal(proposal.dealId);
        } catch (bitrixErr) {
          console.error('Erro ao recusar proposta no Bitrix (CORS ou rede):', bitrixErr);
        }
      }
      await updateCommissionStatus(proposal.commissionId, 'rejected', 'Garantia Negada pelo Usuário');
      
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Erro ao recusar proposta:', error);
      alert('Erro ao recusar proposta. Tente novamente.');
      setStep('review');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        className={cn(
          "absolute inset-0 transition-opacity duration-300",
          theme === 'dark' ? "bg-black/90 backdrop-blur-md" : "bg-slate-900/30 backdrop-blur-sm"
        )}
        onClick={step !== 'loading' ? onClose : undefined}
      />
      
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={cn(
          "relative w-full max-w-xl max-h-[90vh] overflow-y-auto border rounded-sm shadow-2xl transition-all duration-300",
          theme === 'dark' ? "bg-[#0a0a0a] border-white/10" : "bg-white border-slate-200"
        )}
      >
        <div className="p-5 sm:p-8">
          <div className="flex justify-between items-center mb-8">
            <h2 className={cn(
              "text-[10px] font-bold uppercase tracking-[0.4em] flex items-center gap-2 transition-colors",
              theme === 'dark' ? "text-white/40" : "text-slate-500 font-extrabold"
            )}>
              <ShieldCheck size={14} className="text-blue-500" /> Confirmação de Proposta
            </h2>
            {step !== 'loading' && (
              <button onClick={onClose} className={cn("transition-colors cursor-pointer", theme === 'dark' ? "text-white/20 hover:text-white" : "text-slate-400 hover:text-slate-800")}>
                <X size={20} />
              </button>
            )}
          </div>

          <AnimatePresence mode="wait">
            {step === 'review' && (
              <motion.div 
                key="review"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-6"
              >
                <div className={cn(
                  "p-6 rounded-sm border transition-all duration-300",
                  theme === 'dark' ? "bg-white/5 border-white/5 text-white" : "bg-slate-50/85 border-slate-150 text-slate-800"
                )}>
                  <p className={cn(
                    "text-[9px] uppercase tracking-widest mb-1",
                    theme === 'dark' ? "text-white/40" : "text-slate-450 font-bold"
                  )}>Valor Liberado para Adiantamento</p>
                  <p className={cn(
                    "text-3xl font-light",
                    theme === 'dark' ? "text-blue-400" : "text-blue-600 font-medium"
                  )}>{formatCurrency(proposal.valorLiberado)}</p>
                </div>

                {/* Detalhamento do Imóvel / Venda */}
                <div className={cn(
                  "p-4 sm:p-5 rounded-sm border space-y-3 transition-all duration-300",
                  theme === 'dark' ? "bg-white/[0.02] border-white/5" : "bg-slate-50 border-slate-200 text-slate-800"
                )}>
                  <h4 className={cn(
                    "text-[10px] uppercase font-bold tracking-widest border-b pb-2",
                    theme === 'dark' ? "text-white/60 border-white/5" : "text-slate-600 border-slate-200"
                  )}>Dados do Imóvel e Operação</h4>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className={cn("text-[9px] uppercase font-bold tracking-widest block", theme === 'dark' ? "text-white/30" : "text-slate-400")}>PV / Pedido de Venda</span>
                      <span className="font-semibold">{proposal.pvId || '-'}</span>
                    </div>
                    <div>
                      <span className={cn("text-[9px] uppercase font-bold tracking-widest block", theme === 'dark' ? "text-white/30" : "text-slate-400")}>Empreendimento</span>
                      <span className="font-semibold">{proposal.itemDetails?.empreendimento || '-'}</span>
                    </div>
                    <div>
                      <span className={cn("text-[9px] uppercase font-bold tracking-widest block", theme === 'dark' ? "text-white/30" : "text-slate-400")}>Unidade / Bloco</span>
                      <span className="font-semibold">{proposal.itemDetails?.blocoUnidade || '-'}</span>
                    </div>
                    <div>
                      <span className={cn("text-[9px] uppercase font-bold tracking-widest block", theme === 'dark' ? "text-white/30" : "text-slate-400")}>Cliente (Comprador/Locatário)</span>
                      <span className="font-semibold">{proposal.itemDetails?.cliente || proposal.itemDetails?.nome || '-'}</span>
                    </div>
                    <div>
                      <span className={cn("text-[9px] uppercase font-bold tracking-widest block", theme === 'dark' ? "text-white/30" : "text-slate-400")}>Vencimento Estimado</span>
                      <span className="font-semibold">
                        {proposal.itemDetails?.previsaoMes && proposal.itemDetails?.previsaoAno 
                          ? `${proposal.itemDetails.previsaoMes}/${proposal.itemDetails.previsaoAno}` 
                          : '-'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className={cn(
                      "text-[10px] uppercase font-bold tracking-widest mb-2",
                      theme === 'dark' ? "text-white/60" : "text-slate-500"
                    )}>Observações da Análise</h4>
                    <div className={cn(
                      "text-sm leading-relaxed p-4 border select-none italic rounded-sm transition-all duration-300",
                      theme === 'dark' ? "text-white/40 bg-[#111] border-white/5" : "text-slate-600 bg-slate-50 border-slate-200"
                    )}>
                      "{proposal.observacoes || 'Nenhuma observação específica registrada.'}"
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 mt-6 sm:mt-8">
                  <button 
                    onClick={() => setStep('confirm_reject')}
                    className="flex-1 border border-rose-500/20 hover:bg-rose-500/10 text-rose-500 py-3 sm:py-4 rounded-sm transition-all flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest"
                  >
                    <XCircle size={16} /> Recusar Proposta
                  </button>
                  <button 
                    onClick={() => setStep('details')}
                    className="flex-1 sm:flex-[2] bg-blue-600 hover:bg-blue-500 text-white py-3 sm:py-4 rounded-sm transition-all flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest"
                  >
                    <FileText size={16} /> Preencher Dados e Avançar
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'details' && (
              <motion.div 
                key="details"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-4"
              >
                <h3 className={cn(
                  "text-[11px] font-bold uppercase tracking-widest border-b pb-2 mb-4",
                  theme === 'dark' ? "text-white/60 border-white/5" : "text-slate-600 border-slate-200"
                )}>Dados Complementares do Contrato</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className={cn(
                      "text-[9px] uppercase font-bold tracking-widest",
                      theme === 'dark' ? "text-white/30" : "text-slate-450"
                    )}>CRECI</label>
                    <input 
                      type="text" 
                      placeholder="Ex: 12345-F"
                      value={formData.creci}
                      onChange={(e) => updateField('creci', e.target.value)}
                      className={cn(
                        "w-full p-2 text-sm rounded-sm outline-none transition-all border",
                        theme === 'dark' 
                          ? "bg-white/5 border-white/10 text-white focus:border-blue-500/50 focus:bg-white/10" 
                          : "bg-slate-50 border-slate-250 text-slate-800 focus:border-blue-600 focus:bg-white"
                      )}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={cn(
                      "text-[9px] uppercase font-bold tracking-widest",
                      theme === 'dark' ? "text-white/30" : "text-slate-450"
                    )}>E-mail Profissional</label>
                    <input 
                      type="email" 
                      placeholder="corretor@email.com"
                      value={formData.email}
                      onChange={(e) => updateField('email', e.target.value)}
                      className={cn(
                        "w-full p-2 text-sm rounded-sm outline-none transition-all border",
                        theme === 'dark' 
                          ? "bg-white/5 border-white/10 text-white focus:border-blue-500/50 focus:bg-white/10" 
                          : "bg-slate-50 border-slate-250 text-slate-800 focus:border-blue-600 focus:bg-white"
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className={cn(
                    "text-[9px] uppercase font-bold tracking-widest",
                    theme === 'dark' ? "text-white/30" : "text-slate-450"
                  )}>Endereço Residencial Completo</label>
                  <input 
                    type="text" 
                    placeholder="Rua, Número, Bairro, Cidade - UF"
                    value={formData.endereco}
                    onChange={(e) => updateField('endereco', e.target.value)}
                    className={cn(
                      "w-full p-2 text-sm rounded-sm outline-none transition-all border",
                      theme === 'dark' 
                        ? "bg-white/5 border-white/10 text-white focus:border-blue-500/50 focus:bg-white/10" 
                        : "bg-slate-50 border-slate-250 text-slate-800 focus:border-blue-600 focus:bg-white"
                    )}
                  />
                </div>

                <div className="space-y-1">
                  <label className={cn(
                    "text-[9px] uppercase font-bold tracking-widest",
                    theme === 'dark' ? "text-white/30" : "text-slate-450"
                  )}>Tipo de Operação</label>
                  <select 
                    value={formData.operacaoTipo}
                    onChange={(e) => updateField('operacaoTipo', e.target.value)}
                    className={cn(
                      "w-full p-2 text-sm rounded-sm outline-none cursor-pointer border",
                      theme === 'dark' 
                        ? "bg-[#111] border-white/10 text-white" 
                        : "bg-slate-50 border-slate-250 text-slate-800"
                    )}
                  >
                    <option value="VENDA">VENDA</option>
                    <option value="LOCAÇÃO">LOCAÇÃO</option>
                    <option value="PARCERIA">PARCERIA</option>
                    <option value="OUTRO">OUTRO</option>
                  </select>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-4">
                  <button 
                    onClick={() => setStep('review')}
                    className={cn(
                      "flex-1 border py-3 sm:py-4 rounded-sm transition-all text-xs font-bold uppercase tracking-widest w-full",
                      theme === 'dark' 
                        ? "border-white/10 hover:bg-white/5 text-white/60" 
                        : "border-slate-350 hover:bg-slate-100/50 text-slate-600"
                    )}
                  >
                    Voltar
                  </button>
                  <button 
                    disabled={!formData.creci || !formData.email || !formData.endereco}
                    onClick={() => setStep('sign')}
                    className="flex-1 sm:flex-[2] bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white py-3 sm:py-4 rounded-sm transition-all flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest w-full"
                  >
                    Gerar Contrato <ArrowRight size={16} />
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'confirm_reject' && (
              <motion.div 
                key="confirm_reject"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="py-10 text-center"
              >
                <div className="w-16 h-16 bg-rose-500/20 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-6">
                  <AlertCircle size={32} />
                </div>
                <h3 className={cn("text-xl font-bold mb-2", theme === 'dark' ? "text-white" : "text-slate-900")}>Confirmar Recusa?</h3>
                <p className={cn("text-sm mb-8 max-w-xs mx-auto", theme === 'dark' ? "text-white/40" : "text-slate-500")}>
                  Ao recusar, esta negociação será encerrada no Bitrix e você precisará iniciar uma nova solicitação se mudar de idéia.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <button 
                    onClick={() => setStep('review')}
                    className={cn(
                      "w-full sm:w-auto px-8 py-3 text-xs font-bold uppercase tracking-widest rounded-sm transition-all",
                      theme === 'dark' ? "bg-white/5 hover:bg-white/10 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                    )}
                  >
                    Voltar
                  </button>
                  <button 
                    onClick={handleReject}
                    className="w-full sm:w-auto px-8 py-3 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold uppercase tracking-widest rounded-sm transition-all"
                  >
                    Confirmar Recusa
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'sign' && (
              <motion.div 
                key="sign"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-6"
              >
                <div className={cn(
                  "max-h-[300px] overflow-y-auto mb-6 p-5 border text-[10px] font-mono leading-relaxed whitespace-pre-wrap rounded-sm",
                  theme === 'dark' 
                    ? "bg-[#111] border-white/5 text-white/40" 
                    : "bg-slate-50 border-slate-200 text-slate-600"
                )}>
                  <p className={cn(
                    "font-bold mb-4 uppercase text-center underline text-xs leading-relaxed",
                    theme === 'dark' ? "text-white/70" : "text-slate-800"
                  )}>
                    INSTRUMENTO PARTICULAR DE CESSÃO DE CRÉDITOS DE<br/>
                    COMISSÃO IMOBILIÁRIA COM ANTECIPAÇÃO DE RECEBÍVEIS
                  </p>
                  
                  <div className="space-y-4">
                    <section>
                      <p className={cn("font-bold mb-2", theme === 'dark' ? "text-white/60" : "text-slate-700")}>QUADRO-RESUMO DA OPERAÇÃO</p>
                      <p><span className={theme === 'dark' ? "text-white/20 font-bold" : "text-slate-400 font-bold"}>CEDENTE (CORRETOR):</span> {formData.nome}, CPF: {formData.cpf}, CRECI: {formData.creci}, Endereço: {formData.endereco}, E-mail: {formData.email};</p>
                      <p><span className={theme === 'dark' ? "text-white/20 font-bold" : "text-slate-400 font-bold"}>CESSIONÁRIA:</span> ANTECIPA SOLUÇÕES FINANCEIRAS LTDA, CNPJ: 12.670.349/0001-10, Endereço: AV GOVERNADOR AGAMENON MAGALHAES, No 4775, Sala 1201 e 1202 - EMPR BOA VISTA, ILHA DO LEITE - RECIFE/PE, E-mail: contato@antecipa.com.br;</p>
                      <p><span className={theme === 'dark' ? "text-white/20 font-bold" : "text-slate-400 font-bold"}>OPERAÇÃO VINCULADA:</span> [{formData.operacaoTipo}], Imóvel: {formData.imovel}, Cliente(s): {formData.cliente}.</p>
                      <p><span className={theme === 'dark' ? "text-white/20 font-bold" : "text-slate-400 font-bold"}>Adiantamento autorizado:</span> {formatCurrency(proposal.valorLiberado)}</p>
                    </section>

                    <section className={cn("border-t pt-4 space-y-4 text-justify", theme === 'dark' ? "border-white/5" : "border-slate-200")}>
                      <p className={cn("font-bold", theme === 'dark' ? "text-white/60" : "text-slate-700")}>DAS CLÁUSULAS GERAIS</p>
                      
                      <div>
                        <p className={cn("font-bold mb-1", theme === 'dark' ? "text-white/50" : "text-slate-700")}>CLÁUSULA 1 – OBJETO</p>
                        <p>1.1. O presente instrumento tem por objeto a cessão, em caráter irrevogável e irretratável, pelo(a) CEDENTE à CESSIONÁRIA, dos direitos creditórios decorrentes de comissão imobiliária vinculada à operação descrita no quadro-resumo, incluindo venda, locação, parceria, intermediação ou qualquer outro negócio imobiliário relacionado.</p>
                        <p>1.2. A cessão compreende o percentual indicado no quadro-resumo, abrangendo principal, atualização monetária, encargos e demais acessórios eventualmente incidentes sobre o crédito cedido.</p>
                        <p>1.3. O(a) CEDENTE declara que o crédito cedido é legítimo, existente, exigível e livre de ônus, disputas, cessões anteriores, penhoras ou restrições de qualquer natureza.</p>
                      </div>

                      <div>
                        <p className={cn("font-bold mb-1", theme === 'dark' ? "text-white/50" : "text-slate-700")}>CLÁUSULA 2 – PAGAMENTO DA ANTECIPAÇÃO</p>
                        <p>2.1. Em razão da cessão dos créditos, a CESSIONÁRIA realizará o pagamento do valor indicado no quadro-resumo ao(à) CEDENTE, mediante uma das modalidades ali previstas.</p>
                        <p>2.2. O comprovante de transferência bancária servirá como prova de pagamento e plena quitação da antecipação concedida.</p>
                        <p>2.3. A antecipação prevista neste instrumento constitui mera liberalidade comercial da CESSIONÁRIA, não gerando obrigação de concessões futuras ao(à) CEDENTE, ainda que haja operações semelhantes posteriores.</p>
                      </div>

                      <div>
                        <p className={cn("font-bold mb-1", theme === 'dark' ? "text-white/50" : "text-slate-700")}>CLÁUSULA 3 – RESPONSABILIDADE DO(A) CEDENTE</p>
                        <p>3.1. O(a) CEDENTE permanece integralmente responsável pela existência, legitimidade, validade, exigibilidade e manutenção do crédito cedido.</p>
                        <p>3.2. O(a) CEDENTE obriga-se a restituir integralmente os valores antecipados pela CESSIONÁRIA, corrigidos monetariamente e acrescidos dos encargos previstos neste contrato, caso ocorra:</p>
                        <p>I – Cancelamento, distrato, rescisão ou desfazimento do negócio imobiliário;</p>
                        <p>II – Inadimplemento relacionado à operação que impeça o recebimento da comissão;</p>
                        <p>III – Inexistência total ou parcial do crédito;</p>
                        <p>IV – Redução, retenção, suspensão ou estorno da comissão;</p>
                        <p>V – Fraude, irregularidade documental ou vício na negociação;</p>
                        <p>VI – Perda do direito à comissão por ato, omissão ou responsabilidade do(a) CEDENTE;</p>
                        <p>VII – Contestação judicial ou extrajudicial capaz de comprometer o recebimento do crédito cedido.</p>
                        <p>3.3. O(a) CEDENTE declara ciência de que a antecipação concedida possui natureza de cessão civil de crédito, com aquisição de recebíveis mediante deságio negocial, não configurando empréstimo, financiamento ou operação de mútuo.</p>
                      </div>

                      <div>
                        <p className={cn("font-bold mb-1", theme === 'dark' ? "text-white/50" : "text-slate-700")}>CLÁUSULA 4 – OBRIGAÇÕES DO(A) CEDENTE</p>
                        <p>4.1. O(a) CEDENTE obriga-se a:</p>
                        <p>I – não praticar qualquer ato que reduza, inviabilize ou comprometa o recebimento do crédito cedido;</p>
                        <p>II – comunicar imediatamente qualquer fato capaz de afetar a operação imobiliária ou a comissão;</p>
                        <p>III – manter seu registro profissional ativo e regular perante o CRECI;</p>
                        <p>IV – observar integralmente as normas legais, éticas, regulatórias e de compliance aplicáveis à atividade de intermediação imobiliária;</p>
                        <p>V – fornecer documentos e informações solicitados pela CESSIONÁRIA relacionados à operação objeto deste instrumento.</p>
                        <p>4.2. Caso o(a) CEDENTE receba diretamente quaisquer valores relacionados ao crédito cedido, obriga-se a repassá-los integralmente à CESSIONÁRIA no prazo máximo de 02 (dois) dias úteis, sob pena de caracterização de retenção indevida de valores.</p>
                      </div>

                      <div>
                        <p className={cn("font-bold mb-1", theme === 'dark' ? "text-white/50" : "text-slate-700")}>CLÁUSULA 5 – AUTORIZAÇÃO DE RETENÇÃO E COMPENSAÇÃO</p>
                        <p>5.1. O(a) CEDENTE autoriza, de forma irrevogável e irretratável, que a CESSIONÁRIA promova a retenção, compensação ou abatimento de valores decorrentes de futuras comissões, premiações, bonificações, repasses ou quaisquer créditos existentes em favor do(a) CEDENTE, até a quitação integral das obrigações previstas neste instrumento.</p>
                        <p>5.2. A autorização prevista nesta cláusula poderá ser utilizada inclusive em outras operações imobiliárias intermediadas pela CESSIONÁRIA.</p>
                        <p>5.3. O(a) CEDENTE autoriza a CESSIONÁRIA a comunicar a cessão de crédito à fonte pagadora, administradora, imobiliária parceira, incorporadora ou qualquer terceiro relacionado à operação, para fins de direcionamento dos pagamentos.</p>
                      </div>

                      <div>
                        <p className={cn("font-bold mb-1", theme === 'dark' ? "text-white/50" : "text-slate-700")}>CLÁUSULA 6 – INADIMPLEMENTO E PENALIDADES</p>
                        <p>6.1. O descumprimento de qualquer obrigação prevista neste instrumento acarretará:</p>
                        <p>I – multa não compensatória correspondente a 10% (dez por cento) sobre o débito atualizado;</p>
                        <p>II – juros moratórios de 1% (um por cento) ao mês, calculados pro rata die;</p>
                        <p>III – correção monetária pelo IGPM/FGV, ou outro índice que venha a substituí-lo;</p>
                        <p>IV – honorários advocatícios, judiciais (20%) ou extrajudiciais (10%), e despesas de cobrança.</p>
                        <p>6.2. O inadimplemento superior a 05 (cinco) dias úteis autoriza o vencimento antecipado das obrigações eventualmente pendentes.</p>
                      </div>

                      <div>
                        <p className={cn("font-bold mb-1", theme === 'dark' ? "text-white/50" : "text-slate-700")}>CLÁUSULA 7 – TÍTULO EXECUTIVO EXTRAJUDICIAL</p>
                        <p>7.1. As partes reconhecem que o presente instrumento constitui título executivo extrajudicial, nos termos do artigo 784, inciso III, do Código de Processo Civil, sendo líquidas, certas e exigíveis as obrigações nele previstas.</p>
                      </div>

                      <div>
                        <p className={cn("font-bold mb-1", theme === 'dark' ? "text-white/50" : "text-slate-700")}>CLÁUSULA 8 – PROTEÇÃO DE DADOS E CONFIDENCIALIDADE</p>
                        <p>8.1. As partes autorizam o tratamento e compartilhamento de dados pessoais e informações relacionadas à operação para fins de execução contratual, cobrança, prevenção à fraude, exercício regular de direitos, cumprimento de obrigações legais e procedimentos internos da CESSIONÁRIA, observada a Lei nº 13.709/2018 (LGPD).</p>
                        <p>8.2. O(a) CEDENTE compromete-se a manter sigilo sobre informações comerciais, estratégicas e operacionais da CESSIONÁRIA às quais tiver acesso em razão da presente relação contratual.</p>
                      </div>

                      <div>
                        <p className={cn("font-bold mb-1", theme === 'dark' ? "text-white/50" : "text-slate-700")}>CLÁUSULA 9 – ASSINATURA ELETRÔNICA</p>
                        <p>9.1. As Partes envolvidas neste Instrumento afirmam e declaram que o presente documento poderá ser assinado por meio eletrônico, sendo consideradas válida as referidas assinaturas. As Partes também declaram reconhecerem como válidas as assinaturas eletrônicas feitas através de plataforma digital, quando enviadas para os endereços de e-mail citados nas suas qualificações do presente Instrumento, e reconhecem válidas as assinaturas enviadas para o(s) endereço(s) do(s) seu(s) representante(s), todos para fins deste contrato, nos termos do art. 10 parágrafo 2º da MP2200-2/2001. Dispensadas as testemunhas por declaração expressa e autorização legal.</p>
                      </div>

                      <div>
                        <p className={cn("font-bold mb-1", theme === 'dark' ? "text-white/50" : "text-slate-700")}>CLÁUSULA 10 – DISPOSIÇÕES FINAIS</p>
                        <p>10.1. A eventual tolerância de qualquer das partes quanto ao descumprimento de obrigação contratual será interpretada como mera liberalidade, não implicando novação ou renúncia de direitos.</p>
                        <p>10.2. A nulidade ou inexigibilidade de qualquer disposição deste instrumento não afetará as demais cláusulas, que permanecerão válidas e eficazes.</p>
                        <p>10.3. Este instrumento obriga as partes, seus herdeiros e sucessores.</p>
                        <p>10.4. Fica eleito o foro da Comarca de Recife/PE para dirimir quaisquer controvérsias oriundas deste instrumento, com renúncia expressa a qualquer outro, por mais privilegiado que seja.</p>
                      </div>
                    </section>
                  </div>

                  <div className={cn("mt-8 border-t pt-4 text-center", theme === 'dark' ? "border-white/10" : "border-slate-200")}>
                    <p className={cn("text-[11px] mb-2 font-bold uppercase italic", theme === 'dark' ? "text-white/60" : "text-slate-700")}>Aceite e Assinatura Digital</p>
                    <p>Eu, <span className={cn("font-bold", theme === 'dark' ? "text-white/80" : "text-slate-800")}>{formData.nome}</span>, portador do CPF <span className={cn("font-bold", theme === 'dark' ? "text-white/80" : "text-slate-800")}>{formData.cpf}</span>, declaro que aceito integralmente os termos deste instrumento e autorizo a cessão dos créditos acima descritos.</p>
                    <p className={cn("mt-4 text-[9px]", theme === 'dark' ? "text-white/20" : "text-slate-400")}>Data: {new Date().toLocaleDateString('pt-BR')} | IP: Verificado Digitalmente</p>
                    <p className={cn("mt-6 text-[10px]", theme === 'dark' ? "text-white/40" : "text-slate-500")}>Recife, {new Date().getDate()} de {new Date().toLocaleString('pt-BR', { month: 'long' })} de {new Date().getFullYear()}.</p>
                    
                    <div className={cn("mt-8 grid grid-cols-2 gap-8 text-left text-[9px] uppercase tracking-tighter", theme === 'dark' ? "text-white/30" : "text-slate-450")}>
                      <div>
                        <p className={cn("border-t pt-2", theme === 'dark' ? "border-white/10" : "border-slate-200")}>CEDENTE: {formData.nome}</p>
                      </div>
                      <div>
                        <p className={cn("border-t pt-2", theme === 'dark' ? "border-white/10" : "border-slate-200")}>CESSIONÁRIA: ANTECIPA SOLUÇÕES FINANCEIRAS LTDA</p>
                      </div>
                      <div className="col-span-2 text-center opacity-50">
                        <p className={cn("border-t pt-2 mx-auto w-1/2", theme === 'dark' ? "border-white/10" : "border-slate-200")}>ANUENTE / INTERVENIENTE</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className={cn(
                    "flex items-start gap-4 p-4 border rounded-sm cursor-pointer transition-colors",
                    theme === 'dark' 
                      ? "bg-emerald-500/5 border-emerald-500/10 hover:bg-emerald-500/10" 
                      : "bg-emerald-500/5 border-emerald-500/10 hover:bg-emerald-500/10"
                  )}>
                    <input 
                      type="checkbox" 
                      checked={formData.concordo}
                      onChange={(e) => setFormData(prev => ({ ...prev, concordo: e.target.checked }))}
                      className="mt-1"
                    />
                    <span className={cn(
                      "text-[11px] leading-relaxed",
                      theme === 'dark' ? "text-white/60" : "text-slate-600 font-medium"
                    )}>
                      Declaro que li o Instrumento Particular de Cessão de Créditos e concordo com todas as cláusulas e condições estabelecidas.
                    </span>
                  </label>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button 
                    onClick={() => setStep('details')}
                    className={cn(
                      "flex-1 border py-3 sm:py-4 rounded-sm transition-all text-xs font-bold uppercase tracking-widest w-full",
                      theme === 'dark' 
                        ? "border-white/10 hover:bg-white/5 text-white/60" 
                        : "border-slate-350 hover:bg-slate-100/50 text-slate-600"
                    )}
                  >
                    Voltar
                  </button>
                  <button 
                    disabled={!formData.concordo}
                    onClick={handleSign}
                    className="flex-1 sm:flex-[2] bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white py-3 sm:py-4 rounded-sm transition-all flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest w-full"
                  >
                    <Send size={16} /> Confirmar Termos de Autorização
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'loading' && (
              <div className="py-20 flex flex-col items-center justify-center text-center">
                <Loader2 className="animate-spin text-blue-500 mb-4" size={40} />
                <p className={cn("text-[10px] uppercase font-bold tracking-[0.3em]", theme === 'dark' ? "text-white/40" : "text-slate-500")}>Autenticando Documento...</p>
                <p className={cn("text-[9px] uppercase tracking-widest mt-2", theme === 'dark' ? "text-white/20" : "text-slate-400")}>Registrando Operação e Blockchain Local</p>
              </div>
            )}

            {step === 'success' && (
              <div className="py-20 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mb-6">
                  <CheckCircle2 size={32} />
                </div>
                <h3 className={cn("text-xl font-bold mb-2", theme === 'dark' ? "text-white" : "text-slate-900")}>Proposta de Antecipação Aceita</h3>
                <p className={cn("text-sm max-w-md mx-auto", theme === 'dark' ? "text-white/60" : "text-slate-600")}>Os termos de autorização foram confirmados com sucesso. O processo de adiantamento seguirá para liberação e acompanhamento.</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
