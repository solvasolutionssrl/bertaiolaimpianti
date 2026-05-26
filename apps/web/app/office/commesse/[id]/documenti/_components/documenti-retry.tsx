'use client';

import { Folder, RefreshCw } from 'lucide-react';
import { Button } from '@kommessa/ui';

export function DocumentiRetry() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-muted/20 px-8 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Folder className="h-6 w-6" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">Cartella in creazione</p>
        <p className="text-sm text-muted-foreground">
          Se la commessa è appena stata creata, la cartella cloud è ancora in
          preparazione. Riprova tra qualche secondo.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => window.location.reload()}
        className="gap-1.5"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Riprova
      </Button>
    </div>
  );
}
