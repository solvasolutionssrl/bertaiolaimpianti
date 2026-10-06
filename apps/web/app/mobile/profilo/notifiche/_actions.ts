'use server';

import { revalidatePath } from 'next/cache';

import { createServerSupabase } from '@kommessa/api/server';
import { avvisoAmmesso } from '@kommessa/api/avvisi';

import { requireTenantContextCached } from '@/app/_lib/tenant-cache';

/**
 * Accende o spegne la notifica sul telefono per un tipo di avviso.
 *
 * ⚠️ **Il codice si valida qui, non si crede.** `notification_preferences` ha
 * una chiave esterna verso il catalogo, quindi un codice inventato verrebbe
 * rifiutato dal database — ma un codice *esistente e non ammesso per questo
 * mestiere* passerebbe: un tecnico potrebbe scriversi la preferenza delle
 * richieste da approvare. Non riaprirebbe nulla (`pushAttiva` guarda comunque
 * il mestiere, e c'è una prova per questo), però lascerebbe in tabella una
 * riga che afferma una cosa falsa. Si rifiuta all'ingresso.
 *
 * Passa dal client dell'utente, non dal service role: la RLS di
 * `notification_preferences` è self-only, cioè è già il presidio giusto — e
 * usare il service role per scrivere una preferenza propria vorrebbe dire
 * scavalcare un controllo che funziona.
 */
export async function salvaAvvisoSulTelefono(input: {
  codice: string;
  attivo: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenantContextCached();

  if (!avvisoAmmesso(input.codice, ctx.role)) {
    return { ok: false, error: 'Questo avviso non è previsto per il tuo profilo.' };
  }
  if (typeof input.attivo !== 'boolean') {
    return { ok: false, error: 'Valore non valido.' };
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.from('notification_preferences' as never).upsert(
    {
      user_id: ctx.userId,
      event_code: input.codice,
      push: input.attivo,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: 'user_id,event_code' },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath('/mobile/profilo/notifiche');
  return { ok: true };
}
