'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import type { AppRole } from '@kommessa/api';

/**
 * Server actions per gestire folder_presets (tenant-wide) e
 * commessa_folder_overrides (puntuali per commessa).
 *
 * Solo `admin` può modificare i preset; `admin`/`office` possono creare
 * override su singole commesse (le RLS SQL rinforzano).
 */

const VALID_ROLES: AppRole[] = ['admin', 'office', 'tecnico', 'cliente'];

const UpdatePresetInput = z.object({
  presetId: z.string().uuid(),
  visibleRoles: z.array(z.enum(['admin', 'office', 'tecnico', 'cliente'])),
  uploadRoles: z.array(z.enum(['admin', 'office', 'tecnico', 'cliente'])),
});

const SetOverrideInput = z.object({
  commessaId: z.string().uuid(),
  path: z.string().min(1).max(255),
  visibleRoles: z
    .array(z.enum(['admin', 'office', 'tecnico', 'cliente']))
    .nullable(),
  uploadRoles: z
    .array(z.enum(['admin', 'office', 'tecnico', 'cliente']))
    .nullable(),
  customLabel: z.string().max(120).nullable().optional(),
});

const DeleteOverrideInput = z.object({
  commessaId: z.string().uuid(),
  path: z.string().min(1).max(255),
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

/** Crea/aggiorna un override per una specifica commessa. */
export async function impostaFolderOverride(
  input: unknown,
): Promise<ActionResult> {
  const parsed = SetOverrideInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return { ok: false, error: 'Sessione non valida' };
  }
  if (ctx.role !== 'admin' && ctx.role !== 'office') {
    return { ok: false, error: 'Solo admin/office possono creare override' };
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.from('commessa_folder_overrides').upsert(
    {
      commessa_id: parsed.data.commessaId,
      tenant_id: ctx.tenantId,
      path: parsed.data.path,
      visible_roles: parsed.data.visibleRoles,
      upload_roles: parsed.data.uploadRoles,
      custom_label: parsed.data.customLabel ?? null,
    },
    { onConflict: 'commessa_id,path' },
  );

  if (error) return { ok: false, error: `Override fallito: ${error.message}` };

  revalidatePath(`/office/commesse/${parsed.data.commessaId}`);
  revalidatePath(`/office/commesse/${parsed.data.commessaId}/permessi`);
  return { ok: true };
}

/** Elimina un override (la cartella torna al comportamento preset). */
export async function rimuoviFolderOverride(
  input: unknown,
): Promise<ActionResult> {
  const parsed = DeleteOverrideInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return { ok: false, error: 'Sessione non valida' };
  }
  if (ctx.role !== 'admin' && ctx.role !== 'office') {
    return { ok: false, error: 'Solo admin/office possono rimuovere override' };
  }

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('commessa_folder_overrides')
    .delete()
    .eq('commessa_id', parsed.data.commessaId)
    .eq('path', parsed.data.path);

  if (error) return { ok: false, error: `Rimozione fallita: ${error.message}` };

  revalidatePath(`/office/commesse/${parsed.data.commessaId}`);
  revalidatePath(`/office/commesse/${parsed.data.commessaId}/permessi`);
  return { ok: true };
}

export { VALID_ROLES };
