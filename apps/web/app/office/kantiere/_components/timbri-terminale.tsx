'use client';

import { Fingerprint, LogIn, LogOut, PencilLine } from 'lucide-react';

import type { TimbroVisto } from '@/app/_lib/timbro/giornate';

const fmtOra = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'Europe/Rome',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * I passaggi al terminale di una giornata, uno per pillola: l'ora, la
 * direzione (e se l'abbiamo dedotta noi), con che cosa (badge o a mano).
 * Serve all'ufficio, al tecnico e al super admin: lo stesso disegno.
 */
export function TimbriTerminale({ timbri, compatto = false }: { timbri: TimbroVisto[]; compatto?: boolean }) {
  if (timbri.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {timbri.map((t) => {
        const Dir = t.tipo === 'ingresso' ? LogIn : LogOut;
        const titolo =
          (t.scartato
            ? 'Scartato (doppione o senza ora)'
            : t.tipo === 'ingresso'
              ? 'Ingresso'
              : 'Uscita') +
          (t.dedotto && !t.scartato ? ' · direzione dedotta dalla sequenza' : '') +
          (t.genere === 'badge' ? ' · badge al terminale' : t.genere === 'manuale' ? ' · inserito a mano su Timbro' : '') +
          (t.dispositivo ? ` · terminale ${t.dispositivo}` : '');
        return (
          <span
            key={t.id}
            title={titolo}
            className={[
              'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] tabular-nums',
              t.scartato
                ? 'border-border bg-muted/40 text-muted-foreground line-through'
                : t.tipo === 'ingresso'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-slate-200 bg-slate-50 text-slate-700',
            ].join(' ')}
          >
            {t.genere === 'manuale' ? (
              <PencilLine className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />
            ) : (
              <Fingerprint className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />
            )}
            {!t.scartato && t.tipo ? <Dir className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
            <span className="font-medium">{fmtOra.format(new Date(t.ts))}</span>
            {!compatto && !t.scartato && t.tipo ? (
              <span className="text-[10px] opacity-80">{t.tipo === 'ingresso' ? 'in' : 'out'}</span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
