'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import type { Json } from '@kommessa/api';

/**
 * Aggiorna i campi editabili di una commessa GIA' finalizzata.
 *
 * REGOLA FERREA: il nome cartella Nextcloud (`nome_cartella`), il codice
 * interno (`codice_interno`) e il percorso cloud (`cloud_folder_path`) NON
 * si toccano MAI. Sono congelati alla creazione: rinominare la cartella su
 * Nextcloud romperebbe i riferimenti dei file già sincronizzati. Tutto il
 * resto (descrizione/titolo display, indirizzo cantiere) è editabile.
 *
 * Permessi: admin / office.
 */

const InputSchema = z.object({
  commessaId: z.string().uuid(),
  // Titolo "umano" mostrato in app (descrizione cantiere). NON rinomina la
  // cartella: serve solo come display (risolviTitoloCommessa lo preferisce).
  descrizioneFinale: z.string().trim().max(120).optional(),
  indirizzoCantiere: z.string().trim().max(200).nullable().optional(),
});

export type AggiornaCommessaResult = { ok: true } | { ok: false; error: string };

export async function aggiornaCommessa(
  input: unknown,
): Promise<AggiornaCommessaResult> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join(' · '),
    };
  }
  const { commessaId, descrizioneFinale, indirizzoCantiere } = parsed.data;

  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return { ok: false, error: 'Sessione non valida' };
  }
  if (ctx.role !== 'admin' && ctx.role !== 'office') {
    return { ok: false, error: 'Permessi insufficienti per modificare la commessa' };
  }

  // Costruisci l'update SOLO con i campi forniti. Nessun campo identitario
  // (nome_cartella / codice_interno / cloud_folder_path) è presente qui.
  const patch: Record<string, unknown> = {};
  if (descrizioneFinale !== undefined) {
    patch.descrizione_ai_finale = descrizioneFinale.length ? descrizioneFinale : null;
  }
  if (indirizzoCantiere !== undefined) {
    patch.cliente_indirizzo_cantiere =
      indirizzoCantiere && indirizzoCantiere.length ? indirizzoCantiere : null;
  }
  if (Object.keys(patch).length === 0) {
    return { ok: true };
  }

  const supabase = createServerSupabase();
  const { error: updErr } = await supabase
    .from('commesse')
    .update(patch)
    .eq('id', commessaId);

  if (updErr) {
    return { ok: false, error: `Update fallito: ${updErr.message}` };
  }

  await supabase.from('audit_events').insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: ctx.role,
    entity_type: 'commessa',
    entity_id: commessaId,
    action: 'commessa.update',
    after_data: patch as unknown as Json,
  });

  revalidatePath(`/office/commesse/${commessaId}`);
  revalidatePath(`/mobile/commessa/${commessaId}`);

  return { ok: true };
}
