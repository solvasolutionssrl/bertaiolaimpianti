'use client';

import * as React from 'react';
import { BarChart3, Users, Clock, Car } from 'lucide-react';
import { formattaOreGiornata, formattaOreTotale } from '@kommessa/api/kantiere-ore';

export type AnaliticaCantiereDati = {
  /** Persone presenti o passate oggi su questo cantiere. */
  personeOggi: number;
  /** Ore lavorate totali oggi sul cantiere (pause escluse). */
  oreOggi: number;
  /** Km effettivamente guidati oggi (autista=true). */
  kmGuidatiOggi: number;
  /** Km percorsi oggi in totale (autista + passeggero). */
  kmPercorsiOggi: number;
  /** Ore lavorate sul cantiere negli ultimi 7 giorni (da rapportini). */
  ore7gg: number;
  /** Km guidati sul cantiere negli ultimi 7 giorni. */
  kmGuidati7gg: number;
};

/**
 * Ore del giorno: `7:30`, non `7,5`. Su un foglio ore il decimale non lo legge
 * nessuno, e mezz'ora su una giornata conta.
 */
function oreGiornoLabel(ore: number): string {
  if (!Number.isFinite(ore) || ore <= 0) return '0:00';
  return formattaOreGiornata(Math.round(ore * 60));
}

/** Ore di un periodo (7 giorni, tutti insieme): e' una somma, si arrotonda. */
function orePeriodoLabel(ore: number): string {
  if (!Number.isFinite(ore) || ore <= 0) return '0 ore';
  return formattaOreTotale(Math.round(ore * 60));
}

function kmLabel(km: number): string {
  if (!Number.isFinite(km) || km <= 0) return '0';
  const v = Math.round(km * 10) / 10;
  return v.toString().replace('.', ',');
}

/** Chip KPI compatto: valore grande + etichetta, con tinta accento. */
function Chip({
  icon,
  valore,
  unita,
  label,
  tinta,
}: {
  icon: React.ReactNode;
  valore: string;
  unita?: string;
  label: string;
  tinta: 'emerald' | 'blue' | 'amber';
}) {
  const stile =
    tinta === 'emerald'
      ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      : tinta === 'blue'
        ? 'border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300'
        : 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  return (
    <div className={'rounded-lg border p-2.5 ' + stile}>
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wider opacity-80">{label}</span>
      </div>
      <p className="mt-1 text-lg font-semibold leading-none">
        {valore}
        {unita ? <span className="ml-0.5 text-xs font-medium opacity-70">{unita}</span> : null}
      </p>
    </div>
  );
}

/**
 * Vista office/admin: statistiche sintetiche di questo cantiere.
 * Compatta, pensata per il mobile: chip KPI per "oggi" + riga riepilogo 7 giorni.
 * Non compare per i tecnici (gating lato server, come "In cantiere ora").
 */
export function AnaliticaCantiere({ dati }: { dati: AnaliticaCantiereDati }) {
  const haSettimana = dati.ore7gg > 0 || dati.kmGuidati7gg > 0;

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
        Analitica cantiere
      </p>

      <p className="mt-2 text-[11px] font-medium text-muted-foreground">Oggi</p>
      <div className="mt-1.5 grid grid-cols-2 gap-2">
        <Chip
          icon={<Users className="h-3.5 w-3.5" aria-hidden="true" />}
          valore={dati.personeOggi.toString()}
          label="In cantiere"
          tinta="emerald"
        />
        <Chip
          icon={<Clock className="h-3.5 w-3.5" aria-hidden="true" />}
          valore={oreGiornoLabel(dati.oreOggi)}
          label="Ore oggi"
          tinta="emerald"
        />
        <Chip
          icon={<Car className="h-3.5 w-3.5" aria-hidden="true" />}
          valore={kmLabel(dati.kmGuidatiOggi)}
          unita="km"
          label="Km guidati"
          tinta="blue"
        />
      </div>

      {haSettimana ? (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Ultimi 7 giorni:{' '}
          <span className="font-medium text-foreground">{orePeriodoLabel(dati.ore7gg)}</span>
          {' · '}
          <span className="font-medium text-foreground">{kmLabel(dati.kmGuidati7gg)} km guidati</span>
        </p>
      ) : (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Ultimi 7 giorni: nessuna ora registrata.
        </p>
      )}
    </div>
  );
}
