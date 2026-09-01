'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { AggregataCostoRiga } from '../page';
import { formattaOreTotale } from '@kommessa/api/kantiere-ore';

interface Filtri {
  from: string;
  to: string;
  per: 'dipendente' | 'commessa';
}

interface Props {
  aggregati: AggregataCostoRiga[];
  filtri: Filtri;
}

/**
 * Numero decimale con la virgola: serve **solo al CSV**, dove il foglio di
 * calcolo deve poter sommare. A schermo le ore non si scrivono cosi'.
 */
function fmtCsv(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

/** Ore a schermo: sono somme sul periodo scelto, non le ore di una giornata. */
function fmtOre(n: number): string {
  return formattaOreTotale(Math.round((Number(n) || 0) * 60));
}
function fmtEuro(n: number | null): string {
  if (n == null) return 'n.d.';
  return (
    new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) +
    ' €'
  );
}

const escape = (v: unknown): string => {
  if (v == null) return '';
  const s = String(v);
  if (s.includes(';') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

export function CostiTab({ aggregati, filtri }: Props) {
  const router = useRouter();

  function applica(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const p = new URLSearchParams();
    p.set('tab', 'costi');
    p.set('from', (fd.get('from') as string) || filtri.from);
    p.set('to', (fd.get('to') as string) || filtri.to);
    p.set('per', (fd.get('per') as string) || filtri.per);
    router.push('/office/kantiere/ore-costi?' + p.toString());
  }

  const tot = aggregati.reduce(
    (acc, r) => ({
      ore_pesate: acc.ore_pesate + r.ore_pesate,
      costo_totale:
        r.costo_totale == null ? acc.costo_totale : (acc.costo_totale ?? 0) + r.costo_totale,
    }),
    { ore_pesate: 0, costo_totale: null as number | null },
  );

  function esportaCsv() {
    const header = [
      filtri.per === 'dipendente' ? 'Dipendente' : 'Commessa/Cantiere',
      'Ore ordinarie',
      'Ore straordinario',
      'Ore viaggio',
      'Ore pesate',
      'Costo (€)',
    ];
    const rows = aggregati.map((r) =>
      [
        r.chiave,
        fmtCsv(r.ore_ordinarie),
        fmtCsv(r.ore_straordinarie),
        fmtCsv(r.ore_viaggio),
        fmtCsv(r.ore_pesate),
        r.costo_totale == null ? '' : fmtCsv(r.costo_totale),
      ]
        .map(escape)
        .join(';'),
    );
    const csv = '﻿' + header.join(';') + '\n' + rows.join('\n') + '\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `costi_${filtri.from}_${filtri.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      {/* Filtri */}
      <form onSubmit={applica} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Dal</label>
          <input
            type="date"
            name="from"
            defaultValue={filtri.from}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Al</label>
          <input
            type="date"
            name="to"
            defaultValue={filtri.to}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Raggruppa per</label>
          <select
            name="per"
            defaultValue={filtri.per}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          >
            <option value="dipendente">Dipendente</option>
            <option value="commessa">Commessa o cantiere</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Aggiorna
        </button>
        <button
          type="button"
          onClick={esportaCsv}
          className="inline-flex items-center rounded-md border border-border bg-background px-4 py-1.5 text-sm font-medium hover:bg-muted"
        >
          Esporta CSV
        </button>
      </form>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-3 shadow-soft">
          <p className="text-xs text-muted-foreground">Righe</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{aggregati.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 shadow-soft">
          <p className="text-xs text-muted-foreground">Ore pesate totali</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{fmtOre(tot.ore_pesate)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 shadow-soft">
          <p className="text-xs text-muted-foreground">Costo totale</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-primary">{fmtEuro(tot.costo_totale)}</p>
        </div>
      </div>

      {/* Tabella */}
      {aggregati.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nessun rapportino inviato/approvato nel periodo selezionato.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">
                  {filtri.per === 'dipendente' ? 'Dipendente' : 'Commessa / Cantiere'}
                </th>
                <th className="px-3 py-2 text-right font-medium">Ordinarie</th>
                <th className="px-3 py-2 text-right font-medium">Straord.</th>
                <th className="px-3 py-2 text-right font-medium">Viaggio</th>
                <th className="px-3 py-2 text-right font-medium">Ore pesate</th>
                <th className="px-3 py-2 text-right font-medium">Costo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {aggregati.map((r) => (
                <tr key={r.chiave} className="hover:bg-muted/30">
                  <td className="px-3 py-1.5 font-medium">{r.chiave}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtOre(r.ore_ordinarie)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtOre(r.ore_straordinarie)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtOre(r.ore_viaggio)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fmtOre(r.ore_pesate)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fmtEuro(r.costo_totale)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-border bg-muted/40">
              <tr>
                <td className="px-3 py-2 font-semibold" colSpan={4}>
                  Totale
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtOre(tot.ore_pesate)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-primary">
                  {fmtEuro(tot.costo_totale)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
