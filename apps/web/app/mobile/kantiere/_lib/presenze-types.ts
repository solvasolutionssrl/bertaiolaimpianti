/**
 * Tipi puri (niente import server) condivisi tra l'helper server `presenze.ts`
 * e i componenti client che mostrano lo stato presenza di un dipendente
 * (cruscotto "ultime timbrature" e scheda cantiere "in cantiere ora").
 */

export type StatoPresenza = 'lavoro' | 'pausa' | 'idle';

export type CoppiaView = {
  /** Ora ingresso formattata HH:MM (Europe/Rome). */
  ingresso: string;
  /** Ora uscita formattata, o null se il segmento è ancora aperto. */
  uscita: string | null;
};

/** Stato presenza "di oggi" pronto per il render (mirror della riga presenze desktop). */
export type DettaglioPresenza = {
  stato: StatoPresenza;
  /** Es. "dalle 09:16" (al lavoro) o "in pausa dalle 12:00", o null. */
  dalleLabel: string | null;
  /** Ore lavorate oggi, formattate (es. "6h 12m"). */
  oreLavorate: string;
  /** Coppie ingresso→uscita della giornata (l'ultima può essere aperta). */
  coppie: CoppiaView[];
};
