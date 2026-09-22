import 'server-only';

import type { createServerSupabase } from '@kommessa/api/server';
import {
  MODALITA_PREDEFINITA,
  normalizzaModalita,
  type ModalitaLavoro,
} from './dipendenti-modalita-registry';

type Supa = ReturnType<typeof createServerSupabase>;

export { MODALITA_PREDEFINITA, type ModalitaLavoro };

/**
 * Come lavora una persona: cosa l'app le chiede, non cosa le e' permesso fare.
 *
 * - `esterno` (predefinito): il lavoro e' in cantiere. L'app chiede il cantiere,
 *   da dove si parte, i chilometri. E' il comportamento di sempre.
 * - `ufficio`: il lavoro e' in sede. L'app non chiede niente di tutto questo e
 *   parte dalla sede predefinita; il viaggio esiste ancora, ma si dichiara
 *   quando c'e' invece di essere chiesto ogni volta.
 *
 * Il ruolo (`users.role`) e' un'altra cosa e resta dov'e': dice cosa puoi fare,
 * non come lavori. Un `tecnico` puo' stare in sede e un `office` puo' passare
 * in cantiere.
 */
/**
 * Mappa `dipendenteId → modalita` per tutto il tenant.
 *
 * ⚠️ **Query separata, e tollerante.** La colonna arriva con la migration
 * `20260922090000`, che viene applicata a mano: se il codice e' online prima,
 * questa lettura torna vuota e valgono i predefiniti, invece di far fallire
 * l'intera pagina Dipendenti. Per lo stesso motivo la colonna **non va
 * aggiunta** alla select principale dell'elenco, che chiede molte colonne in
 * un colpo solo: la' un campo mancante porterebbe giu' tutto.
 */
export async function leggiModalitaLavoro(
  supabase: Supa,
  tenantId: string,
): Promise<Map<string, ModalitaLavoro>> {
  const mappa = new Map<string, ModalitaLavoro>();
  try {
    const { data, error } = await supabase
      .from('dipendenti' as never)
      .select('id, modalita_lavoro')
      .eq('tenant_id', tenantId);
    if (error) return mappa;
    for (const r of (data ?? []) as unknown as { id: string; modalita_lavoro: unknown }[]) {
      mappa.set(r.id, normalizzaModalita(r.modalita_lavoro));
    }
  } catch {
    // Colonna non ancora applicata: si prosegue con i predefiniti.
  }
  return mappa;
}

/** La modalita' di una persona sola. Stessa tolleranza. */
export async function modalitaLavoroDi(
  supabase: Supa,
  tenantId: string,
  dipendenteId: string,
): Promise<ModalitaLavoro> {
  try {
    const { data, error } = await supabase
      .from('dipendenti' as never)
      .select('modalita_lavoro')
      .eq('tenant_id', tenantId)
      .eq('id', dipendenteId)
      .maybeSingle();
    if (error) return MODALITA_PREDEFINITA;
    return normalizzaModalita((data as { modalita_lavoro?: unknown } | null)?.modalita_lavoro);
  } catch {
    return MODALITA_PREDEFINITA;
  }
}
