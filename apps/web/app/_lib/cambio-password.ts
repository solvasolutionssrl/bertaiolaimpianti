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
import { getAppModeCached } from './app-mode';
import { tenantFeatureEnabled } from './tenant-features';

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
   * password è scaduta» e «devi sceglierne una tua» sono due frasi diverse, e
   * dire quella sbagliata fa sembrare l'app rotta.
   *
   * ⚠️ Si chiama `cambio_obbligatorio` e **non** `provvisoria`: nasce da
   * `must_change_password`, che è un'altra colonna da `password_provvisoria`.
   * Coincidono quasi sempre, non sempre — un reset forzato da un
   * amministratore alza la prima e non per forza la seconda — e col nome
   * sbagliato la pagina diceva «quella che ti hanno dato in ufficio la sanno
   * in due» a chi la password se l'era scelta da sé.
   */
  motivo: 'nessuno' | 'cambio_obbligatorio' | 'scaduta';
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
      // ⚠️ `error`, non `warn`: il fail-open e' voluto, ma se resta acceso a
      // lungo (una colonna rinominata, un permesso tolto) la regola e' spenta
      // per tutta l'azienda e non lo vede nessuno. Almeno si urla.
      console.error('[cambio-password] lettura NON riuscita, si lascia passare:', error.message);
      return fuoriServizio;
    }
    if (!data) {
      // Un caso diverso, e vale la pena distinguerlo: la riga non c'e'.
      console.error('[cambio-password] nessuna riga utente per', ctx.userId);
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

    // ⚠️ **La scadenza si accende per cliente.** Le date (10 dicembre, marzo,
    // giugno, settembre) le ha scelte un'azienda; il muro lo prende chi lavora.
    // Accesa per tutti, il 10 dicembre i tecnici di un altro cliente si
    // troverebbero bloccati davanti a un QR in cantiere per una regola che
    // nessuno gli ha annunciato. Si accende dal pannello, a chi la chiede.
    const policyAttiva = await tenantFeatureEnabled(
      'scadenza_password',
      (await getAppModeCached()) !== 'kantiere',
    );

    const scadenza = policyAttiva
      ? statoScadenzaPassword({
          oggi: romeDay(new Date()),
          scelta: giorno(riga?.password_changed_at),
          nato: giorno(riga?.created_at),
        })
      : SCADENZA_FUORI_SERVIZIO;

    const perPolicy = deveCambiarePassword({ mustChangePassword: riga?.must_change_password });
    const scaduta = scadenza.stato === 'scaduta';

    return {
      // Un cancello solo per due ragioni: i quattro presidi che già sbarrano
      // la strada a chi deve scegliere la password non vanno toccati, e non
      // c'è un secondo posto da ricordarsi di aggiornare.
      obbligato: perPolicy || scaduta,
      provvisoria: mostraPromemoriaPassword({ passwordProvvisoria: riga?.password_provvisoria }),
      scadenza,
      motivo: perPolicy ? 'cambio_obbligatorio' : scaduta ? 'scaduta' : 'nessuno',
    };
  } catch (e) {
    console.error('[cambio-password] lettura NON riuscita, si lascia passare:', e);
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
