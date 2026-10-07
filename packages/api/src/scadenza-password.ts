/**
 * **Quando la password va cambiata.**
 *
 * Quattro date all'anno, uguali per tutti: **10 dicembre, 10 marzo, 10 giugno,
 * 10 settembre**. Dal **primo del mese** si dice quanti giorni restano; dal
 * giorno della scadenza non si passa piu' finche' non si cambia.
 *
 * ## Una regola sola, senza casi a parte
 *
 * La scadenza che riguarda una persona e' **la prima data del calendario che
 * la sua password non ha ancora soddisfatto**, e una data e' soddisfatta se la
 * password e' stata scelta **dentro la sua finestra di avviso**, cioe' dal
 * primo del mese in poi.
 *
 * Quindi cambiarla il 3 dicembre vale per il 10 dicembre: altrimenti l'avviso
 * non servirebbe a niente — diresti «cambiala» e la bloccheresti comunque una
 * settimana dopo.
 *
 * ⚠️ **Il contrario di una finestra e' un bordo**: chi la cambia il 30
 * novembre viene riavvisato il primo dicembre, perche' il 30 novembre sta
 * fuori dalla finestra. E' il prezzo delle **date fisse**: in cambio tutta
 * l'azienda ha la password nuova dal 10, e «quando scade la mia?» ha la stessa
 * risposta per tutti. Con «ogni 90 giorni da quando l'hai cambiata» quel bordo
 * non c'e', ma non c'e' nemmeno un giorno in cui si sappia che e' cambiata a
 * qualcuno.
 *
 * ## L'orologio parte da un giorno, e non e' la nascita dell'account
 *
 * `password_changed_at` dice **quando l'ha scelta chi la usa**, ed e' NULL su
 * tutti e cinquantaquattro gli utenti che c'erano: il modulo per cambiarla e'
 * del 07/10/2026 e una password consegnata dall'ufficio non l'ha scelta
 * nessuno. ⚠️ Leggere quel NULL come «scaduta da sempre» vorrebbe dire aprire
 * l'app il mattino del deploy con un muro davanti a tutta l'azienda — cioe'
 * fermarla. Quindi il giorno da cui si conta e':
 *
 *   1. il giorno in cui l'ha scelta,
 *   2. se non l'ha mai scelta, il giorno in cui e' nato l'account,
 *   3. mai prima di {@link REGOLA_DAL}, il giorno in cui questa regola esiste.
 *
 * Il punto 2 non e' un dettaglio: senza, un tecnico assunto a febbraio e fatto
 * entrare **senza muro** (la scelta del 08/10) si troverebbe murato al primo
 * accesso, perche' la sua password risulterebbe vecchia come la regola.
 * Il punto 3 non e' un dettaglio: senza, lo stesso vale per chi c'era da
 * maggio.
 *
 * Tutte le date sono giorni calendario italiani ('YYYY-MM-DD') confrontati
 * come stringhe: in quel formato l'ordine alfabetico **e'** quello
 * cronologico, e non c'e' un fuso da sbagliare.
 */

/**
 * Da quando questa regola esiste. Chi aveva la password prima di questo
 * giorno la conta da qui: non si rinfaccia a nessuno di non aver rispettato
 * una scadenza che non c'era.
 */
export const REGOLA_DAL = '2026-10-07';

/** I quattro giorni dell'anno in cui la password scade, in ordine di mese. */
export const SCADENZE_ANNO: ReadonlyArray<{ mese: number; giorno: number }> = [
  { mese: 3, giorno: 10 },
  { mese: 6, giorno: 10 },
  { mese: 9, giorno: 10 },
  { mese: 12, giorno: 10 },
];

/** Stato di una password rispetto al calendario delle scadenze. */
export type StatoScadenza =
  /** In regola: la scadenza e' lontana, niente da dire. */
  | 'valida'
  /** Dentro la finestra: si lavora, ma si avvisa ogni giorno. */
  | 'in_scadenza'
  /** Scaduta: per continuare bisogna cambiarla. */
  | 'scaduta';

export interface EsitoScadenza {
  stato: StatoScadenza;
  /** La scadenza che riguarda questa persona ('YYYY-MM-DD'). */
  scadenza: string;
  /** Primo giorno in cui si comincia ad avvisare ('YYYY-MM-DD'). */
  avvisoDal: string;
  /** Giorni da oggi alla scadenza: 0 il giorno stesso, negativo se e' passata. */
  giorniRimasti: number;
}

/** Niente da dire: la risposta quando la lettura non riesce. */
export const SCADENZA_FUORI_SERVIZIO: EsitoScadenza = {
  stato: 'valida',
  scadenza: '',
  avvisoDal: '',
  giorniRimasti: Number.POSITIVE_INFINITY,
};

