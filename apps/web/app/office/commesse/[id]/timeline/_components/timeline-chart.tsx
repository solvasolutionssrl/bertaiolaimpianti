'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { cn } from '@impiantixplus/ui';

/**
 * Timeline (Gantt-light) — pure CSS Grid, niente librerie esterne.
 *
 * Layout:
 *   ┌───────────────┬──────────────────────────────────┐
 *   │ Voce          │  asse temporale (scroll →)       │
 *   │ (sticky col)  │  ┌──── barra ─────┐              │
 *   └───────────────┴──────────────────────────────────┘
 *
 * - Una swimlane per voce
 * - Colore barra per stato (slate / arancio / verde / rosso)
 * - Today marker = linea verticale arancio brand
 * - Zoom: settimana (giorni stretti) / mese (giorni standard)
 * - Click barra → naviga a /fasi#voce-<id>
 */

export interface TimelineRow {
  voceId: number;
  voceNome: string;
  categoria: string | null;
  stato: 'da_iniziare' | 'in_corso' | 'completata' | 'bloccata';
  fotoCount: number;
  minFoto: number;
  /** Inizio (ISO date string). */
  start: string;
  /** Fine (ISO date string). Per voci in_corso → today. */
  end: string;
}

interface Props {
  commessaId: string;
  rows: TimelineRow[];
  /** Min/max calcolati lato server per dare il range completo allo schermo. */
  rangeStart: string;
  rangeEnd: string;
}

type Zoom = 'settimana' | 'mese';

const STATO_BAR_CLASS: Record<TimelineRow['stato'], string> = {
  da_iniziare: 'bg-slate-300 border-slate-400/60 text-slate-800',
  in_corso: 'bg-accent border-accent text-accent-foreground',
  completata: 'bg-stato-aperta border-stato-aperta text-white',
  bloccata: 'bg-stato-critica border-stato-critica text-white',
};

const STATO_LABEL: Record<TimelineRow['stato'], string> = {
  da_iniziare: 'Da iniziare',
  in_corso: 'In corso',
  completata: 'Completata',
  bloccata: 'Bloccata',
};

const MS_PER_DAY = 86_400_000;

