'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import type { AppRole } from '@kommessa/api';

const WRITE_ROLES = new Set<AppRole>(['admin', 'office']);

const AlertType = z.enum([
  'commessa_ferma',
  'sopralluogo_no_foto',
  'todo_scaduti',
  'todo_urgenti_non_assegnati',
  'dico_scadenza',
  'fasi_in_attesa',
]);

const Input = z.object({
  alertType: AlertType,
  enabled: z.boolean(),
  thresholdDays: z.number().int().min(0).max(365).nullable(),
});

export async function aggiornaAlertSetting(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  const ctx = await safeCtx();
  if (!ctx) return { ok: false, error: 'Sessione non valida' };
  if (!WRITE_ROLES.has(ctx.role)) {
    return { ok: false, error: 'Solo admin/office possono modificare gli avvisi' };
  }

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('tenant_alert_settings' as never)
    .upsert(
      {
        tenant_id: ctx.tenantId,
        alert_type: parsed.data.alertType,
        enabled: parsed.data.enabled,
        threshold_days: parsed.data.thresholdDays,
        updated_by: ctx.userId,
      } as never,
      { onConflict: 'tenant_id,alert_type' },
    );
  if (error) return { ok: false, error: `Salvataggio fallito: ${error.message}` };

  revalidatePath('/office/notifiche');
  revalidatePath('/office');
  return { ok: true };
}

async function safeCtx() {
  try {
    return await requireTenantContext();
  } catch {
    return null;
  }
}
