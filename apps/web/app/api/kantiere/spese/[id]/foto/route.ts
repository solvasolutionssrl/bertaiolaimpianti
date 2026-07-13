import { type NextRequest } from 'next/server';

import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';
import {
  getR2ProviderFromEnv,
  getR2ProviderFromTenantConfig,
} from '@kommessa/integrations/storage';

import { tenantHasModule } from '@/app/_lib/modules';
import { kontabilitaAttiva } from '@/app/_lib/kontabilita-config';

/**
 * Serve la foto di una spesa: 302 verso un signed GET R2 (5 min TTL).
 * `?size=thumb` usa la miniatura se presente, altrimenti il full-size.
 * L'autorizzazione passa dalla RLS: la select su `spese` ritorna la riga solo
 * se il chiamante puo' vederla (office/admin del tenant o proprietario).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return Response.json({ error: 'Non autenticato' }, { status: 401 });
  }
  // Gate modulo + sotto-flag kontabilità (coerente con le altre route spese/*).
  if (!(await tenantHasModule('kantiere'))) {
    return Response.json({ error: 'Modulo non attivo' }, { status: 404 });
  }
  if (!(await kontabilitaAttiva(createServiceSupabase(), ctx.tenantId))) {
    return Response.json({ error: 'Kontabilità non attiva' }, { status: 404 });
  }

  const supabase = createServerSupabase();
  const { data: row } = await supabase
    .from('spese' as never)
    .select('id, r2_key, r2_thumb_key')
    .eq('id', params.id)
    .maybeSingle();

  const spesa = row as { id: string; r2_key: string | null; r2_thumb_key: string | null } | null;
  if (!spesa) return Response.json({ error: 'Non trovata' }, { status: 404 });

  const wantThumb = request.nextUrl.searchParams.get('size') === 'thumb';
  const wantDownload = request.nextUrl.searchParams.get('download') === '1';
  const key = wantThumb && spesa.r2_thumb_key ? spesa.r2_thumb_key : spesa.r2_key;
  if (!key) return Response.json({ error: 'Nessuna foto' }, { status: 404 });

  const service = createServiceSupabase();
  const { data: tenantRow } = await service
    .from('tenants')
    .select('r2_config')
    .eq('id', ctx.tenantId)
    .maybeSingle();
  const r2 =
    getR2ProviderFromTenantConfig(
      (tenantRow?.r2_config as Record<string, unknown> | null) ?? null,
    ) ?? getR2ProviderFromEnv();
  if (!r2) return Response.json({ error: 'R2 non configurato' }, { status: 503 });

  // download: forza Content-Disposition attachment con un nome leggibile
  const nomeFile = wantDownload ? `ricevuta_${params.id.slice(0, 8)}${estDaKey(key)}` : undefined;
  const signed = await r2.createPresignedGetUrl(key, {
    ttlSec: 300,
    ...(nomeFile ? { downloadAs: nomeFile } : {}),
  });
  return Response.redirect(signed.url, 302);
}

function estDaKey(key: string): string {
  const m = key.match(/\.[a-zA-Z0-9]+$/);
  return m ? m[0].toLowerCase() : '';
}
