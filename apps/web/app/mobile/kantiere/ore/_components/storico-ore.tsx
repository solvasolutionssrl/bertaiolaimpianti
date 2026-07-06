'use client';

import { useMemo, useState } from 'react';
import { History, PencilLine, Lock } from 'lucide-react';
import type { GiornoStorico } from '@/app/_actions/kantiere-rapportino';
import { ModificaGiornataDialog } from './modifica-giornata-dialog';

function fmtGiorno(data: string): string {
  // data = 'YYYY-MM-DD'; ancoriamo a mezzogiorno UTC per evitare slittamenti di fuso.
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(new Date(`${data}T12:00:00Z`));
}

function fmtOre(n: number): string {
  const totMin = Math.max(0, Math.round(n * 60));
  return `${Math.floor(totMin / 60)}:${String(totMin % 60).padStart(2, '0')}`;
}

const STATO: Record<string, { label: string; cls: string }> = {
  // Per il tecnico una bozza è una giornata ancora in verifica dall'ufficio,
  // non un'azione in sospeso a suo carico.
  bozza: { label: 'In verifica', cls: 'bg-amber-500/15 text-amber-700' },
  inviato: { label: 'Inviato', cls: 'bg-emerald-500/15 text-emerald-700' },
  verificato: { label: 'Verificato', cls: 'bg-blue-500/15 text-blue-700' },
  approvato: { label: 'Approvato', cls: 'bg-blue-500/15 text-blue-700' },
  respinto: { label: 'Respinto', cls: 'bg-destructive/15 text-destructive' },
  esportato: { label: 'Esportato', cls: 'bg-muted text-muted-foreground' },
};

/**
 * Giorni modificabili dal tecnico: oggi + i 3 precedenti. Calcolato in
 * Europe/Rome (TZ-safe: la data italiana corrente è risolta da Intl a
 * prescindere dal fuso del browser, poi ancorata a mezzogiorno UTC).
 */
function giorniModificabili(): Set<string> {
  const oggi = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
  const noon = Date.parse(`${oggi}T12:00:00Z`);
  const out = new Set<string>();
  for (let i = 0; i <= 3; i += 1) {
    out.add(new Date(noon - i * 86400000).toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Storico ultimi 30 giorni del tecnico: per ogni giornata, ore di lavoro
 * (ordinarie + straordinarie), ore di viaggio e stato del rapportino.
 * Le giornate di oggi + i 3 giorni precedenti sono TAPPABILI e aprono il dialog
 * di modifica; le più vecchie restano in sola lettura.
 */
export function StoricoOre({ giorni, passo = 15 }: { giorni: GiornoStorico[]; passo?: number }) {
  const editabili = useMemo(() => giorniModificabili(), []);
  const [selezionata, setSelezionata] = useState<string | null>(null);

  return (
    <section className="space-y-2.5">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight text-foreground">
        <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        Storico · ultimi 30 giorni
      </h2>

      {giorni.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/60 px-4 py-6 text-center text-sm text-muted-foreground shadow-soft">
          Ancora nessuna giornata registrata.
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
            <ul className="divide-y divide-border">
              {giorni.map((g) => {
                const lavoro = g.ord + g.straord;
                const meta = STATO[g.stato] ?? { label: g.stato, cls: 'bg-muted text-muted-foreground' };
                const editabile = editabili.has(g.data);

                const contenuto = (
                  <>
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-medium capitalize text-foreground">
                        {fmtGiorno(g.data)}
                        {editabile ? (
                          <PencilLine className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                        ) : null}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                        <span className="tabular-nums">Lavoro {fmtOre(lavoro)}</span>
                        {g.straord > 0 && (
                          <span className="tabular-nums text-amber-600">straord. {fmtOre(g.straord)}</span>
                        )}
                        {g.viaggio > 0 && (
                          <span className="tabular-nums text-sky-600">viaggio {fmtOre(g.viaggio)}</span>
                        )}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${meta.cls}`}
                    >
                      {meta.label}
                    </span>
                  </>
                );

                return editabile ? (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() => setSelezionata(g.data)}
                      className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/40 active:bg-muted/60"
                    >
                      {contenuto}
                    </button>
                  </li>
                ) : (
                  <li
                    key={g.id}
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                  >
                    {contenuto}
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
            <Lock className="h-3 w-3" aria-hidden="true" />
            Le ore sono modificabili fino a 3 giorni fa. Tocca una giornata recente per correggerla.
          </p>
        </>
      )}

      {selezionata ? (
        <ModificaGiornataDialog
          open
          data={selezionata}
          passo={passo}
          onClose={() => setSelezionata(null)}
        />
      ) : null}
    </section>
  );
}
