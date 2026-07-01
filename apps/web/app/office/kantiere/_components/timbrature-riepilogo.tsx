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
  /** Origine della riga: 'qr' | 'cronometro' (timbrata) | 'manuale' (inserita a mano). */
  origine?: string | null;
  /** Quando la riga è stata inserita (ISO). */
  createdAt?: string | null;
  /** Nome di chi l'ha inserita (per le manuali). */
  creatoNome?: string | null;
  /** true se è la RIPRESA di una pausa chiusa in automatico (dimenticata oltre soglia). */
  autoChiusa?: boolean | null;
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

/** Set dei timestamp di RIPRESA (ingresso pausa) chiusi in automatico. */
function ripreseAutoChiuse(timbrature: TimbraturaInput[]): Set<string> {
  const set = new Set<string>();
  for (const t of timbrature) {
    if (t.tipo === 'ingresso' && t.pausa && t.autoChiusa) set.add(t.ts);
  }
  return set;
}

/** Durata in minuti formattata "H:MM" (es. 90 → "1:30"). */
function fmtMinColon(min: number): string {
  const m = Math.max(0, Math.round(min));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
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

function fmtDataOra(ts: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts));
}

type OrigineMeta = { origine?: string | null; createdAt?: string | null; creatoNome?: string | null };

/**
 * Riga origine di un evento: badge "Timbrata · QR/app" oppure "Inserita a mano"
 * (con "da {chi} · agg. {quando}"). Così office e super admin vedono SEMPRE come
 * e quando è nata la riga (es. pausa timbrata vs dichiarata a fine giornata).
 */
function OrigineLine({ meta }: { meta?: OrigineMeta }) {
  if (!meta || !meta.origine) return null;
  const o = meta.origine;
  const manuale = o !== 'qr' && o !== 'cronometro';
  const label = o === 'qr' ? 'Timbrata · QR' : o === 'cronometro' ? 'Timbrata · app' : 'Inserita a mano';
  const quando = manuale && meta.createdAt ? fmtDataOra(meta.createdAt) : null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
      <span
        className={[
          'inline-flex items-center rounded-full border px-1.5 py-0.5 font-medium uppercase tracking-wide',
          manuale
            ? 'border-amber-300 bg-amber-100/60 text-amber-700'
            : 'border-border bg-muted text-muted-foreground',
        ].join(' ')}
      >
        {label}
      </span>
      {manuale && (meta.creatoNome || quando) ? (
        <span>
          {meta.creatoNome ? `da ${meta.creatoNome}` : ''}
          {meta.creatoNome && quando ? ' · ' : ''}
          {quando ? `agg. ${quando}` : ''}
        </span>
      ) : null}
    </div>
  );
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

function fmtOreColon(n: number): string {
  const totMin = Math.max(0, Math.round(n * 60));
  return `${Math.floor(totMin / 60)}:${String(totMin % 60).padStart(2, '0')}`;
}

/**
 * Totale ore lavorate della giornata, LIVE (ticka se il turno è aperto). Hook:
 * va chiamato a livello di componente. La pausa pranzo è già esclusa.
 */
export function useTotaleGiornata(timbrature: TimbraturaInput[]): { minuti: number; aperto: boolean } {
  const r = appaiaTimbrature(soloTimbrature(timbrature));
  const now = useLiveNow(r.aperto);
  const liveMin = r.ingressoAperto ? (now - Date.parse(r.ingressoAperto)) / 60000 : 0;
  return { minuti: r.minutiTotali + (r.aperto ? liveMin : 0), aperto: r.aperto };
}

/**
 * Timeline INLINE della giornata, a colpo d'occhio: viaggio (km + tempo) →
 * segmenti di lavoro (ingresso→uscita) → pause, in ordine cronologico. Il totale
 * ore NON è qui (va mostrato a destra della riga). Live se la giornata è aperta.
 */
export function GiornataFlow({
  timbrature,
  oreViaggio = 0,
  kmViaggio = 0,
}: {
  timbrature: TimbraturaInput[];
  oreViaggio?: number;
  kmViaggio?: number;
}) {
  const r = appaiaTimbrature(soloTimbrature(timbrature));
  const pause = calcolaPause(timbrature);
  const autoSet = ripreseAutoChiuse(timbrature);

  if (r.coppie.length === 0 && oreViaggio <= 0) {
    return <span className="text-[11px] text-muted-foreground/60">Nessuna timbratura</span>;
  }

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
    const auto = !!(p.fine && autoSet.has(p.fine));
    eventi.push({
      t: Date.parse(p.inizio),
      el: (
        <span
          key={`p${i}`}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-amber-300 bg-amber-50 px-1.5 py-0.5 text-amber-700"
        >
          <Coffee className="h-2.5 w-2.5" aria-hidden="true" />
          Pausa{min != null ? ` ${fmtMinuti(min)}` : ''}
          {auto ? ' · chiusa automaticamente' : ''}
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
        Viaggio {kmViaggio > 0 ? `${Math.round(kmViaggio)} km · ` : ''}
        {fmtOreColon(oreViaggio)}
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
  const autoSet = ripreseAutoChiuse(timbrature);

  // Origine per timestamp evento (per badge "Timbrata/Inserita a mano").
  const meta = new Map<string, OrigineMeta>();
  for (const t of timbrature) {
    meta.set(t.ts, { origine: t.origine, createdAt: t.createdAt, creatoNome: t.creatoNome });
  }

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
            className="rounded-md border border-border/60 px-2.5 py-1.5 text-xs"
          >
            <div className="flex items-center justify-between gap-2">
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
            </div>
            <OrigineLine meta={meta.get(c.ingresso)} />
          </li>
        ))}
      </ul>

      {/* Pause pranzo (informative: NON contano nelle ore lavorate) */}
      {pause.length > 0 && (
        <ul className="space-y-1">
          {pause.map((p, i) => {
            const min = p.fine ? Math.round((Date.parse(p.fine) - Date.parse(p.inizio)) / 60000) : null;
            const auto = !!(p.fine && autoSet.has(p.fine));
            return (
              <li
                key={`p-${i}`}
                className="rounded-md border border-dashed border-amber-300/70 bg-amber-50/50 px-2.5 py-1.5 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 tabular-nums text-amber-800">
                    <span className="inline-block h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
                    Pausa pranzo {fmtOra(p.inizio)}
                    {p.fine ? <> → {fmtOra(p.fine)}</> : <> · in corso</>}
                  </span>
                  <span className="tabular-nums font-medium text-amber-700">
                    {min != null ? fmtMinuti(min) : ''}
                  </span>
                </div>
                {auto ? (
                  <p className="mt-1 text-[10px] font-medium text-amber-700">
                    Pausa {min != null ? fmtMinColon(min) : ''} · chiusa automaticamente (dimenticata)
                  </p>
                ) : null}
                <OrigineLine meta={meta.get(p.inizio)} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
