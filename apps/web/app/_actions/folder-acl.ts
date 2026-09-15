'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import type { AppRole } from '@kommessa/api';

/**
 * Server actions per gestire folder_presets (tenant-wide).
 *
 * Solo `admin` può modificare i preset (le RLS SQL rinforzano).
 */

const VALID_ROLES: AppRole[] = ['admin', 'office', 'tecnico', 'cliente'];

const UpdatePresetInput = z.object({
  presetId: z.string().uuid(),
  visibleRoles: z.array(z.enum(['admin', 'office', 'tecnico', 'cliente'])),
  uploadRoles: z.array(z.enum(['admin', 'office', 'tecnico', 'cliente'])),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Aggiorna un preset cartella del tenant (solo admin). */
export async function aggiornaFolderPreset(
  input: unknown,
): Promise<ActionResult> {
  const parsed = UpdatePresetInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return { ok: false, error: 'Sessione non valida' };
  }
  if (ctx.role !== 'admin') {
    return { ok: false, error: 'Solo gli admin possono modificare i preset' };
  }

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('folder_presets')
    .update({
      visible_roles: parsed.data.visibleRoles,
      upload_roles: parsed.data.uploadRoles,
    })
    .eq('id', parsed.data.presetId)
    .eq('tenant_id', ctx.tenantId);

  if (error) return { ok: false, error: `Update fallito: ${error.message}` };

  await supabase.from('audit_events').insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: ctx.role,
    entity_type: 'folder_preset',
    entity_id: parsed.data.presetId,
    action: 'folder.preset.update',
    metadata: {
      visible_roles: parsed.data.visibleRoles,
      upload_roles: parsed.data.uploadRoles,
    } as unknown as never,
  });

  revalidatePath('/office/impostazioni/cartelle');
  return { ok: true };
}

export { VALID_ROLES };
