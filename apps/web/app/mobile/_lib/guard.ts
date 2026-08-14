import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { leggiSessione, type TenantContext } from '@kommessa/api/tenant';

/**
 * Controllo dell'accesso per le pagine dell'app.
 *
 * Va chiamata in cima a ogni pagina sotto `mobile/`.
 *
 * ⚠️ **Non butta più fuori a ogni intoppo.** Prima bastava che la verifica
 * della sessione non andasse a buon fine — l'app riaperta dopo ore, un
 * capannone senza campo — e si finiva alla schermata di accesso, con la
 * password da riscrivere e il turno da riprendere. Ma la sessione non era
 * finita: era solo irraggiungibile in quel momento.
 *
 * Adesso si distingue: se il biglietto della sessione nei cookie non c'è,
 * l'accesso è chiuso davvero e si va al login. Se c'è ma non si è potuto
 * verificare, si passa da «riprova», che lo rinnova dal browser e riporta
 * esattamente dov'eravamo.
 */
export async function guardMobile(): Promise<TenantContext> {
  const esito = await leggiSessione(cookies().getAll());
  if (esito.stato === 'ok') return esito.ctx;
  // Dove eravamo: lo mette il middleware. Se manca si torna alla home dell'app.
  const dove = headers().get('x-percorso') ?? '/mobile';
  if (esito.stato === 'incerto') {
    redirect(`/riprova?dove=${encodeURIComponent(dove)}`);
  }
  redirect(`/login?next=${encodeURIComponent(dove)}`);
}
