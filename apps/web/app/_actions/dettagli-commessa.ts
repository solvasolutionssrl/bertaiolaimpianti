'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';

const InputSchema = z.object({
  commessaId: z.string().uuid(),
  testo: z.string().max(8000),
});

export type AggiornaDettagliResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Aggiorna i "Dettagli" (campo `commesse.note_iniziali`) di una commessa.
 *
 * Solo `admin` e `owner` possono editare — il capo cantiere ha già scritto
 * la nota iniziale via voice intake, quindi tipicamente è un admin che
 * vuole correggere/aggiungere informazioni dopo.
 *
 * L'utente può anche concatenare aggiunte separandole con doppio newline
 * (l'UI lo proporrà come "Aggiungi nota").
 */
export async function aggiornaDettagliCommessa(
  input: unknown,
): Promise<AggiornaDettagliResult> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Input non valido' };
  }
  const { commessaId, testo } = parsed.data;

  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return { ok: false, error: 'Sessione non valida' };
  }

  if (ctx.role !== 'admin') {
    return { ok: false, error: 'Solo gli admin possono modificare i dettagli' };
  }

  const supabase = createServerSupabase();
  const trimmed = testo.trim();
  const valore: string | null = trimmed.length === 0 ? null : trimmed;

  const { error: updErr } = await supabase
    .from('commesse')
    .update({ note_iniziali: valore })
    .eq('id', commessaId);

  if (updErr) {
    return { ok: false, error: `Update fallito: ${updErr.message}` };
  }

  // Audit
  await supabase.from('audit_events').insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: ctx.role,
    entity_type: 'commessa',
    entity_id: commessaId,
    action: 'commessa.dettagli.update',
    metadata: { length: valore?.length ?? 0 },
  });

  revalidatePath(`/mobile/commessa/${commessaId}`);
  revalidatePath(`/office/commesse/${commessaId}`);

  return { ok: true };
}
