'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerSupabase } from '@impiantixplus/api/server';
import { requireTenantContext } from '@impiantixplus/api/tenant';

const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'Nome obbligatorio')
    .max(120, 'Massimo 120 caratteri'),
  avatarUrl: z
    .string()
    .trim()
    .url('URL non valido')
    .or(z.literal(''))
    .nullable()
    .optional(),
});

export type FormState =
  | { status: 'idle' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

export async function aggiornaProfilo(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireTenantContext();
  const parsed = profileSchema.safeParse({
    displayName: formData.get('displayName')?.toString() ?? '',
    avatarUrl: formData.get('avatarUrl')?.toString() ?? '',
  });
  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Dati non validi',
    };
  }

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('users')
    .update({
      display_name: parsed.data.displayName,
      avatar_url: parsed.data.avatarUrl?.trim() || null,
    })
    .eq('id', ctx.userId);

  if (error) {
    return { status: 'error', message: error.message };
  }

  revalidatePath('/office', 'layout');
  return { status: 'success', message: 'Profilo aggiornato.' };
}
