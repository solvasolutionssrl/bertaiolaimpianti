import { type NextRequest } from 'next/server';

import { createServiceSupabase } from '@kommessa/api/service';
import {
  getR2ProviderFromEnv,
  getR2ProviderFromTenantConfig,
  type R2StorageProvider,
} from '@kommessa/integrations/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Purge delle bozze abbandonate (retention 30gg).
 *
 * Chiamato dal cron (pg_cron/pg_net) una volta al giorno. Per ogni bozza
 * ATTIVA non toccata da `giorni` giorni: cancella gli oggetti R2 di staging
 * (originale + thumb) dei file collegati, poi elimina la riga bozza (il
 * CASCADE su file_refs.bozza_id rimuove le righe dei file).
 *
 * SQL da solo non può parlare con R2, quindi la cancellazione fisica avviene
 * qui; `purge_bozze_scadute()` resta come backstop sulle sole righe.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET` (stesso secret del sync/cestino).
 */
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (request.headers.get('authorization') ?? '') === `Bearer ${secret}`;
}

function clampDays(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 30;
  return Math.min(Math.max(1, Math.trunc(n)), 365);
}

async function run(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Non autorizzato' }, { status: 401 });
  }
  const giorni = clampDays(request.nextUrl.searchParams.get('giorni'));
  const service = createServiceSupabase();

  const soglia = new Date(Date.now() - giorni * 24 * 60 * 60 * 1000).toISOString();

  const { data: bozzeRaw, error } = await service
    .from('commessa_bozze' as never)
    .select('id, tenant_id')
    .eq('stato' as never, 'attiva')
    .lt('updated_at', soglia as never)
    .limit(200);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  const bozze = (bozzeRaw as unknown as Array<{ id: string; tenant_id: string }>) ?? [];

  // Cache provider R2 per-tenant (evita N letture di r2_config).
  const r2ByTenant = new Map<string, R2StorageProvider | null>();
  async function r2For(tenantId: string): Promise<R2StorageProvider | null> {
    if (r2ByTenant.has(tenantId)) return r2ByTenant.get(tenantId) ?? null;
    const { data: t } = await service
      .from('tenants')
      .select('r2_config')
      .eq('id', tenantId)
      .maybeSingle();
    const r2 =
      getR2ProviderFromTenantConfig(
        (t?.r2_config as Record<string, unknown> | null) ?? null,
      ) ?? getR2ProviderFromEnv();
    r2ByTenant.set(tenantId, r2);
    return r2;
  }

  let purgate = 0;
  let oggettiR2 = 0;

  for (const b of bozze) {
    const { data: filesRaw } = await service
      .from('file_refs')
      .select('id, r2_key, r2_thumb_key')
      .eq('bozza_id', b.id as never);
    const files = (filesRaw as unknown as Array<{
      id: string;
      r2_key: string | null;
      r2_thumb_key: string | null;
    }>) ?? [];

    if (files.length > 0) {
      const r2 = await r2For(b.tenant_id);
      if (r2) {
        for (const f of files) {
          if (f.r2_key) {
            await r2.delete(f.r2_key).then(() => {
              oggettiR2 += 1;
            }).catch(() => {});
          }
          if (f.r2_thumb_key) await r2.delete(f.r2_thumb_key).catch(() => {});
        }
      }
    }

    const { error: dErr } = await service
      .from('commessa_bozze' as never)
      .delete()
      .eq('id', b.id);
    if (!dErr) purgate += 1;
  }

  return Response.json({ ok: true, giorni, bozzePurgate: purgate, oggettiR2 });
}

export async function POST(request: NextRequest) {
  return run(request);
}

export async function GET(request: NextRequest) {
  return run(request);
}
