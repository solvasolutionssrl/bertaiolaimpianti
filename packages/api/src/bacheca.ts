/**
 * La bacheca: un indirizzo da aprire su una televisione in ufficio, dove ogni
 * persona vede cosa le resta da fare.
 *
 * ## Com'è protetta, e perché così
 *
 * L'indirizzo è casuale (non indovinabile) **e** c'è una password. Due strati,
 * e sono diversi dal collegamento di una commessa — dove l'indirizzo *è* il
 * segreto, perché deve poter finire in un messaggio a un cliente.
 *
 * Qui no: l'indirizzo lo si batte una volta sul televisore e poi resta lì per
 * mesi. Un indirizzo che vive per mesi su uno schermo in una stanza dove passa
 * gente va protetto da qualcosa che non si legge guardando la barra del
 * browser. Quindi: password, e una sessione lunga (trenta giorni) perché una
 * televisione che chiede la password ogni mattina viene spenta.
 *
 * ⚠️ Chi ha l'indirizzo può provare le password a raffica. Per questo c'è un
 * blocco a tempo dopo un po' di tentativi: senza, una password di otto
 * caratteri su un indirizzo noto si trova.
 *
 * ## Cosa mostra
 *
 * Una casella per persona, con le cose da fare aperte che le sono assegnate.
 * Niente nomi di clienti, niente telefoni, niente indirizzi: su un televisore
 * in una stanza di passaggio ci sta il lavoro, non l'anagrafica.
 */

// ─────────────────────────── Accesso ───────────────────────────

/** Quanto dura la sessione di un televisore. Trenta giorni. */
export const BACHECA_GIORNI_SESSIONE = 30;

/** Byte casuali dell'indirizzo. 16 = 22 caratteri, non indovinabili. */
export const BACHECA_BYTE_TOKEN = 16;

/** Minimo della password. Più corta non la accettiamo. */
export const BACHECA_PASSWORD_MIN = 6;

/** Dopo quanti tentativi sbagliati si chiude la porta. */
export const BACHECA_MAX_TENTATIVI = 10;

/** Per quanto resta chiusa. */
export const BACHECA_BLOCCO_MINUTI = 15;

export interface StatoTentativi {
  /** Tentativi sbagliati di fila. */
  tentativi: number;
  /** Se c'è, prima di questo momento non si prova più. */
  bloccataFinoA: Date | string | null;
}

export type EsitoBlocco =
  | { bloccata: false; tentativiRimasti: number }
  | { bloccata: true; secondiRimasti: number };

