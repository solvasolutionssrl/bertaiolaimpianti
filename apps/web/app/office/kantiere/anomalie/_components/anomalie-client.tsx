'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@kommessa/ui';
import { fmtData } from '@/app/office/_lib/format';
import type {
  IncompleteRow,
  StraordinarioRow,
  SenzaRapportinoRow,
  ModificatoDopoInvioRow,
} from '../page';

interface Props {
  incomplete: IncompleteRow[];
  straordinario: StraordinarioRow[];
  senzaRapportino: SenzaRapportinoRow[];
  modificati: ModificatoDopoInvioRow[];
  filtri: { from: string; to: string };
}

const STATO_LABEL: Record<string, string> = {
  bozza: 'Bozza',
  inviato: 'Inviato',
  approvato: 'Approvato',
  respinto: 'Respinto',
  verificato: 'Verificato',
  esportato: 'Esportato',
};

export function AnomalieClient({
  incomplete,
  straordinario,
  senzaRapportino,
  modificati,
  filtri,
}: Props) {
  const router = useRouter();

  function handleFiltri(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const from = fd.get('from') as string;
    const to = fd.get('to') as string;
    const qs = new URLSearchParams({ from, to }).toString();
    router.push(`/office/kantiere/anomalie?${qs}`);
  }

  return (
    <div className="space-y-6">
      {/* Filtri */}
      <form onSubmit={handleFiltri} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="from" className="text-xs text-muted-foreground">
            Dal
          </label>
          <input
            id="from"
            name="from"
            type="date"
            defaultValue={filtri.from}
            required
            className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="to" className="text-xs text-muted-foreground">
            Al
          </label>
          <input
            id="to"
            name="to"
            type="date"
            defaultValue={filtri.to}
            required
            className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Filtra
        </button>
      </form>

      {/* A) Timbrature incomplete */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Giornate incomplete{' '}
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              ({incomplete.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {incomplete.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessuna anomalia.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Dipendente</th>
                    <th className="pb-2 pr-4 font-medium">Commessa / Cantiere</th>
                    <th className="pb-2 font-medium">Giorno</th>
                  </tr>
                </thead>
                <tbody>
                  {incomplete.map((row, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-4">{row.dipendenteNome}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{row.commessaTitolo}</td>
                      <td className="py-2">
                        <a
                          href={`/office/kantiere/rapportini?from=${row.giorno}&to=${row.giorno}&dipendente=${row.dipendente_id}`}
                          className="text-primary hover:underline"
                        >
                          {fmtData(row.giorno)}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* B) Straordinario */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Ore straordinarie{' '}
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              ({straordinario.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {straordinario.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessuna anomalia.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Dipendente</th>
                    <th className="pb-2 pr-4 font-medium">Data</th>
                    <th className="pb-2 pr-4 font-medium">Commessa / Cantiere</th>
                    <th className="pb-2 font-medium">Ore straord.</th>
                  </tr>
                </thead>
                <tbody>
                  {straordinario.map((row, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-4">{row.dipendenteNome}</td>
                      <td className="py-2 pr-4">{fmtData(row.data)}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{row.commessaTitolo}</td>
                      <td className="py-2 font-medium">{row.ore_straordinarie}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* C) Senza rapportino */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Dipendenti senza rapportino nel periodo{' '}
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              ({senzaRapportino.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {senzaRapportino.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessuna anomalia.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {senzaRapportino.map((row, i) => (
                <li key={i} className="border-b border-border/50 py-2 last:border-0">
                  {row.nome}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* D) Modificato dopo invio */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Modificati dopo invio{' '}
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              ({modificati.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {modificati.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessuna anomalia.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Dipendente</th>
                    <th className="pb-2 pr-4 font-medium">Data</th>
                    <th className="pb-2 font-medium">Stato attuale</th>
                  </tr>
                </thead>
                <tbody>
                  {modificati.map((row, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-4">{row.dipendenteNome}</td>
                      <td className="py-2 pr-4">{fmtData(row.data)}</td>
                      <td className="py-2 text-muted-foreground">
                        {STATO_LABEL[row.stato] ?? row.stato}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
