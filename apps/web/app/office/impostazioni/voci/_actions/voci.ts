'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerSupabase } from '@impiantixplus/api/server';
import { requireTenantContext } from '@impiantixplus/api/tenant';
import { assertCanManageTenant } from '../../_components/role-gate';

const overrideSchema = z.object({
  voceId: z.number().int().min(1).max(255),
  nomeOverride: z
    .string()
    .trim()
    .max(160)
    .or(z.literal(''))
    .nullable()
    .optional(),
  minFotoOverride: z
    .union([z.coerce.number().int().min(0).max(999), z.literal(''), z.null()])
    .optional(),
  attiva: z.boolean().default(true),
});

export type VoceFormState =
  | { status: 'idle' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

export async function salvaVoceOverride(
  _prev: VoceFormState,
  formData: FormData,
): Promise<VoceFormState> {
  const ctx = await requireTenantContext();
  try {
    assertCanManageTenant(ctx);
  } catch {
    return {
      status: 'error',
      message: 'Solo gli amministratori possono modificare il catalogo.',
    };
  }

  const parsed = overrideSchema.safeParse({
    voceId: Number(formData.get('voceId') ?? 0),
    nomeOverride: formData.get('nomeOverride')?.toString() ?? '',
    minFotoOverride: formData.get('minFotoOverride')?.toString() ?? '',
    attiva: formData.get('attiva') === 'on' || formData.get('attiva') === 'true',
  });
  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Dati non validi',
    };
  }

  const nomeNorm =
    typeof parsed.data.nomeOverride === 'string' &&
    parsed.data.nomeOverride.trim().length > 0
      ? parsed.data.nomeOverride.trim()
      : null;
  const minFotoNorm =
    parsed.data.minFotoOverride === '' ||
    parsed.data.minFotoOverride === null ||
    parsed.data.minFotoOverride === undefined
      ? null
      : Number(parsed.data.minFotoOverride);

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('tenant_voci_override' as never)
    .upsert(
      {
        tenant_id: ctx.tenantId,
        voce_id: parsed.data.voceId,
        nome_override: nomeNorm,
        min_foto_richieste_override: minFotoNorm,
        attiva: parsed.data.attiva,
      } as never,
      { onConflict: 'tenant_id,voce_id' },
    );

  if (error) return { status: 'error', message: error.message };
  revalidatePath('/office/impostazioni/voci');
  return { status: 'success', message: 'Voce aggiornata.' };
}

export async function resetVoceOverride(input: { voceId: number }) {
  const ctx = await requireTenantContext();
  assertCanManageTenant(ctx);
  const { voceId } = z
    .object({ voceId: z.number().int().min(1).max(255) })
    .parse(input);

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('tenant_voci_override' as never)
    .delete()
    .eq('tenant_id', ctx.tenantId)
    .eq('voce_id', voceId);

  if (error) throw new Error(error.message);
  revalidatePath('/office/impostazioni/voci');
}
