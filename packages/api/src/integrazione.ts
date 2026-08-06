/**
 * Integrazione con i gestionali dei clienti — LINGUA CANONICA.
 *
 * Questo modulo definisce il **contratto** fra Kommessa e un agente di sync
 * esterno (oggi la VM Ubuntu di FPM che parla con ERGO/Infominds, domani un
 * altro cliente con un altro gestionale).
 *
 * Regola ferrea: **qui dentro non esiste una sola parola del gestionale.**
 * Niente `workcycleId`, niente `FPM0014`, niente `deliverynotes`. Kommessa
 * parla di ore, km e spese; e' l'agente a tradurre nel dialetto del sistema
 * di destinazione. Se domani il cliente cambia ERP, cambia solo l'agente.
 *
 * Il canale non e' HTTP: Kommessa accoda in `integrazione_outbox`, l'agente
 * legge, traduce, invia e riscrive l'esito. La VM non e' raggiungibile da
 * Vercel (rete privata, nessuna porta esposta) — il verso e' sempre
 * agente → cloud.
 *
 * ⚠️ Vincolo che governa tutto (verificato su ERGO l'11/07/2026): sul
 * gestionale le scritture sono **append-only e irreversibili via API** — non
 * si rileggono (GET → 405) e non si cancellano. Quindi l'idempotenza la
 * garantiamo NOI, con `chiaveIdempotenza()`, e si spinge soltanto cio' che
 * l'ufficio ha gia' approvato.
 */

/** Gestionali supportati. Si allunga quando arriva un nuovo cliente. */
export type SistemaEsterno = 'ergo';

/** Cosa sappiamo spingere verso il gestionale. */
export type TipoOperazione = 'ore' | 'km' | 'spesa';

/**
 * Causali delle ore in lingua Kommessa. L'agente le mappa sulle causali del
 * gestionale (su ERGO: `workcycleId`, es. ordinario→1, straordinario→3).
 */
export type CausaleOre =
  | 'ordinario'
  | 'straordinario'
  | 'viaggio'
  | 'sabato'
  | 'notturno'
  | 'trasferta'
  | 'formazione'
  | 'permesso'
  | 'malattia';

/** Categorie di spesa. L'agente le mappa sull'articolo del gestionale. */
export type CategoriaSpesa = 'ristorante' | 'albergo' | 'carburante' | 'altro';

/** Ruolo della persona in trasferta: cambia se i km gli spettano o no. */
export type RuoloViaggio = 'autista' | 'passeggero';

/**
 * Identificativi del gestionale, gia' risolti da `integrazione_mappature`.
 * Kommessa NON li inventa: se manca la mappatura, l'operazione non si accoda
 * (vedi `riferimentiMancanti`), altrimenti l'agente fallirebbe comunque.
 */
export interface RiferimentiEsterni {
  /**
   * L'unita' di lavoro su cui si imputano ore e costi, sul gestionale.
   *
   * Si chiama `commessa` perche' e' il concetto **neutro**: nel mondo Kantiere
   * si risolve su una riga di `cantieri`, nel mondo Kommessa su una riga di
   * `commesse`. Chi legge i dati di dominio sceglie la colonna giusta (vedi
   * `risolviCommessa` in `integrazione-mappa.ts`); da qui in poi la
   * distinzione non esiste piu' e l'agente non deve conoscerla.
   */
  commessa?: string | null;
  /** Dipendente sul gestionale. */
  dipendente?: string | null;
  /** Cliente sul gestionale. */
  cliente?: string | null;
}

interface PayloadBase {
  /** Giorno di competenza, `YYYY-MM-DD`. Mai un timestamp. */
  data: string;
  /**
   * Testo libero gia' composto dai preset di questo modulo. Su molti
   * gestionali e' l'UNICO posto dove far entrare il contesto (es. su ERGO il
   * DDT non ha un campo dipendente) — per questo e' un formato convenzionato
   * e non una frase a caso.
   */
  descrizione: string;
  rif: RiferimentiEsterni;
}

export interface PayloadOre extends PayloadBase {
  tipo: 'ore';
  /** Durata in minuti. L'orario di inizio/fine NON si trasmette: il
   *  gestionale vuole quante ore, non quando (confermato dal cliente). */
  durataMin: number;
  causale: CausaleOre;
}

export interface PayloadKm extends PayloadBase {
  tipo: 'km';
  km: number;
  /** Solo all'autista spettano i km: il passeggero si registra per traccia. */
  ruolo: RuoloViaggio;
}

export interface PayloadSpesa extends PayloadBase {
  tipo: 'spesa';
  categoria: CategoriaSpesa;
  /** Importo in euro, IVA inclusa come da scontrino. */
  importoEur: number;
}

export type PayloadOperazione = PayloadOre | PayloadKm | PayloadSpesa;

// ---------------------------------------------------------------------------
// Idempotenza
// ---------------------------------------------------------------------------

