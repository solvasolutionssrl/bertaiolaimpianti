export type Timbratura = {
  commessa_id: string;
  tipo: 'ingresso' | 'uscita';
  ts: string; // ISO
};

/** Accoppia ingresso→uscita per commessa e somma i minuti lavorati. */
export function minutiPerCommessa(timbrature: Timbratura[]): Map<string, number> {
  const perCommessa = new Map<string, Timbratura[]>();
  for (const t of timbrature) {
    const arr = perCommessa.get(t.commessa_id) ?? [];
    arr.push(t);
    perCommessa.set(t.commessa_id, arr);
  }
  const out = new Map<string, number>();
  for (const [commessa, arr] of perCommessa) {
    const sorted = [...arr].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    let aperto: number | null = null;
    let minuti = 0;
    for (const t of sorted) {
      if (t.tipo === 'ingresso') {
        if (aperto === null) aperto = Date.parse(t.ts);
        // doppio ingresso: ignora il secondo (resta aperto il primo)
      } else {
        if (aperto !== null) {
          minuti += Math.round((Date.parse(t.ts) - aperto) / 60000);
          aperto = null;
        }
        // uscita orfana: ignorata
      }
    }
    out.set(commessa, minuti);
  }
  return out;
}

export type RigaOre = {
  commessa_id: string;
  ore_ordinarie: number;
  ore_straordinarie: number;
};
export type RisultatoOre = { righe: RigaOre[]; ore_viaggio: number };

function oreDaMinuti(min: number): number {
  return Math.round((min / 60) * 100) / 100;
}

/** Suggerimento ore giornata: prime `soglia` ore ordinarie (riempimento
 *  sequenziale per ordine input), eccedenza straordinario, viaggio separato. */
export function calcolaOreGiornata(input: {
  minutiLavoratiPerCommessa: { commessa_id: string; minuti: number }[];
  minutiViaggio?: number;
  sogliaOreOrdinarie?: number;
}): RisultatoOre {
  const sogliaMin = (input.sogliaOreOrdinarie ?? 8) * 60;
  let restanteOrd = sogliaMin;
  const righe: RigaOre[] = input.minutiLavoratiPerCommessa.map(({ commessa_id, minuti }) => {
    const ord = Math.min(restanteOrd, minuti);
    const straord = minuti - ord;
    restanteOrd -= ord;
    return {
      commessa_id,
      ore_ordinarie: oreDaMinuti(ord),
      ore_straordinarie: oreDaMinuti(straord),
    };
  });
  return { righe, ore_viaggio: oreDaMinuti(input.minutiViaggio ?? 0) };
}

// ── Riepilogo timbrature giornata (per UI ufficio) ──────────────────────────

export interface CoppiaTimbratura {
  /** ISO timestamp dell'ingresso. */
  ingresso: string;
  /** ISO timestamp dell'uscita, o null se la giornata è ancora aperta. */
  uscita: string | null;
  /** Minuti lavorati nella coppia, o null se ancora aperta. */
  minuti: number | null;
}

export interface RiepilogoTimbrature {
  /** Coppie ingresso→uscita in ordine cronologico (l'ultima può essere aperta). */
  coppie: CoppiaTimbratura[];
  /** Somma minuti delle coppie chiuse. */
  minutiTotali: number;
  /** True se c'è un ingresso senza uscita (sta lavorando in questo momento). */
  aperto: boolean;
  /** ISO dell'ingresso ancora aperto (per il contatore live), o null. */
  ingressoAperto: string | null;
  /** True se l'ultimo evento è un'uscita di pausa (turno aperto ma in pausa). */
  inPausa: boolean;
  /** ISO dell'inizio pausa in corso, o null. */
  inizioPausa: string | null;
}

/** Stato corrente del turno di un dipendente su un target, in un giorno.
 *  - idle  = nessun turno aperto (mai iniziato, o già terminato)
 *  - lavoro = turno aperto e sta lavorando (orologio in marcia)
 *  - pausa = turno aperto ma in pausa pranzo (orologio fermo) */
