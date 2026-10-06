/**
 * Cosa può fare una persona **in più** di quanto dica il suo ruolo.
 *
 * ## Perché questo file sostituisce il pannello dei permessi
 *
 * Esisteva già un sistema di permessi per-utente: sette aree (commesse,
 * clienti, ticket, turni, documenti, utenti, statistiche) per quattro livelli
 * ciascuna, con una funzione Postgres per i default di ruolo, una vista, un
 * modulo TypeScript e un pannello a scorrimento nell'elenco utenti.
 *
 * Nessuna riga di codice lo leggeva. Zero utenti su cinquantaquattro avevano
 * un override. Era un pannello che si poteva compilare e che **non cambiava
 * niente**: mettere «commesse: nessuno» a un tecnico lo lasciava esattamente
 * dov'era. È peggio di non avere niente, perché chi lo compila crede di aver
 * chiuso una porta.
 *
 * Qui ci sta l'opposto: **pochissime voci, ognuna con un posto preciso che la
 * applica.** Il criterio per aggiungerne una non è «sarebbe comodo poterlo
 * decidere», è «c'è una riga di codice che la legge e si comporta di
 * conseguenza». Se la riga non c'è, la voce non si aggiunge.
 *
 * ## Dove sta scritta
 *
 * In `users.permissions`, booleani piatti: `{ "capo_squadra": true }`. Piatti
 * e non annidati perché così la stessa domanda si può fare anche in SQL
 * (`permissions->>'capo_squadra' = 'true'`) senza dover estrarre un array.
 *
 * ⚠️ La colonna è protetta dal trigger `users_proteggi_privilegi`: nessuno se
 * la cambia da solo. Senza quella protezione, un tecnico si darebbe i poteri
 * del capo con una riga dalla console del browser.
 */

export const CAPACITA = ['capo_squadra'] as const;
export type Capacita = (typeof CAPACITA)[number];

export interface CapacitaMeta {
  /** Come si chiama per chi la concede. */
  etichetta: string;
  /** Una frase che dice cosa cambia davvero, non cosa significa. */
  descrizione: string;
  /** L'elenco puntuale di ciò che si sblocca. Niente di più, niente di meno. */
  sblocca: readonly string[];
  /** Cosa vede chi NON la ha, quando prova. */
  messaggioNegato: string;
}

export const CAPACITA_META: Record<Capacita, CapacitaMeta> = {
  capo_squadra: {
    etichetta: 'Capo squadra',
    descrizione:
      'Può aprire lavori nuovi e organizzare quelli degli altri, come fa l’ufficio. Senza questo, un tecnico lavora sui lavori che gli vengono assegnati.',
    sblocca: [
      'Creare un lavoro nuovo (dettatura e sopralluogo)',
      'Creare una riunione con il verbale automatico',
      'Creare cose da fare e assegnarle a chiunque',
    ],
    messaggioNegato:
      'Per aprire un lavoro nuovo chiedi al capo squadra: il tuo profilo non è abilitato.',
  },
};

/** Ruoli per cui una capacità è già compresa nel mestiere, senza concederla. */
const RUOLI_CON_TUTTO = new Set(['admin', 'office']);

/**
 * Le capacità concesse a mano, lette da `users.permissions`.
 *
 * Tollerante per scelta: una colonna `null`, un oggetto con le chiavi del
 * vecchio sistema, una stringa arrivata da chissà dove — tutto diventa «nessuna
 * capacità in più». Un dato storto non deve impedire a nessuno di lavorare, e
 * il verso giusto dell'errore è togliere poteri, non darli.
 */
export function leggiCapacita(permissions: unknown): Set<Capacita> {
  const out = new Set<Capacita>();
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) return out;
  const o = permissions as Record<string, unknown>;
  for (const c of CAPACITA) {
    if (o[c] === true) out.add(c);
  }
  return out;
}

/**
 * La domanda vera: **questa persona può fare questa cosa?**
 *
 * Un amministratore e l'ufficio ce l'hanno per mestiere: non serve
 * concedergliela, e non si deve poter togliere da qui (per togliere qualcosa a
 * un amministratore si cambia il ruolo, che è un gesto visibile).
 */
export function haCapacita(
  utente: { role: string; permissions?: unknown },
  capacita: Capacita,
): boolean {
  if (RUOLI_CON_TUTTO.has(utente.role)) return true;
  if (utente.role === 'cliente') return false;
  return leggiCapacita(utente.permissions).has(capacita);
}

/** Scorciatoia per la capacità che conta oggi, usata in una decina di punti. */
export function puoAprireLavori(utente: { role: string; permissions?: unknown }): boolean {
  return haCapacita(utente, 'capo_squadra');
}

/**
 * Il nuovo valore di `users.permissions` dopo aver acceso o spento una
 * capacità.
 *
 * Due dettagli voluti:
 *  - le chiavi del vecchio sistema di permessi **non vengono conservate**: era
 *    un sistema che non faceva niente, portarselo dietro significherebbe
 *    riportarselo dietro per sempre;
 *  - se non resta nessuna capacità accesa si scrive `null` e non `{}`, così la
 *    colonna dice «niente di speciale» invece di «ho pensato a niente».
 */
export function scriviCapacita(
  permissionsAttuali: unknown,
  capacita: Capacita,
  acceso: boolean,
): Record<string, boolean> | null {
  const correnti = leggiCapacita(permissionsAttuali);
  if (acceso) correnti.add(capacita);
  else correnti.delete(capacita);
  if (correnti.size === 0) return null;
  const out: Record<string, boolean> = {};
  for (const c of CAPACITA) if (correnti.has(c)) out[c] = true;
  return out;
}

/** Se una stringa è il nome di una capacità che esiste. Per validare l'input. */
export function eCapacita(valore: unknown): valore is Capacita {
  return typeof valore === 'string' && (CAPACITA as readonly string[]).includes(valore);
}
