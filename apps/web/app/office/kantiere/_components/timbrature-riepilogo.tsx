'use client';

import { useEffect, useState } from 'react';
import { appaiaTimbrature } from '@kommessa/api/kantiere-ore';

export interface TimbraturaInput {
  tipo: string;
  ts: string;
  commessaTitolo?: string | null;
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
    .map((t) => ({ tipo: t.tipo as 'ingresso' | 'uscita', ts: t.ts }));
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

  if (r.coppie.length === 0) {
    return <p className="text-xs text-muted-foreground">Nessuna timbratura registrata.</p>;
  }

  const liveMin = r.ingressoAperto ? (now - Date.parse(r.ingressoAperto)) / 60000 : 0;
  const totaleConLive = r.minutiTotali + (r.aperto ? liveMin : 0);

  return (
    <div className="space-y-2">
      {/* Totale */}
      <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
        <span className="text-xs text-muted-foreground">Ore timbrate</span>
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
        </span>
      </div>

      {/* Coppie ingresso → uscita */}
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
    </div>
  );
}