export type StatoTurno = 'idle' | 'lavoro' | 'pausa';

export interface InfoTurno {
  stato: StatoTurno;
  /** ISO dell'ingresso aperto se sta lavorando (per contatore), o null. */
  ingressoAperto: string | null;
  /** ISO dell'inizio pausa se in pausa, o null. */
  inizioPausa: string | null;
}

/**
 * Determina lo stato del turno dall'ultimo evento cronologico.
 * `pausa` distingue l'uscita/ingresso di pausa pranzo da inizio/fine turno.
 */
export function statoTurno(
  eventi: { tipo: 'ingresso' | 'uscita'; ts: string; pausa?: boolean | null }[],
): InfoTurno {
  const sorted = [...eventi].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const ultimo = sorted[sorted.length - 1];
  if (!ultimo) return { stato: 'idle', ingressoAperto: null, inizioPausa: null };
  if (ultimo.tipo === 'ingresso') {
    return { stato: 'lavoro', ingressoAperto: ultimo.ts, inizioPausa: null };
  }
  // ultimo è un'uscita: pausa → turno in pausa; altrimenti → turno chiuso
  if (ultimo.pausa) return { stato: 'pausa', ingressoAperto: null, inizioPausa: ultimo.ts };
  return { stato: 'idle', ingressoAperto: null, inizioPausa: null };
}

/**
 * Accoppia ingresso→uscita di una giornata (ordine cronologico) e calcola i
 * minuti di ogni segmento + il totale. L'ultima coppia resta "aperta" se manca
 * l'uscita (giornata in corso). Doppio ingresso e uscita orfana sono ignorati,
 * coerentemente con `minutiPerCommessa`.
 */
export function appaiaTimbrature(
  timbrature: { tipo: 'ingresso' | 'uscita'; ts: string; pausa?: boolean | null }[],
): RiepilogoTimbrature {
  const sorted = [...timbrature].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const coppie: CoppiaTimbratura[] = [];
  let aperto: string | null = null;
  for (const t of sorted) {
    if (t.tipo === 'ingresso') {
      if (aperto === null) aperto = t.ts; // doppio ingresso: tiene il primo
    } else if (aperto !== null) {
      const minuti = Math.max(0, Math.round((Date.parse(t.ts) - Date.parse(aperto)) / 60000));
      coppie.push({ ingresso: aperto, uscita: t.ts, minuti });
      aperto = null;
    }
    // uscita orfana: ignorata
  }
  if (aperto !== null) coppie.push({ ingresso: aperto, uscita: null, minuti: null });
  const minutiTotali = coppie.reduce((acc, c) => acc + (c.minuti ?? 0), 0);
  // "In pausa" = l'ultimo evento è un'uscita di pausa (turno aperto ma fermo).
  const ultimo = sorted[sorted.length - 1];
  const inPausa = !!ultimo && ultimo.tipo === 'uscita' && !!ultimo.pausa;
  return {
    coppie,
    minutiTotali,
    aperto: aperto !== null,
    ingressoAperto: aperto,
    inPausa,
    inizioPausa: inPausa ? ultimo.ts : null,
  };
}

/** Toggle del bottone Timbra dalle timbrature odierne (ordinate asc). */
export function prossimoTipoTimbratura(
  odierne: { tipo: 'ingresso' | 'uscita' }[],
): 'ingresso' | 'uscita' {
  const ultima = odierne[odierne.length - 1];
  return ultima?.tipo === 'ingresso' ? 'uscita' : 'ingresso';
}

/** Arrotonda i minuti di percorrenza al quarto d'ora più vicino.
 *  Una tratta con durata > 0 non scende mai sotto i 15 minuti. */
export function arrotonda15(minuti: number): number {
  if (!Number.isFinite(minuti) || minuti <= 0) return 0;
  const r = Math.round(minuti / 15) * 15;
  return r === 0 ? 15 : r;
}

