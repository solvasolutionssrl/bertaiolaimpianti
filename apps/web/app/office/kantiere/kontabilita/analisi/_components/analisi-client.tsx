'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@kommessa/ui';
import { CATEGORIA_META } from '@/app/_components/spese/categoria';
import type { CategoriaSpesa } from '@kommessa/api/spese';
import { BarsOrizzontali, DonutCategorie, AreaTrendValore } from '../../../_components/charts';
import type { VoceAgg, VoceCategoria } from '../page';

type CantiereOption = { id: string; nome: string };

interface Props {
  kpi: { spesaTotale: number; ivaTotale: number; nRicevute: number; scontrinoMedio: number };
  categorie: VoceCategoria[];
  cantieri: VoceAgg[];
  dipendenti: VoceAgg[];
  trend: { etichetta: string; valore: number }[];
  cantieriOptions: CantiereOption[];
  filtri: { da: string; a: string; cantiere: string };
}

const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
function euro(n: number): string {
  return eur.format(n);
}

// Colori coerenti con i badge categoria (mappati su esadecimali per Recharts).
const COLORE_CATEGORIA: Record<CategoriaSpesa, string> = {
  hotel: '#6366F1',
  ristorante: '#F59E0B',
  bar: '#F43F5E',
  trasporti: '#0EA5E9',
  carburante: '#10B981',
  varie: '#94A3B8',
};

function etichettaMese(ym: string): string {
  const [y, m] = ym.split('-');
  const mesi = [
    'gen', 'feb', 'mar', 'apr', 'mag', 'giu',
    'lug', 'ago', 'set', 'ott', 'nov', 'dic',
  ];
  const idx = Number(m) - 1;
  return mesi[idx] ? `${mesi[idx]} ${y}` : ym;
}

export function AnalisiClient({
  kpi,
  categorie,
  cantieri,
  dipendenti,
  trend,
  cantieriOptions,
  filtri,
}: Props) {
  const router = useRouter();

  const applica = React.useCallback(
    (patch: Partial<typeof filtri>) => {
      const next = { ...filtri, ...patch };
      const params = new URLSearchParams();
      if (next.da) params.set('da', next.da);
      if (next.a) params.set('a', next.a);
      if (next.cantiere) params.set('cantiere', next.cantiere);
      const qs = params.toString();
      router.push(qs ? `/office/kantiere/kontabilita/analisi?${qs}` : '/office/kantiere/kontabilita/analisi');
    },
    [filtri, router],
  );

  const haFiltri = !!(filtri.da || filtri.a || filtri.cantiere);
  const vuoto = kpi.nRicevute === 0;

  const datiCategorie = categorie.map((c) => ({
    nome: CATEGORIA_META[c.categoria as CategoriaSpesa]?.label ?? c.categoria,
    valore: c.valore,
    colore: COLORE_CATEGORIA[c.categoria as CategoriaSpesa] ?? '#94A3B8',
  }));
  const datiCantieri = cantieri.slice(0, 12);
  const datiDipendenti = dipendenti.slice(0, 12);
  const datiTrend = trend.map((t) => ({ etichetta: etichettaMese(t.etichetta), valore: t.valore }));

  return (
    <div className="space-y-5">
      {/* Filtri */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Dal</label>
              <input
                type="date"
                value={filtri.da}
                onChange={(e) => applica({ da: e.target.value })}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Al</label>
              <input
                type="date"
                value={filtri.a}
                onChange={(e) => applica({ a: e.target.value })}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Cantiere</label>
              <select
                value={filtri.cantiere}
                onChange={(e) => applica({ cantiere: e.target.value })}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Tutti i cantieri</option>
                {cantieriOptions.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nome}
                  </option>
                ))}
              </select>
            </div>
            {haFiltri ? (
              <button
                type="button"
                onClick={() => router.push('/office/kantiere/kontabilita/analisi')}
                className="ml-auto rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Pulisci filtri
              </button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {vuoto ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nessuna spesa nel periodo.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-3 shadow-soft">
              <p className="text-xs text-muted-foreground">Spesa totale</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-primary">{euro(kpi.spesaTotale)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3 shadow-soft">
              <p className="text-xs text-muted-foreground">IVA totale</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{euro(kpi.ivaTotale)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3 shadow-soft">
              <p className="text-xs text-muted-foreground">N. ricevute</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{kpi.nRicevute}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3 shadow-soft">
              <p className="text-xs text-muted-foreground">Scontrino medio</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{euro(kpi.scontrinoMedio)}</p>
            </div>
          </div>

          {/* Categorie + trend */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Spesa per categoria</CardTitle>
              </CardHeader>
              <CardContent>
                <DonutCategorie data={datiCategorie} formatValore={euro} testoVuoto="Nessuna spesa nel periodo." />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Andamento mensile</CardTitle>
              </CardHeader>
              <CardContent>
                <AreaTrendValore data={datiTrend} formatValore={euro} testoVuoto="Nessuna spesa nel periodo." />
              </CardContent>
            </Card>
          </div>

          {/* Cantiere + dipendente */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Spesa per cantiere</CardTitle>
              </CardHeader>
              <CardContent>
                <BarsOrizzontali
                  data={datiCantieri}
                  colore="#1340A6"
                  unita="€"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Spesa per dipendente</CardTitle>
              </CardHeader>
              <CardContent>
                <BarsOrizzontali
                  data={datiDipendenti}
                  colore="#D97706"
                  unita="€"
                />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
