import 'server-only';

import { createServiceSupabase } from '@kommessa/api/service';
import { statoTurno } from '@kommessa/api/kantiere-ore';
import { romeDay, romeDayBoundsUtc } from '@kommessa/api/rome-time';

/**
 * Query cross-tenant per il monitoraggio Kantiere lato platform admin.
 * Service-role (bypass RLS) — il chiamante è già gated da requirePlatformAdmin.
 */

export type KantiereTenantStat = {
  tenantId: string;
  nome: string;
  appMode: string;
  moduloAttivo: boolean;
  nDipendenti: number;
  nCantieri: number;
  timbratureOggi: number;
  inCantiere: number;
  inPausa: number;
  ultimaOggi: string | null;
};

type TimbRow = {
  tenant_id: string;
  dipendente_id: string | null;
  tipo: 'ingresso' | 'uscita';
  ts: string;
  pausa: boolean | null;
};

/** Statistiche Kantiere per ogni tenant che ha il modulo attivo o app_mode kantiere/full. */
export async function statKantierePerTenant(): Promise<KantiereTenantStat[]> {
  const sb = createServiceSupabase();

  const [modsRes, tenantsRes] = await Promise.all([
    sb
      .from('tenant_modules' as never)
      .select('tenant_id, attivo')
      .eq('module_code', 'kantiere'),
    sb.from('tenants').select('id, nome, app_mode'),
  ]);

  const modAttivo = new Map<string, boolean>();
  for (const m of (modsRes.data as { tenant_id: string; attivo: boolean }[] | null) ?? []) {
    modAttivo.set(m.tenant_id, m.attivo);
  }
  const tenants =
    (tenantsRes.data as { id: string; nome: string; app_mode: string | null }[] | null) ?? [];

  const rilevanti = tenants.filter(
    (t) => modAttivo.get(t.id) === true || t.app_mode === 'kantiere' || t.app_mode === 'full',
  );
  if (rilevanti.length === 0) return [];

  const ids = rilevanti.map((t) => t.id);
  const { fromIso, toIso } = romeDayBoundsUtc(romeDay(new Date()));

  const [dipRes, cantRes, oggiRes] = await Promise.all([
    sb.from('dipendenti' as never).select('tenant_id, stato_attivo').in('tenant_id', ids),
    sb.from('cantieri' as never).select('tenant_id').in('tenant_id', ids),
    sb
      .from('timbrature' as never)
      .select('tenant_id, dipendente_id, tipo, ts, pausa')
      .in('tenant_id', ids)
      .gte('ts', fromIso)
      .lt('ts', toIso)
      .order('ts', { ascending: true }),
  ]);

  const nDip = new Map<string, number>();
  for (const d of (dipRes.data as { tenant_id: string; stato_attivo: boolean }[] | null) ?? []) {
    if (d.stato_attivo) nDip.set(d.tenant_id, (nDip.get(d.tenant_id) ?? 0) + 1);
  }
  const nCant = new Map<string, number>();
  for (const c of (cantRes.data as { tenant_id: string }[] | null) ?? []) {
    nCant.set(c.tenant_id, (nCant.get(c.tenant_id) ?? 0) + 1);
  }

  // Eventi di oggi per (tenant, dipendente) → stato live pausa-aware.
  const oggi = (oggiRes.data as TimbRow[] | null) ?? [];
  const perTenant = new Map<string, { count: number; ultima: string | null; eventiDip: Map<string, TimbRow[]> }>();
  for (const r of oggi) {
    let bucket = perTenant.get(r.tenant_id);
    if (!bucket) {
      bucket = { count: 0, ultima: null, eventiDip: new Map() };
      perTenant.set(r.tenant_id, bucket);
    }
    bucket.count += 1;
    bucket.ultima = r.ts; // oggi è ordinato asc → l'ultimo resta in coda
    if (r.dipendente_id) {
      const arr = bucket.eventiDip.get(r.dipendente_id) ?? [];
      arr.push(r);
      bucket.eventiDip.set(r.dipendente_id, arr);
    }
  }

  return rilevanti
    .map((t) => {
      const b = perTenant.get(t.id);
      let inCantiere = 0;
      let inPausa = 0;
      if (b) {
        for (const [, eventi] of b.eventiDip) {
          const s = statoTurno(eventi).stato;
          if (s === 'lavoro') inCantiere += 1;
          else if (s === 'pausa') inPausa += 1;
        }
      }
      return {
        tenantId: t.id,
        nome: t.nome,
        appMode: t.app_mode ?? 'kommessa',
        moduloAttivo: modAttivo.get(t.id) === true,
        nDipendenti: nDip.get(t.id) ?? 0,
        nCantieri: nCant.get(t.id) ?? 0,
        timbratureOggi: b?.count ?? 0,
        inCantiere,
        inPausa,
        ultimaOggi: b?.ultima ?? null,
      };
    })
    .sort((a, b) => b.timbratureOggi - a.timbratureOggi);
}
