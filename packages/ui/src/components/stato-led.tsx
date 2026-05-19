import * as React from 'react';

import { cn } from '../lib/cn';

/**
 * StatoLed — indicatore stato a "LED a 3 punti" stile strumento industriale.
 *
 * Tre pallini affiancati: il primo è il LED attivo (animato per stati live
 * come `aperta` / `in_corso`), gli altri due sono "tracce" inattive ma con
 * il colore dello stato. Sembra il pannello di un misuratore Bosch / Leica.
 *
 * Usato come elemento signature del linguaggio "blueprint" della app
 * mobile — sostituisce StatoBadge dove serve un'identità più forte.
 *
 * Combinarlo con la label uppercase in mono per il pattern completo:
 *   <StatoLed stato={stato} /> <span className="font-mono text-[10px] uppercase tracking-[0.18em]">In corso</span>
 */
export type StatoLedKind =
  | 'aperta'
  | 'in_corso'
  | 'collaudo'
  | 'critica'
  | 'completata'
  | 'bozza'
  | 'archiviata';

interface LedSpec {
  /** Tailwind class per il colore (deve essere statica per JIT). */
  color: string;
  /** Se true il LED principale pulsa (stati "live"). */
  live: boolean;
  /** Label di default. */
  label: string;
}

const SPECS: Record<StatoLedKind, LedSpec> = {
  aperta: { color: 'bg-stato-aperta', live: true, label: 'Aperta' },
  in_corso: { color: 'bg-stato-in-corso', live: true, label: 'In corso' },
  collaudo: { color: 'bg-stato-collaudo', live: true, label: 'Collaudo' },
  critica: { color: 'bg-stato-critica', live: true, label: 'Critica' },
  completata: { color: 'bg-stato-completata', live: false, label: 'Completata' },
  bozza: { color: 'bg-stato-bozza', live: false, label: 'Bozza' },
  archiviata: { color: 'bg-stato-archiviata', live: false, label: 'Archiviata' },
};

export interface StatoLedProps {
  stato: StatoLedKind;
  /** Mostra anche la label accanto (default false). */
  showLabel?: boolean;
  /** Sostituisce la label di default. */
  label?: string;
  className?: string;
}

export function StatoLed({ stato, showLabel = false, label, className }: StatoLedProps) {
  const spec = SPECS[stato] ?? SPECS.bozza;
  return (
    <span
      role="status"
      aria-label={`Stato: ${label ?? spec.label}`}
      className={cn('inline-flex items-center gap-2', className)}
    >
      <span className="relative inline-flex items-center gap-[3px]" aria-hidden="true">
        {/* LED 1 — attivo (pulsa se live) */}
        <span
          className={cn(
            'relative inline-block h-1.5 w-1.5 rounded-full',
            spec.color,
            spec.live && 'animate-ping-soft',
          )}
        />
        {/* LED 2-3 — tracce inattive */}
        <span className={cn('inline-block h-1.5 w-1.5 rounded-full opacity-50', spec.color)} />
        <span className={cn('inline-block h-1.5 w-1.5 rounded-full opacity-25', spec.color)} />
      </span>
      {showLabel ? (
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {label ?? spec.label}
        </span>
      ) : null}
    </span>
  );
}
