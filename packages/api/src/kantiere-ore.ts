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
