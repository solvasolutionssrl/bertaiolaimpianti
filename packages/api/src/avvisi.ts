/**
 * **Chi riceve cosa, e per quale via.**
 *
 * ## Perché questo modulo esiste
 *
 * Il 07/10 è stato tolto dal profilo dell'app un pannello di ventuno caselle
 * — sette eventi per tre canali, più le ore di silenzio — perché **non
 * governava niente**: l'unico lettore era una rotta senza chiamanti, e le
 * sottoscrizioni push erano zero su tutti e quattro i clienti. La nota di
 * allora diceva: «quando colleghiamo l'invio, il pannello torna con una riga».
 *
 * Adesso l'invio si collega, e il pannello torna. Ma torna con una regola in
 * più rispetto a prima: **ogni voce dichiarata qui deve avere un mittente
 * vivo**, cioè una riga di codice che manda quell'avviso. L'elenco qui sotto
 * contiene cinque codici e sono esattamente i cinque che qualcuno manda —
 * quattro tipi erano stati cancellati dal catalogo proprio perché nessuno li
 * mandava.
 *
 * ## Perché i predefiniti dipendono dal mestiere
 *
 * `notification_event_types.default_push` è un valore solo per tutti, e con un
 * valore solo per tutti un tecnico si ritroverebbe sul telefono le richieste
 * di permesso da approvare — che non può approvare. Il mestiere non è una
 * preferenza da scoprire: si sa già chi riceve cosa, e lo si scrive.
 *
 * ⚠️ **Un avviso non ammesso per un mestiere non è nascosto: non viene
 * mandato.** La pagina mostra solo le voci ammesse, ma la decisione sta nel
 * mittente, non nella pagina — una pagina non è un presidio.
 */

export type RuoloAvviso = 'admin' | 'office' | 'tecnico';

export interface MetaAvviso {
  codice: string;
  /** Come si chiama nella pagina di gestione. */
  etichetta: string;
  /** Una riga che dice *quando* arriva. Senza, nessuno sa cosa sta spegnendo. */
  quando: string;
  /** Chi lo può ricevere. */
  ruoli: readonly RuoloAvviso[];
  /** Se la notifica sul telefono parte da sé, prima che qualcuno scelga. */
  pushPredefinita: boolean;
}

/**
 * I cinque avvisi che qualcuno manda davvero.
 *
 * Per aggiungerne uno: prima la riga di codice che lo manda, poi la voce qui.
 * Mai il contrario.
 */
export const AVVISI: readonly MetaAvviso[] = [
  {
    codice: 'commessa_assegnata',
    etichetta: 'Commesse affidate a me',
    quando: 'Quando l’ufficio ti mette su un lavoro.',
    ruoli: ['admin', 'office', 'tecnico'],
    pushPredefinita: true,
  },
  {
    codice: 'todo_assegnato',
    etichetta: 'Cose da fare affidate a me',
    quando: 'Quando qualcuno assegna una cosa da fare o una richiesta a te.',
    ruoli: ['admin', 'office', 'tecnico'],
    pushPredefinita: true,
  },
  {
    codice: 'pianificazione_pubblicata',
    etichetta: 'La mia settimana',
    quando: 'Quando l’ufficio pubblica o cambia la pianificazione che ti riguarda.',
    ruoli: ['admin', 'office', 'tecnico'],
    pushPredefinita: true,
  },
  {
    codice: 'permesso_esito',
    etichetta: 'Esito delle mie richieste',
    quando: 'Quando una tua richiesta di ferie o permesso viene accolta o respinta.',
    ruoli: ['admin', 'office', 'tecnico'],
    pushPredefinita: true,
  },
  {
    codice: 'permesso_richiesto',
    etichetta: 'Richieste da approvare',
    // ⚠️ Non per i tecnici: un tecnico non approva i permessi, e un avviso per
    // una cosa che non puoi fare è solo un telefono che squilla.
    quando: 'Quando qualcuno chiede ferie o un permesso e tocca a te decidere.',
    ruoli: ['admin', 'office'],
    pushPredefinita: true,
  },
] as const;

const PER_CODICE = new Map(AVVISI.map((a) => [a.codice, a]));

/** Gli avvisi che una persona con questo mestiere può ricevere. */
export function avvisiPerRuolo(ruolo: string): MetaAvviso[] {
  return AVVISI.filter((a) => (a.ruoli as readonly string[]).includes(ruolo));
}

