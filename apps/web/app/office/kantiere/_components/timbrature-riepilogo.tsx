'use client';

import { useEffect, useState } from 'react';
import { Car, Coffee } from 'lucide-react';
import { appaiaTimbrature } from '@kommessa/api/kantiere-ore';

export interface TimbraturaInput {
  tipo: string;
  ts: string;
  commessaTitolo?: string | null;
  /** true se è un evento di pausa pranzo (uscita = inizio pausa, ingresso = ripresa). */
  pausa?: boolean | null;
}

/** Intervalli di pausa pranzo (da un'uscita-pausa alla ripresa successiva). */
function calcolaPause(timbrature: TimbraturaInput[]): { inizio: string; fine: string | null }[] {
  const sorted = [...timbrature]
    .filter((t) => t.tipo === 'ingresso' || t.tipo === 'uscita')
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const pause: { inizio: string; fine: string | null }[] = [];
  let inizio: string | null = null;
  for (const t of sorted) {
    if (t.tipo === 'uscita' && t.pausa) inizio = t.ts;
    else if (t.tipo === 'ingresso' && inizio) {
      pause.push({ inizio, fine: t.ts });
      inizio = null;
    }
  }
  if (inizio) pause.push({ inizio, fine: null });
  return pause;
}

function fmtOra(ts: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts));
}

