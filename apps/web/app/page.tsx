import Link from 'next/link';
import { ArrowRight, ShieldCheck, Wrench, Sparkles } from 'lucide-react';

export default function RootPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-aurora-brand">
      <div className="absolute inset-0 -z-10 bg-grid-radial opacity-60" aria-hidden />
      <div
        className="border-brand-line absolute inset-x-0 top-0 -z-10 h-1"
        aria-hidden
      />

      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-md shadow-glow-brand"
            style={{
              background:
                'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary)) 55%, hsl(var(--accent)) 100%)',
            }}
          >
            <span className="font-mono text-sm font-bold text-white">i+</span>
          </span>
          <div className="flex flex-col leading-none">
            <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              impiantiXplus
            </span>
            <span className="mt-0.5 text-sm font-semibold tracking-tight">
              Bertaiola Impianti
            </span>
          </div>
        </div>
        <Link
          href="/login"
          prefetch
          className="inline-flex items-center gap-1 text-sm font-medium text-foreground/80 transition hover:text-foreground"
        >
          Accedi
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </nav>

      <section className="mx-auto max-w-3xl px-6 pb-24 pt-20 text-center sm:pt-28">
        <div className="animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <span className="relative inline-flex h-1.5 w-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-success/60" />
              <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-success" />
            </span>
            SOLVA × Bertaiola · pilot in produzione
          </span>
        </div>

        <h1
          className="mt-7 text-balance text-5xl font-semibold tracking-tighter text-foreground sm:text-6xl md:text-7xl animate-fade-up"
          style={{ animationDelay: '60ms' }}
        >
          La gestione commesse,
          <br />
          <span className="text-brand-grad">finalmente al passo del cantiere.</span>
        </h1>

        <p
          className="mx-auto mt-6 max-w-xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg animate-fade-up"
          style={{ animationDelay: '120ms' }}
        >
          Dal sopralluogo alla chiusura, in un&apos;unica app. Ticket, fasi,
          foto da cantiere, documenti — tutto in un&apos;unica cronologia,
          tutto pronto per l&apos;ufficio.
        </p>

        <div
          className="mt-10 flex items-center justify-center gap-3 animate-fade-up"
          style={{ animationDelay: '180ms' }}
        >
          <Link
            href="/login"
            prefetch
            className="group inline-flex h-12 items-center gap-2 rounded-md bg-primary px-7 text-sm font-medium text-primary-foreground shadow-glow-brand transition hover:opacity-95 active:translate-y-px"
          >
            Apri l&apos;applicativo
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div
          className="mt-20 grid grid-cols-1 gap-3 text-left sm:grid-cols-3 animate-fade-up"
          style={{ animationDelay: '240ms' }}
        >
          {[
            {
              icon: Wrench,
              title: '38 voci · fasi',
              desc: 'Tassonomia completa pronta all\'uso.',
            },
            {
              icon: Sparkles,
              title: 'AI naming',
              desc: 'Suggerimento intelligente sulla cartella.',
            },
            {
              icon: ShieldCheck,
              title: 'GDPR EU',
              desc: 'Hosting Frankfurt/Dublin. Audit incluso.',
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="group relative overflow-hidden rounded-xl border border-border bg-card/80 p-5 backdrop-blur transition hover:-translate-y-0.5 hover:shadow-soft-md"
            >
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary-soft text-primary"
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="font-mono text-sm font-medium tabular-nums">
                  {title}
                </span>
              </div>
              <p className="mt-2 text-sm leading-snug text-muted-foreground">
                {desc}
              </p>
              <span
                aria-hidden="true"
                className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-accent/0 transition group-hover:bg-accent/10"
              />
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl items-center justify-between border-t border-border/70 px-6 py-6 text-xs text-muted-foreground">
        <span>
          © 2026 SOLVA Solutions · pilot tenant{' '}
          <span className="font-mono font-medium text-foreground">BER</span>
        </span>
        <span className="font-mono">v0.1 · build dev</span>
      </footer>
    </main>
  );
}
