import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from 'lucide-react';
import { cn } from '@kommessa/ui';

import type { StatoCollegamento } from '@kommessa/api/integrazione-salute';

/**
 * Il semaforo di un collegamento, identico ovunque compaia.
 *
 * Sta in un componente suo perche' lo usano tre pagine: il tab del cliente, la
 * console di piattaforma e (domani) qualunque riepilogo. Se il colore lo
 * scegliesse ogni pagina, prima o poi due pagine mostrerebbero due colori per
 * lo stesso stato.
 */

const STILI: Record<
  StatoCollegamento,
  { etichetta: string; classi: string; Icona: typeof CheckCircle2 }
> = {
  ok: {
    etichetta: 'Regolare',
    classi:
      'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    Icona: CheckCircle2,
  },
  attenzione: {
    etichetta: 'Da guardare',
    classi: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    Icona: AlertTriangle,
  },
  guasto: {
    etichetta: 'In avaria',
    classi: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400',
    Icona: XCircle,
  },
  mai_visto: {
    etichetta: 'Mai partito',
    classi: 'border-border bg-muted/50 text-muted-foreground',
    Icona: HelpCircle,
  },
};

export function SemaforoCollegamento({
  stato,
  compatto = false,
}: {
  stato: StatoCollegamento;
  /** Solo il pallino con l'icona, senza la parola. Per le righe di tabella. */
  compatto?: boolean;
}) {
  const s = STILI[stato];
  if (compatto) {
    return (
      <span
        title={s.etichetta}
        className={cn(
          'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border',
          s.classi,
        )}
      >
        <s.Icona className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">{s.etichetta}</span>
      </span>
    );
  }
  return (
    <span
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
        s.classi,
      )}
      title={s.etichetta}
    >
      <s.Icona className="h-4 w-4" aria-hidden="true" />
      <span className="sr-only">{s.etichetta}</span>
    </span>
  );
}

export function etichettaStato(stato: StatoCollegamento): string {
  return STILI[stato].etichetta;
}
