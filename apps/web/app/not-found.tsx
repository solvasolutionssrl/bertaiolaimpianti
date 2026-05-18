import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[hsl(32,28%,98%)] p-6 text-center">
      {/* Dot grid */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.3]"
        style={{
          backgroundImage: `radial-gradient(circle, hsl(220,30%,20%) 1px, transparent 1px)`,
          backgroundSize: '28px 28px',
        }}
      />

      {/* Blob cobalto */}
      <div
        aria-hidden="true"
        className="absolute right-0 top-0 h-[500px] w-[500px] -translate-y-1/3 translate-x-1/3 rounded-full bg-[hsl(220,80%,32%)] opacity-[0.05] blur-[100px]"
      />

      <div className="relative z-10 flex max-w-md flex-col items-center gap-6">
        {/* Numero 404 geometrico */}
        <div className="relative">
          <span
            aria-hidden="true"
            className="block font-mono text-[120px] font-bold leading-none tracking-tight text-[hsl(220,80%,32%)] opacity-[0.07] select-none"
          >
            404
          </span>
          <div className="absolute inset-0 flex items-center justify-center">
            {/* Icona "pagina non trovata": griglia spezzata */}
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-[hsl(220,80%,32%)]/20 bg-white/80 shadow-sm">
              <svg viewBox="0 0 40 40" fill="none" className="h-10 w-10" aria-hidden="true">
                <rect x="4" y="4" width="10" height="10" rx="2" fill="hsl(220,80%,32%)" opacity="0.8" />
                <rect x="16" y="4" width="10" height="10" rx="2" fill="hsl(220,80%,32%)" opacity="0.3" />
                <rect x="4" y="16" width="10" height="10" rx="2" fill="hsl(220,80%,32%)" opacity="0.3" />
                {/* Quadrato mancante = 404 */}
                <rect x="16" y="16" width="10" height="10" rx="2" stroke="hsl(22,92%,54%)" strokeWidth="2" strokeDasharray="3 2" fill="none" />
                <rect x="28" y="4" width="8" height="8" rx="1.5" fill="hsl(220,80%,32%)" opacity="0.15" />
                <rect x="28" y="28" width="8" height="8" rx="1.5" fill="hsl(22,92%,54%)" opacity="0.3" />
                <rect x="4" y="28" width="8" height="8" rx="1.5" fill="hsl(220,80%,32%)" opacity="0.15" />
              </svg>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[hsl(220,10%,50%)]">
            · Errore 404 ·
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-[hsl(220,30%,9%)]">
            Pagina non trovata
          </h1>
          <p className="text-[15px] leading-relaxed text-[hsl(220,10%,45%)]">
            La risorsa che cerchi non esiste o è stata spostata.
            <br />
            Torna alla home per continuare.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/office"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[hsl(220,80%,32%)] px-5 font-mono text-[11px] uppercase tracking-[0.16em] text-white shadow-[0_4px_16px_-4px_hsl(220,80%,32%,0.35)] transition hover:bg-[hsl(220,80%,27%)] active:scale-[0.99]"
          >
            → Gestionale
          </Link>
          <Link
            href="/mobile"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-[hsl(30,12%,85%)] bg-white px-5 font-mono text-[11px] uppercase tracking-[0.16em] text-[hsl(220,30%,20%)] transition hover:border-[hsl(220,80%,32%)]/30 hover:bg-[hsl(220,80%,32%)]/5 active:scale-[0.99]"
          >
            → App mobile
          </Link>
        </div>

        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[hsl(220,10%,65%)]">
          impiantiXplus · powered by SOLVA
        </p>
      </div>
    </main>
  );
}
