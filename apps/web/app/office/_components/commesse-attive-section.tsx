import Link from 'next/link';
import { Card, Skeleton } from '@kommessa/ui';
import { ArrowUpRight, Briefcase } from 'lucide-react';
import { getCommesseAttive } from '../_lib/queries';
import { CommesseAttiveList } from './commesse-attive-list';

/**
 * Macro-card "Commesse in lavorazione" (dashboard, colonna destra).
 * Elenco compatto ricercabile — include anche le "Non prese" (aperta).
 * Header con link alla Panoramica stampabile.
 */
export async function CommesseAttiveSection() {
  const rows = await getCommesseAttive();

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-start gap-2.5">
          <span
            aria-hidden
            className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-soft-foreground [&_svg]:size-4"
          >
            <Briefcase />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-soft-foreground">
              Attive · ricercabili
            </p>
            <h2 className="text-base font-semibold leading-tight tracking-tight">
              Commesse in lavorazione
            </h2>
          </div>
        </div>
        <Link
          href="/office/commesse"
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          Apri tutte le commesse
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <CommesseAttiveList rows={rows} />
    </Card>
  );
}

export function CommesseAttiveSkeleton() {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-8 w-8 rounded-md" />
          <div className="space-y-1.5">
            <Skeleton className="h-2.5 w-20 rounded-full" />
            <Skeleton className="h-4 w-36 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-6 w-24 rounded-md" />
      </div>
      <div className="space-y-3 p-3">
        <Skeleton className="h-9 w-full rounded-md" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-40 rounded-full" />
              <Skeleton className="h-2.5 w-52 rounded-full" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </Card>
  );
}
