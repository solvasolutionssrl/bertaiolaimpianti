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

// ---------------------------------------------------------------------------
// Cantieri
// ---------------------------------------------------------------------------

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

/** Va mostrato nei punti di scelta (picker, selettori, ricerca)? */
export function cantiereSceglibile(stato: string | null | undefined): boolean {
  return cantiereImputabile(stato);
}

// ---------------------------------------------------------------------------
// Commesse
// ---------------------------------------------------------------------------

export type StatoCommessa =
  | 'bozza'
  | 'aperta'
  | 'in_corso'
  | 'collaudo'
  | 'completata'
  | 'archiviata';

/** Gli stati di una commessa su cui si lavora ancora. */
export const STATI_COMMESSA_VIVI: readonly StatoCommessa[] = [
  'bozza',
  'aperta',
  'in_corso',
  'collaudo',
];

/**
 * Si puo' ancora attaccare qualcosa a questa commessa (foto, ore, todo,
 * riunioni, documenti)? No da `completata` in poi.
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

/** Va proposta nei punti di scelta (selettori, ricerca, ⌘K)? */
export function commessaSceglibile(stato: string | null | undefined): boolean {
  return commessaImputabile(stato);
}

// ---------------------------------------------------------------------------
// Messaggi
// ---------------------------------------------------------------------------

/**
 * I codici che le azioni restituiscono. Il testo per l'utente sta nella UI,
 * qui c'e' solo il motivo, perche' lo stesso codice serve a chi indaga un log.
 */
export const CANTIERE_CHIUSO = 'CANTIERE_CHIUSO' as const;

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
