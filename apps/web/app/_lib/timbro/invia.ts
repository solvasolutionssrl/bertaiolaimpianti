import 'server-only';

import { waitUntil } from '@vercel/functions';

import { daSpecchiare, passoDaTimbratura } from '@kommessa/api/timbro-passo';

import { ClientTimbro, ErroreTimbro } from './client';
import { leggiConfigTimbro } from './config';

/**
 * Lo **specchio verso Timbro**: le timbrature nate nella nostra app vanno
 * anche a loro, così il terminale sa in che punto del turno è la persona
 * quando si presenta col badge.
 *
 * Perché serve: il terminale deduce la fase dall'ultimo stato che **lui**
 * conosce. Se una persona apre il turno dall'app e poi passa il badge, senza
 * questo specchio Timbro crede che il turno sia chiuso e manda `start`
 * (`inferred`) invece di una pausa o di una fine. L'ipotesi è sbagliata per
 * colpa nostra, non loro.
 *
 * ⚠️ **Non blocca mai chi timbra.** Sta in un `waitUntil` e non solleva: se
 * Timbro è irraggiungibile, lento o rifiuta, la timbratura nel nostro
 * database è già scritta e la giornata del tecnico non si ferma. Lo specchio
 * è un di più, non un pezzo della scrittura.
 *
 * ⚠️ **Il `waitUntil` sta qui dentro, non nei chiamanti**: su Vercel la
 * funzione si chiude appena risponde, e una `fetch` lasciata a metà non parte.
 * È la stessa lezione di `avvisa()`, pagata una volta.
 *
 * ⚠️ **Idempotente sull'id della NOSTRA riga.** Riprovare non crea doppioni su
 * Timbro; generare un id nuovo per lo stesso gesto sì, e non se ne
 * accorgerebbe nessuno.
 *
 * ⚠️ **Quali righe si mandano lo decide `daSpecchiare`**, puro e provato: non
 * tutte. Una giornata ricostruita produce righe derivate che direbbero al
 * terminale che il turno si è aperto e chiuso cinque volte.
 */

export interface RigaDaSpecchiare {
  id: string;
  dipendenteId: string;
  tipo: 'ingresso' | 'uscita';
  pausa: boolean;
  ts: string;
  origine: string;
}

/** Lo scope che serve: la chiave di sola lettura non ce l'ha. */
const SCOPE_RICHIESTO = 'punches:write';

async function invia(tenantId: string, righe: RigaDaSpecchiare[]): Promise<void> {
  const cfg = await leggiConfigTimbro(tenantId);
  // ⚠️ Solo da `attivo`. In `osservazione` si legge e si mostra, ma non si
  // tocca niente: scrivere su un sistema esterno mentre si dichiara di stare
  // solo guardando è il contrario di quello che quello stato promette. E un
  // collegamento messo in osservazione per capire un problema non deve
  // continuare a mandare timbrature mentre lo si studia.
  if (!cfg || cfg.stato !== 'attivo' || !cfg.token) return;

  const client = new ClientTimbro(cfg.urlBase, cfg.token);
  for (const r of righe) {
    try {
      await client.creaPunch({
        id: r.id,
        employeeExternalId: r.dipendenteId,
        occurredAt: r.ts,
        passo: passoDaTimbratura(r.tipo, r.pausa),
        nota: "Dall'app Kommessa",
      });
    } catch (e) {
      const err = e instanceof ErroreTimbro ? e : null;
      // ⚠️ Un 401/403 vuol dire che la chiave non ha `punches:write`: è una
      // configurazione da sistemare, non un intoppo da ritentare. Si dice una
      // volta e si smette, invece di provarci per ogni timbratura della
      // giornata e riempire i log di rumore.
      if (err && (err.stato === 401 || err.stato === 403)) {
        console.warn(
          `[timbro] specchio non autorizzato per il tenant ${tenantId}: serve lo scope ${SCOPE_RICHIESTO}. Smetto per questo lotto.`,
        );
        return;
      }
      // ⚠️ 422 = Timbro non conosce questa persona (`external_id` non
      // abbinato) o la fase non è coerente. Non si ritenta: riproverebbe
      // identico. Si lascia detto.
      console.warn(
        `[timbro] non ho potuto specchiare la timbratura ${r.id}: ${err ? `${err.stato} ${err.codice}` : 'errore sconosciuto'}`,
      );
    }
  }
}

/**
 * Manda a Timbro le righe che lo meritano. Da chiamare dallo scrittore unico:
 * non ritorna niente e non fallisce mai.
 */
export function specchiaSuTimbro(tenantId: string, righe: readonly RigaDaSpecchiare[]): void {
  const dainviare = daSpecchiare(
    righe.map((r) => ({ ...r, dipendenteId: r.dipendenteId })),
  );
  if (dainviare.length === 0) return;
  waitUntil(
    invia(tenantId, dainviare).catch((e) => {
      console.warn('[timbro] specchio fallito:', e instanceof Error ? e.message : e);
    }),
  );
}
