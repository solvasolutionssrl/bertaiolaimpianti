import * as React from 'react';

import { cn } from '@impiantixplus/ui';

/**
 * Primitive del linguaggio "blueprint" per la app mobile.
 *
 * Componenti tipografici e atmosferici riusabili in tutte le pagine
 * mobile per dare un'identità coerente da strumento tecnico (Bosch GLM,
 * Leica Disto, Procore pro) — numerazione step monospace, marginalia
 * inline, divider tipografici.
 */

// ─── SectionNumber ──────────────────────────────────────────────────────────
// "01 / TITLE" — header tipografico di sezione stile blueprint.

export function SectionNumber({
  n,
  title,
  trailing,
  className,
}: {
  /** Numero progressivo. Mostrato in mono con zero-padding. */
  n: number;
  /** Titolo della sezione. Mostrato in uppercase wide tracking. */
  title: string;
  /** Slot a destra (es. count, link "vedi tutti", azione). */
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-2', className)}>
      <h2 className="flex items-baseline gap-2">
        <span className="font-mono text-[11px] font-medium tabular-nums text-muted-foreground/60">
          {String(n).padStart(2, '0')}
          <span className="mx-1 text-muted-foreground/40">/</span>
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground">
          {title}
        </span>
      </h2>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </div>
  );
}

// ─── MetaLine ────────────────────────────────────────────────────────────────
// Mono inline marginalia — data, autore, codici. Stile "appunti su blueprint".

export function MetaLine({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        'font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80',
        className,
      )}
    >
      {children}
    </p>
  );
}

// ─── Divider ─────────────────────────────────────────────────────────────────
// Linea sottile con label opzionale al centro stile "section break".

export function Divider({ label, className }: { label?: string; className?: string }) {
  if (!label) {
    return <hr className={cn('border-border/60', className)} />;
  }
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="h-px flex-1 bg-border/60" aria-hidden="true" />
      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/60">
        {label}
      </span>
      <span className="h-px flex-1 bg-border/60" aria-hidden="true" />
    </div>
  );
}

// ─── Stagger wrapper ─────────────────────────────────────────────────────────
// Applica fade-up con delay incrementale ai figli diretti.

export function Stagger({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('stagger', className)}>{children}</div>;
}

// ─── Hero ────────────────────────────────────────────────────────────────────
// Blocco dark blu profondo brand in cima alla pagina con grid texture
// di sfondo. Dà depth immediata e separa il "contesto" dal "contenuto".
// Le sezioni che seguono possono fare overlap negativo per fluttuare
// sopra il bordo inferiore curvo.

export function Hero({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative -mx-4 -mt-4 mb-2 overflow-hidden bg-primary px-4 pt-6 pb-12 text-primary-foreground',
        className,
      )}
    >
      {/* Grid pattern texture */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,0.7) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.7) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          maskImage: 'radial-gradient(ellipse at 50% 0%, black 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse at 50% 0%, black 30%, transparent 75%)',
        }}
      />
      {/* Accent glow arancio in basso a destra per "vita" */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-20 -right-16 h-48 w-48 rounded-full opacity-25 blur-3xl"
        style={{ background: 'hsl(var(--accent))' }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

// ─── HeroMeta ────────────────────────────────────────────────────────────────
// MetaLine ma in tono "dark hero" (semi-transparent sul blu).

export function HeroMeta({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        'font-mono text-[10px] uppercase tracking-[0.18em] text-primary-foreground/60',
        className,
      )}
    >
      {children}
    </p>
  );
}

// ─── Corner Tick ─────────────────────────────────────────────────────────────
// Decoro angolare stile "registration mark" tecnico per card distintive.

export function CornerTicks({ className }: { className?: string }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute left-0 top-0 h-2 w-2 border-l border-t border-primary/40',
          className,
        )}
      />
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute right-0 top-0 h-2 w-2 border-r border-t border-primary/40',
          className,
        )}
      />
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute bottom-0 left-0 h-2 w-2 border-b border-l border-primary/40',
          className,
        )}
      />
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute bottom-0 right-0 h-2 w-2 border-b border-r border-primary/40',
          className,
        )}
      />
    </>
  );
}
