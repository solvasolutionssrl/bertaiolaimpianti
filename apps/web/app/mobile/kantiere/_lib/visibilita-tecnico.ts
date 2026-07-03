import 'server-only';

import { createServerSupabase } from '@kommessa/api/server';
import type { AppRole } from '@kommessa/api';

/**
 * GATE TEMPORANEO (dal 03/07/2026 — da RIMUOVERE/rimpiazzare nel weekend).
 *
 * Dopo l'import massivo dei cantieri FPM (190 righe), i **tecnici** devono
 * vedere SOLO i cantieri "timbrabili" (con QR cantiere attivo) — oggi il solo
 * Monfalcone — così l'elenco dei 190 non li invade prima che la nuova modalità
 * (ricerca / assegnazione) sia pronta. **Admin e office vedono TUTTO** (ok
 * durante la costruzione).
 *
 * A regime il cliente vuole che i tecnici vedano tutti i cantieri: questo gate
 * va sostituito da ricerca/assegnazione. Vedi memoria
 * `project-cantieri-fpm-popolamento`.
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