function due(n: number): string {
  return n < 10 ? '0' + String(n) : String(n);
}

/** Il primo del mese della scadenza: da qui si avvisa. */
function inizioFinestra(scadenza: string): string {
  return scadenza.slice(0, 8) + '01';
}

/**
 * Le scadenze dall'anno di `da` in avanti. Tre anni bastano con abbondanza: la
 * prima non soddisfatta cade sempre entro dodici mesi da `da`.
 */
function calendarioDa(da: string): string[] {
  const anno = Number(da.slice(0, 4));
  const fuori: string[] = [];
  for (let a = anno; a <= anno + 2; a += 1) {
    for (const s of SCADENZE_ANNO) {
      fuori.push(String(a) + '-' + due(s.mese) + '-' + due(s.giorno));
    }
  }
  return fuori;
}

/**
 * Da che giorno si conta, per questa persona.
 *
 * `scelta` = `users.password_changed_at`, `nato` = `users.created_at`, in
 * giorni italiani. Vedi la nota in testa al file: sono tre ripieghi in fila, e
 * togliendone uno si mura qualcuno.
 */
export function giornoDaCuiContare(dati: {
  scelta: string | null;
  nato: string | null;
  regolaDal?: string;
}): string {
  const partenza = dati.regolaDal ?? REGOLA_DAL;
  const suo = dati.scelta ?? dati.nato ?? partenza;
  return suo > partenza ? suo : partenza;
}

/**
 * La prima scadenza che una password scelta il giorno `cambiataIl` **non** ha
 * soddisfatto. Soddisfatta = scelta dal primo del mese della scadenza in poi.
 */
export function scadenzaDopo(cambiataIl: string): string {
  const calendario = calendarioDa(cambiataIl);
  for (const s of calendario) {
    if (cambiataIl < inizioFinestra(s)) return s;
  }
  // Non raggiungibile: il calendario copre tre anni, e la prima non
  // soddisfatta cade entro dodici mesi. Ma una data vera e' sempre meglio di
  // un `undefined`, che diventerebbe un blocco a sorpresa.
  return String(Number(cambiataIl.slice(0, 4)) + 2) + '-12-10';
}

/** Quanti giorni calendario separano due giorni italiani (b meno a). */
export function giorniFra(a: string, b: string): number {
  const ms = Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z');
  return Math.round(ms / 86400000);
}

/** Che fare, oggi, con la password di questa persona. */
export function statoScadenzaPassword(dati: {
  oggi: string;
  /** `users.password_changed_at` come giorno italiano, o null. */
  scelta: string | null;
  /** `users.created_at` come giorno italiano, o null. */
  nato: string | null;
  regolaDal?: string;
}): EsitoScadenza {
  const scadenza = scadenzaDopo(giornoDaCuiContare(dati));
  const avvisoDal = inizioFinestra(scadenza);
  const giorniRimasti = giorniFra(dati.oggi, scadenza);
  const stato: StatoScadenza =
    dati.oggi >= scadenza ? 'scaduta' : dati.oggi >= avvisoDal ? 'in_scadenza' : 'valida';
  return { stato, scadenza, avvisoDal, giorniRimasti };
}

const MESI = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
];

/** '2026-12-10' → '10 dicembre'. L'anno si dice solo se non e' quello di oggi. */
export function formattaGiorno(g: string, oggi?: string): string {
  if (g.length < 10) return '';
  const anno = g.slice(0, 4);
  const mese = Number(g.slice(5, 7));
  const delMese = Number(g.slice(8, 10));
  const base = String(delMese) + ' ' + MESI[mese - 1];
  return oggi && oggi.slice(0, 4) !== anno ? base + ' ' + anno : base;
}

/** Quanto manca, a parole: 'oggi', 'domani', 'fra 9 giorni'. */
export function quandoScade(giorniRimasti: number): string {
  if (giorniRimasti <= 0) return 'oggi';
  if (giorniRimasti === 1) return 'domani';
  return 'fra ' + String(giorniRimasti) + ' giorni';
}

/**
 * Come si dice. Sta qui e non nelle pagine perche' lo dicono in tre posti (il
 * guscio dell'ufficio, quello del telefono e la pagina del cambio) e devono
 * dirlo uguale.
 */
export function testoScadenza(esito: EsitoScadenza): { titolo: string; corpo: string } {
  if (esito.stato === 'scaduta') {
    return {
      titolo: 'La password è scaduta',
      corpo: 'Per continuare a usare l’applicazione scegline una nuova.',
    };
  }
  return {
    titolo: 'La password scade ' + quandoScade(esito.giorniRimasti),
    corpo:
      'Dal ' +
      formattaGiorno(esito.scadenza) +
      ' il cambio è obbligatorio per continuare. Puoi farlo adesso.',
  };
}
