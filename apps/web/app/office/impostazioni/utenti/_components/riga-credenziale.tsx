'use client';

import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@kommessa/ui';

/**
 * Una credenziale da leggere a voce, con il tasto per copiarla.
 *
 * Sta in un file suo perché la usano due pannelli — quello che crea un accesso
 * e quello che ne reimposta la password — e sono lo stesso gesto: qualcuno
 * detta tre righe a qualcun altro.
 */
export function RigaCredenziale({
  etichetta,
  valore,
  chiave,
  copiato,
  onCopia,
}: {
  etichetta: string;
  valore: string;
  chiave: string;
  copiato: string | null;
  onCopia: (chiave: string, valore: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2">
      <span className="w-[72px] shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
        {etichetta}
      </span>
      <code className="min-w-0 flex-1 truncate font-mono text-sm">{valore}</code>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0"
        onClick={() => onCopia(chiave, valore)}
        aria-label={`Copia ${etichetta.toLowerCase()}`}
      >
        {copiato === chiave ? (
          <Check aria-hidden="true" className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <Copy aria-hidden="true" className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
}

/** Lo stato «ho copiato questa riga», condiviso da chi mostra più credenziali. */
export function useCopia() {
  const [copiato, setCopiato] = React.useState<string | null>(null);
  const copia = React.useCallback(async (chiave: string, valore: string) => {
    try {
      await navigator.clipboard.writeText(valore);
      setCopiato(chiave);
      setTimeout(() => setCopiato(null), 1800);
    } catch {
      /* se la copia non va, il valore è comunque a schermo */
    }
  }, []);
  return { copiato, copia };
}
