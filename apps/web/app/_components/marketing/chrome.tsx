import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { HeroParallax } from '../hero-parallax';

/* ──────────────────────────────────────────────────────────────────────── */
/*  Chrome condiviso del sito vetrina (landing · cantiere · contatti)        */
/*  Server components: solo link, nessuno stato client.                      */
/* ──────────────────────────────────────────────────────────────────────── */

export function BrandMark() {
  return (
    <span
      aria-hidden="true"
      className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg shadow-glow-brand"
      style={{
        background:
          'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary)) 55%, hsl(var(--accent)) 100%)',
      }}
    >
      <span className="font-mono text-base font-bold tracking-tighter text-white">K</span>
    </span>
  );
}

type NavKey = 'commesse' | 'cantiere' | 'contatti';

/**
 * Cornice condivisa del sito vetrina: aurora + parallasse + filo brand +
 * nav + footer. Usata da /kantiere e /contatti (la home ha una fascia top
 * leggermente più ricca e la costruisce da sé).
 */
export function MarketingShell({
  active,
  children,
}: {
  active?: NavKey;
  children: ReactNode;
}) {
  return (
    <main className="relative isolate min-h-screen bg-aurora-brand pt-3">
      <div className="absolute inset-0 -z-10 bg-grid-radial opacity-[0.55]" aria-hidden />
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-40"
        style={{
          background:
            'linear-gradient(105deg, hsl(214 82% 80%) 0%, hsl(217 64% 83%) 50%, hsl(27 84% 83%) 100%)',
          maskImage: 'linear-gradient(180deg, black 0%, black 16%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(180deg, black 0%, black 16%, transparent 100%)',
        }}
      />
      <HeroParallax />
      <div aria-hidden className="border-brand-line fixed inset-x-0 top-0 z-50 h-[3px]" />
      <MarketingNav active={active} />
      {children}
      <MarketingFooter />
    </main>
  );
}

export function MarketingNav({ active }: { active?: NavKey }) {
  const links: { key: NavKey; href: string; label: string }[] = [
    { key: 'commesse', href: '/', label: 'Commesse' },
    { key: 'cantiere', href: '/kantiere', label: 'Kantiere' },
    { key: 'contatti', href: '/contatti', label: 'Contatti' },
  ];
  return (
    <nav className="sticky top-3 z-40 mx-3 flex max-w-5xl items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/70 px-5 py-3 shadow-soft backdrop-blur-xl transition-colors supports-[backdrop-filter]:bg-background/55 sm:mx-auto sm:px-6">
      <Link href="/" className="flex items-center gap-2.5">
        <BrandMark />
        <span className="flex flex-col leading-none">
          <span className="text-base font-semibold tracking-tight">Kommessa</span>
          <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
            suite SOLVA
          </span>
        </span>
      </Link>

      <div className="hidden items-center gap-7 text-sm md:flex">
        {links.map((l) => (
          <Link
            key={l.key}
            href={l.href}
            className={
              active === l.key
                ? 'font-medium text-foreground'
                : 'text-foreground/70 transition hover:text-foreground'
            }
          >
            {l.label}
            {l.key === 'cantiere' && (
              <span className="ml-1.5 rounded-full bg-accent-soft px-1.5 py-0.5 align-middle font-mono text-[8px] uppercase tracking-[0.14em] text-accent-soft-foreground">
                add-on
              </span>
            )}
          </Link>
        ))}
      </div>

      <Link
        href="/login"
        prefetch
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow-brand transition hover:opacity-95"
      >
        Accedi
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </nav>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  tone = 'light',
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  tone?: 'light' | 'dark';
}) {
  return (
    <div className="mx-auto max-w-4xl text-center">
      <p
        className={`font-mono text-[11px] uppercase tracking-[0.18em] ${
          tone === 'dark' ? 'text-accent' : 'text-primary'
        }`}
      >
        {eyebrow}
      </p>
      <h2 className="mx-auto mt-2 max-w-3xl text-pretty text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {title}
      </h2>
      {subtitle && (
        <p className="mx-auto mt-3 max-w-2xl text-balance text-sm leading-relaxed text-muted-foreground sm:text-base">
          {subtitle}
        </p>
      )}
    </div>
  );
}

export function MarketingFooter() {
  return (
    <footer className="mt-10 border-t border-border/70 bg-background/40 backdrop-blur">
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <span className="flex flex-col leading-none">
              <span className="text-base font-semibold tracking-tight">Kommessa</span>
              <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                suite SOLVA
              </span>
            </span>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
            La piattaforma di gestione commesse e cantiere per impiantisti.
            Costruita in Italia, ospitata in Europa, fatta per chi lavora
            davvero sul campo.
          </p>
        </div>

        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Prodotto
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="/" className="text-foreground/80 hover:text-foreground">
                Commesse
              </Link>
            </li>
            <li>
              <Link href="/kantiere" className="text-foreground/80 hover:text-foreground">
                Modulo Kantiere
              </Link>
            </li>
            <li>
              <Link href="/contatti" className="text-foreground/80 hover:text-foreground">
                Contatti
              </Link>
            </li>
            <li>
              <Link href="/login" className="text-foreground/80 hover:text-foreground">
                Accedi
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Azienda
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <a
                href="https://solva.it"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-foreground/80 hover:text-foreground"
              >
                solva.it <ExternalLink className="h-3 w-3" />
              </a>
            </li>
            <li>
              <a
                href="mailto:info@solva.it"
                className="text-foreground/80 hover:text-foreground"
              >
                info@solva.it
              </a>
            </li>
            <li>
              <a
                href="https://impiantix.app"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-foreground/80 hover:text-foreground"
              >
                impiantiX <ExternalLink className="h-3 w-3" />
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-2 px-6 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <span>
            © {new Date().getFullYear()} Solva Solutions S.r.l. · Tutti i diritti
            riservati.
          </span>
          <span className="font-mono">
            powered by{' '}
            <a
              href="https://solva.it"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground/80 hover:text-foreground"
            >
              SOLVA
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
