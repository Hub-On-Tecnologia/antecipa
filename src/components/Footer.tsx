export default function Footer() {
  return (
    <footer className="bg-[#0A0A0A] text-white p-12 md:p-24 border-t border-white/5">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-12">
        {/* Brand & CNPJ */}
        <div className="space-y-8">
          <img 
            src="https://i.postimg.cc/T3gMF7f5/ANTECIPA-LOGO-1-removebg-preview.png" 
            alt="Antecipa Logo" 
            className="h-16 w-auto object-contain brightness-0 invert" 
            referrerPolicy="no-referrer"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 md:gap-16">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] opacity-40 mb-2">Razão Social</p>
              <p className="text-xs uppercase font-medium">Antecipa Soluções Financeiras Ltda</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] opacity-40 mb-2">CNPJ</p>
              <p className="text-xs font-mono">12.670.349/0001-10</p>
            </div>
          </div>
        </div>

        {/* Copyright notice aligned to the right or bottom */}
        <div className="pt-8 md:pt-0 border-t border-white/5 md:border-t-0 text-left md:text-right">
          <p className="text-[9px] text-white/20 leading-relaxed uppercase tracking-widest leading-loose">
            Antecipa Soluções Financeiras Ltda • © {new Date().getFullYear()}<br/>
            Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
