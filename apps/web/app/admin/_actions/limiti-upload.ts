'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServiceSupabase } from '@kommessa/api/service';
import {
  applicaLimitiAConfig,
  validaLimitiUpload,
} from '@kommessa/api/limiti-upload';

import { requirePlatformAdmin } from '../_lib/guard';
import { auditPlatform } from '../_lib/audit-platform';

/**
 * I limiti di invio media, scritti dal super admin su due livelli.
 *
 * Fino al 05/10/2026 erano costanti dentro il componente di selezione file.
 * Ora: `platform_settings.limiti_upload` vale per tutti, `tenants.upload_config`
 * sovrascrive un singolo cliente, e una chiave assente eredita il livello
 * sopra. I tetti tecnici restano in `@kommessa/api/limiti-upload` e qui si
 * **rifiuta** chi li supera invece di tagliare in silenzio: il numero che un
 * umano ha appena battuto nel pannello non si cambia di nascosto.
 *
 * Service role come tutte le action di questo pannello (vedi la nota in
 * `tenants.ts`): la tabella globale concede la scrittura solo a lui.
 */

const CHIAVE_GLOBALE = 'limiti_upload';

/** Quello che arriva dal form: stringhe, vuoto = "eredita". */
const INGRESSO = z.record(z.union([z.string(), z.number(), z.null()]));

type Esito = { ok: true } | { ok: false; error: string };

/** Il default che vale per tutti i tenant senza override. */
export async function aggiornaLimitiUploadGlobali(
  input: Record<string, string | number | null>,
): Promise<Esito> {
  const admin = await requirePlatformAdmin();
  const parsed = INGRESSO.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  const validazione = validaLimitiUpload(parsed.data);
  if (!validazione.ok) return { ok: false, error: validazione.errori.join(' ') };

  const supabase = createServiceSupabase();
  const { data: prev, error: errLettura } = await supabase
    .from('platform_settings' as never)
    .select('valore')
    .eq('chiave', CHIAVE_GLOBALE)
    .maybeSingle();
  // Se non si riesce a leggere il precedente NON si scrive: un upsert alla
  // cieca cancellerebbe le chiavi che il form non ha mandato.
  if (errLettura) return { ok: false, error: errLettura.message };

  const precedente = (prev as { valore?: unknown } | null)?.valore ?? null;
  const nuovo = applicaLimitiAConfig(precedente, validazione.valori);

  const { error } = await supabase.from('platform_settings' as never).upsert(
    {
      chiave: CHIAVE_GLOBALE,
      valore: nuovo,
      updated_at: new Date().toISOString(),
      updated_by: admin.userId,
    } as never,
    { onConflict: 'chiave' },
  );
  if (error) return { ok: false, error: error.message };

  await auditPlatform({
    actorUserId: admin.userId,
    actorEmail: admin.email,
    tenantId: null,
    entityType: 'platform_settings',
    entityId: CHIAVE_GLOBALE,
    action: 'platform.limiti_upload.update',
    before: { valore: precedente },
    after: { valore: nuovo },
  });

  revalidatePath('/admin/media');
  return { ok: true };
}

const INGRESSO_TENANT = z
  .object({ tenantId: z.string().uuid() })
  .catchall(z.union([z.string(), z.number(), z.null()]));

/** L'override di un singolo tenant. Campo vuoto = torna a ereditare. */
export async function aggiornaLimitiUploadTenant(
  input: { tenantId: string } & Record<string, string | number | null>,
): Promise<Esito> {
  const admin = await requirePlatformAdmin();
  const parsed = INGRESSO_TENANT.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  }
  const { tenantId, ...limiti } = parsed.data;

  const validazione = validaLimitiUpload(limiti);
  if (!validazione.ok) return { ok: false, error: validazione.errori.join(' ') };

  const supabase = createServiceSupabase();
  const { data: prev, error: errLettura } = await supabase
    .from('tenants')
    .select('upload_config')
    .eq('id', tenantId)
    .maybeSingle();
  if (errLettura) return { ok: false, error: errLettura.message };
  if (!prev) return { ok: false, error: 'Tenant non trovato' };

  const precedente = (prev as { upload_config?: unknown } | null)?.upload_config ?? null;
  const nuovo = applicaLimitiAConfig(precedente, validazione.valori);

  const { error } = await supabase
    .from('tenants')
    .update({ upload_config: nuovo } as never)
    .eq('id', tenantId);
  if (error) return { ok: false, error: error.message };

  await auditPlatform({
    actorUserId: admin.userId,
    actorEmail: admin.email,
    tenantId,
    entityType: 'tenant',
    entityId: tenantId,
    action: 'tenant.limiti_upload.update',
    before: { upload_config: precedente },
    after: { upload_config: nuovo },
  });

  revalidatePath(`/admin/tenants/${tenantId}`);
  return { ok: true };
}
