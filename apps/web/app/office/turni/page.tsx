import type { Metadata } from 'next';
import { Timer } from 'lucide-react';

import { Card, CardContent } from '@impiantixplus/ui';

import { requireTenantContextCached as requireTenantContext } from '../../_lib/tenant-cache';
import { SectionHeader } from '../../_components/section-header';

import { TurniFiltersClient } from './_components/filters-client';
import {
  aggregaFoglioOre,
  aggregaOrePerCommessa,
  fetchCommesseTenant,
  fetchInterventi,
  fetchUtentiTenant,
  formatDurataMin,
  settimanaRange,
} from './_lib/queries';

export const metadata: Metadata = { title: 'Turni & ore' };
export const dynamic = 'force-dynamic';

const GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

interface PageProps {
  searchParams?: { [k: string]: string | string[] | undefined };
}

function parseDateParam(v: string | undefined): Date | null {
  if (!v) return null;
  const d = new Date(`${v}T00:00:00`);
  return isNaN(d.getTime()) ? null : d;
}

export default async function OfficeTurniPage({ searchParams }: PageProps) {
  await requireTenantContext();

  const weekParam = (searchParams?.week as string | undefined) ?? undefined;
  const userParam = (searchParams?.user as string | undefined) ?? null;
  const commessaParam =
    (searchParams?.commessa as string | undefined) ?? null;

  const refDate = parseDateParam(weekParam) ?? new Date();
  const { from, to } = settimanaRange(refDate);

  const [interventi, utenti, commesse] = await Promise.all([
    fetchInterventi({
      from,
      to,
      userId: userParam,
      commessaId: commessaParam,
    }),
    fetchUtentiTenant(),
    fetchCommesseTenant(),
  ]);

  const foglio = aggregaFoglioOre(interventi, from);
  const perCommessa = aggregaOrePerCommessa(interventi);

  const fromIso = from.toISOString().slice(0, 10);
  const toIsoIncluso = new Date(to.getTime() - 24 * 3_600_000)
    .toISOString()
    .slice(0, 10);

  const labelGiorni = GIORNI.map((g, i) => {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    return `${g} ${d.getDate()}`;
  });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <SectionHeader
        eyebrow="Operations"
        title="Turni & ore"
        description={`Foglio ore della settimana ${fromIso} → ${toIsoIncluso}, aggregato per utente e commessa.`}
        icon={<Timer />}
      />

      <Card>
        <CardContent className="space-y-4 py-4">
          <TurniFiltersClient
            from={fromIso}
            utenti={utenti}
            commesse={commesse}
            filtroUserId={userParam}
            filtroCommessaId={commessaParam}
          />
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          Foglio ore settimana
        </h2>
        <Card>
          <CardContent className="p-0">
            {foglio.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Nessun intervento registrato nella settimana selezionata.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="sticky left-0 z-10 bg-muted/40 px-4 py-2 text-left font-semibold">
                        Utente
                      </th>
                      {labelGiorni.map((l) => (
                        <th
                          key={l}
                          className="px-3 py-2 text-right font-semibold font-mono tabular-nums"
                        >
                          {l}
                        </th>
                      ))}
                      <th className="px-4 py-2 text-right font-semibold">
                        Totale
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {foglio.map((row) => (
                      <tr key={row.user_id}>
                        <td className="sticky left-0 z-10 bg-background px-4 py-2 font-medium">
                          {row.user_name}
                        </td>
                        {row.giorni.map((m, i) => (
                          <td
                            key={i}
                            className={
                              'px-3 py-2 text-right font-mono tabular-nums ' +
                              (m > 0 ? 'text-foreground' : 'text-muted-foreground')
                            }
                          >
                            {m > 0 ? formatDurataMin(m) : '·'}
                          </td>
                        ))}
                        <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold text-primary">
                          {formatDurataMin(row.totale)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          Ore per commessa
        </h2>
        <Card>
          <CardContent className="p-0">
            {perCommessa.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Nessuna commessa attiva nel periodo.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">
                      Commessa
                    </th>
                    <th className="px-4 py-2 text-right font-semibold">
                      Utenti
                    </th>
                    <th className="px-4 py-2 text-right font-semibold">
                      Ore totali squadra
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {perCommessa.map((r) => (
                    <tr key={r.commessa_id}>
                      <td className="px-4 py-2 font-mono tabular-nums">
                        {r.commessa_codice}
                      </td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums">
                        {r.utenti_count}
                      </td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold">
                        {formatDurataMin(r.minuti_totali)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