function aData(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Si può provare una password adesso?
 *
 * Non solleva su dati storti: una data illeggibile in colonna vale «nessun
 * blocco», perché il verso giusto dell'errore qui è lasciar provare la
 * password — chi non la sa resta fuori comunque.
 */
export function statoBlocco(stato: StatoTentativi, adesso: Date): EsitoBlocco {
  const fino = aData(stato.bloccataFinoA);
  if (fino && fino.getTime() > adesso.getTime()) {
    return {
      bloccata: true,
      secondiRimasti: Math.ceil((fino.getTime() - adesso.getTime()) / 1000),
    };
  }
  const usati = Number.isFinite(stato.tentativi) ? Math.max(0, stato.tentativi) : 0;
  return { bloccata: false, tentativiRimasti: Math.max(0, BACHECA_MAX_TENTATIVI - usati) };
}

/**
 * I contatori dopo un tentativo sbagliato. Raggiunto il massimo, si blocca e
 * **si azzera il contatore**: il blocco è la punizione, non si cumula.
 */
export function dopoTentativoSbagliato(
  stato: StatoTentativi,
  adesso: Date,
): { tentativi: number; bloccataFinoA: Date | null } {
  const fino = aData(stato.bloccataFinoA);
  // Se era già bloccata, il tentativo non conta: la porta era chiusa.
  if (fino && fino.getTime() > adesso.getTime()) {
    return { tentativi: stato.tentativi, bloccataFinoA: fino };
  }
  const usati = (Number.isFinite(stato.tentativi) ? Math.max(0, stato.tentativi) : 0) + 1;
  if (usati >= BACHECA_MAX_TENTATIVI) {
    return {
      tentativi: 0,
      bloccataFinoA: new Date(adesso.getTime() + BACHECA_BLOCCO_MINUTI * 60_000),
    };
  }
  return { tentativi: usati, bloccataFinoA: null };
}

/** I contatori dopo un ingresso riuscito: si riparte da zero. */
export function dopoIngressoRiuscito(): { tentativi: number; bloccataFinoA: null } {
  return { tentativi: 0, bloccataFinoA: null };
}

export type EsitoPasswordBacheca = { ok: true } | { ok: false; motivo: string };

export function validaPasswordBacheca(password: unknown): EsitoPasswordBacheca {
  if (typeof password !== 'string' || password.trim() === '') {
    return { ok: false, motivo: 'Scegli una password.' };
  }
  if (password.length < BACHECA_PASSWORD_MIN) {
    return {
      ok: false,
      motivo: `La password è troppo corta: almeno ${BACHECA_PASSWORD_MIN} caratteri.`,
    };
  }
  if (password.length > 200) {
    return { ok: false, motivo: 'La password è troppo lunga.' };
  }
  return { ok: true };
}

/** L'indirizzo completo da battere sul televisore. */
export function urlBacheca(origine: string, token: string): string {
  return `${origine.replace(/\/+$/, '')}/tv/${token}`;
}

/** Scadenza della sessione di un televisore, da adesso. */
export function scadenzaSessione(da: Date): Date {
  return new Date(da.getTime() + BACHECA_GIORNI_SESSIONE * 24 * 60 * 60 * 1000);
}

// ─────────────────────── Cosa resta da fare ───────────────────────

/** Le priorità, dalla più urgente. Allineate a `@kommessa/api/priorita`. */
const PESO_PRIORITA: Record<string, number> = { urgente: 0, alta: 1, media: 2, bassa: 2 };

export interface CosaDaFare {
  id: string;
  titolo: string;
  priorita: string;
  /** ISO, o null se non ha una data. */
  scadenzaAt: string | null;
  /** A chi è assegnata. `null` = a nessuno. */
  assegnatoA: string | null;
  /** Il codice del lavoro, se ce n'è uno. Niente nomi di clienti. */
  codiceLavoro: string | null;
}

export interface Persona {
  userId: string;
  nome: string;
}

export interface CasellaBacheca {
  persona: Persona;
  cose: CosaDaFare[];
  /** Quante sono già oltre la data. */
  inRitardo: number;
}

/** Se una data è già passata rispetto a adesso. */
export function eInRitardo(scadenzaAt: string | null, adesso: Date): boolean {
  if (!scadenzaAt) return false;
  const d = new Date(scadenzaAt);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < adesso.getTime();
}

/**
 * In che ordine si leggono: prima quelle in ritardo, poi per urgenza, poi per
 * data, e a parità per titolo — così due aperture di fila mostrano la stessa
 * cosa nello stesso punto. Su uno schermo che nessuno tocca, un ordine che
 * balla è peggio di un ordine discutibile.
 */
export function ordinaCoseDaFare(cose: CosaDaFare[], adesso: Date): CosaDaFare[] {
  return [...cose].sort((a, b) => {
    const ra = eInRitardo(a.scadenzaAt, adesso) ? 0 : 1;
    const rb = eInRitardo(b.scadenzaAt, adesso) ? 0 : 1;
    if (ra !== rb) return ra - rb;

    const pa = PESO_PRIORITA[a.priorita] ?? 9;
    const pb = PESO_PRIORITA[b.priorita] ?? 9;
    if (pa !== pb) return pa - pb;

    // Chi ha una data viene prima di chi non ne ha: è una cosa con un termine.
    const da = a.scadenzaAt ? new Date(a.scadenzaAt).getTime() : Number.POSITIVE_INFINITY;
    const db = b.scadenzaAt ? new Date(b.scadenzaAt).getTime() : Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;

    return a.titolo.localeCompare(b.titolo, 'it');
  });
}

/**
 * Una casella per persona, nell'ordine in cui si guardano.
 *
 * **Tutte le persone, anche quelle senza niente**: su una bacheca «Mario: 4
 * cose, Luca: niente» dice due cose utili, mentre un elenco delle sole persone
 * occupate nasconde chi è libero — che è metà del motivo per cui si guarda.
 *
 * Chi ha di più viene prima; a parità, in ordine di nome. Le cose assegnate a
 * nessuno non compaiono in nessuna casella: hanno il loro posto, se il
 * chiamante vuole mostrarlo.
 */
export function componiBacheca(
  persone: Persona[],
  cose: CosaDaFare[],
  adesso: Date,
): CasellaBacheca[] {
  const perPersona = new Map<string, CosaDaFare[]>();
  for (const p of persone) perPersona.set(p.userId, []);
  for (const c of cose) {
    if (!c.assegnatoA) continue;
    const lista = perPersona.get(c.assegnatoA);
    // Una cosa assegnata a chi non è più nell'elenco (account chiuso) non si
    // perde in silenzio: il chiamante la ritrova con `coseOrfane`.
    if (lista) lista.push(c);
  }

  return persone
    .map((persona) => {
      const ordinate = ordinaCoseDaFare(perPersona.get(persona.userId) ?? [], adesso);
      return {
        persona,
        cose: ordinate,
        inRitardo: ordinate.filter((c) => eInRitardo(c.scadenzaAt, adesso)).length,
      };
    })
    .sort((a, b) => {
      if (a.cose.length !== b.cose.length) return b.cose.length - a.cose.length;
      return a.persona.nome.localeCompare(b.persona.nome, 'it');
    });
}

/**
 * Le cose assegnate a qualcuno che non è nell'elenco delle persone: account
 * chiusi, o persone rimosse. Senza questa funzione sparirebbero dalla bacheca
 * senza che nessuno se ne accorga — ed è proprio il lavoro che nessuno sta
 * guardando.
 */
export function coseOrfane(persone: Persona[], cose: CosaDaFare[]): CosaDaFare[] {
  const noti = new Set(persone.map((p) => p.userId));
  return cose.filter((c) => c.assegnatoA !== null && !noti.has(c.assegnatoA));
}

/** Quante cose ci sono in tutto nelle caselle: il numero grande in cima. */
export function totaleBacheca(caselle: CasellaBacheca[]): {
  cose: number;
  inRitardo: number;
  personeOccupate: number;
} {
  return {
    cose: caselle.reduce((n, c) => n + c.cose.length, 0),
    inRitardo: caselle.reduce((n, c) => n + c.inRitardo, 0),
    personeOccupate: caselle.filter((c) => c.cose.length > 0).length,
  };
}
