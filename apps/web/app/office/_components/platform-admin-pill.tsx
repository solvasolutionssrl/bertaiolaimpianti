'use client';

import * as React from 'react';
import Link from 'next/link';
import { ShieldCheck, ArrowRight } from 'lucide-react';

/**
 * Mini-banner mostrato in cima al main della UI office quando l'utente
 * loggato è anche un platform admin SOLVA. Permette il rientro rapido
 * alla console `/admin`. Non bloccante, non intrusivo.
 */
export function PlatformAdminPill() {
  return (
    <div
      role="status"
      className="mb-4 flex items-center gap-2 rounded-md border border-dashed border-foreground/15 bg-foreground/[0.03] px-3 py-2 text-xs text-foreground/80"
    >
      <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-accent" />
      <p className="min-w-0">
        Sei in modalità tenant come{' '}
        <span className="font-semibold">platform admin SOLVA</span>.
      </p>
      <Link
        href="/admin"
        className="ml-auto inline-flex items-center gap-1 font-semibold tracking-tight text-foreground hover:text-primary"
      >
        Torna a Platform
        <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
