/**
 * Logica pura della pianificazione settimanale (modulo Dipendenti).
 *
 * Niente I/O, niente Date.now(): funzioni deterministiche testabili.
 *  - risoluzione fasce orarie (preset → orari 'HH:MM')
 *  - matematica settimana (lunedì, 7 giorni) su date 'YYYY-MM-DD'
 *  - rilevamento conflitti = sovrapposizione di intervalli per stessa entità
 *    (dipendente o mezzo) nello stesso giorno.
 */

export type Fascia = 'giornata' | 'mattina' | 'pomeriggio' | 'custom';

/** Preset orari di default (poi eventualmente configurabili per tenant). */
export const ORARI_FASCIA: Record<
  Exclude<Fascia, 'custom'>,
  { inizio: string; fine: string }
> = {
  giornata: { inizio: '08:00', fine: '17:00' },
  mattina: { inizio: '08:00', fine: '12:00' },
  pomeriggio: { inizio: '13:00', fine: '17:00' },
};

export const LABEL_FASCIA: Record<Fascia, string> = {
  giornata: 'Giornata',
  mattina: 'Mattina',
  pomeriggio: 'Pomeriggio',
  custom: 'Orario',
};

/**
 * Risolve una fascia in orari concreti 'HH:MM'. Per 'custom' usa gli orari
 * passati; per i preset ignora `custom`. Ritorna sempre inizio < fine se gli
 * input sono validi (il chiamante valida ulteriormente).
 */
export function risolviFascia(
  fascia: Fascia,
  custom?: { inizio?: string | null; fine?: string | null },
): { inizio: string; fine: string } {
  if (fascia === 'custom') {
    return {
      inizio: normalizzaOra(custom?.inizio) ?? '08:00',
      fine: normalizzaOra(custom?.fine) ?? '17:00',
    };
  }
  return ORARI_FASCIA[fascia];
}

/** 'HH:MM[:SS]' → 'HH:MM'; null/invalid → null. */
export function normalizzaOra(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}

/** Minuti dalla mezzanotte per 'HH:MM'. */
export function minutiDa(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

/**
 * Due intervalli orari 'HH:MM' si sovrappongono? Half-open: [inizio, fine).
 * Intervalli che si TOCCANO al confine (fine A == inizio B) NON confliggono.
 */
export function intervalliSovrapposti(
  aInizio: string,
  aFine: string,
  bInizio: string,
  bFine: string,
): boolean {
  return minutiDa(aInizio) < minutiDa(bFine) && minutiDa(bInizio) < minutiDa(aFine);
}

// ── Rilevamento conflitti ────────────────────────────────────────────

export interface VoceOccupazione {
  /** L'entità occupata: dipendenteId oppure mezzoId. */
  entita: string;
  /** Giorno 'YYYY-MM-DD'. */
  data: string;
  inizio: string; // 'HH:MM'
  fine: string; // 'HH:MM'
  /** Riferimento della voce (es. blocco id, o 'nuovo' per il candidato). */
  refId: string;
}

export interface Conflitto {
  entita: string;
  data: string;
  a: string; // refId
  b: string; // refId
}

/**
 * Tutte le coppie in conflitto (stessa entità, stesso giorno, orari sovrapposti).
 * Riuso: per i dipendenti (`entita`=dipendenteId) e per i mezzi (`entita`=mezzoId).
 * O(n²) per gruppo (giorni con pochi blocchi → irrilevante).
 */
export function rilevaConflitti(voci: VoceOccupazione[]): Conflitto[] {
  const perChiave = new Map<string, VoceOccupazione[]>();
  for (const v of voci) {
    const k = `${v.entita}|${v.data}`;
    const arr = perChiave.get(k);
    if (arr) arr.push(v);
    else perChiave.set(k, [v]);
  }
  const out: Conflitto[] = [];
  for (const arr of perChiave.values()) {
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i]!;
        const b = arr[j]!;
        if (a.refId === b.refId) continue;
        if (intervalliSovrapposti(a.inizio, a.fine, b.inizio, b.fine)) {
          out.push({ entita: a.entita, data: a.data, a: a.refId, b: b.refId });
        }
      }
    }
  }
  return out;
}

/**
 * Voci esistenti che si sovrappongono a un candidato (stessa entità, stesso
 * giorno). Usato in fase di creazione/modifica per avvisare l'ufficio prima
 * di salvare. Esclude eventuali voci con lo stesso `refId` del candidato
 * (utile in modifica: non confliggo con me stesso).
 */
export function sovrapposizioniPerCandidato(
  candidato: { entita: string; data: string; inizio: string; fine: string; refId?: string },
  esistenti: VoceOccupazione[],
): VoceOccupazione[] {
  return esistenti.filter(
    (e) =>
      e.entita === candidato.entita &&
      e.data === candidato.data &&
      e.refId !== candidato.refId &&
      intervalliSovrapposti(candidato.inizio, candidato.fine, e.inizio, e.fine),
  );
}

// ── Matematica settimana (date 'YYYY-MM-DD') ─────────────────────────

/** Aggiunge `n` giorni (anche negativi) a una data 'YYYY-MM-DD'. */
export function addGiorni(iso: string, n: number): string {
  const [Y, M, D] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(Y!, M! - 1, D! + n));
  return d.toISOString().slice(0, 10);
}

/** Lunedì (ISO week) della settimana che contiene `iso`. */
export function lunediDellaSettimana(iso: string): string {
  const [Y, M, D] = iso.split('-').map(Number);
  const dow = new Date(Date.UTC(Y!, M! - 1, D!)).getUTCDay(); // 0=dom..6=sab
  const offset = (dow + 6) % 7; // giorni da sottrarre per arrivare a lunedì
  return addGiorni(iso, -offset);
}

/** I 7 giorni (lun→dom) della settimana che inizia al `lunediISO`. */
export function giorniSettimana(lunediISO: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addGiorni(lunediISO, i));
}

export const NOMI_GIORNO_BREVI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

/**
 * Numero di settimana ISO-8601 (+ anno ISO) di una data 'YYYY-MM-DD'. L'anno ISO
 * può differire dall'anno civile a cavallo di dicembre/gennaio (es. 29/12/2025 =
 * settimana 1 del 2026). Deterministica (no Date.now). Usato per titolo ed export.
 */
export function settimanaISO(iso: string): { anno: number; settimana: number } {
  const [Y, M, D] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(Y!, M! - 1, D!));
  const dayNum = (d.getUTCDay() + 6) % 7; // lun=0..dom=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // giovedì della settimana ISO
  const anno = d.getUTCFullYear();
  const primoGio = new Date(Date.UTC(anno, 0, 4)); // il 4 gennaio è sempre in settimana 1
  const primoGioDayNum = (primoGio.getUTCDay() + 6) % 7;
  primoGio.setUTCDate(primoGio.getUTCDate() - primoGioDayNum + 3);
  const settimana = 1 + Math.round((d.getTime() - primoGio.getTime()) / (7 * 86400000));
  return { anno, settimana };
}

/**
 * Slug sicuro per nome file: minuscolo, senza accenti, non-alfanumerici → `_`.
 * Vuoto → 'gruppo'. Es. "Cantiere & Manutenzione" → "cantiere_manutenzione".
 */
export function slugPianificazione(s: string): string {
  const out = s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // toglie i segni diacritici combinanti
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return out || 'gruppo';
}