/**
 * Chiave che rende l'invio ripetibile senza duplicare nulla sul gestionale.
 *
 * E' ancorata alla **riga di Kommessa che ha originato l'operazione**, non al
 * contenuto: cosi' un retry, un doppio click sul tasto "Sincronizza" o un
 * riavvio dell'agente non creano un secondo documento. Serve perche' sul
 * gestionale non possiamo ne' rileggere ne' cancellare: l'unica difesa contro
 * i doppioni sta da questa parte.
 *
 * Conseguenza voluta: se una riga viene CORRETTA in Kommessa dopo l'invio, la
 * chiave resta la stessa e non si rispedisce. E' il comportamento giusto —
 * una correzione andrebbe a sommarsi, non a sostituire. La UI segnala
 * "gia' inviato: correggere a mano sul gestionale".
 *
 * `variante` distingue piu' operazioni nate dalla STESSA riga: una riga di
 * rapportino porta ore ordinarie, straordinarie e di viaggio, che sul
 * gestionale sono tre registrazioni con causali diverse. Senza variante la
 * seconda e la terza verrebbero scartate come doppioni.
 */
export function chiaveIdempotenza(
  tipo: TipoOperazione,
  origineTipo: string,
  origineId: string,
  variante?: string,
): string {
  const base = `${tipo}:${origineTipo}:${origineId}`;
  return variante ? `${base}:${variante}` : base;
}

// ---------------------------------------------------------------------------
// Preset delle descrizioni
// ---------------------------------------------------------------------------

/**
 * Tetto prudenziale alla descrizione. Il limite reale del campo sul
 * gestionale non e' documentato: meglio troncare noi in modo controllato che
 * farci rifiutare la scrittura (o, peggio, farla troncare a meta' parola).
 */
export const MAX_DESCRIZIONE = 200;

const SEP = ' · ';