function fmtMinuti(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}min`;
  if (r === 0) return `${h}h`;
  return `${h}h ${String(r).padStart(2, '0')}min`;
}

function soloTimbrature(timbrature: TimbraturaInput[]) {
  return timbrature
    .filter((t) => t.tipo === 'ingresso' || t.tipo === 'uscita')
    .map((t) => ({ tipo: t.tipo as 'ingresso' | 'uscita', ts: t.ts, pausa: t.pausa ?? false }));
}

/** Hook: ticka ogni 30s solo se serve un contatore live (giornata aperta). */
function useLiveNow(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}

/**
 * Sommario compatto a una riga: "07:30 → 16:45 · 8h 15min" oppure, se la
 * giornata è ancora aperta, "dalle 07:30 · in corso (1h 23min)". Pensato per
 * essere infilato in liste/tabelle dove serve il colpo d'occhio.
 */
export function TimbratureSommario({ timbrature }: { timbrature: TimbraturaInput[] }) {
  const r = appaiaTimbrature(soloTimbrature(timbrature));
  const now = useLiveNow(r.aperto);

  if (r.coppie.length === 0) {
    return <span className="text-xs text-muted-foreground/60">Nessuna timbratura</span>;
  }

  const prima = r.coppie[0]!;
  const ultima = r.coppie[r.coppie.length - 1]!;
  const liveMin = r.ingressoAperto ? (now - Date.parse(r.ingressoAperto)) / 60000 : 0;
  const totaleConLive = r.minutiTotali + (r.aperto ? liveMin : 0);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="tabular-nums font-medium text-foreground">
        {fmtOra(prima.ingresso)}
        {' → '}
        {r.aperto ? (
          <span className="text-emerald-700">in corso</span>
        ) : (
          fmtOra(ultima.uscita!)
        )}
      </span>
      <span className="tabular-nums text-muted-foreground">· {fmtMinuti(totaleConLive)}</span>
      {r.aperto && (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          Aperta
        </span>
      )}
      {r.inPausa && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
          In pausa
        </span>
      )}
    </span>
  );
}

function fmtOreDec(n: number): string {
  const v = parseFloat(n.toFixed(2));
  return Number.isInteger(v) ? `${v}h` : `${v.toFixed(1)}h`;
}

/**
 * Timeline INLINE della giornata, a colpo d'occhio: viaggio → segmenti di lavoro
 * (ingresso→uscita) → pause, in ordine cronologico, con il totale ore in coda.
 * Pensata per le righe "in corso oggi" (live se la giornata è aperta).
 */
export function GiornataFlow({
  timbrature,
  oreViaggio = 0,
}: {
  timbrature: TimbraturaInput[];
  oreViaggio?: number;
}) {
  const r = appaiaTimbrature(soloTimbrature(timbrature));
  const now = useLiveNow(r.aperto);
  const pause = calcolaPause(timbrature);

  if (r.coppie.length === 0 && oreViaggio <= 0) {
    return <span className="text-[11px] text-muted-foreground/60">Nessuna timbratura</span>;
  }

  const liveMin = r.ingressoAperto ? (now - Date.parse(r.ingressoAperto)) / 60000 : 0;
  const totaleConLive = r.minutiTotali + (r.aperto ? liveMin : 0);

  // Eventi cronologici: segmenti di lavoro + pause.
  const eventi: { t: number; el: JSX.Element }[] = [];
  r.coppie.forEach((c, i) => {
    eventi.push({
      t: Date.parse(c.ingresso),
      el: (
        <span
          key={`s${i}`}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-1.5 py-0.5 tabular-nums text-foreground/80"
        >
          {fmtOra(c.ingresso)}
          <span className="text-muted-foreground">→</span>
          {c.uscita ? fmtOra(c.uscita) : <span className="font-medium text-emerald-700">in corso</span>}
        </span>
      ),
    });
  });
  pause.forEach((p, i) => {
    const min = p.fine ? Math.round((Date.parse(p.fine) - Date.parse(p.inizio)) / 60000) : null;
    eventi.push({
      t: Date.parse(p.inizio),
      el: (
        <span
          key={`p${i}`}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-amber-300 bg-amber-50 px-1.5 py-0.5 text-amber-700"
        >
          <Coffee className="h-2.5 w-2.5" aria-hidden="true" />
          Pausa{min != null ? ` ${fmtMinuti(min)}` : ''}
        </span>
      ),
    });
  });
  eventi.sort((a, b) => a.t - b.t);

  const items: JSX.Element[] = [];
  if (oreViaggio > 0) {
    items.push(
      <span
        key="v"
        className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-sky-700"
      >
        <Car className="h-2.5 w-2.5" aria-hidden="true" />
        Viaggio {fmtOreDec(oreViaggio)}
      </span>,
    );
  }
  for (const e of eventi) items.push(e.el);

  return (
    <span className="flex flex-wrap items-center gap-1 text-[11px]">
      {items.map((el, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 ? (
            <span className="text-muted-foreground/40" aria-hidden="true">→</span>
          ) : null}
          {el}
        </span>
      ))}
      {r.coppie.length > 0 ? (
        <span className="ml-0.5 tabular-nums font-semibold text-foreground">· {fmtMinuti(totaleConLive)}</span>
      ) : null}
      {r.aperto ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          Aperta
        </span>
      ) : null}
      {r.inPausa ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
          In pausa
        </span>
      ) : null}
    </span>
  );
}

/**
 * Riepilogo esteso: totale ore timbrate (live se aperta) + timeline delle
 * coppie ingresso→uscita con durata di ogni segmento. Per i pannelli di
 * dettaglio (rapportino espanso, scheda dipendente, ecc.).
 */
export function TimbratureRiepilogo({ timbrature }: { timbrature: TimbraturaInput[] }) {
  const r = appaiaTimbrature(soloTimbrature(timbrature));
  const now = useLiveNow(r.aperto);
  const pause = calcolaPause(timbrature);

  if (r.coppie.length === 0) {
    return <p className="text-xs text-muted-foreground">Nessuna timbratura registrata.</p>;
  }

  const liveMin = r.ingressoAperto ? (now - Date.parse(r.ingressoAperto)) / 60000 : 0;
  const totaleConLive = r.minutiTotali + (r.aperto ? liveMin : 0);

  return (
    <div className="space-y-2">
      {/* Totale (ORE EFFETTIVE: la pausa pranzo è già esclusa) */}
      <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
        <span className="text-xs text-muted-foreground">Ore lavorate</span>
        <span className="flex items-center gap-2">
          <span className="tabular-nums text-sm font-semibold text-foreground">
            {fmtMinuti(totaleConLive)}
          </span>
          {r.aperto && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              In corso
            </span>
          )}
          {r.inPausa && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
              In pausa
            </span>
          )}
        </span>
      </div>

      {/* Coppie ingresso → uscita (segmenti di lavoro) */}
      <ul className="space-y-1">
        {r.coppie.map((c, i) => (
          <li
            key={i}
            className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2.5 py-1.5 text-xs"
          >
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
              <span className="font-medium text-foreground">{fmtOra(c.ingresso)}</span>
              <span className="text-muted-foreground">→</span>
              {c.uscita ? (
                <>
                  <span className="inline-block h-2 w-2 rounded-full bg-slate-400" aria-hidden="true" />
                  <span className="font-medium text-foreground">{fmtOra(c.uscita)}</span>
                </>
              ) : (
                <span className="font-medium text-emerald-700">in corso</span>
              )}
            </span>
            <span className="tabular-nums font-semibold text-muted-foreground">
              {c.minuti != null ? fmtMinuti(c.minuti) : fmtMinuti(liveMin)}
            </span>
          </li>
        ))}
      </ul>

      {/* Pause pranzo (informative: NON contano nelle ore lavorate) */}
      {pause.length > 0 && (
        <ul className="space-y-1">
          {pause.map((p, i) => {
            const min = p.fine ? Math.round((Date.parse(p.fine) - Date.parse(p.inizio)) / 60000) : null;
            return (
              <li
                key={`p-${i}`}
                className="flex items-center justify-between gap-2 rounded-md border border-dashed border-amber-300/70 bg-amber-50/50 px-2.5 py-1.5 text-xs"
              >
                <span className="inline-flex items-center gap-1.5 tabular-nums text-amber-800">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
                  Pausa pranzo {fmtOra(p.inizio)}
                  {p.fine ? <> → {fmtOra(p.fine)}</> : <> · in corso</>}
                </span>
                <span className="tabular-nums font-medium text-amber-700">
                  {min != null ? fmtMinuti(min) : ''}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