/** Se a questo mestiere questo avviso si manda del tutto. */
export function avvisoAmmesso(codice: string, ruolo: string): boolean {
  const m = PER_CODICE.get(codice);
  return m ? (m.ruoli as readonly string[]).includes(ruolo) : false;
}

/**
 * Se la notifica sul telefono parte.
 *
 * `preferenza` è quello che la persona ha scelto: `null` o `undefined`
 * significa «non ha scelto», e allora vale il predefinito del mestiere.
 *
 * ⚠️ Un avviso non ammesso per il mestiere non parte **mai**, nemmeno se in
 * tabella c'è una preferenza che dice `true`: una riga vecchia, scritta quando
 * la persona aveva un altro ruolo, non deve poter riaprire una porta chiusa.
 */
export function pushAttiva(
  codice: string,
  ruolo: string,
  preferenza?: boolean | null,
): boolean {
  if (!avvisoAmmesso(codice, ruolo)) return false;
  if (preferenza === true || preferenza === false) return preferenza;
  return PER_CODICE.get(codice)?.pushPredefinita === true;
}

/** L'etichetta per la pagina; mai il codice grezzo a schermo. */
export function etichettaAvviso(codice: string): string {
  return PER_CODICE.get(codice)?.etichetta ?? 'Avviso';
}

// ───────────────────── Come si scrive un avviso ─────────────────────

/**
 * Il testo di un avviso di assegnazione.
 *
 * Due righe, e tutte e due dicono qualcosa:
 *   - la prima **cosa è successo** e a chi («Ti è stato affidato un lavoro»),
 *     perché è quella che compare sulla schermata bloccata del telefono;
 *   - la seconda **di cosa si tratta**, col nome del lavoro.
 *
 * ⚠️ Il nome del lavoro va nel corpo e non nel titolo: su iOS il titolo di una
 * notifica si taglia intorno ai quaranta caratteri, e un titolo tagliato a
 * metà di un indirizzo non dice né cosa è successo né dove.
 */
export function componiAssegnazione(dati: {
  tipo: 'commessa' | 'todo' | 'richiesta';
  /** Il nome del lavoro o della cosa da fare. */
  oggetto: string;
  /** Il codice della commessa, quando c'è. */
  codiceCommessa?: string | null;
  /** Per chi: il cliente, come si chiama in anagrafica o come e' stato detto. */
  cliente?: string | null;
  /** Dove bisogna andare, quando si sa. */
  dove?: string | null;
}): { titolo: string; corpo: string } {
  const oggetto = (dati.oggetto ?? '').trim();
  const cliente = (dati.cliente ?? '').trim();
  const dove = (dati.dove ?? '').trim();
  const codice = (dati.codiceCommessa ?? '').trim();

  /**
   * ⚠️ **Niente «Apri per…» in coda.**
   *
   * C'era, e serviva quando il corpo diceva solo il nome del lavoro: senza
   * quella frase la notifica non suggeriva nessun gesto. Ora il corpo dice
   * cosa, per chi e dove — e su una schermata bloccata lo spazio e' due righe:
   * ogni carattere speso per «Apri per vedere la commessa» e' un pezzo di
   * indirizzo che non si legge. Il gesto, davanti a un indirizzo, e' ovvio.
   */
  const corpo = (parti: Array<string | null | undefined>, ripiego: string) => {
    const vive = parti.map((p) => (p ?? '').trim()).filter(Boolean);
    return vive.length > 0 ? vive.join(' · ') : ripiego;
  };

  if (dati.tipo === 'commessa') {
    return {
      titolo: 'Ti è stato affidato un lavoro',
      corpo: corpo([oggetto, cliente, dove], 'Un nuovo lavoro'),
    };
  }

  if (dati.tipo === 'richiesta') {
    return {
      titolo: 'Ti è stata affidata una richiesta',
      // Per una richiesta il cliente e il posto sono **la** notizia: chi la
      // riceve deve sapere da chi andare prima ancora di aprire l'app.
      corpo: corpo([oggetto, cliente, dove], 'Una richiesta arrivata in ufficio'),
    };
  }

  return {
    titolo: 'Ti è stata affidata una cosa da fare',
    corpo: corpo([oggetto, codice, cliente, dove], 'Una cosa da fare'),
  };
}
