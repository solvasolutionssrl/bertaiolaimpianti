'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@kommessa/ui';
import { BarsImpilate } from '../../../_components/charts';
import type { CostoCantiereRiga } from '../page';

interface Props {
  righe: CostoCantiereRiga[];
  filtri: { da: string; a: string };
}

const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
function euro(n: number | null): string {
  if (n == null) return 'n.d.';
  return eur.format(n);
}
function ore(n: number): string {
  return (Math.round(n * 100) / 100).toString().replace('.', ',');
}

const escape = (v: unknown): string => {
  if (v == null) return '';
  const s = String(v);
  if (s.includes(';') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

export function CostoCantiereClient({ righe, filtri }: Props) {
  const router = useRouter();

  function applica(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const p = new URLSearchParams();
    p.set('da', (fd.get('da') as string) || filtri.da);
    p.set('a', (fd.get('a') as string) || filtri.a);
    router.push('/office/kantiere/kontabilita/costo-cantiere?' + p.toString());
  }

  const tot = righe.reduce(
    (acc, r) => ({
      ore: acc.ore + r.oreLavorate,
      manodopera: r.costoManodopera == null ? acc.manodopera : (acc.manodopera ?? 0) + r.costoManodopera,
      spese: acc.spese + r.totaleSpese,
      totale: acc.totale + r.costoTotale,
    }),
    { ore: 0, manodopera: null as number | null, spese: 0, totale: 0 },
  );

  // Dati grafico: manodopera vs spese impilate (escludo righe a zero).
  const datiGrafico = righe
    .filter((r) => r.costoTotale > 0)
    .slice(0, 12)
    .map((r) => ({ nome: r.nome, a: r.costoManodopera ?? 0, b: r.totaleSpese }));

  function esportaCsv() {
    const header = ['Cantiere', 'Ore lavorate', 'Costo manodopera (€)', 'Spese (€)', 'Costo totale (€)'];
    const rows = righe.map((r) =>
      [
        r.nome,
        ore(r.oreLavorate),
        r.costoManodopera == null ? '' : (Math.round(r.costoManodopera * 100) / 100).toString().replace('.', ','),
        (Math.round(r.totaleSpese * 100) / 100).toString().replace('.', ','),
        (Math.round(r.costoTotale * 100) / 100).toString().replace('.', ','),
      ]
        .map(escape)
        .join(';'),
    );
    const csv = '﻿' + header.join(';') + '\n' + rows.join('\n') + '\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `costo-cantiere_${filtri.da}_${filtri.a}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const vuoto = righe.length === 0;

  return (
    <div className="space-y-5">
      {/* Filtri */}
      <form onSubmit={applica} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Dal</label>
          <input
            type="date"
            name="da"
            defaultValue={filtri.da}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Al</label>
          <input
            type="date"
            name="a"
            defaultValue={filtri.a}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
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
          disabled={vuoto}
          className="inline-flex items-center rounded-md border border-border bg-background px-4 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          Esporta CSV
        </button>
      </form>

      {vuoto ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nessun dato nel periodo (né manodopera da rapportini né spese).
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-3 shadow-soft">
              <p className="text-xs text-muted-foreground">Ore lavorate</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{ore(tot.ore)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3 shadow-soft">
              <p className="text-xs text-muted-foreground">Costo manodopera</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{euro(tot.manodopera)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3 shadow-soft">
              <p className="text-xs text-muted-foreground">Spese</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{euro(tot.spese)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3 shadow-soft">
              <p className="text-xs text-muted-foreground">Costo totale</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-primary">{euro(tot.totale)}</p>
            </div>
          </div>

          {/* Grafico */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Costo per cantiere</CardTitle>
            </CardHeader>
            <CardContent>
              <BarsImpilate
                data={datiGrafico}
                serieA={{ etichetta: 'Manodopera', colore: '#1340A6' }}
                serieB={{ etichetta: 'Spese', colore: '#D97706' }}
                formatValore={(v) => euro(v)}
                testoVuoto="Nessun costo nel periodo."
              />
            </CardContent>
          </Card>

          {/* Tabella */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Cantiere</th>
                  <th className="px-3 py-2 text-right font-medium">Ore lavorate</th>
                  <th className="px-3 py-2 text-right font-medium">Manodopera</th>
                  <th className="px-3 py-2 text-right font-medium">Spese</th>
                  <th className="px-3 py-2 text-right font-medium">Costo totale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {righe.map((r) => (
                  <tr key={r.cantiereId ?? '__none__'} className="hover:bg-muted/30">
                    <td className="px-3 py-1.5 font-medium">
                      {r.nome}
                      {r.manodoperaMancante ? (
                        <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-normal text-amber-700">
                          tariffa oraria mancante
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{ore(r.oreLavorate)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{euro(r.costoManodopera)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{euro(r.totaleSpese)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium">{euro(r.costoTotale)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border bg-muted/40">
                <tr>
                  <td className="px-3 py-2 font-semibold">Totale</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{ore(tot.ore)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{euro(tot.manodopera)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{euro(tot.spese)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-primary">{euro(tot.totale)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
