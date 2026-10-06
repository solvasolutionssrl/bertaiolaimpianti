import 'server-only';
import { cache } from 'react';

import { createServerSupabase } from '@kommessa/api/server';
import { deveCambiarePassword } from '@kommessa/api/identita';

import { getTenantContextCached } from './tenant-cache';

/**
 * «Questa persona deve ancora scegliere la sua password?»
 *
 * Lo chiedono i due gusci dell'app (ufficio e telefono) a ogni render, quindi
 * sta dentro `cache()`: una lettura per richiesta, non una per pagina.
 *
 * ⚠️ **In caso di guasto risponde NO, ed è voluto.**
 * Se la lettura non riesce — colonna che non c'è ancora perché il codice è
 * online prima della migration, rete che non risponde — l'alternativa sarebbe
 * mandare TUTTI alla schermata «scegli la password», compresi i novanta per
 * cento che l'hanno già scelta e che si troverebbero l'azienda ferma. Un
 * guasto nel controllo non deve diventare un blocco del lavoro: al massimo
 * qualcuno resta un giorno in più sulla password dell'ufficio.
 */
export const devoCambiarePassword = cache(async (): Promise<boolean> => {
  const ctx = await getTenantContextCached();
  if (!ctx) return false;
  try {
    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from('users')
      .select('must_change_password')
      .eq('id', ctx.userId)
      .maybeSingle();
    if (error) {
      console.warn('[cambio-password] lettura non riuscita, si lascia passare:', error.message);
      return false;
    }
    return deveCambiarePassword({
      mustChangePassword: (data as { must_change_password?: boolean | null } | null)
        ?.must_change_password,
    });
  } catch (e) {
    console.warn('[cambio-password] lettura non riuscita, si lascia passare:', e);
    return false;
  }
});

/** Dove mandare una persona appena ha scelto la sua password. */
export function casaPerRuolo(role: string): string {
  return role === 'admin' || role === 'office' ? '/office' : '/mobile';
}
