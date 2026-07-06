import 'server-only';

import { createServerSupabase } from '@kommessa/api/server';
import type { AppRole } from '@kommessa/api';

/**
 * Visibilità cantieri per i tecnici — ramo "avvio turno NON libero".
 *
 * È l'implementazione del caso `avvio_turno_libero = off` (impostazione ufficio
 * "Turni & calcoli", reader `leggiImpostazioniTurno`): quando **off**, i tecnici
 * vedono SOLO i cantieri "timbrabili" (con QR cantiere attivo); quando **on**
 * (default) vedono TUTTI i cantieri e questo helper non viene usato. **Admin e
 * office vedono sempre TUTTO.**
 *
 * Storia: nato come gate temporaneo dopo l'import dei 190 cantieri FPM (03/07),
 * ora è governato dall'impostazione. Vedi `project-kantiere-turno-manuale-multicantiere`.
 *
 * Gated `kantiere` → nessun impatto su Bertaiola.
 */
export function vedeTuttiICantieri(role: AppRole): boolean {
  return role === 'admin' || role === 'office';
}

/**
 * Ids dei cantieri visibili a un tecnico = quelli con un QR cantiere attivo
 * (cioè timbrabili). Oggi, su FPM, è il solo Monfalcone.
 */
export async function cantieriVisibiliTecnicoIds(tenantId: string): Promise<Set<string>> {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from('cantiere_qr' as never)
    .select('cantiere_id')
    .eq('tenant_id', tenantId)
    .eq('attivo', true)
    .not('cantiere_id', 'is', null);
  const ids = ((data as { cantiere_id: string | null }[] | null) ?? [])
    .map((r) => r.cantiere_id)
    .filter((x): x is string => Boolean(x));
  return new Set(ids);
}
