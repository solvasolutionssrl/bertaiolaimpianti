'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronLeft, Route } from 'lucide-react';

// ── Tipi ──────────────────────────────────────────────────────────────────

export type TrattaView = {
  id: string;
  data: string;
  dipendente: string;
  direzione: 'andata' | 'ritorno';
  sede: string | null;
  cantiere: string | null;
  distanza_km: number;
  durata_min: number | null;
  manuale: boolean;
};

export type MezzoStorico = {
  id: string;
  targa: string;
  modello: string | null;
  tipo: string;
};

export type TotaliStorico = {
  kmTotali: number;
  nViaggi: number;
  minutiTotali: number;
};

interface Props {
  mezzo: MezzoStorico;
  tratte: TrattaView[];
  totali: TotaliStorico;
}

// ── Helpers ───────────────────────────────────────────────────────────────

const fmtKm = (km: number) =>
  new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(km);

const fmtData = (d: string) =>
  new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Rome',
  }).format(new Date(d));

function fmtDurata(minuti: number | null): string {
  if (minuti == null || minuti <= 0) return 'n.d.';
  const h = Math.floor(minuti / 60);
  const m = Math.round(minuti % 60);
  if (h === 0) return `${m} min`;
  return `${h}h ${m > 0 ? `${m}min` : ''}`.trim();
}

// ── Componente ────────────────────────────────────────────────────────────

export function MezzoStoricoClient({ mezzo, tratte, totali }: Props) {
  return (
    <div className="w-full space-y-5">
      {/* Intestazione */}
      <header className="flex items-start gap-3">
        <Link
          href="/office/kantiere/mezzi"
          className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Parco mezzi
        </Link>
      </header>

      <div>
        <h1 className="text-lg font-semibold">
          {mezzo.targa}
          {mezzo.modello && (
            <span className="ml-2 text-base font-normal text-muted-foreground">{mezzo.modello}</span>
          )}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Storico viaggi</p>
      </div>

      {/* KPI totali */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-3 shadow-soft">
          <p className="text-xs text-muted-foreground">Km totali</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{fmtKm(totali.kmTotali)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 shadow-soft">
          <p className="text-xs text-muted-foreground">Viaggi</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{totali.nViaggi}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 shadow-soft">
          <p className="text-xs text-muted-foreground">Durata totale</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {fmtDurata(totali.minutiTotali)}
          </p>
        </div>
      </div>

      {/* Tabella tratte */}
      {tratte.length === 0 ? (
        <div className="rounded-lg border border-border bg-muted/20 py-12 text-center">
          <Route className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
          <p className="text-sm font-medium text-muted-foreground">Nessun viaggio registrato per questo mezzo.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide text-muted-foreground">Data</th>
                <th className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide text-muted-foreground">Dipendente</th>
                <th className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide text-muted-foreground">Direzione</th>
                <th className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide text-muted-foreground">Tratta</th>
                <th className="px-3 py-2 text-right font-medium text-xs uppercase tracking-wide text-muted-foreground">Km</th>
                <th className="px-3 py-2 text-right font-medium text-xs uppercase tracking-wide text-muted-foreground">Durata</th>
                <th className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide text-muted-foreground">Origine</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tratte.map((t) => (
                <tr key={t.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2 tabular-nums whitespace-nowrap text-muted-foreground">
                    {fmtData(t.data)}
                  </td>
                  <td className="px-3 py-2 font-medium">{t.dipendente}</td>
                  <td className="px-3 py-2">
                    <span
                      className={[
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        t.direzione === 'andata'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                          : 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
                      ].join(' ')}
                    >
                      {t.direzione === 'andata' ? 'Andata' : 'Ritorno'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">
                    {t.sede ?? 'n.d.'}
                    <span className="mx-1 text-muted-foreground/50">&#x2192;</span>
                    {t.cantiere ?? 'n.d.'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    {fmtKm(t.distanza_km)} km
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-muted-foreground">
                    {fmtDurata(t.durata_min)}
                  </td>
                  <td className="px-3 py-2">
                    {t.manuale ? (
                      <span className="text-xs text-muted-foreground">Manuale</span>
                    ) : (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400">QR</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
