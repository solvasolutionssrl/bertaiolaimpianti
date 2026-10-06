/**
 * Il link pubblico di una commessa: **chi può aprirlo, fino a quando, e cosa
 * vede**.
 *
 * I clienti chiedono spesso «mandami un link con le foto». Oggi l'alternativa è
 * scaricare le foto e rimandarle su WhatsApp, che è lavoro a mano e perde la
 * qualità. Qui si genera un indirizzo che mostra una pagina sola: titolo,
 * eventualmente i dettagli del lavoro, e la libreria delle foto e dei video.
 *
 * ## Il modello di sicurezza, detto in chiaro
 *
 * **Chi ha l'indirizzo entra.** Non c'è password, non c'è account: è il punto
 * della cosa, altrimenti non si potrebbe mandare su WhatsApp. Quindi
 * l'indirizzo *è* il segreto, e da lì discende tutto il resto:
 *
 * - **32 byte casuali** (256 bit): non si indovina e non si enumera;
 * - **in tabella finisce solo lo SHA-256**, come per i token del comando iOS:
 *   chi legge il database non ottiene link funzionanti;
 * - **scade da solo** dopo 30 giorni, perché un link dimenticato in una chat è
 *   un link che vive per sempre;
 * - **si spegne in un istante** e si vede quante volte è stato aperto: se
 *   finisce dove non doveva, lo si chiude e si sa se qualcuno l'ha usato;
 * - **uno solo per commessa**: rigenerarlo uccide il precedente. Due link vivi
 *   per lo stesso lavoro sono due cose da ricordarsi di revocare, e la seconda
 *   non la revoca nessuno.
 *
 * ## Cosa NON passa, mai
 *
 * Telefono, indirizzo, mappa, cliente, stato, codice interno, documenti,
 * preventivi. Non per scelta della pagina: la query che alimenta la pagina
 * pubblica quei campi **non li legge affatto**, così nessuno può farli
 * comparire per sbaglio aggiungendo un campo a un componente.
 *
 * I **dettagli del lavoro** sono l'unico campo discutibile — è la dettatura
 * integrale del capo, e può contenere di tutto, compreso un numero di telefono.
 * Per questo non è una decisione presa qui una volta per tutte: è una scelta
 * per singolo link (`mostra_dettagli`), fatta da chi lo genera **con il testo
 * sotto gli occhi**.
 *
 * Puro e deterministico: nessun database, nessuna data implicita (l'ora
 * «adesso» si passa, così i test non dipendono dall'orologio).
 */

/** Quanto vive un link appena creato. */
export const GIORNI_VALIDITA = 30;

/** Byte di casualità del token. 32 byte = 256 bit. */
export const BYTE_TOKEN = 32;

export interface LinkPubblico {
  id: string;
  commessaId: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  aperture: number;
  ultimaAperturaAt: string | null;
  mostraDettagli: boolean;
}

export type StatoLink = 'attivo' | 'scaduto' | 'revocato';

/**
 * In che stato è un link. L'ordine dei controlli conta: un link **revocato**
 * resta revocato anche dopo la scadenza, perché è l'informazione utile («l'ho
 * chiuso io») contro quella ovvia («è passato il tempo»).
 */
export function statoLink(
  link: Pick<LinkPubblico, 'expiresAt' | 'revokedAt'>,
  adesso: Date,
): StatoLink {
  if (link.revokedAt) return 'revocato';
  if (new Date(link.expiresAt).getTime() <= adesso.getTime()) return 'scaduto';
  return 'attivo';
}

/** Vero se il link apre la pagina. L'unica domanda che conta lato server. */
export function linkApribile(
  link: Pick<LinkPubblico, 'expiresAt' | 'revokedAt'>,
  adesso: Date,
): boolean {
  return statoLink(link, adesso) === 'attivo';
}

/** La scadenza di un link creato adesso. */
export function scadenzaDa(adesso: Date, giorni = GIORNI_VALIDITA): Date {
  return new Date(adesso.getTime() + giorni * 24 * 60 * 60 * 1000);
}

/**
 * Quanti giorni interi mancano alla scadenza. Zero significa «scade oggi»,
 * mai un numero negativo: a scadenza passata la domanda giusta non è «da
 * quanto», è «è scaduto».
 */
export function giorniRimasti(
  link: Pick<LinkPubblico, 'expiresAt'>,
  adesso: Date,
): number {
  const ms = new Date(link.expiresAt).getTime() - adesso.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/** Come si legge lo stato a schermo. */
export function etichettaStatoLink(stato: StatoLink): string {
  switch (stato) {
    case 'attivo':
      return 'Attivo';
    case 'scaduto':
      return 'Scaduto';
    case 'revocato':
      return 'Spento';
  }
}

/**
 * L'indirizzo completo da copiare.
 *
 * `/c/` e non `/commessa-pubblica/`: deve stare in un messaggio e deve
 * sopravvivere a chi lo riscrive a mano.
 */
export function urlLinkPubblico(origine: string, token: string): string {
  return `${origine.replace(/\/+$/, '')}/c/${token}`;
}

/**
 * I tipi di file che la pagina pubblica mostra: **solo foto e video**.
 *
 * Non i PDF, non i documenti, non i preventivi: sono le cose che stanno nelle
 * cartelle di lavoro, e un link mandato a un cliente non deve diventare una
 * finestra sull'archivio. Se un domani servirà condividere un documento, sarà
 * una decisione separata e consapevole, non un effetto collaterale di questa.
 */
export function mediaVisibilePubblicamente(mime: string | null | undefined): boolean {
  if (!mime) return false;
  return mime.startsWith('image/') || mime.startsWith('video/');
}
