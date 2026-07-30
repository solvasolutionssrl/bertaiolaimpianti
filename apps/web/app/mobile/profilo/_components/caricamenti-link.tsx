'use client';

import Link from 'next/link';
import { ChevronRight, UploadCloud } from 'lucide-react';
import { cn } from '@kommessa/ui';

import { useUploadQueueOptional } from '../../../_components/upload-queue-provider';

/**
 * Voce "Caricamenti" nel profilo: entrata stabile alla pagina dei file in
 * salita. Quando c'è qualcosa in sospeso mostra il conteggio e vira in ambra,
 * lo stesso codice colore del pannello fluttuante.
 */
export function CaricamentiLink() {
  const ctx = useUploadQueueOptional();
  const attivi = ctx?.activeCount ?? 0;
  const falliti = ctx?.jobs.filter((j) => j.status === 'failed').length ?? 0;
  const inSospeso = attivi + falliti;

  return (
    <Link
      href="/mobile/caricamenti"
      className={cn(
        'flex items-center gap-3 rounded-lg border bg-card p-4 active:scale-[0.99]',
        inSospeso > 0 ? 'border-amber-400/50' : '',
      )}
    >
      <span
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-full',
          inSospeso > 0
            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
            : 'bg-primary/10 text-primary',
        )}
      >
        <UploadCloud className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Caricamenti</span>
        <span className="block text-xs text-muted-foreground">
          {inSospeso > 0
            ? `${inSospeso} file da completare`
            : 'Foto e video già arrivati'}
        </span>
      </span>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </Link>
  );
}
