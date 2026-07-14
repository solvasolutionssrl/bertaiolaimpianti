import Link from 'next/link';
import {
  ReceiptText,
  Receipt,
  Euro,
  Percent,
  MapPinOff,
  ArrowLeft,
  ArrowUpRight,
} from 'lucide-react';
import { Badge, Card, CardContent } from '@kommessa/ui';

import { createServiceSupabase } from '@kommessa/api/service';
import { normalizzaCategoria } from '@kommessa/api/spese';
import { requirePlatformAdmin } from '../../_lib/guard';
import { SectionHeader } from '../../../_components/section-header';
import { CATEGORIA_META } from '@/app/_components/spese/categoria';
import { statKontabilitaPerTenant } from '../_lib/queries';
import { FiltriSpese } from './_components/filtri-spese';

export const metadata = { title: 'Platform · Kontabilità' };
export const dynamic = 'force-dynamic';

const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const fmtData = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'Europe/Rome',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function dataRel(iso: string | null): string {
  if (!iso) return 'mai';
  return fmtData.format(new Date(iso));
}

const STATO_STILE: Record<string, string> = {
  confermata: 'border-success/30 text-success',
  bozza: 'border-amber-400/40 text-amber-600',
  in_elaborazione: 'border-primary/30 text-primary',
};
const STATO_LABEL: Record<string, string> = {
  confermata: 'Confermata',
  bozza: 'Bozza',
  in_elaborazione: 'In elaborazione',
};

type SpesaRow = {
  id: string;
  tenant_id: string;
  dipendente_id: string | null;
  cantiere_id: string | null;
  categoria: string;
  ragione_sociale: string | null;
  importo_totale: number | null;
  importo_iva: number | null;
  data_scontrino: string | null;
  stato: string;
  created_at: string;
};