/** `2026-08-03` → `03/08/2026`. Data secca: nessun fuso in gioco. */
export function dataIt(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Unisce i pezzi non vuoti e tronca in coda se serve. I segmenti vanno
 * passati **dal piu' importante al meno importante**: se si tronca, si perde
 * la coda, che e' il contesto accessorio.
 *
 * `max` arriva dalla configurazione del tenant quando il gestionale ha un
 * limite piu' stretto del nostro. Deve essere applicato **qui**, in fase di
 * composizione: dichiararlo soltanto all'agente lo lascerebbe con un testo piu'
 * lungo di quanto puo' accettare, e a quel punto o lo rifiuta o lo taglia lui —
 * una seconda volta, a meta' parola.
 */
export function componiDescrizione(
  segmenti: (string | null | undefined)[],
  max: number = MAX_DESCRIZIONE,
): string {
  const tetto = Number.isFinite(max) && max > 1 ? Math.trunc(max) : MAX_DESCRIZIONE;
  const testo = segmenti
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter((s) => s.length > 0)
    .join(SEP);
  if (testo.length <= tetto) return testo;
  return testo.slice(0, tetto - 1).trimEnd() + '…';
}

const ETICHETTA_CAUSALE: Record<CausaleOre, string> = {
  ordinario: 'Ordinario',
  straordinario: 'Straordinario',
  viaggio: 'Viaggio',
  sabato: 'Sabato',
  notturno: 'Notturne',
  trasferta: 'Trasferta',
  formazione: 'Formazione',
  permesso: 'Permesso/Ferie',
  malattia: 'Malattia',
};

const ETICHETTA_SPESA: Record<CategoriaSpesa, string> = {
  ristorante: 'Pasto',
  albergo: 'Pernottamento',
  carburante: 'Carburante',
  altro: 'Spesa',
};

/** `450` → `7:30`. Le ore si leggono cosi' in tutto Kantiere. */
export function oreHMM(minuti: number): string {
  const m = Math.max(0, Math.round(minuti));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Descrizione ORE.
 * → `Ordinario · 7:30 · Rossi Mario · Fincantieri Monfalcone`
 */
export function descrizioneOre(input: {
  causale: CausaleOre;
  durataMin: number;
  persona?: string | null;
  /** Nome leggibile del cantiere/commessa, per l'occhio di chi sta in ufficio. */
  commessa?: string | null;
  nota?: string | null;
  /** Tetto del gestionale, se piu' stretto del nostro. */
  max?: number;
}): string {
  return componiDescrizione(
    [
    ETICHETTA_CAUSALE[input.causale],
    oreHMM(input.durataMin),
    input.persona,
    input.commessa,
    input.nota,
    ],
    input.max,
  );
}

/**
 * Descrizione VIAGGIO/KM. Il gestionale non ha un campo dipendente sui
 * documenti, quindi persona e ruolo entrano qui — ed e' il motivo per cui il
 * formato dev'essere sempre lo stesso: e' l'unico modo perche' in ufficio si
 * capisca a colpo d'occhio a chi si riferisce la riga.
 *
 * → `Viaggio 03/08/2026 · Rossi Mario (autista) · Sede Verona → Fincantieri Monfalcone · 50 km`
 */
export function descrizioneViaggio(input: {
  data: string;
  km: number;
  ruolo: RuoloViaggio;
  persona?: string | null;
  partenza?: string | null;
  arrivo?: string | null;
  max?: number;
}): string {
  const tratta =
    input.partenza && input.arrivo
      ? `${input.partenza} → ${input.arrivo}`
      : input.arrivo || input.partenza || null;
  return componiDescrizione(
    [
      `Viaggio ${dataIt(input.data)}`,
    input.persona ? `${input.persona} (${input.ruolo})` : `(${input.ruolo})`,
    tratta,
      `${input.km} km`,
    ],
    input.max,
  );
}

/**
 * Descrizione SPESA.
 * → `Pasto 03/08/2026 · Ristorante La Borsa · Rossi Mario · 2 pers. · Fincantieri Monfalcone`
 */
export function descrizioneSpesa(input: {
  data: string;
  categoria: CategoriaSpesa;
  fornitore?: string | null;
  persona?: string | null;
  numPersone?: number | null;
  commessa?: string | null;
  max?: number;
}): string {
  return componiDescrizione(
    [
      `${ETICHETTA_SPESA[input.categoria]} ${dataIt(input.data)}`,
    input.fornitore,
    input.persona,
    input.numPersone && input.numPersone > 1 ? `${input.numPersone} pers.` : null,
      input.commessa,
    ],
    input.max,
  );
}

// ---------------------------------------------------------------------------
// Validazione prima dell'accodamento
// ---------------------------------------------------------------------------

/**
 * Quali riferimenti servono, per tipo di operazione.
 *
 * ⚠️ Questo NON e' una legge universale: e' una **richiesta del gestionale**.
 * Un ERP puo' pretendere il cliente su un documento di trasferta, un altro
 * accontentarsi della commessa. Percio' e' un parametro, non una costante
 * cablata: l'agente dichiara di cosa ha bisogno, Kommessa si limita a
 * verificarlo prima di accodare.
 */
export type RequisitiRiferimenti = Partial<
  Record<TipoOperazione, (keyof RiferimentiEsterni)[]>
>;

/**
 * Minimo indispensabile perche' un'operazione abbia senso in Kommessa, a
 * prescindere dal gestionale: senza sapere *chi* e *dove*, il dato non e'
 * attribuibile a nessuno. Tutto il resto lo chiede l'agente.
 */
export const REQUISITI_MINIMI: Required<RequisitiRiferimenti> = {
  ore: ['dipendente', 'commessa'],
  km: ['commessa'],
  spesa: ['commessa'],
};

/**
 * Elenco dei riferimenti mancanti; vuoto = si puo' accodare. Accodare
 * un'operazione senza le mappature necessarie significa produrre un errore
 * certo sull'agente: meglio fermarsi qui e dire all'ufficio *quale*
 * anagrafica va collegata.
 *
 * `extra` sono i requisiti aggiuntivi del gestionale di turno, letti dalla
 * config del tenant (es. per ERGO: il cliente sui documenti).
 */
export function riferimentiMancanti(
  payload: PayloadOperazione,
  extra?: RequisitiRiferimenti,
): (keyof RiferimentiEsterni)[] {
  const richiesti = new Set<keyof RiferimentiEsterni>([
    ...REQUISITI_MINIMI[payload.tipo],
    ...(extra?.[payload.tipo] ?? []),
  ]);
  return [...richiesti].filter((k) => {
    const v = payload.rif[k];
    return v === undefined || v === null || v === '';
  });
}

/** Errori strutturali che non dipendono dalle mappature. */
export function validaPayload(
  payload: PayloadOperazione,
  extra?: RequisitiRiferimenti,
): string[] {
  const errori: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.data)) {
    errori.push('data non e\' nel formato YYYY-MM-DD');
  }
  if (!payload.descrizione.trim()) errori.push('descrizione vuota');
  if (payload.tipo === 'ore' && payload.durataMin <= 0) {
    errori.push('durata deve essere maggiore di zero');
  }
  if (payload.tipo === 'km' && payload.km <= 0) {
    errori.push('km devono essere maggiori di zero');
  }
  if (payload.tipo === 'spesa' && payload.importoEur <= 0) {
    errori.push('importo deve essere maggiore di zero');
  }
  const mancanti = riferimentiMancanti(payload, extra);
  if (mancanti.length) {
    errori.push(`anagrafiche non collegate al gestionale: ${mancanti.join(', ')}`);
  }
  return errori;
}

/** Stati di una riga di outbox. */
export type StatoOutbox =
  | 'in_attesa'
  | 'in_corso'
  | 'inviato'
  | 'errore'
  | 'annullato';
