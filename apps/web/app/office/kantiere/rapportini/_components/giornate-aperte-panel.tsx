'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { fmtData } from '@/app/office/_lib/format';
import { chiudiGiornata, type GiornataAperta } from '@/app/office/_actions/kantiere-rapportini';

function fmtOra(ts: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts));
}

function messaggio(code: string): string {
  switch (code) {
    case 'NESSUNA_GIORNATA_APERTA':
      return 'La giornata risulta già chiusa.';
    case 'ORA_USCITA_NON_VALIDA':
      return "L'ora di uscita deve essere dopo l'ingresso.";
    case 'DIPENDENTE_NON_TROVATO':
      return 'Dipendente non trovato.';
    default:
      return 'Operazione non riuscita. Riprova.';
  }
}

/**
 * Promemoria ufficio: giornate passate con timbratura di uscita mancante.
 * Per ognuna, un controllo inline per inserire l'ora di uscita e chiudere la
 * giornata (ricalcola il rapportino).
 */
export function GiornateApertePanel({ giorni }: { giorni: GiornataAperta[] }) {
  const router = useRouter();
  if (giorni.length === 0) return null;
  return (
    <section className="rounded-xl border border-amber-300/60 bg-amber-50/70 p-3.5 shadow-soft">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        Giornate rimaste aperte ({giorni.length})
      </h2>
      <p className="mt-0.5 text-xs text-amber-900/80">
        Manca la timbratura di uscita. Indica l'ora di fine per chiudere la giornata e calcolare le ore.
      </p>
      <ul className="mt-2.5 space-y-1.5">
        {giorni.map((g) => (
          <GiornataRow
            key={`${g.dipendenteId}-${g.giorno}-${g.ingressoTs}`}
            g={g}
            onDone={() => router.refresh()}
          />
        ))}
      </ul>
    </section>
  );
}

function GiornataRow({ g, onDone }: { g: GiornataAperta; onDone: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [ora, setOra] = React.useState('17:00');
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  function conferma() {
    start(async () => {
      setErr(null);
      const res = await chiudiGiornata({ dipendenteId: g.dipendenteId, giorno: g.giorno, oraUscita: ora });
      if (res.ok) {
        setOpen(false);
        onDone();
      } else {
        setErr(messaggio(res.error));
      }
    });
  }

  return (
    <li className="rounded-lg border border-amber-300/50 bg-white px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 text-sm">
          <span className="font-medium text-foreground">{g.dipendenteNome}</span>
          <span className="text-muted-foreground">
            {' · '}
            {fmtData(g.giorno)}
            {g.targetLabel ? ` · ${g.targetLabel}` : ''}
            {' · ingresso '}
            <span className="tabular-nums">{fmtOra(g.ingressoTs)}</span>
          </span>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-md border border-amber-400 bg-white px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
          >
            Chiudi giornata
          </button>
        )}
      </div>
      {open && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground">Ora uscita</label>
          <input
            type="time"
            value={ora}
            onChange={(e) => setOra(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm tabular-nums"
          />
          <button
            type="button"
            onClick={conferma}
            disabled={pending}
            className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {pending ? 'Chiusura...' : 'Conferma'}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={pending}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            Annulla
          </button>
          {err && <span className="text-xs text-destructive">{err}</span>}
        </div>
      )}
    </li>
  );
}
