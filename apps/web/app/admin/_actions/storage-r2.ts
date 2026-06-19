'use server';

import { requirePlatformAdmin } from '../_lib/guard';
import { getR2ProviderFromEnv } from '@kommessa/integrations/storage';
import { createServiceSupabase } from '@kommessa/api/service';

function mask(v: string | undefined): string {
  if (!v) return '';
  if (v.length <= 8) return '••••';
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}

/** Stato della config R2 da env (valori non sensibili in chiaro, segreti mascherati). */
export async function r2EnvStatus(): Promise<{
  accountId: { set: boolean; value: string };
  bucket: { set: boolean; value: string };
  endpoint: { set: boolean; value: string };
  accessKeyId: { set: boolean; value: string };
  secretAccessKey: { set: boolean };
  complete: boolean;
}> {
  await requirePlatformAdmin();
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET;
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  return {
    accountId: { set: !!accountId, value: mask(accountId) },
    bucket: { set: !!bucket, value: bucket ?? '' },
    endpoint: { set: !!endpoint, value: endpoint ?? '' },
    accessKeyId: { set: !!accessKeyId, value: mask(accessKeyId) },
    secretAccessKey: { set: !!secretAccessKey },
    complete: !!(accountId && bucket && accessKeyId && secretAccessKey),
  };
}

/** Probe live di connessione: ListObjectsV2 maxKeys 1 sul bucket condiviso. */
export async function testR2Connection(): Promise<
  { ok: true; bucket: string; latencyMs: number } | { ok: false; error: string }
> {
  await requirePlatformAdmin();
  const provider = getR2ProviderFromEnv();
  if (!provider)
    return { ok: false, error: 'Variabili R2_* mancanti o incomplete.' };
  const start = Date.now();
  try {
    await provider.listObjects('', { maxKeys: 1 });
    return { ok: true, bucket: provider.bucket, latencyMs: Date.now() - start };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? 'errore sconosciuto' };
  }
}

/** Tenant configurati su R2 + conteggio best-effort oggetti sotto il prefisso. */
export async function listR2Tenants(): Promise<
  { id: string; slug: string; nome: string; prefix: string; objects: number; capped: boolean }[]
> {
  await requirePlatformAdmin();
  const supabase = createServiceSupabase();
  const { data } = await supabase
    .from('tenants')
    .select('id, slug, nome, storage_provider')
    .eq('storage_provider', 'r2' as never);
  const tenants = (data ?? []) as { id: string; slug: string; nome: string }[];
  const provider = getR2ProviderFromEnv();
  const out = [];
  for (const t of tenants) {
    const prefix = `tenants/${t.slug}/`;
    let objects = 0;
    let capped = false;
    if (provider) {
      try {
        const res = await provider.listObjects(prefix, { maxKeys: 1000 });
        objects = res.keys.length;
        capped = res.keys.length >= 1000;
      } catch {
        objects = 0;
      }
    }
    out.push({ id: t.id, slug: t.slug, nome: t.nome, prefix, objects, capped });
  }
  return out;
}
