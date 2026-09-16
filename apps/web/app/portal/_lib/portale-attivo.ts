import 'server-only';

import { createServiceSupabase } from '@kommessa/api/service';

/**
 * Il portale clienti è chiuso finché non lo si completa: nessun tenant ha la
 * funzione `portale_clienti` accesa, e sul database il ruolo `cliente` non
 * accede a niente (migration 20260916090000). Questa è la porta d'ingresso
 * dell'app: senza la funzione accesa le pagine del portale non esistono.
 *
 * Si legge con il client di servizio perché chi bussa al portale non è un
 * utente dello staff e non ha un contesto tenant.
 */
export async function portaleClientiAttivo(tenantId: string | null | undefined): Promise<boolean> {
  if (!tenantId) return false;
  try {
    const { data } = await createServiceSupabase()
      .from('tenants')
      .select('features')
      .eq('id', tenantId)
      .maybeSingle();
    const features = (data as { features?: Record<string, unknown> | null } | null)?.features ?? {};
    return features.portale_clienti === true;
  } catch {
    return false;
  }
}