export default async function AdminKontabilitaPage({
  searchParams,
}: {
  searchParams: { tenant?: string; categoria?: string; da?: string; a?: string };
}) {
  await requirePlatformAdmin();
  const sb = createServiceSupabase();

  const tenant = searchParams.tenant ?? '';
  const categoria = searchParams.categoria ?? '';
  const da = searchParams.da ?? '';
  const a = searchParams.a ?? '';

  // KPI + per-tenant (aggregati su tutto, applicando il range data).
  const stats = await statKontabilitaPerTenant({ da: da || null, a: a || null });

  const totImporto = stats.reduce((s, t) => s + t.totaleImporto, 0);
  const totIva = stats.reduce((s, t) => s + t.totaleIva, 0);
  const totSpese = stats.reduce((s, t) => s + t.numSpese, 0);
  const totSenzaCantiere = stats.reduce((s, t) => s + t.numSenzaCantiere, 0);
  const pctConCantiere = totSpese > 0 ? Math.round(((totSpese - totSenzaCantiere) / totSpese) * 100) : 0;

  // Tabella dettaglio: ultime ~100 spese cross-tenant (con filtri).
  let q = sb
    .from('spese' as never)
    .select(
      'id, tenant_id, dipendente_id, cantiere_id, categoria, ragione_sociale, importo_totale, importo_iva, data_scontrino, stato, created_at',
    )
    .order('data_scontrino', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(100);
  if (tenant) q = q.eq('tenant_id', tenant);
  if (categoria) q = q.eq('categoria', categoria);
  if (da) q = q.gte('data_scontrino', da);
  if (a) q = q.lte('data_scontrino', `${a}T23:59:59.999`);

  const [{ data: speseRaw }, { data: tenantsRaw }] = await Promise.all([
    q as unknown as Promise<{ data: SpesaRow[] | null }>,
    sb.from('tenants').select('id, nome').order('nome'),
  ]);

  const rows = (speseRaw as SpesaRow[] | null) ?? [];
  const tenants = (tenantsRaw as { id: string; nome: string }[] | null) ?? [];
  const tenantMap = new Map(tenants.map((t) => [t.id, t.nome]));

  // Lookup nomi dipendente/cantiere cross-tenant.
  const dipIds = [...new Set(rows.map((r) => r.dipendente_id).filter(Boolean))] as string[];
  const cantIds = [...new Set(rows.map((r) => r.cantiere_id).filter(Boolean))] as string[];
  const [dipRes, cantRes] = await Promise.all([
    dipIds.length
      ? sb.from('dipendenti' as never).select('id, nome, cognome').in('id', dipIds)
      : Promise.resolve({ data: [] }),
    cantIds.length
      ? sb.from('cantieri' as never).select('id, nome, codice').in('id', cantIds)
      : Promise.resolve({ data: [] }),
  ]);
  const dipMap = new Map(
    ((dipRes.data as { id: string; nome: string; cognome: string }[] | null) ?? []).map((d) => [
      d.id,
      `${d.nome} ${d.cognome}`.trim(),
    ]),
  );
  const cantMap = new Map(
    ((cantRes.data as { id: string; nome: string | null; codice: string | null }[] | null) ?? []).map(
      (c) => [c.id, c.nome || c.codice || ''],
    ),
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Platform · Kantiere"
        title="Kontabilità"
        description="Osservabilità cross-tenant delle spese di cantiere (sola lettura). Ricevute, importi, IVA e assegnazione cantiere."
        icon={<ReceiptText />}
        actions={
          <Link
            href="/admin/kantiere"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium transition-colors hover:bg-muted/50"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Panoramica
          </Link>
        }
      />

      {/* KPI aggregati su tutti i tenant */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiBox label="Spesa totale" value={eur.format(totImporto)} icon={<Euro />} />
        <KpiBox label="IVA totale" value={eur.format(totIva)} icon={<Receipt />} />
        <KpiBox label="Ricevute" value={String(totSpese)} icon={<ReceiptText />} />
        <KpiBox
          label="Con cantiere assegnato"
          value={`${pctConCantiere}%`}
          icon={<Percent />}
          tone={pctConCantiere >= 90 ? 'success' : 'amber'}
        />
      </div>

      {totSenzaCantiere > 0 ? (
        <div className="flex items-center gap-2 rounded-md border border-amber-400/40 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
          <MapPinOff className="h-4 w-4 shrink-0" aria-hidden="true" />
          {totSenzaCantiere} ricevut{totSenzaCantiere === 1 ? 'a' : 'e'} senza cantiere assegnato nel
          periodo selezionato.
        </div>
      ) : null}

      {/* Riepilogo per tenant */}
      {stats.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nessun tenant usa il modulo Kantiere. Attivalo dalla scheda tenant → tab Moduli.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {stats.map((s) => (
            <Card key={s.tenantId} className="overflow-hidden">
              <CardContent className="space-y-3 py-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/tenants/${s.tenantId}`}
                      className="flex items-center gap-1 text-sm font-semibold tracking-tight hover:underline"
                    >
                      {s.tenantNome}
                      <ArrowUpRight
                        className="h-3.5 w-3.5 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </Link>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Ultima ricevuta: {dataRel(s.ultimaSpesaAt)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-lg font-semibold leading-none tabular-nums">
                      {eur.format(s.totaleImporto)}
                    </p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                      di cui IVA {eur.format(s.totaleIva)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <Mini label="Ricevute" value={String(s.numSpese)} />
                  <Mini
                    label="Senza cantiere"
                    value={String(s.numSenzaCantiere)}
                    tone={s.numSenzaCantiere > 0 ? 'amber' : 'default'}
                  />
                  <Mini
                    label="Con cantiere"
                    value={
                      s.numSpese > 0
                        ? `${Math.round(((s.numSpese - s.numSenzaCantiere) / s.numSpese) * 100)}%`
                        : 'n.d.'
                    }
                  />
                </div>

                <div className="flex items-center justify-end border-t border-border pt-2">
                  <Link
                    href={`/admin/kantiere/kontabilita?tenant=${s.tenantId}`}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                  >
                    Vedi ricevute
                    <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filtri + dettaglio */}
      <FiltriSpese
        tenants={tenants}
        tenant={tenant || 'all'}
        categoria={categoria || 'all'}
        da={da}
        a={a}
      />

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Nessuna ricevuta con i filtri selezionati.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2.5 font-medium">Tenant</th>
                    <th className="px-3 py-2.5 font-medium">Data</th>
                    <th className="px-3 py-2.5 font-medium">Esercente</th>
                    <th className="px-3 py-2.5 font-medium">Dipendente</th>
                    <th className="px-3 py-2.5 font-medium">Cantiere</th>
                    <th className="px-3 py-2.5 font-medium">Categoria</th>
                    <th className="px-3 py-2.5 text-right font-medium">Importo</th>
                    <th className="px-3 py-2.5 text-right font-medium">IVA</th>
                    <th className="px-3 py-2.5 font-medium">Stato</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => {
                    const cat = normalizzaCategoria(r.categoria);
                    const meta = CATEGORIA_META[cat];
                    const senzaCantiere = !r.cantiere_id;
                    return (
                      <tr
                        key={r.id}
                        className={
                          'transition-colors hover:bg-muted/20 ' +
                          (senzaCantiere ? 'bg-amber-50/40 dark:bg-amber-950/10' : '')
                        }
                      >
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {tenantMap.get(r.tenant_id) ?? r.tenant_id}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs tabular-nums text-muted-foreground">
                          {r.data_scontrino ? fmtData.format(new Date(r.data_scontrino)) : 'n.d.'}
                        </td>
                        <td className="max-w-[180px] truncate px-3 py-2.5 font-medium tracking-tight">
                          {r.ragione_sociale || 'n.d.'}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {dipMap.get(r.dipendente_id ?? '') ?? 'n.d.'}
                        </td>
                        <td className="max-w-[160px] truncate px-3 py-2.5">
                          {senzaCantiere ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                              <MapPinOff className="h-3.5 w-3.5" aria-hidden="true" />
                              Da assegnare
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              {cantMap.get(r.cantiere_id ?? '') || 'n.d.'}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={
                              'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ' +
                              meta.badge
                            }
                          >
                            {meta.label}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums">
                          {r.importo_totale != null ? eur.format(Number(r.importo_totale)) : 'n.d.'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-xs tabular-nums text-muted-foreground">
                          {r.importo_iva != null ? eur.format(Number(r.importo_iva)) : 'n.d.'}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge
                            variant="outline"
                            className={
                              'font-normal ' + (STATO_STILE[r.stato] ?? 'text-muted-foreground')
                            }
                          >
                            {STATO_LABEL[r.stato] ?? r.stato}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-right font-mono text-[11px] text-muted-foreground">
        {rows.length} righe{rows.length === 100 ? ' (cap 100)' : ''} ·{' '}
        {new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}
      </p>
    </div>
  );
}

function KpiBox({
  label,
  value,
  icon,
  tone = 'default',
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: 'default' | 'success' | 'amber';
}) {
  const toneCls =
    tone === 'success' ? 'text-success' : tone === 'amber' ? 'text-amber-600' : 'text-foreground';
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <span
          className={`inline-flex h-9 w-9 items-center justify-center rounded-md bg-muted [&_svg]:h-4 [&_svg]:w-4 ${toneCls}`}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className={`text-xl font-semibold leading-none tabular-nums ${toneCls}`}>{value}</p>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Mini({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'amber';
}) {
  const toneCls = tone === 'amber' ? 'text-amber-600' : 'text-foreground';
  return (
    <div className="rounded-lg border border-border px-2.5 py-2">
      <p className={`text-lg font-semibold leading-none tabular-nums ${toneCls}`}>{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}
