'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BarChart3, TrendingUp } from 'lucide-react';
import { BarsOrizzontali, DonutOre, AreaTrend } from '@/app/office/kantiere/_components/charts';

export interface StoricoPersona {
  dipendenteId: string;
  nome: string;
  ordinarie: number;
  straordinarie: number;
  viaggio: number;
  totale: number;
  /** Km percorsi su questo cantiere nel periodo (tutti). */
  km: number;
  /** Km percorsi come autista (sottoinsieme di `km`). */
  kmGuidati: number;
}

export interface StoricoTotali {
  ordinarie: number;
  straordinarie: number;
  viaggio: number;
  totale: number;
  km: number;
  kmGuidati: number;
}

export interface TrendGiorno {
  giorno: string; // YYYY-MM-DD
  valore: number;
  oggi: boolean;
}

export interface StoricoData {
  giorni: number;
  perPersona: StoricoPersona[];
  totali: StoricoTotali;
  trend: TrendGiorno[];
}

const PERIODI = [
  { giorni: 7, label: '7 giorni' },
  { giorni: 14, label: '14 giorni' },
  { giorni: 30, label: '30 giorni' },
  { giorni: 60, label: '60 giorni' },
  { giorni: 90, label: '90 giorni' },
];

function fmtOre(n: number): string {
  if (!n) return '—';
  const totMin = Math.max(0, Math.round(n * 60));
  return `${Math.floor(totMin / 60)}:${String(totMin % 60).padStart(2, '0')}`;
}

function fmtKm(n: number): string {
  return n > 0 ? `${Math.round(n)} km` : '—';
}

/** Etichetta breve "gg/mm" da una data YYYY-MM-DD per gli assi grafico. */
function etichettaGiorno(g: string): string {
  const p = g.split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}` : g;
}

export function StoricoPresenze({ data }: { data: StoricoData }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function cambiaPeriodo(giorni: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('giorni', String(giorni));
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const barsData = data.perPersona.map((p) => ({ nome: p.nome, valore: p.totale }));
  const trendData = data.trend.map((t) => ({
    etichetta: etichettaGiorno(t.giorno),
    valore: t.valore,
    oggi: t.oggi,
  }));
  const vuoto = data.perPersona.length === 0;

  return (
    <div className="space-y-4">
      {/* Selettore periodo */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Ore registrate sui rapportini di questo cantiere nel periodo selezionato.
        </p>
        <div className="inline-flex rounded-md border border-border bg-muted/30 p-0.5">
          {PERIODI.map((p) => {
            const attivo = p.giorni === data.giorni;
            return (
              <button
                key={p.giorni}
                type="button"
                onClick={() => cambiaPeriodo(p.giorni)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  attivo
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {vuoto ? (
        <p className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-8 text-center text-sm italic text-muted-foreground">
          Nessuna ora registrata in questo periodo.
        </p>
      ) : (
        <>
          {/* Tabella per persona */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Dipendente</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Ordinarie</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Straord.</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Viaggio</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Km</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Totale</th>
                </tr>
              </thead>
              <tbody>
                {data.perPersona.map((p, i) => (
                  <tr
                    key={p.dipendenteId}
                    className={`border-b border-border/50 last:border-0 transition-colors hover:bg-muted/40 ${
                      i % 2 === 1 ? 'bg-muted/20' : ''
                    }`}
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/office/kantiere/dipendenti/${p.dipendenteId}`}
                        className="font-medium text-foreground underline-offset-2 hover:text-primary hover:underline"
                      >
                        {p.nome}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtOre(p.ordinarie)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-700 dark:text-amber-400">
                      {fmtOre(p.straordinarie)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                      {fmtOre(p.viaggio)}
                    </td>
                    <td
                      className="px-3 py-2 text-right tabular-nums text-sky-700 dark:text-sky-400"
                      title={p.kmGuidati > 0 ? `di cui ${fmtKm(p.kmGuidati)} come autista` : undefined}
                    >
                      {fmtKm(p.km)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtOre(p.totale)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/40">
                  <td className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Totale
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtOre(data.totali.ordinarie)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                    {fmtOre(data.totali.straordinarie)}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {fmtOre(data.totali.viaggio)}
                  </td>
                  <td
                    className="px-3 py-2 text-right font-semibold tabular-nums text-sky-700 dark:text-sky-400"
                    title={data.totali.kmGuidati > 0 ? `di cui ${fmtKm(data.totali.kmGuidati)} come autista` : undefined}
                  >
                    {fmtKm(data.totali.km)}
                  </td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">{fmtOre(data.totali.totale)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Grafici */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-muted/10 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
                Ore totali per persona
              </div>
              <BarsOrizzontali data={barsData} unita="h" />
            </div>
            <div className="rounded-lg border border-border bg-muted/10 p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Ripartizione ore
              </div>
              <DonutOre
                ordinarie={data.totali.ordinarie}
                straordinarie={data.totali.straordinarie}
                viaggio={data.totali.viaggio}
              />
            </div>
          </div>

          {trendData.length > 1 && (
            <div className="rounded-lg border border-border bg-muted/10 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                Ore totali per giorno
              </div>
              <AreaTrend data={trendData} unita="h" />
            </div>
          )}
        </>
      )}
    </div>
  );
}
