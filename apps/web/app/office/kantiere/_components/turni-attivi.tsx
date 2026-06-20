'use client';

import * as React from 'react';
import { Truck, MapPin, Radio } from 'lucide-react';
import { turniAttivi, type GruppoTurni } from '@/app/office/_actions/kantiere-turni-attivi';

function oraInizio(ts: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts));
}

function trascorso(ts: string, now: number): string {
  const min = Math.max(0, Math.floor((now - Date.parse(ts)) / 60000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

function fmtKm(km: number | null): string | null {
  if (km == null) return null;
  return `${km.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

/** Pallino verde pulsante (turno in corso). */
function Pallino() {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
    </span>
  );
}

export function TurniAttivi({
  iniziale,
  totaleIniziale,
}: {
  iniziale: GruppoTurni[];
  totaleIniziale: number;
}) {
  const [gruppi, setGruppi] = React.useState<GruppoTurni[]>(iniziale);
  const [totale, setTotale] = React.useState(totaleIniziale);
  const [now, setNow] = React.useState<number>(() => Date.parse(new Date().toISOString()));

  // Tick del tempo trascorso (ogni 30s)
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Polling dei turni attivi (ogni 45s)
  React.useEffect(() => {
    let attivo = true;
    const ricarica = async () => {
      try {
        const res = await turniAttivi();
        if (attivo && res.ok) {
          setGruppi(res.gruppi);
          setTotale(res.totale);
        }
      } catch {
        /* rete: si riprova al prossimo giro */
      }
    };
    const id = setInterval(ricarica, 45_000);
    return () => {
      attivo = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="rounded-lg border border-border bg-card shadow-soft">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-emerald-600" strokeWidth={1.75} aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">Turni attivi</h2>
        </div>
        {totale > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
            <Pallino />
            {totale} in corso
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">nessuno</span>
        )}
      </div>

      {gruppi.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          Nessun turno attivo in questo momento.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {gruppi.map((g) => (
            <div key={g.cantiereId} className="px-4 py-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.cantiereNome}
                </p>
                <span className="text-[11px] text-muted-foreground">{g.turni.length}</span>
              </div>
              <ul className="space-y-1.5">
                {g.turni.map((t) => {
                  const km = fmtKm(t.viaggio?.km ?? null);
                  return (
                    <li
                      key={t.dipendenteId}
                      className="flex items-center gap-2.5 rounded-md bg-muted/40 px-2.5 py-2"
                    >
                      <Pallino />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {t.dipendenteNome}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          dalle {oraInizio(t.inizioTs)} · {trascorso(t.inizioTs, now)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {t.viaggio?.sedeNome ? (
                          <span
                            title={`Partito da ${t.viaggio.sedeNome}`}
                            className="hidden items-center gap-1 rounded bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline-flex"
                          >
                            <MapPin className="h-3 w-3" strokeWidth={1.75} />
                            {t.viaggio.sedeNome}
                          </span>
                        ) : null}
                        {km ? (
                          <span className="inline-flex items-center rounded bg-background px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                            {km}
                          </span>
                        ) : null}
                        {t.viaggio?.autista && t.viaggio.mezzoTarga ? (
                          <span
                            title={`Autista · ${t.viaggio.mezzoTarga}`}
                            className="inline-flex items-center gap-1 rounded bg-background px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground"
                          >
                            <Truck className="h-3 w-3" strokeWidth={1.75} />
                            {t.viaggio.mezzoTarga}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
