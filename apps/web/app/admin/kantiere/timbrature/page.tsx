import Link from 'next/link';
import { Timer, LogIn, LogOut, MapPin, ArrowLeft, Route } from 'lucide-react';
import { Badge, Card, CardContent } from '@kommessa/ui';

import { createServiceSupabase } from '@kommessa/api/service';
import { romeDay } from '@kommessa/api/rome-time';
import { requirePlatformAdmin } from '../../_lib/guard';
import { SectionHeader } from '../../../_components/section-header';
import { FiltriTimbrature } from './_components/filtri-timbrature';

/** min → "H:MM" (tempo di viaggio registrato). */
function hm(min: number): string {
  const t = Math.max(0, Math.round(min));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export const metadata = { title: 'Platform · Timbrature Kantiere' };
export const dynamic = 'force-dynamic';

const fmt = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'Europe/Rome',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

type TimbRow = {
  id: string;
  tenant_id: string;
  dipendente_id: string | null;
  cantiere_id: string | null;
  tipo: 'ingresso' | 'uscita';
  origine: string;
  ts: string;
  pausa: boolean | null;
  geo_lat: number | null;
  geo_lng: number | null;
  creato_da: string | null;
};

const ORIGINE_STILE: Record<string, string> = {
  qr: 'border-primary/30 text-primary',
  capo: 'border-violet-400/40 text-violet-600',
  manuale: 'border-amber-400/40 text-amber-600',
  cronometro: 'border-border text-muted-foreground',
};

// Trasferimento cantiere→cantiere registrato (da_cantiere_id valorizzato): km +
// tempo stimato SEMPRE tracciati, indipendenti dal toggle di conteggio per-tenant.
type TransRow = {
  id: string;
  tenant_id: string;
  dipendente_id: string | null;
  data: string | null;
  cantiere_id: string | null;
  da_cantiere_id: string | null;
  distanza_km: number | null;
  durata_stimata_min: number | null;
};

export default async function TimbratureAdminPage({
  searchParams,
}: {
  searchParams: { tenant?: string; origine?: string; giorni?: string };
}) {
  await requirePlatformAdmin();
  const sb = createServiceSupabase();

  const tenant = searchParams.tenant ?? '';
  const origine = searchParams.origine ?? '';
  const giorni = ['1', '7', '30'].includes(searchParams.giorni ?? '') ? searchParams.giorni! : '7';
  const sinceIso = new Date(Date.now() - Number(giorni) * 24 * 3600 * 1000).toISOString();

  // Filtro principale timbrature
  let q = sb
    .from('timbrature' as never)
    .select(
      'id, tenant_id, dipendente_id, cantiere_id, tipo, origine, ts, pausa, geo_lat, geo_lng, creato_da',
    )
    .gte('ts', sinceIso)
    .order('ts', { ascending: false })
    .limit(300);
  if (tenant) q = q.eq('tenant_id', tenant);
  if (origine) q = q.eq('origine', origine);

  // Trasferimenti cantiere→cantiere registrati nel periodo (da_cantiere_id valorizzato).
  const sinceGiorno = romeDay(new Date(sinceIso));
  let tq = sb
    .from('timbratura_viaggio' as never)
    .select(
      'id, tenant_id, dipendente_id, data, cantiere_id, da_cantiere_id, distanza_km, durata_stimata_min',
    )
    .not('da_cantiere_id', 'is', null)
    .gte('data', sinceGiorno)
    .order('data', { ascending: false })
    .limit(300);
  if (tenant) tq = tq.eq('tenant_id', tenant);

  const [{ data: timbRaw }, { data: tenantsRaw }, { data: transRaw }] = await Promise.all([
    q as unknown as Promise<{ data: TimbRow[] | null }>,
    sb.from('tenants').select('id, nome').order('nome'),
    tq as unknown as Promise<{ data: TransRow[] | null }>,
  ]);

  const rows = (timbRaw as TimbRow[] | null) ?? [];
  const transRows = (transRaw as TransRow[] | null) ?? [];
  const tenants = (tenantsRaw as { id: string; nome: string }[] | null) ?? [];
  const tenantMap = new Map(tenants.map((t) => [t.id, t.nome]));

  // Batch lookups (dipendenti + cantieri: unione timbrature + trasferimenti)
  const dipIds = [
    ...new Set(
      [...rows.map((r) => r.dipendente_id), ...transRows.map((t) => t.dipendente_id)].filter(Boolean),
    ),
  ] as string[];
  const cantIds = [
    ...new Set(
      [
        ...rows.map((r) => r.cantiere_id),
        ...transRows.map((t) => t.cantiere_id),
        ...transRows.map((t) => t.da_cantiere_id),
      ].filter(Boolean),
    ),
  ] as string[];
  const userIds = [...new Set(rows.map((r) => r.creato_da).filter(Boolean))] as string[];
  const timbIds = rows.map((r) => r.id);

  const [dipRes, cantRes, userRes, viaRes] = await Promise.all([
    dipIds.length
      ? sb.from('dipendenti' as never).select('id, nome, cognome').in('id', dipIds)
      : Promise.resolve({ data: [] }),
    cantIds.length
      ? sb.from('cantieri' as never).select('id, nome, codice').in('id', cantIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? sb.from('users').select('id, display_name').in('id', userIds)
      : Promise.resolve({ data: [] }),
    timbIds.length
      ? sb
          .from('timbratura_viaggio' as never)
          .select('timbratura_id, distanza_km, mezzo_id, autista')
          .in('timbratura_id', timbIds)
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
  const userMap = new Map(
    ((userRes.data as { id: string; display_name: string | null }[] | null) ?? []).map((u) => [
      u.id,
      u.display_name ?? '',
    ]),
  );
  type Via = { timbratura_id: string; distanza_km: number | null; mezzo_id: string | null; autista: boolean };
  const viaRows = (viaRes.data as Via[] | null) ?? [];
  const viaMap = new Map(viaRows.map((v) => [v.timbratura_id, v]));
  const mezzoIds = [...new Set(viaRows.map((v) => v.mezzo_id).filter(Boolean))] as string[];
  const mezzoMap = new Map<string, string>();
  if (mezzoIds.length) {
    const { data: mezzi } = await sb.from('mezzi' as never).select('id, targa').in('id', mezzoIds);
    for (const m of (mezzi as { id: string; targa: string }[] | null) ?? []) mezzoMap.set(m.id, m.targa);
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Platform · Kantiere"
        title="Timbrature"
        description="Tracciamento cross-tenant: chi, quando, come (QR/capo/manuale), dove (GPS) e viaggio."
        icon={<Timer />}
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

      <FiltriTimbrature
        tenants={tenants}
        tenant={tenant || 'all'}
        origine={origine || 'all'}
        giorni={giorni}
      />

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Nessuna timbratura nel periodo/filtri selezionati.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2.5 font-medium">Quando</th>
                    <th className="px-3 py-2.5 font-medium">Dipendente</th>
                    <th className="px-3 py-2.5 font-medium">Tenant</th>
                    <th className="px-3 py-2.5 font-medium">Evento</th>
                    <th className="px-3 py-2.5 font-medium">Origine</th>
                    <th className="px-3 py-2.5 font-medium">Cantiere</th>
                    <th className="px-3 py-2.5 font-medium">Registrata da</th>
                    <th className="px-3 py-2.5 font-medium">GPS</th>
                    <th className="px-3 py-2.5 font-medium">Viaggio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => {
                    const ingresso = r.tipo === 'ingresso';
                    const via = viaMap.get(r.id);
                    const registrante = r.creato_da ? userMap.get(r.creato_da) : null;
                    const gps =
                      r.geo_lat != null && r.geo_lng != null
                        ? `https://www.google.com/maps?q=${r.geo_lat},${r.geo_lng}`
                        : null;
                    return (
                      <tr key={r.id} className="transition-colors hover:bg-muted/20">
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs tabular-nums text-muted-foreground">
                          {fmt.format(new Date(r.ts))}
                        </td>
                        <td className="px-3 py-2.5 font-medium tracking-tight">
                          {dipMap.get(r.dipendente_id ?? '') ?? '—'}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {tenantMap.get(r.tenant_id) ?? r.tenant_id}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={
                              'inline-flex items-center gap-1 text-xs font-medium ' +
                              (ingresso ? 'text-emerald-600' : 'text-muted-foreground')
                            }
                          >
                            {ingresso ? <LogIn className="h-3.5 w-3.5" /> : <LogOut className="h-3.5 w-3.5" />}
                            {ingresso ? 'Ingresso' : 'Uscita'}
                          </span>
                          {r.pausa ? (
                            <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                              pausa
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge
                            variant="outline"
                            className={'font-normal ' + (ORIGINE_STILE[r.origine] ?? 'text-muted-foreground')}
                          >
                            {r.origine}
                          </Badge>
                        </td>
                        <td className="max-w-[160px] truncate px-3 py-2.5 text-muted-foreground">
                          {r.cantiere_id ? cantMap.get(r.cantiere_id) ?? '—' : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{registrante || '—'}</td>
                        <td className="px-3 py-2.5">
                          {gps ? (
                            <a
                              href={gps}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                            >
                              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                              mappa
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                          {via
                            ? `${via.distanza_km != null ? `${Number(via.distanza_km).toFixed(1)} km` : ''}${
                                via.autista && via.mezzo_id ? ` · ${mezzoMap.get(via.mezzo_id) ?? 'mezzo'}` : ''
                              }` || '—'
                            : '—'}
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

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Route className="h-4 w-4 text-primary" aria-hidden="true" />
            Trasferimenti tra cantieri (registrati)
          </h2>
          {transRows.length > 0 ? (
            <span className="font-mono text-[11px] text-muted-foreground">
              {transRows.reduce((a, t) => a + (Number(t.distanza_km) || 0), 0).toFixed(1)} km ·{' '}
              {hm(transRows.reduce((a, t) => a + (Number(t.durata_stimata_min) || 0), 0))} totali
            </span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          Km e tempo dei tragitti cantiere→cantiere, <strong>sempre tracciati</strong> a
          prescindere dal toggle di conteggio del tenant. Il tempo è stimato (non pagato) finché
          non attiviamo il conteggio.
        </p>
        <Card>
          <CardContent className="p-0">
            {transRows.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                Nessun trasferimento cantiere→cantiere nel periodo/filtri selezionati.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2.5 font-medium">Giorno</th>
                      <th className="px-3 py-2.5 font-medium">Dipendente</th>
                      <th className="px-3 py-2.5 font-medium">Tenant</th>
                      <th className="px-3 py-2.5 font-medium">Tragitto</th>
                      <th className="px-3 py-2.5 font-medium">Km</th>
                      <th className="px-3 py-2.5 font-medium">Tempo stimato</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {transRows.map((t) => (
                      <tr key={t.id} className="transition-colors hover:bg-muted/20">
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs tabular-nums text-muted-foreground">
                          {t.data ? t.data.split('-').reverse().join('/') : '—'}
                        </td>
                        <td className="px-3 py-2.5 font-medium tracking-tight">
                          {dipMap.get(t.dipendente_id ?? '') ?? '—'}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {tenantMap.get(t.tenant_id) ?? t.tenant_id}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1.5 text-xs">
                            <span className="max-w-[140px] truncate text-muted-foreground">
                              {t.da_cantiere_id ? cantMap.get(t.da_cantiere_id) ?? '—' : '—'}
                            </span>
                            <span className="text-muted-foreground">→</span>
                            <span className="max-w-[140px] truncate font-medium">
                              {t.cantiere_id ? cantMap.get(t.cantiere_id) ?? '—' : '—'}
                            </span>
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs tabular-nums">
                          {t.distanza_km != null ? `${Number(t.distanza_km).toFixed(1)} km` : '—'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs tabular-nums text-muted-foreground">
                          {t.durata_stimata_min != null ? hm(Number(t.durata_stimata_min)) : '—'}
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

      <p className="text-right font-mono text-[11px] text-muted-foreground">
        {rows.length} righe{rows.length === 300 ? ' (cap 300)' : ''} · {transRows.length} trasferimenti ·{' '}
        {new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}
      </p>
    </div>
  );
}