function startOfDay(iso: string): Date {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

function fmtGiorno(d: Date): string {
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
}

function fmtMese(d: Date): string {
  return d.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' });
}

export function TimelineChart({
  commessaId,
  rows,
  rangeStart,
  rangeEnd,
}: Props) {
  const [zoom, setZoom] = useState<Zoom>('mese');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Px per giorno: settimana = denso (40), mese = compresso (16).
  const pxPerDay = zoom === 'settimana' ? 40 : 16;

  const { dayStart, totalDays, days, todayOffset } = useMemo(() => {
    const ds = startOfDay(rangeStart);
    const de = startOfDay(rangeEnd);
    // Padding di 2 giorni a sx/dx per non incollare le barre ai bordi.
    ds.setDate(ds.getDate() - 2);
    de.setDate(de.getDate() + 2);
    const total = Math.max(1, daysBetween(ds, de));
    const list: Date[] = [];
    for (let i = 0; i <= total; i += 1) {
      const d = new Date(ds);
      d.setDate(ds.getDate() + i);
      list.push(d);
    }
    const today = startOfDay(new Date().toISOString());
    const off = daysBetween(ds, today);
    return {
      dayStart: ds,
      totalDays: total,
      days: list,
      todayOffset: off >= 0 && off <= total ? off : null,
    };
  }, [rangeStart, rangeEnd]);

  const trackWidth = (totalDays + 1) * pxPerDay;
  const LABEL_COL = 200; // px

  function barOffset(row: TimelineRow) {
    const s = startOfDay(row.start);
    const e = startOfDay(row.end);
    const left = daysBetween(dayStart, s) * pxPerDay;
    const widthRaw = Math.max(1, daysBetween(s, e) + 1) * pxPerDay - 2;
    return { left, width: widthRaw };
  }

  return (
    <div className="space-y-4">
      {/* Legenda + controlli */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <Legenda />
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border bg-background p-0.5 text-xs">
          {(['settimana', 'mese'] as Zoom[]).map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setZoom(z)}
              className={cn(
                'rounded px-3 py-1 font-medium capitalize transition-colors',
                zoom === z
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {z === 'settimana' ? 'Settimana' : 'Mese'}
            </button>
          ))}
        </div>
      </div>

      {/* Gantt grid */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex" style={{ minHeight: 60 }}>
          {/* Colonna sticky etichette */}
          <div
            className="shrink-0 border-r border-border bg-muted/30"
            style={{ width: LABEL_COL }}
          >
            <div className="h-12 border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Voce
            </div>
            {rows.map((r) => (
              <div
                key={r.voceId}
                className="flex h-12 items-center gap-2 border-b border-border px-3 text-sm"
              >
                <span className="truncate font-medium" title={r.voceNome}>
                  {r.voceNome}
                </span>
              </div>
            ))}
          </div>

          {/* Track scrollabile */}
          <div
            ref={scrollRef}
            className="relative flex-1 overflow-x-auto"
            style={{ scrollbarGutter: 'stable' }}
          >
            <div style={{ width: trackWidth, position: 'relative' }}>
              {/* Header asse */}
              <div className="sticky top-0 z-10 flex h-12 border-b border-border bg-card">
                {days.map((d, i) => {
                  const isMonday = d.getDay() === 1;
                  const isFirstOfMonth = d.getDate() === 1;
                  const showLabel =
                    zoom === 'settimana' ? isMonday || i === 0 : isFirstOfMonth || i === 0;
                  return (
                    <div
                      key={i}
                      className={cn(
                        'shrink-0 border-l border-border/40 px-1 py-1 text-[10px] text-muted-foreground',
                        isFirstOfMonth && 'border-border',
                      )}
                      style={{ width: pxPerDay }}
                    >
                      {showLabel ? (
                        <span className="whitespace-nowrap font-medium">
                          {zoom === 'settimana' ? fmtGiorno(d) : fmtMese(d)}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {/* Today marker */}
              {todayOffset !== null ? (
                <div
                  className="pointer-events-none absolute top-0 z-20 h-full"
                  style={{
                    left: todayOffset * pxPerDay + pxPerDay / 2,
                    width: 2,
                  }}
                >
                  <div className="h-full w-[2px] bg-accent/70" />
                  <span className="absolute -top-1 left-1 rounded bg-accent px-1 text-[9px] font-semibold uppercase tracking-wide text-accent-foreground">
                    Oggi
                  </span>
                </div>
              ) : null}

              {/* Righe + barre */}
              {rows.map((r) => {
                const { left, width } = barOffset(r);
                return (
                  <div
                    key={r.voceId}
                    className="relative flex h-12 border-b border-border"
                  >
                    {/* Grid lines verticali sottili */}
                    <div
                      aria-hidden
                      className="absolute inset-0"
                      style={{
                        backgroundImage: `linear-gradient(to right, hsl(var(--border) / 0.35) 1px, transparent 1px)`,
                        backgroundSize: `${pxPerDay}px 100%`,
                      }}
                    />
                    <BarLink
                      commessaId={commessaId}
                      row={r}
                      left={left}
                      width={width}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BarLink({
  commessaId,
  row,
  left,
  width,
}: {
  commessaId: string;
  row: TimelineRow;
  left: number;
  width: number;
}) {
  const [hover, setHover] = useState(false);
  return (
    <Link
      href={`/office/commesse/${commessaId}/fasi#voce-${row.voceId}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={cn(
        'group absolute top-1/2 -translate-y-1/2 rounded-md border px-2 text-[11px] font-medium leading-none shadow-soft transition-transform hover:scale-[1.02] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring/40',
        STATO_BAR_CLASS[row.stato],
      )}
      style={{
        left: left + 1,
        width: Math.max(width, 12),
        height: 28,
      }}
      aria-label={`${row.voceNome} — ${STATO_LABEL[row.stato]}`}
    >
      <span className="flex h-full items-center gap-1 truncate">
        <span className="truncate">{row.voceNome}</span>
        {row.minFoto > 0 ? (
          <span className="ml-auto shrink-0 rounded bg-black/15 px-1 py-px text-[9px]">
            {row.fotoCount}/{row.minFoto}
          </span>
        ) : null}
      </span>
      {hover ? (
        <div className="pointer-events-none absolute left-0 top-full z-30 mt-2 w-56 rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-lg">
          <p className="text-sm font-semibold tracking-tight">{row.voceNome}</p>
          {row.categoria ? (
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {row.categoria}
            </p>
          ) : null}
          <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <dt>Stato</dt>
              <dd className="font-medium text-foreground">
                {STATO_LABEL[row.stato]}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Foto</dt>
              <dd className="font-medium text-foreground">
                {row.fotoCount}
                {row.minFoto > 0 ? ` / ${row.minFoto}` : ''}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Inizio</dt>
              <dd className="font-mono text-foreground">
                {new Date(row.start).toLocaleDateString('it-IT')}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Fine</dt>
              <dd className="font-mono text-foreground">
                {new Date(row.end).toLocaleDateString('it-IT')}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}
    </Link>
  );
}

function Legenda() {
  const items: { stato: TimelineRow['stato']; label: string }[] = [
    { stato: 'da_iniziare', label: 'Da iniziare' },
    { stato: 'in_corso', label: 'In corso' },
    { stato: 'completata', label: 'Completata' },
    { stato: 'bloccata', label: 'Bloccata' },
  ];
  return (
    <>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Legenda:
      </span>
      {items.map((i) => (
        <span key={i.stato} className="inline-flex items-center gap-1.5">
          <span
            className={cn(
              'inline-block h-3 w-6 rounded-sm border',
              STATO_BAR_CLASS[i.stato],
            )}
          />
          <span className="text-foreground">{i.label}</span>
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-[2px] bg-accent" />
        <span className="text-foreground">Oggi</span>
      </span>
    </>
  );
}
