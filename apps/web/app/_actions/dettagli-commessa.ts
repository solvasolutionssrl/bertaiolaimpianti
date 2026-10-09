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
 * Aggiorna i "Dettagli" (campo `commesse.note_iniziali`) di una commessa: il
 * contesto del lavoro scritto da chi l'ha aperta, che i tecnici leggono in
 * cantiere.
 *
 * **Lo modificano ufficio e amministratori**, cioè chi la commessa la
 * gestisce.
 *
 * ⚠️ Fino all'08/10/2026 qui passava **solo** `admin`, e il risultato era un
 * comando che prometteva e poi rifiutava: la scheda desktop mostra la matita a
 * `admin || office` dal 18/06, quindi quattro persone su sei in Bertaiola
 * aprivano il riquadro, scrivevano, premevano Salva e leggevano in rosso
 * «Solo gli admin possono modificare i dettagli».
 *
 * ⭐ E il divieto non proteggeva niente: **lo stesso campo** è sempre stato
 * scrivibile dall'ufficio da «Modifica» → editor completo, che passa da
 * `aggiornaCommessaCompleta` (admin + office). Non era un confine, era una
 * seconda risposta alla stessa domanda.
 *
 * ⚠️ `owner` non compare più perché non esiste più: il ruolo è diventato
 * irraggiungibile con la pulizia del 07/10 (`onboard-tenant` ritirata).
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

  if (ctx.role !== 'admin' && ctx.role !== 'office') {
    return {
      ok: false,
      error: 'Solo ufficio e amministratori possono modificare i dettagli',
    };
  }

  const supabase = createServerSupabase();
  const trimmed = testo.trim();
  const valore: string | null = trimmed.length === 0 ? null : trimmed;

  // ⚠️ **Si chiede indietro la riga.** PostgREST non considera un errore un
  // aggiornamento che non ha toccato niente: con un id di un altro spazio di
  // lavoro (la RLS filtra, giustamente) `updErr` resta `null`, questa funzione
  // rispondeva «fatto», e qui sotto si scriveva pure una riga di registro per
  // una modifica mai avvenuta. L'utente leggeva «salvato» su un testo perso.
  const { data: toccata, error: updErr } = await supabase
    .from('commesse')
    .update({ note_iniziali: valore })
    .eq('id', commessaId)
    .select('id')
    .maybeSingle();

  if (updErr) {
    return { ok: false, error: `Update fallito: ${updErr.message}` };
  }
  if (!toccata) {
    return { ok: false, error: 'Commessa non trovata' };
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
