'use client';

import { RefreshCw, Folder } from 'lucide-react';

export function CloudRetry() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center">
      <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Folder className="h-5 w-5" />
      </span>
      <p className="text-sm font-semibold text-foreground">Cartella in creazione</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Se la commessa è appena stata creata, la cartella cloud è ancora in preparazione.
        Riprova tra qualche secondo.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition-all active:scale-95 hover:bg-muted"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Riprova
      </button>
    </div>
  );
}
