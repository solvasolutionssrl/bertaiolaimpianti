import Link from 'next/link';
import { ArrowRight, Radio, ShieldCheck, Sparkles, CloudUpload } from 'lucide-react';

/* ──────────────────────────────────────────────────────────────────────── */
/*  "Fasce" strette del sito vetrina.                                         */
/*                                                                            */
/*  Servono a STACCARE due sezioni chiare (che accostate non contrastano):    */
/*  tra un chiaro e l'altro c'è sempre uno scuro (sezione piena) OPPURE una   */
/*  di queste fasce (scuro sottile). Sono tutte navy così separano davvero.   */
/*                                                                            */
/*  Ordine su una pagina: le GRAFICHE prima, la DEMO sempre per ultima. Se    */
/*  ne servono più di una grafica si alternano/ne inventiamo altre.           */
/*  Server components: nessuno stato client (il marquee è CSS puro).          */
/* ──────────────────────────────────────────────────────────────────────── */

const NAVY = {
  background: 'linear-gradient(180deg, hsl(219 54% 19%), hsl(222 52% 14%))',
} as const;

function StripShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="dark relative isolate overflow-hidden border-y border-white/10" style={NAVY}>
      <div aria-hidden className="border-brand-line absolute inset-x-0 top-0 z-10 h-px opacity-70" />
      {children}
    </section>
  );
}

/* ── Fascia grafica A · marquee delle funzioni ────────────────────────── */
export function MarqueeStrip() {
  const items = [
    'QR di cantiere',
    'Presenze in tempo reale',
    'Rapportino automatico',
    'Viaggi con km reali',
    'Mezzi e autisti',
    'Note spese con AI',
    'Costo del cantiere',
    'Pianificazione settimanale',
    'Ferie e permessi',
    'Sync col gestionale',
  ];
  const row = [...items, ...items]; // duplicato per il loop continuo
  return (
    <StripShell>
      <div
        className="relative overflow-hidden py-5"
        style={{
          WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent)',
          maskImage: 'linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent)',
        }}
      >
        <div className="flex w-max animate-marquee gap-2.5">
          {row.map((label, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-[13px] font-medium text-white/85"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              {label}
            </span>
          ))}
        </div>
      </div>
    </StripShell>
  );
}

/* ── Fascia grafica B · i "valori" della suite in mono ────────────────── */
export function ValoriStrip() {
  const facts = [
    { icon: Sparkles, label: 'Voce e AI a bordo' },
    { icon: CloudUpload, label: 'Sync col cloud' },
    { icon: ShieldCheck, label: 'Dati in Europa' },
    { icon: Radio, label: 'In tempo reale' },
  ];
  return (
    <StripShell>
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-6 py-7">
        {facts.map(({ icon: Icon, label }) => (
          <span
            key={label}
            className="inline-flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.14em] text-white/80"
          >
            <Icon className="h-4 w-4 shrink-0 text-accent" aria-hidden />
            {label}
          </span>
        ))}
      </div>
    </StripShell>
  );
}

/* ── Fascia demo · SEMPRE l'ultima fascia della pagina ────────────────── */
export function DemoStrip({
  titolo = 'Vuoi vederlo sul tuo cantiere?',
  sotto = 'Una demo su misura, coi tuoi cantieri e i tuoi tecnici.',
}: {
  titolo?: string;
  sotto?: string;
}) {
  return (
    <StripShell>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-7 gap-y-4 px-6 py-9 text-center">
        <div>
          <p className="text-lg font-semibold tracking-tight text-white sm:text-xl">{titolo}</p>
          <p className="mt-1 text-sm text-white/70">{sotto}</p>
        </div>
        <Link
          href="/contatti"
          className="group inline-flex h-11 items-center gap-2 rounded-md bg-accent px-6 text-sm font-semibold text-accent-foreground shadow-glow-brand transition hover:opacity-95 active:translate-y-px"
        >
          Richiedi una demo
          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </Link>
      </div>
    </StripShell>
  );
}
