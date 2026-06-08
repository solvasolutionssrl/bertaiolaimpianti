'use client';

/**
 * Sezione "Da completare": elenco delle bozze dell'utente con resume + scarta.
 *
 * Mostra nulla se non ci sono bozze (droppabile in qualunque pagina senza
 * ingombro). Il link di resume punta alla superficie giusta via `resumeBase`
 * (es. '/office/commesse/nuova' o '/mobile/voice-intake') + ?bozza=<id>.
 */

import * as React from 'react';
import Link from 'next/link';
import { FileEdit, Trash2, ChevronRight } from 'lucide-react';

import { useBozzeList } from '../_lib/bozze/use-bozze-list';
import { deleteBozza } from '../_lib/bozze/idb-store';

function quando(ms: number): string {
  const fmt = new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  return fmt.format(new Date(ms));
}

export function BozzeDaCompletare({
  resumeBase,
  variant = 'office',
}: {
  resumeBase: string;
  variant?: 'office' | 'mobile';
}) {
  const { bozze, loading, reload } = useBozzeList();
  const [busy, setBusy] = React.useState<string | null>(null);

  const scarta = async (id: string) => {
    if (typeof window !== 'undefined' && !window.confirm('Eliminare questa bozza?')) {
      return;
    }
    setBusy(id);
    await deleteBozza(id);
    await fetch(`/api/bozze/${id}`, { method: 'DELETE' }).catch(() => {});
    setBusy(null);
    await reload();
  };

  if (loading || bozze.length === 0) return null;

  const isMobile = variant === 'mobile';

  return (
    <section
      className={
        isMobile
          ? 'rounded-2xl border border-amber-200/70 bg-amber-50/70 p-4 shadow-sm'
          : 'rounded-xl border border-amber-200 bg-amber-50/60 p-5'
      }
      aria-label="Bozze da completare"
    >
      <div className="mb-3 flex items-center gap-2">
        <FileEdit className="h-4 w-4 text-amber-700" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-amber-900">
          Da completare
          <span className="ml-1.5 font-normal text-amber-700">({bozze.length})</span>
        </h2>
      </div>
      <ul className="space-y-2">
        {bozze.map((b) => (
          <li
            key={b.id}
            className="flex items-center gap-2 rounded-lg border border-amber-200/80 bg-white/80 px-3 py-2.5"
          >
            <Link
              href={`${resumeBase}?bozza=${b.id}`}
              className="flex min-w-0 flex-1 items-center gap-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {b.titolo}
                </p>
                <p className="text-xs text-muted-foreground">
                  {b.numeroBozza ? `Bozza #${b.numeroBozza} · ` : ''}
                  {quando(b.updatedAt)}
                  {b.soloLocale ? ' · solo su questo dispositivo' : ''}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={() => void scarta(b.id)}
              disabled={busy === b.id}
              className="shrink-0 rounded-md p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
              aria-label={`Elimina bozza ${b.titolo}`}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
