'use client';

import * as React from 'react';
import Link from 'next/link';
import { Radio, Utensils } from 'lucide-react';
import { turniAttivi, type GruppoTurni, type TurnoAttivo } from '@/app/office/_actions/kantiere-turni-attivi';
import { oraMostrata } from '@kommessa/api/ora-mostrata';
import { minutiPresenza, scriviDurata } from '@kommessa/api/presenza-viva';

function oraInizio(ts: string): string {
  // A video ai 5 minuti; il dato resta esatto.
  return oraMostrata(ts);
}

/**
 * Da quanto è al lavoro. ⚠️ Non «adesso meno l'inizio»: in pausa il conto si
 * ferma, o si regalerebbe un'ora a tutti. La regola è una sola per tutta
 * l'applicazione (`@kommessa/api/presenza-viva`).
 */
function trascorso(t: TurnoAttivo, now: number): string {
  return scriviDurata(
    minutiPresenza({
      aperta: t.aperta,
      inizioMs: Date.parse(t.inizioTs),
      pausaTimbrataMin: t.pausaMin,
      nettoMin: t.nettoMin,
      oraMs: now,
    }),
  );
}

function fmtKm(km: number | null): string | null {
  if (km == null) return null;
  return `${km.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

/** Pallino di stato: verde pulsante (in corso) o giallo fisso (in pausa). */
function Pallino({ inPausa = false }: { inPausa?: boolean }) {
  if (inPausa) {
    return (
      <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
      </span>
    );
  }
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
  // Niente orario al primo render (server e browser darebbero minuti diversi):
  // l'effetto lo imposta subito e poi ogni 30 secondi.
  const [now, setNow] = React.useState<number | null>(null);

  // Tick del tempo trascorso (ogni 30s)
  React.useEffect(() => {
    setNow(Date.now());
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
          <h2 className="text-sm font-semibold text-foreground">Personale presente</h2>
        </div>
        {totale > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
            <Pallino />
            {totale} al lavoro
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">nessuno</span>
        )}
      </div>

      {gruppi.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          Nessuno al lavoro in questo momento.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {gruppi.map((g) => (
            <div key={g.cantiereId ?? '__senza_cantiere__'} className="px-4 py-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.cantiereNome}
                </p>
                <span className="shrink-0 text-[11px] text-muted-foreground">{g.turni.length}</span>
              </div>
              {/* ⚠️ A CARD, non in colonna: con trenta persone al lavoro un
                  elenco verticale non finisce più e il cruscotto smette di
                  essere un colpo d'occhio. Una card sta su due righe e il
                  numero di colonne cresce con lo schermo. */}
              <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {g.turni.map((t) => {
                  const km = fmtKm(t.viaggio?.km ?? null);
                  // In una card non ci stanno tre pastiglie: il viaggio si
                  // legge come testo, sulla riga che dice già da che ora.
                  const viaggio = [t.viaggio?.sedeNome, km, t.viaggio?.autista ? t.viaggio.mezzoTarga : null]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <li key={t.dipendenteId} className="min-w-0">
                      {/* Tutta la card porta alla giornata di quella persona, già aperta. */}
                      <Link
                        href={`/office/kantiere/rapportini?apri=${t.dipendenteId}`}
                        title={viaggio ? `${t.dipendenteNome} · ${viaggio}` : t.dipendenteNome}
                        className="flex h-full items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-2.5 py-1.5 transition-colors hover:border-border hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Pallino inPausa={t.inPausa} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium leading-tight text-foreground">
                            {t.dipendenteNome}
                          </span>
                          <span
                            className={`block truncate text-[10px] leading-tight ${
                              t.inPausa ? 'font-medium text-amber-700' : 'text-muted-foreground'
                            }`}
                          >
                            {t.inPausa ? (
                              <>
                                <Utensils className="mr-0.5 inline h-2.5 w-2.5 align-[-1px]" strokeWidth={2} />
                                in pausa · dalle {oraInizio(t.inizioTs)}
                              </>
                            ) : (
                              <>dalle {oraInizio(t.inizioTs)}{viaggio ? ` · ${viaggio}` : ''}</>
                            )}
                          </span>
                        </span>
                        {/* Da quante ore è al lavoro: è il numero per cui si guarda la card. */}
                        {now != null ? (
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                              t.inPausa ? 'bg-amber-50 text-amber-800' : 'bg-background text-foreground'
                            }`}
                          >
                            {trascorso(t, now)}
                          </span>
                        ) : null}
                      </Link>
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
