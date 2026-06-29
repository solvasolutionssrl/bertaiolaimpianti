'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@kommessa/ui';

// ── Tipi ──────────────────────────────────────────────────────────────────

interface VoceGiorno {
  nome: string;
  oreLavoro: number;
  oreViaggio: number;
}

export interface GiornoCalendario {
  data: string; // YYYY-MM-DD
  oreLavoro: number;
  oreViaggio: number;
  stato: 'approvato' | 'bozza';
  voci: VoceGiorno[];
}

interface Props {
  mese: string; // YYYY-MM
  giorni: GiornoCalendario[];
}

// ── Helpers formato (it-IT, Europe/Rome) ────────────────────────────────────

function fmtOre(n: number): string {
  const totMin = Math.max(0, Math.round(n * 60));
  return `${Math.floor(totMin / 60)}:${String(totMin % 60).padStart(2, '0')}`;
}

function fmtMeseLungo(mese: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Rome',
  }).format(new Date(`${mese}-15T12:00:00Z`));
}

function fmtGiornoLungo(data: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    timeZone: 'Europe/Rome',
  }).format(new Date(`${data}T12:00:00Z`));
}

/** Mese precedente / successivo in formato YYYY-MM (date math semplice). */
function shiftMese(mese: string, delta: number): string {
  const p = mese.split('-').map(Number);
  const y = p[0] ?? 2026;
  const m = p[1] ?? 1;
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Indice colonna Lun=0 … Dom=6 per un giorno YYYY-MM-DD (calcolo UTC stabile). */
function colonnaLun0(data: string): number {
  const p = data.split('-').map(Number);
  const y = p[0] ?? 2026;
  const m = p[1] ?? 1;
  const d = p[2] ?? 1;
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Dom … 6=Sab
  return (dow + 6) % 7; // Lun=0 … Dom=6
}

const NOMI_COLONNE = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

// ── Costruzione griglia ─────────────────────────────────────────────────────

interface Cella {
  data: string | null; // null = riempimento fuori-mese
  giorno?: GiornoCalendario;
  numero?: number;
}

interface Settimana {
  celle: Cella[];
  totaleLavoro: number;
}

function costruisciSettimane(mese: string, giorni: GiornoCalendario[]): {
  settimane: Settimana[];
  totaleMese: number;
} {
  const byData = new Map<string, GiornoCalendario>();
  for (const g of giorni) byData.set(g.data, g);

  const p = mese.split('-').map(Number);
  const y = p[0] ?? 2026;
  const m = p[1] ?? 1;
  const giorniNelMese = new Date(Date.UTC(y, m, 0)).getUTCDate();

  // Celle vuote iniziali fino al primo giorno del mese.
  const celle: Cella[] = [];
  const offset = colonnaLun0(`${mese}-01`);
  for (let i = 0; i < offset; i += 1) celle.push({ data: null });

  for (let d = 1; d <= giorniNelMese; d += 1) {
    const data = `${mese}-${String(d).padStart(2, '0')}`;
    celle.push({ data, giorno: byData.get(data), numero: d });
  }
  // Riempimento finale fino a completare l'ultima settimana.
  while (celle.length % 7 !== 0) celle.push({ data: null });

  const settimane: Settimana[] = [];
  let totaleMese = 0;
  for (let i = 0; i < celle.length; i += 7) {
    const slice = celle.slice(i, i + 7);
    const totaleLavoro = slice.reduce((s, c) => s + (c.giorno?.oreLavoro ?? 0), 0);
    totaleMese += totaleLavoro;
    settimane.push({ celle: slice, totaleLavoro });
  }
  return { settimane, totaleMese };
}

// ── Cella giorno ────────────────────────────────────────────────────────────

function CellaGiorno({ cella }: { cella: Cella }) {
  if (!cella.data) {
    return <div className="min-h-[58px] rounded-md bg-transparent" aria-hidden="true" />;
  }
  const g = cella.giorno;
  const haOre = g != null && g.oreLavoro > 0;
  const daVerificare = g != null && g.stato === 'bozza';

  // Tooltip con il dettaglio voci (cantieri/commesse + ore).
  const titolo = g
    ? [
        fmtGiornoLungo(cella.data),
        `Lavoro: ${fmtOre(g.oreLavoro)}${g.oreViaggio > 0 ? ` · Viaggio: ${fmtOre(g.oreViaggio)}` : ''}`,
        g.stato === 'approvato' ? 'Approvato' : 'Da verificare',
        ...g.voci.map((v) => `• ${v.nome}: ${fmtOre(v.oreLavoro)}`),
      ].join('\n')
    : fmtGiornoLungo(cella.data);

  // Stile per stato: approvato = emerald soft; bozza/da-verificare = amber soft.
  let stileCella = 'border-border bg-card';
  if (g) {
    stileCella = daVerificare
      ? 'border-amber-300 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30'
      : 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-emerald-950/20';
  }

  return (
    <div
      title={titolo}
      className={`relative min-h-[58px] rounded-md border px-1.5 py-1 transition-colors ${stileCella} ${
        g ? 'cursor-default' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <span
          className={`text-xs font-medium tabular-nums ${
            g ? 'text-foreground' : 'text-muted-foreground/60'
          }`}
        >
          {cella.numero}
        </span>
        {daVerificare && (
          <span
            className="mt-0.5 h-1.5 w-1.5 rounded-full bg-amber-500"
            aria-label="Da verificare"
          />
        )}
      </div>
      {haOre ? (
        <div className="mt-1 leading-tight">
          <span
            className={`text-sm font-semibold tabular-nums ${
              daVerificare
                ? 'text-amber-700 dark:text-amber-300'
                : 'text-emerald-700 dark:text-emerald-300'
            }`}
          >
            {fmtOre(g!.oreLavoro)}
          </span>
          {g!.oreViaggio > 0 && (
            <span className="ml-1 text-[10px] text-muted-foreground">
              +{fmtOre(g!.oreViaggio)} vg
            </span>
          )}
        </div>
      ) : g ? (
        <div className="mt-1 text-[10px] text-muted-foreground">0h</div>
      ) : null}
    </div>
  );
}

// ── Componente ──────────────────────────────────────────────────────────────

export function CalendarioOre({ mese, giorni }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { settimane, totaleMese } = React.useMemo(
    () => costruisciSettimane(mese, giorni),
    [mese, giorni],
  );

  const totaleViaggio = React.useMemo(
    () => giorni.reduce((s, g) => s + g.oreViaggio, 0),
    [giorni],
  );

  function vaiAMese(nuovoMese: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('mese', nuovoMese);
    router.push(`?${params.toString()}`, { scroll: false });
  }

  const meseCorrente = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
  })
    .format(new Date())
    .slice(0, 7);
  const isMeseCorrente = mese >= meseCorrente;

  return (
    <Card className="shadow-soft">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarRange className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Calendario ore
          </CardTitle>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => vaiAMese(shiftMese(mese, -1))}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Mese precedente"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="min-w-[8.5rem] text-center text-sm font-medium capitalize tabular-nums">
              {fmtMeseLungo(mese)}
            </span>
            <button
              type="button"
              onClick={() => vaiAMese(shiftMese(mese, 1))}
              disabled={isMeseCorrente}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Mese successivo"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Intestazione colonne: Lun-Dom + colonna totale settimana */}
        <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_3.25rem] gap-1.5">
          {NOMI_COLONNE.map((c) => (
            <div
              key={c}
              className="pb-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              {c}
            </div>
          ))}
          <div className="pb-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Tot
          </div>

          {/* Settimane */}
          {settimane.map((sett, idx) => (
            <React.Fragment key={idx}>
              {sett.celle.map((cella, ci) => (
                <CellaGiorno key={cella.data ?? `vuoto-${idx}-${ci}`} cella={cella} />
              ))}
              <div className="flex min-h-[58px] flex-col items-center justify-center rounded-md bg-muted/40 px-1">
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  {sett.totaleLavoro > 0 ? `${fmtOre(sett.totaleLavoro)}` : '·'}
                </span>
              </div>
            </React.Fragment>
          ))}
        </div>

        {/* Legenda + totale mese */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm border border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20" />
              Approvato
            </span>
            <span className="flex items-center gap-1.5">
              <span className="relative h-2.5 w-2.5 rounded-sm border border-amber-300 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30">
                <span className="absolute right-0 top-0 h-1 w-1 rounded-full bg-amber-500" />
              </span>
              Da verificare
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm border border-border bg-card" />
              Nessuna timbratura
            </span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Totale mese </span>
            <span className="font-semibold tabular-nums text-foreground">{fmtOre(totaleMese)}</span>
            {totaleViaggio > 0 && (
              <span className="ml-2 text-xs text-muted-foreground">
                + {fmtOre(totaleViaggio)} viaggio
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
