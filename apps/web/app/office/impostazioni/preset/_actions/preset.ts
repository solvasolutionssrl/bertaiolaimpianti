'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerSupabase } from '@impiantixplus/api/server';
import { requireTenantContext } from '@impiantixplus/api/tenant';
import { assertCanManageTenant } from '../../_components/role-gate';

const presetSchema = z.object({
  nome: z.string().trim().min(1, 'Nome obbligatorio').max(120),
  descrizione: z.string().trim().max(600).optional().nullable(),
  vociDefault: z.array(z.number().int().min(1).max(255)).default([]),
});

export type PresetFormState =
  | { status: 'idle' }
  | { status: 'success'; message: string; id?: string }
  | { status: 'error'; message: string };

export async function creaPreset(input: z.infer<typeof presetSchema>) {
  const ctx = await requireTenantContext();
  assertCanManageTenant(ctx);
  const parsed = presetSchema.parse(input);
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('preset')
    .insert({
      tenant_id: ctx.tenantId,
      nome: parsed.nome,
      descrizione: parsed.descrizione?.trim() || null,
      voci_default: parsed.vociDefault,
      created_by: ctx.userId,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'INSERT fallita');
  revalidatePath('/office/impostazioni/preset');
  return { id: data.id };
}

const updateSchema = presetSchema.extend({ id: z.string().uuid() });

export async function aggiornaPreset(input: z.infer<typeof updateSchema>) {
  const ctx = await requireTenantContext();
  assertCanManageTenant(ctx);
  const parsed = updateSchema.parse(input);
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('preset')
    .update({
      nome: parsed.nome,
      descrizione: parsed.descrizione?.trim() || null,
      voci_default: parsed.vociDefault,
    })
    .eq('id', parsed.id);
  if (error) throw new Error(error.message);
  revalidatePath('/office/impostazioni/preset');
}

export async function eliminaPreset(input: { id: string }) {
  const ctx = await requireTenantContext();
  assertCanManageTenant(ctx);
  const { id } = z.object({ id: z.string().uuid() }).parse(input);
  const supabase = createServerSupabase();
  const { error } = await supabase.from('preset').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/office/impostazioni/preset');
}

export async function duplicaPreset(input: { id: string }) {
  const ctx = await requireTenantContext();
  assertCanManageTenant(ctx);
  const { id } = z.object({ id: z.string().uuid() }).parse(input);
  const supabase = createServerSupabase();

  const { data: src, error: errSrc } = await supabase
    .from('preset')
    .select('nome, descrizione, voci_default')
    .eq('id', id)
    .maybeSingle();
  if (errSrc || !src) throw new Error(errSrc?.message ?? 'Preset non trovato');

  // Trova un nome univoco nel formato "Nome (copia)" / "Nome (copia 2)"
  const baseName = `${src.nome} (copia)`;
  let nome = baseName;
  let suffix = 2;
  // Loop limitato per sicurezza
  for (let i = 0; i < 50; i += 1) {
    const { data: existing } = await supabase
      .from('preset')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('nome', nome)
      .maybeSingle();
    if (!existing) break;
    nome = `${src.nome} (copia ${suffix})`;
    suffix += 1;
  }

  const { error } = await supabase.from('preset').insert({
    tenant_id: ctx.tenantId,
    nome,
    descrizione: src.descrizione,
    voci_default: src.voci_default ?? [],
    created_by: ctx.userId,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/office/impostazioni/preset');
}
