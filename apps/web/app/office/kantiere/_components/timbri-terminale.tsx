'use client';

import { Fingerprint, LogIn, LogOut, Monitor, PencilLine, Smartphone } from 'lucide-react';

import type { TimbroVisto } from '@/app/_lib/timbro/giornate';
import { oraMostrata } from '@kommessa/api/ora-mostrata';


/**
 * Da quale bocca viene un passaggio del registro: il badge al terminale, la
 * presenza segnata dall'app sul telefono o dal PC, o una riga messa a mano
 * su Timbro. E' la stessa domanda che `OrigineLine` fa alle timbrature sui
 * cantieri (QR / app / a mano): qui per il registro.
 */
export function boccaDelTimbro(t: Pick<TimbroVisto, 'genere' | 'dispositivo'>): {
  parola: string;
  titolo: string;
  Icona: typeof Fingerprint;
} {
  if (t.genere === 'manuale') return { parola: 'a mano', titolo: 'inserito a mano su Timbro', Icona: PencilLine };
  if (t.genere === 'badge') return { parola: 'badge', titolo: 'badge al terminale', Icona: Fingerprint };
  if (t.dispositivo === 'pc') return { parola: 'PC', titolo: 'segnato dal PC', Icona: Monitor };
  if (t.dispositivo === 'telefono') return { parola: 'app', titolo: 'segnato dall’app sul telefono', Icona: Smartphone };
  return { parola: 'badge', titolo: t.dispositivo ? `terminale ${t.dispositivo}` : 'terminale', Icona: Fingerprint };
}

/** Il titolo di un gruppo di passaggi: dice le bocche che contiene. */
export function titoloPassaggi(timbri: readonly Pick<TimbroVisto, 'genere' | 'dispositivo'>[]): string {
  const bocche = new Set(timbri.map((t) => boccaDelTimbro(t).parola));
  if (bocche.size === 0) return 'Presenza';
  if (bocche.size === 1) {
    const b = [...bocche][0]!;
    return b === 'badge' ? 'Badge al terminale' : b === 'a mano' ? 'Presenza inserita su Timbro' : b === 'PC' ? 'Presenza segnata dal PC' : 'Presenza segnata dall’app';
  }
  return 'Presenza · ' + [...bocche].join(' e ');
}

/**
 * I passaggi del registro di una giornata, uno per pillola: l'ora, la
 * direzione (e se l'abbiamo dedotta noi), e da quale bocca (badge, app, PC,
 * a mano). Serve all'ufficio, al tecnico e al super admin: lo stesso disegno.
 */
export function TimbriTerminale({ timbri, compatto = false }: { timbri: TimbroVisto[]; compatto?: boolean }) {
  if (timbri.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {timbri.map((t) => {
        const Dir = t.tipo === 'ingresso' ? LogIn : LogOut;
        const bocca = boccaDelTimbro(t);
        const titolo =
          (t.scartato
            ? 'Scartato (doppione o senza ora)'
            : t.tipo === 'ingresso'
              ? 'Ingresso'
              : 'Uscita') +
          (t.dedotto && !t.scartato ? ' · direzione dedotta dalla sequenza' : '') +
          ` · ${bocca.titolo}`;
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
            <bocca.Icona className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />
            {!t.scartato && t.tipo ? <Dir className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
            <span className="font-medium">{oraMostrata(t.ts)}</span>
            {!compatto && !t.scartato && t.tipo ? (
              <span className="text-[10px] opacity-80">{t.tipo === 'ingresso' ? 'in' : 'out'} · {bocca.parola}</span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