/** Arrotonda i minuti al multiplo di `stepMin` più vicino.
 *  - `stepMin < 1` DISATTIVA l'arrotondamento (dettaglio pieno: ritorna i minuti).
 *  - con uno step valido, una durata > 0 non scende mai sotto un singolo step
 *    (coerente con `arrotonda15`: es. 4 min con step 5 → 5).
 *  Usato per l'arrotondamento configurabile di viaggio (default 5) e ore-lavoro
 *  (default 0 = nessun arrotondamento, si raccoglie tutto a dettaglio massimo). */
export function arrotondaA(minuti: number, stepMin: number): number {
  if (!Number.isFinite(minuti) || minuti <= 0) return 0;
  if (!Number.isFinite(stepMin) || stepMin < 1) return Math.round(minuti);
  const step = Math.round(stepMin);
  const r = Math.round(minuti / step) * step;
  return r === 0 ? step : r;
}

/** Soglia (ore) oltre la quale, in uscita, se NON risulta alcuna pausa pranzo
 *  registrata si chiede al dipendente di dichiararla (ripiego: l'ideale è
 *  timbrarla). Condivisa client+server per coerenza del prompt. */
export const SOGLIA_PAUSA_PRANZO_ORE = 6;

/** Soglia (ore) di default oltre la quale una giornata NON si auto-approva e
 *  diventa un'anomalia "da verificare" (turno troppo lungo). Configurabile per
 *  tenant (`anomalia_turno_ore_max`). */
export const SOGLIA_ANOMALIA_TURNO_ORE = 10;

export type EsitoAutoApprovazione = {
  /** true se la giornata può essere auto-approvata dal sistema. */
  autoApprova: boolean;
  /** Perché no: nessun turno, turno aperto/incompleto, oltre la soglia ore. */
  motivo: 'ok' | 'nessun_turno' | 'aperto' | 'oltre_soglia';
};

/**
 * Decide se una giornata di timbrature può essere AUTO-APPROVATA (vale per tutti
 * i tenant con modulo kantiere). Regola:
 *  - serve almeno un turno (ingressi > 0);
 *  - giornata CHIUSA (ingressi === uscite: nessun turno aperto/incompleto);
 *  - ore lavorate totali (pause escluse) entro la soglia.
 * Altrimenti resta "da verificare" (bozza) per l'ufficio.
 *
 * `minutiLavoratiTotali` = minuti effettivi lavorati nel giorno, pause escluse
 * (es. somma di `minutiPerCommessa`). Viaggio non incluso.
 */
export function esitoAutoApprovazione(input: {
  ingressi: number;
  uscite: number;
  minutiLavoratiTotali: number;
  sogliaOreMax: number;
}): EsitoAutoApprovazione {
  const { ingressi, uscite, minutiLavoratiTotali, sogliaOreMax } = input;
  if (ingressi <= 0) return { autoApprova: false, motivo: 'nessun_turno' };
  if (ingressi !== uscite) return { autoApprova: false, motivo: 'aperto' };
  const soglia = Number.isFinite(sogliaOreMax) && sogliaOreMax > 0 ? sogliaOreMax : SOGLIA_ANOMALIA_TURNO_ORE;
  if (minutiLavoratiTotali > soglia * 60) return { autoApprova: false, motivo: 'oltre_soglia' };
  return { autoApprova: true, motivo: 'ok' };
}

/** Somma i minuti di viaggio (andata + ritorno) per ciascun target
 *  (chiave sintetica commessa:/cantiere:). Usato dal precompila rapportino
 *  per riempire ore_viaggio della riga corrispondente. */
export function minutiViaggioPerTarget(
  viaggi: { targetKey: string; minuti: number }[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const v of viaggi) {
    if (!v.targetKey) continue;
    out.set(v.targetKey, (out.get(v.targetKey) ?? 0) + (v.minuti || 0));
  }
  return out;
}
