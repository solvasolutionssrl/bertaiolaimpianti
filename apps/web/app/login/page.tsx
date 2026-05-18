import type { Metadata } from 'next';
import { LoginForm } from './_components/form';

export const metadata: Metadata = { title: 'Accedi — impiantiXplus' };
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      {/* Sfondo carta calda */}
      <div className="absolute inset-0 bg-[hsl(32,28%,98%)]" />

      {/* Griglia di punti sottilissima */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: `radial-gradient(circle, hsl(220,30%,20%) 1px, transparent 1px)`,
          backgroundSize: '28px 28px',
        }}
      />

      {/* Blob cobalto in alto a destra */}
      <div
        aria-hidden="true"
        className="absolute right-0 top-0 h-[640px] w-[640px] -translate-y-1/3 translate-x-1/3 rounded-full bg-[hsl(220,80%,32%)] opacity-[0.055] blur-[120px]"
      />

      {/* Blob arancio in basso a sinistra */}
      <div
        aria-hidden="true"
        className="absolute bottom-0 left-0 h-[480px] w-[480px] -translate-x-1/3 translate-y-1/3 rounded-full bg-[hsl(22,92%,54%)] opacity-[0.045] blur-[100px]"
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-[380px]">
        {/* Wordmark */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2">
            {/* Icona brand: quadrato cobalto con angolo arancio */}
            <span
              aria-hidden="true"
              className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[hsl(220,80%,32%)]"
            >
              <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
                <rect x="3" y="3" width="6" height="6" rx="1" fill="white" opacity="0.9" />
                <rect x="11" y="3" width="6" height="6" rx="1" fill="white" opacity="0.5" />
                <rect x="3" y="11" width="6" height="6" rx="1" fill="white" opacity="0.5" />
                <rect x="11" y="11" width="6" height="6" rx="1" fill="hsl(22,92%,60%)" />
              </svg>
            </span>
            <span className="font-mono text-[15px] font-semibold tracking-tight text-[hsl(220,30%,9%)]">
              impiantiXplus
            </span>
          </div>
          <p className="mt-2 text-xs uppercase tracking-[0.2em] text-[hsl(220,10%,50%)]">
            Gestione Commesse · SOLVA
          </p>
        </div>

        <LoginForm />

        <p className="mt-6 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(220,10%,60%)]">
          Accesso riservato al personale autorizzato
        </p>
      </div>
    </main>
  );
}
