/**
 * Cosa vuol dire «chiuso», per i due mondi.
 *
 * Un lavoro finito non si cancella mai: resta lo storico, restano le ore, le
 * spese, le foto e le cartelle. Cambia solo cosa se ne puo' fare.
 *
 * La regola e' una sola, scritta qui una volta, perche' i filtri sparsi negli
 * elenchi sono gentilezza, non regola: chi ha un id scrive lo stesso. Il
 * divieto lo dice il server, e lo dice da qui.
 *
 * ## Mondo cantieri (Kantiere)
 *
 * `chiuso` = fuori dai giri. Sparisce da ogni punto di scelta e dalla ricerca,
 * resta nella sua lista con l'interruttore per rivederlo, e **non accetta piu'
 * scritture**: niente ore, niente spese, niente timbrature, QR compreso.
 *
 * L'unica eccezione e' l'ufficio da computer, che puo' sempre registrare
 * qualunque cosa (gli si chiede solo conferma): il caso «ho lavorato oggi su
 * un cantiere chiuso ieri» esiste davvero, e a saperlo e' l'ufficio. Dall'app
 * la forzatura non esiste: chi e' in cantiere non deve poter decidere questo.
 *
 * ## Mondo commesse (Kommessa)
 *
 * Due stati, due significati diversi, e questa e' la differenza che il codice
 * finora non aveva chiara:
 *
 * - `completata` = **il lavoro e' finito, ma si guarda ancora**. Resta visibile
 *   ovunque, anche da telefono, con l'etichetta bene in vista.
 * - `archiviata` = **finita e tolta di mezzo**. Dal telefono non si vede piu';
 *   da computer resta nella lista grande, spenta e filtrabile.
 *
 * Su una commessa chiusa **si aggiunge lo stesso**: una foto o un documento
 * che arrivano dopo la fine dei lavori sono la normalita', e chi carica dal
 * Comando iOS o dalle API non ha un popup a cui rispondere. Il divieto qui non
 * c'e': l'app chiede conferma dove c'e' una persona davanti, e basta. Quindi
 * `commessaImputabile` dice **com'e' messa**, non cosa e' permesso.
 *
 * Il precedente esisteva gia' in un posto solo (i solleciti automatici saltano
 * le completate e le archiviate): qui diventa la regola di tutti.
 */

import type { StatoCommessa } from './types/domain';

// ---------------------------------------------------------------------------
// Cantieri
// ---------------------------------------------------------------------------

/** Il vocabolario degli stati di un cantiere: tipa la whitelist qui sotto. */
export type StatoCantiere = 'attivo' | 'sospeso' | 'chiuso';

/** Gli stati che un cantiere vivo puo' avere: la whitelist per gli elenchi. */
export const STATI_CANTIERE_VIVI: readonly StatoCantiere[] = ['attivo', 'sospeso'];

/**
 * Si puo' ancora registrare qualcosa su questo cantiere?
 *
 * Uno sconosciuto (stato mancante o valore mai visto) conta come vivo: e'
 * meglio accettare un'ora di troppo che rifiutarne una vera per colpa di un
 * dato sporco. Il divieto vale solo su un «chiuso» esplicito.
 */
export function cantiereImputabile(stato: string | null | undefined): boolean {
  return stato !== 'chiuso';
}

// ---------------------------------------------------------------------------
// Commesse
// ---------------------------------------------------------------------------
//
// Il vocabolario degli stati sta in `./types/domain` (`StatoCommessa`) e non si
// ricopia qui: due elenchi della stessa cosa divergono al primo stato nuovo.

/**
 * La commessa e' ancora in lavorazione?
 *
 * ⚠️ **Non e' un permesso.** Su una commessa chiusa si aggiunge lo stesso (vedi
 * l'intestazione del file): questa risponde a «com'e' messa», e serve alla UI
 * per decidere se chiedere conferma prima di scrivere. Leggerla come un divieto
 * e' esattamente l'errore che e' costato un'ora di upload bloccati.
 */
export function commessaImputabile(stato: string | null | undefined): boolean {
  return stato !== 'completata' && stato !== 'archiviata';
}

/**
 * La scheda e' in sola lettura? E' l'esatto contrario della precedente, ma si
 * legge nei due versi in punti diversi del codice e leggerla storta e' il modo
 * classico di sbagliare il segno.
 */
export function commessaSoloLettura(stato: string | null | undefined): boolean {
  return !commessaImputabile(stato);
}

/**
 * Si vede dal telefono?
 *
 * Le completate si': il tecnico deve poter riaprire il lavoro di ieri per
 * guardare una foto o un documento. Le archiviate no: sono state tolte di
 * mezzo apposta, e il telefono e' lo strumento di chi sta lavorando adesso.
 */
export function commessaVisibileSuMobile(stato: string | null | undefined): boolean {
  return stato !== 'archiviata';
}

/** Tutti gli stati, nell'ordine del ciclo di vita: serve a derivare le liste. */
const STATI_COMMESSA: readonly StatoCommessa[] = [
  'bozza',
  'aperta',
  'in_corso',
  'collaudo',
  'completata',
  'archiviata',
];

/**
 * Gli stati che il telefono mostra negli elenchi.
 *
 * E' `commessaVisibileSuMobile` applicata al vocabolario, non un elenco battuto
 * a mano: il filtro degli elenchi mobile e' lato query — a PostgREST si passa
 * una lista, non una funzione — e la stessa lista ricopiata in due pagine e' il
 * modo classico di far divergere la regola dal codice che la applica.
 */
export const STATI_COMMESSA_SU_MOBILE: readonly StatoCommessa[] =
  STATI_COMMESSA.filter(commessaVisibileSuMobile);

// ---------------------------------------------------------------------------
// Messaggi
// ---------------------------------------------------------------------------

/**
 * Il perche' del rifiuto, in italiano, pronto da mostrare.
 *
 * Queste stringhe finiscono davanti all'utente, quindi gli accenti sono quelli
 * veri: nei commenti del codice scriviamo «piu'», a schermo si scrive «più».
 */
export function motivoCantiereChiuso(nome?: string | null): string {
  return nome
    ? `Il cantiere "${nome}" è chiuso: non accetta più registrazioni.`
    : 'Il cantiere è chiuso: non accetta più registrazioni.';
}
