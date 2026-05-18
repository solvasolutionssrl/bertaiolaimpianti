'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServerSupabase } from '@impiantixplus/api/server';
import { requireTenantContext } from '@impiantixplus/api/tenant';

/**
 * Server Actions per la gestione delle voci di una commessa esistente.
 * La creazione di una commessa è in `apps/web/app/_actions/crea-commessa.ts`.
 */
const aggiungiInput = z.object({
  commessaId: z.string().uuid(),
  voceId: z.number().int().min(1),
});

export async function aggiungiVoce(input: z.infer<typeof aggiungiInput>) {
  const ctx = await requireTenantContext();
  const parsed = aggiungiInput.parse(input);
  const supabase = createServerSupabase();
  const { error } = await supabase.from('commessa_voci').insert({
    commessa_id: parsed.commessaId,
    voce_id: parsed.voceId,
    tenant_id: ctx.tenantId,
  });
  if (error && !error.message.toLowerCase().includes('duplicate'))
    throw new Error(error.message);
  revalidatePath(`/office/commesse/${parsed.commessaId}/fasi`);
}

const cambiaStatoInput = z.object({
  commessaId: z.string().uuid(),
  voceId: z.number().int().min(1),
  stato: z.enum(['da_iniziare', 'in_corso', 'completata', 'bloccata']),
});

export async function cambiaStatoVoce(input: z.infer<typeof cambiaStatoInput>) {
  const parsed = cambiaStatoInput.parse(input);
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('commessa_voci')
    .update({ stato: parsed.stato })
    .eq('commessa_id', parsed.commessaId)
    .eq('voce_id', parsed.voceId);
  if (error) throw new Error(error.message);
  revalidatePath(`/office/commesse/${parsed.commessaId}/fasi`);
}
