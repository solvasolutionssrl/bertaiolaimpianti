'use client';

import { useRouter } from 'next/navigation';
import type { AggregataRiga, KpiTotali, ViaggioRigaDip, ViaggioRigaMezzo } from '../page';

interface Filtri {
  from: string;
  to: string;
  per: 'dipendente' | 'commessa';
  stato: string;
}

interface Props {
  aggregati: AggregataRiga[];
  kpi: KpiTotali;
  filtri: Filtri;
  viaggiPerDipendente: ViaggioRigaDip[];
  viaggiPerMezzo: ViaggioRigaMezzo[];
}

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

function fmtKm(km: number): string {
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(km);
}

function fmtOre(ore: number): string {
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(ore);
}

function buildQs(f: Filtri): string {
  const p = new URLSearchParams();
  p.set('from', f.from);
  p.set('to', f.to);
  p.set('per', f.per);
  if (f.stato) p.set('stato', f.stato);
  return p.toString();
}

export function ReportClient({ aggregati, kpi, filtri, viaggiPerDipendente, viaggiPerMezzo }: Props) {
  const router = useRouter();

  const totaleColonna = {
    ordinarie: aggregati.reduce((s, r) => s + r.ordinarie, 0),
    straordinarie: aggregati.reduce((s, r) => s + r.straordinarie, 0),
    viaggio: aggregati.reduce((s, r) => s + r.viaggio, 0),
    totale: aggregati.reduce((s, r) => s + r.totale, 0),
  };

  function handleApply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const next: Filtri = {
      from: (fd.get('from') as string) || filtri.from,
      to: (fd.get('to') as string) || filtri.to,
      per: (fd.get('per') as 'dipendente' | 'commessa') || filtri.per,
      stato: (fd.get('stato') as string) || '',
    };
    router.push('/office/kantiere/report?' + buildQs(next));
  }

  const exportHref =
    '/api/office/kantiere/rapportini/export?' +
    new URLSearchParams({
      from: filtri.from,
      to: filtri.to,
      ...(filtri.stato ? { stato: filtri.stato } : {}),
    }).toString();

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: A4; margin: 12mm; }
        }
      `}</style>

      {/* Filtri */}
      <form onSubmit={handleApply} className="no-print flex flex-wrap items-end gap-3">
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
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Stato</label>
          <select
            name="stato"
            defaultValue={filtri.stato}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          >
            <option value="">Inviato + Approvato</option>
            <option value="inviato">Inviato</option>
            <option value="approvato">Approvato</option>
            <option value="verificato">Verificato</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Aggiorna
        </button>
      </form>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-3 shadow-soft">
          <p className="text-xs text-muted-foreground">Ore ordinarie</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{fmt(kpi.ordinarie)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 shadow-soft">
          <p className="text-xs text-muted-foreground">Ore straordinario</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{fmt(kpi.straordinarie)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 shadow-soft">
          <p className="text-xs text-muted-foreground">Ore viaggio</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{fmt(kpi.viaggio)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 shadow-soft">
          <p className="text-xs text-muted-foreground">Totale ore</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-primary">{fmt(kpi.totale)}</p>
        </div>
      </div>

      {/* Tabella aggregata */}
      {aggregati.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessun dato nel periodo selezionato.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">
                  {filtri.per === 'dipendente' ? 'Dipendente' : 'Commessa / Cantiere'}
                </th>
                <th className="px-3 py-2 text-right font-medium">Ordinarie</th>
                <th className="px-3 py-2 text-right font-medium">Straordinario</th>
                <th className="px-3 py-2 text-right font-medium">Viaggio</th>
                <th className="px-3 py-2 text-right font-medium">Totale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {aggregati.map((row) => (
                <tr key={row.chiave} className="hover:bg-muted/30">
                  <td className="px-3 py-1.5 font-medium">{row.chiave}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmt(row.ordinarie)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmt(row.straordinarie)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmt(row.viaggio)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fmt(row.totale)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-border bg-muted/40">
              <tr>
                <td className="px-3 py-2 font-semibold">Totale</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">
                  {fmt(totaleColonna.ordinarie)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">
                  {fmt(totaleColonna.straordinarie)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">
                  {fmt(totaleColonna.viaggio)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-primary">
                  {fmt(totaleColonna.totale)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Azioni export */}
      <div className="no-print flex gap-3">
        <a
          href={exportHref}
          className="inline-flex items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Esporta CSV
        </a>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Stampa / PDF
        </button>
      </div>

      {/* ── Sezione Viaggi e km ────────────────────────────────────────────── */}
      <section className="space-y-4 pt-2">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Viaggi e km</h2>
          <span className="text-xs text-muted-foreground">
            Tratte registrate nel periodo selezionato.
          </span>
        </div>

        {viaggiPerDipendente.length === 0 && viaggiPerMezzo.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun viaggio registrato nel periodo selezionato.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Per dipendente */}
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Per dipendente</h3>
              {viaggiPerDipendente.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nessun dato.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide text-muted-foreground">Dipendente</th>
                        <th className="px-3 py-2 text-right font-medium text-xs uppercase tracking-wide text-muted-foreground">Km tot.</th>
                        <th className="px-3 py-2 text-right font-medium text-xs uppercase tracking-wide text-muted-foreground">Viaggi</th>
                        <th className="px-3 py-2 text-right font-medium text-xs uppercase tracking-wide text-muted-foreground">Ore guida</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {viaggiPerDipendente.map((r) => (
                        <tr key={r.dipendente} className="hover:bg-muted/30">
                          <td className="px-3 py-1.5 font-medium">{r.dipendente}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtKm(r.kmTotali)} km</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{r.nViaggi}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtOre(r.oreGuida)} h</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-border bg-muted/40">
                      <tr>
                        <td className="px-3 py-2 font-semibold">Totale</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold whitespace-nowrap">
                          {fmtKm(viaggiPerDipendente.reduce((s, r) => s + r.kmTotali, 0))} km
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">
                          {viaggiPerDipendente.reduce((s, r) => s + r.nViaggi, 0)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold whitespace-nowrap">
                          {fmtOre(viaggiPerDipendente.reduce((s, r) => s + r.oreGuida, 0))} h
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Per mezzo */}
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Per mezzo</h3>
              {viaggiPerMezzo.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nessun viaggio con mezzo assegnato.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide text-muted-foreground">Mezzo</th>
                        <th className="px-3 py-2 text-right font-medium text-xs uppercase tracking-wide text-muted-foreground">Km tot.</th>
                        <th className="px-3 py-2 text-right font-medium text-xs uppercase tracking-wide text-muted-foreground">Viaggi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {viaggiPerMezzo.map((r) => (
                        <tr key={r.targa} className="hover:bg-muted/30">
                          <td className="px-3 py-1.5 font-medium font-mono">
                            {r.targa}
                            {r.modello && (
                              <span className="ml-1.5 font-sans font-normal text-muted-foreground text-xs">{r.modello}</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtKm(r.kmTotali)} km</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{r.nViaggi}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-border bg-muted/40">
                      <tr>
                        <td className="px-3 py-2 font-semibold">Totale</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold whitespace-nowrap">
                          {fmtKm(viaggiPerMezzo.reduce((s, r) => s + r.kmTotali, 0))} km
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">
                          {viaggiPerMezzo.reduce((s, r) => s + r.nViaggi, 0)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
