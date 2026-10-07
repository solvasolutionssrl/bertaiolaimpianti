import 'server-only';
import { cache } from 'react';

import { createServerSupabase } from '@kommessa/api/server';
import { deveCambiarePassword, mostraPromemoriaPassword } from '@kommessa/api/identita';
import { romeDay } from '@kommessa/api/rome-time';
import {
  SCADENZA_FUORI_SERVIZIO,
  statoScadenzaPassword,
  type EsitoScadenza,
} from '@kommessa/api/scadenza-password';

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
  /** Dove siamo nel calendario delle scadenze trimestrali. */
  scadenza: EsitoScadenza;
  /**
   * Perché è obbligato, quando lo è. Serve alla pagina del cambio: «la tua
   * password è scaduta» e «stai usando quella dell'ufficio» sono due frasi
   * diverse, e dire quella sbagliata fa sembrare l'app rotta.
   */
  motivo: 'nessuno' | 'provvisoria' | 'scaduta';
}

/**
 * I fatti sulla password di chi sta guardando, in una lettura sola.
 *
 * ⚠️ **In caso di guasto risponde «niente da fare», ed è voluto.** Vale anche
 * per la scadenza, e lì conta il doppio: un errore di lettura che diventasse
 * «scaduta» chiuderebbe fuori tutta l'azienda nello stesso istante.
 */
export const statoPassword = cache(async (): Promise<StatoPassword> => {
  const fuoriServizio: StatoPassword = {
    obbligato: false,
    provvisoria: false,
    scadenza: SCADENZA_FUORI_SERVIZIO,
    motivo: 'nessuno',
  };
  const ctx = await getTenantContextCached();
  if (!ctx) return fuoriServizio;
  try {
    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from('users')
      .select('must_change_password, password_provvisoria, password_changed_at, created_at')
      .eq('id', ctx.userId)
      .maybeSingle();
    if (error) {
      console.warn('[cambio-password] lettura non riuscita, si lascia passare:', error.message);
      return fuoriServizio;
    }
    const riga = data as {
      must_change_password?: boolean | null;
      password_provvisoria?: boolean | null;
      password_changed_at?: string | null;
      created_at?: string | null;
    } | null;

    // I timestamp diventano giorni italiani: la scadenza è una data sul
    // calendario dell'ufficio, non un istante UTC.
    const giorno = (t: string | null | undefined): string | null =>
      t ? romeDay(new Date(t)) : null;

    const scadenza = statoScadenzaPassword({
      oggi: romeDay(new Date()),
      scelta: giorno(riga?.password_changed_at),
      nato: giorno(riga?.created_at),
    });

    const perPolicy = deveCambiarePassword({ mustChangePassword: riga?.must_change_password });
    const scaduta = scadenza.stato === 'scaduta';

    return {
      // Un cancello solo per due ragioni: i quattro presidi che già sbarrano
      // la strada a chi deve scegliere la password non vanno toccati, e non
      // c'è un secondo posto da ricordarsi di aggiornare.
      obbligato: perPolicy || scaduta,
      provvisoria: mostraPromemoriaPassword({ passwordProvvisoria: riga?.password_provvisoria }),
      scadenza,
      motivo: perPolicy ? 'provvisoria' : scaduta ? 'scaduta' : 'nessuno',
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
