import 'server-only';
import { cache } from 'react';

import { createServerSupabase } from '@kommessa/api/server';
import { deveCambiarePassword, mostraPromemoriaPassword } from '@kommessa/api/identita';

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
export interface StatoPassword {
  /** Il cancello: non si passa finché non ne sceglie una sua. */
  obbligato: boolean;
  /** Lo stato: la password in uso gliel'ha data qualcun altro. */
  provvisoria: boolean;
}

/**
 * I due fatti sulla password di chi sta guardando, in una lettura sola.
 *
 * ⚠️ **In caso di guasto risponde «niente da fare», ed è voluto.** Se la
 * lettura non riesce — colonna che non c'è ancora perché il codice è online
 * prima della migration, rete che non risponde — l'alternativa sarebbe
 * mandare TUTTI alla schermata «scegli la password», compresi i novanta per
 * cento che l'hanno già scelta, e fermare l'azienda. Un guasto nel controllo
 * non deve diventare un blocco del lavoro: al massimo qualcuno resta un
 * giorno in più sulla password dell'ufficio.
 */
export const statoPassword = cache(async (): Promise<StatoPassword> => {
  const fuoriServizio: StatoPassword = { obbligato: false, provvisoria: false };
  const ctx = await getTenantContextCached();
  if (!ctx) return fuoriServizio;
  try {
    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from('users')
      .select('must_change_password, password_provvisoria')
      .eq('id', ctx.userId)
      .maybeSingle();
    if (error) {
      console.warn('[cambio-password] lettura non riuscita, si lascia passare:', error.message);
      return fuoriServizio;
    }
    const riga = data as {
      must_change_password?: boolean | null;
      password_provvisoria?: boolean | null;
    } | null;
    return {
      obbligato: deveCambiarePassword({ mustChangePassword: riga?.must_change_password }),
      provvisoria: mostraPromemoriaPassword({ passwordProvvisoria: riga?.password_provvisoria }),
    };
  } catch (e) {
    console.warn('[cambio-password] lettura non riuscita, si lascia passare:', e);
    return fuoriServizio;
  }
});

/** Il solo cancello, per i gusci che sbarrano la strada. */
export const devoCambiarePassword = cache(async (): Promise<boolean> => {
  return (await statoPassword()).obbligato;
});

/** Dove mandare una persona appena ha scelto la sua password. */
export function casaPerRuolo(role: string): string {
  return role === 'admin' || role === 'office' ? '/office' : '/mobile';
}
