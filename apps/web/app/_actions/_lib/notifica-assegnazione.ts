import 'server-only';

import { componiAssegnazione } from '@kommessa/api/avvisi';

import { avvisa } from './avvisa';

/**
 * Avvisa chi si è appena preso una cosa da fare o una richiesta.
 *
 * Fino al 05/10/2026 assegnare un task scriveva **solo** su `audit_events`:
 * l'interessato non riceveva niente e lo scopriva solo se gli veniva in mente
 * di aprire la lista. Un post-it digitale che non avvisa nessuno è ancora un
 * post-it, e il senso della funzione era proprio togliere il passaggio a mano.
 *
 * Dal 08/10 l'avviso arriva **anche sul telefono**, e passa da `avvisa()`:
 * lì stanno il rispetto delle preferenze, il mestiere di chi riceve e il
 * `waitUntil` che tiene in vita la consegna oltre la risposta. Qui resta solo
 * *cosa* si dice, e il testo lo compone un modulo puro con le prove.
 *
 * Non si avvisa chi assegna a se stesso: lo sa già.
 */
export async function notificaAssegnazione(opts: {
  tenantId: string;
  /** Chi riceve. */
  userId: string;
  /** Chi ha assegnato: se è la stessa persona non si manda niente. */
  attoreUserId: string;
  todoId: string;
  titolo: string;
  /** Null = è una richiesta, non ancora agganciata a una commessa. */
  commessaId: string | null;
  /** Il codice della commessa, se chi chiama ce l'ha già sotto mano. */
  codiceCommessa?: string | null;
  /**
   * Per chi è il lavoro, e dove si va.
   *
   * ⚠️ **Non sono dettagli: sono la notizia.** L'avviso diceva «Ti è stata
   * affidata una cosa da fare» e, nel corpo, il titolo. Chi lo riceve sul
   * telefono voleva sapere *da chi* deve andare e *dove*, e doveva aprire
   * l'app per scoprirlo — ammesso di capire quale delle venti righe fosse.
   * Chi chiama questi due dati **ce li ha già in mano**: non passarli era solo
   * una riga non scritta.
   */
  cliente?: string | null;
  dove?: string | null;
}): Promise<void> {
  if (opts.userId === opts.attoreUserId) return;

  const eRichiesta = opts.commessaId === null;
  const { titolo, corpo } = componiAssegnazione({
    tipo: eRichiesta ? 'richiesta' : 'todo',
    oggetto: opts.titolo,
    codiceCommessa: opts.codiceCommessa ?? null,
    cliente: opts.cliente ?? null,
    dove: opts.dove ?? null,
  });

  await avvisa([
    {
      userId: opts.userId,
      codice: 'todo_assegnato',
      titolo,
      corpo,
      /**
       * ⚠️ **Si atterra sulla cosa, non nel suo quartiere.**
       *
       * Prima: una richiesta portava alla home (venti righe, indovina quale) e
       * una cosa da fare portava a `…#lavori`, che è un'**àncora morta** — in
       * tutto il repo non esiste nessun `id="lavori"`, e i todo stanno dentro
       * una tab che un hash non può nemmeno selezionare.
       *
       * Ora: una richiesta ha una pagina sua; una cosa da fare porta alla
       * commessa con `?evidenzia=`, e lì la riga si accende per tre secondi.
       */
      url: opts.commessaId
        ? `/mobile/commessa/${opts.commessaId}?evidenzia=${opts.todoId}`
        : `/mobile/richiesta/${opts.todoId}`,
      extra: {
        todo_id: opts.todoId,
        ...(opts.commessaId ? { commessa_id: opts.commessaId } : {}),
        e_richiesta: eRichiesta,
        actor_user_id: opts.attoreUserId,
      },
    },
  ]);
}

/**
 * Avvisa un tecnico che è stato messo su una commessa.
 *
 * ⚠️ PERCHE' QUESTA FUNZIONE NASCE IL 07/10/2026
 * Il tipo di notifica `commessa_assegnata` **esisteva da marzo**: dichiarato
 * in `notification_event_types` con tanto di descrizione («Quando vieni
 * nominato responsabile o tecnico di una commessa»), presente nella matrice
 * delle preferenze dentro il profilo dell'app — dove ognuno poteva scegliere
 * su quali canali riceverlo. **Nessuna riga di codice lo inviava.**
 *
 * Il risultato era il peggiore dei due mondi: l'utente vedeva
 * un'impostazione, la configurava, e non arrivava niente. Un tecnico messo su
 * una commessa lo scopriva aprendo l'app e trovandocela.
 */
export async function notificaCommessaAssegnata(opts: {
  tenantId: string;
  userId: string;
  attoreUserId: string;
  commessaId: string;
  /** Come si chiama il lavoro a schermo: codice più titolo, se c'è. */
  titolo: string;
  /** Per chi è, e dove si va: le due domande di chi lo legge sul telefono. */
  cliente?: string | null;
  dove?: string | null;
}): Promise<void> {
  if (opts.userId === opts.attoreUserId) return;

  const { titolo, corpo } = componiAssegnazione({
    tipo: 'commessa',
    oggetto: opts.titolo,
    cliente: opts.cliente ?? null,
    dove: opts.dove ?? null,
  });

  await avvisa([
    {
      userId: opts.userId,
      codice: 'commessa_assegnata',
      titolo,
      corpo,
      url: `/mobile/commessa/${opts.commessaId}`,
      extra: { commessa_id: opts.commessaId, actor_user_id: opts.attoreUserId },
    },
  ]);
}
