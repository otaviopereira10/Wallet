import { ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import { Wordmark } from "@/components/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[radial-gradient(120%_90%_at_10%_10%,#FCEEF4_0%,#F8DCE8_45%,#E8A3C1_100%)] p-12 lg:flex lg:flex-col lg:justify-between">
        <Wordmark />
        <div className="max-w-md">
          <h1 className="font-display text-5xl font-medium leading-[1.05] tracking-tight text-[#302630]">
            Seu dinheiro, com clareza e calma.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-[#302630]/70">
            Contas, dívida universitária, metas e fluxo de caixa num só lugar — com cálculos precisos e recomendações baseadas nos seus dados reais.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-[#302630]/80">
            <li className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-xl bg-white/70"><TrendingUp className="size-4 text-[#C96B98]" /></span>Projeções que separam saldo real de previsto</li>
            <li className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-xl bg-white/70"><Sparkles className="size-4 text-[#C96B98]" /></span>Isabelle Intelligence para suas dúvidas</li>
            <li className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-xl bg-white/70"><ShieldCheck className="size-4 text-[#C96B98]" /></span>Privado por padrão, dados isolados por usuário</li>
          </ul>
        </div>
        <p className="text-xs text-[#302630]/50">Isabelle Wallet não movimenta dinheiro: organiza, calcula e recomenda.</p>
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/30 blur-3xl" aria-hidden />
      </aside>
      <main className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden"><Wordmark /></div>
          {children}
        </div>
      </main>
    </div>
  );
}
