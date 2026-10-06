'use client';

import * as React from 'react';
import { AlertCircle, Circle, Flame } from 'lucide-react';
import { cn } from '@kommessa/ui';
import {
  PRIORITA_IN_ORDINE,
  metaPriorita,
  type NomeIconaPriorita,
  type Priorita,
} from '@kommessa/api/priorita';

/**
 * La priorità a schermo: **una pastiglia e un selettore**, per tutta l'app.
 *
 * Prima la stessa colonna del database si disegnava in nove posti diversi, con
 * otto tavolozze che divergevano fra loro per dettagli che nessuno aveva deciso
 * (`/12` qui e `/15` là, `dark:` presente in un file e assente in quello
 * accanto, l'icona `Clock` sulla home mobile e `Circle` ovunque altrove). In un
 * caso si mostrava il valore grezzo del database, in minuscolo.
 *
 * I colori e le etichette stanno in `@kommessa/api/priorita`, che è puro e
 * testato. Qui c'è solo la resa.
 *
 * ⚠️ Le icone arrivano da lì come **nomi**, non come componenti: un'icona
 * Lucide non attraversa il confine server → client come prop, e `priorita.ts`
 * dev'essere importabile anche da un file server.
 */

const ICONE: Record<NomeIconaPriorita, React.ComponentType<{ className?: string }>> = {
  Flame,
  AlertCircle,
  Circle,
};

export function IconaPriorita({
  priorita,
  className,
}: {
  priorita: unknown;
  className?: string;
}) {
  const Icona = ICONE[metaPriorita(priorita).icona];
  return <Icona className={className} />;
}

export function PrioritaChip({
  priorita,
  /** Solo la parola, senza il numero: per le righe davvero strette. */
  corta = false,
  /** Anello di evidenza: si usa dove la riga è grande (board Lavori). */
  conAnello = false,
  className,
}: {
  priorita: unknown;
  corta?: boolean;
  conAnello?: boolean;
  className?: string;
}) {
  const m = metaPriorita(priorita);
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium',
        m.chip,
        conAnello && m.anello && `ring-1 ${m.anello}`,
        className,
      )}
    >
      <IconaPriorita priorita={priorita} className="h-3 w-3" />
      {corta ? m.parola : m.etichetta}
    </span>
  );
}

/** Il pallino pieno, per le liste a colonne della dashboard. */
export function PuntoPriorita({
  priorita,
  className,
}: {
  priorita: unknown;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block h-2 w-2 rounded-full', metaPriorita(priorita).punto, className)}
    />
  );
}

/**
 * Il selettore: tre pastiglie affiancate.
 *
 * Tre e non quattro, e in **orizzontale**: con tre voci ci stanno comode anche
 * su un telefono, e si vede tutta la scala in un colpo d'occhio invece di
 * doverla ricostruire a memoria da una tendina.
 */
export function PrioritaSelect({
  valore,
  onCambia,
  disabilitato,
  className,
  idEtichetta,
}: {
  valore: Priorita;
  onCambia: (p: Priorita) => void;
  disabilitato?: boolean;
  className?: string;
  /** Id dell'etichetta che descrive il gruppo, per i lettori di schermo. */
  idEtichetta?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-labelledby={idEtichetta}
      className={cn('grid grid-cols-3 gap-1.5', className)}
    >
      {PRIORITA_IN_ORDINE.map((m) => {
        const attiva = valore === m.valore;
        return (
          <button
            key={m.valore}
            type="button"
            role="radio"
            aria-checked={attiva}
            disabled={disabilitato}
            onClick={() => onCambia(m.valore)}
            className={cn(
              'flex min-h-[36px] items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-all max-sm:min-h-[44px]',
              attiva
                ? `${m.chip} ring-2 ring-offset-1 ${m.anello || 'ring-border'}`
                : 'border-border text-muted-foreground hover:border-primary/40',
              disabilitato && 'cursor-not-allowed opacity-60',
            )}
          >
            <IconaPriorita priorita={m.valore} className="h-3 w-3" />
            {m.etichetta}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Le voci per un filtro a chip (board Task, lista ticket). Si passa quale è
 * attiva e cosa fare al clic; la resa resta al chiamante, che ha già il suo
 * `FiltroGroup`.
 */
export const VOCI_FILTRO_PRIORITA = PRIORITA_IN_ORDINE.map((m) => ({
  valore: m.valore,
  etichetta: m.etichetta,
  parola: m.parola,
}));
