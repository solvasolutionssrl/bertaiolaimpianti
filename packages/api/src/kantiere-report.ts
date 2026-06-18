export type RigaAgg = {
  chiaveDipendente: string;
  chiaveCommessa: string;
  ore_ordinarie: number;
  ore_straordinarie: number;
  ore_viaggio: number;
};

export type Aggregato = {
  ordinarie: number;
  straordinarie: number;
  viaggio: number;
  totale: number;
};

export function aggregaOre(
  righe: RigaAgg[],
  per: 'dipendente' | 'commessa',
): Map<string, Aggregato> {
  const out = new Map<string, Aggregato>();
  for (const r of righe) {
    const chiave = per === 'dipendente' ? r.chiaveDipendente : r.chiaveCommessa;
    const cur = out.get(chiave) ?? { ordinarie: 0, straordinarie: 0, viaggio: 0, totale: 0 };
    cur.ordinarie = round2(cur.ordinarie + r.ore_ordinarie);
    cur.straordinarie = round2(cur.straordinarie + r.ore_straordinarie);
    cur.viaggio = round2(cur.viaggio + r.ore_viaggio);
    cur.totale = round2(cur.ordinarie + cur.straordinarie + cur.viaggio);
    out.set(chiave, cur);
  }
  return out;
}

export type TimbraturaGiorno = {
  dipendente_id: string;
  commessa_id: string;
  giorno: string; // YYYY-MM-DD
  tipo: 'ingresso' | 'uscita';
};

export function giornateIncomplete(
  timbrature: TimbraturaGiorno[],
): { dipendente_id: string; commessa_id: string; giorno: string }[] {
  const conteggi = new Map<string, { in: number; out: number; t: TimbraturaGiorno }>();
  for (const t of timbrature) {
    const k = `${t.dipendente_id}|${t.commessa_id}|${t.giorno}`;
    const cur = conteggi.get(k) ?? { in: 0, out: 0, t };
    if (t.tipo === 'ingresso') cur.in += 1;
    else cur.out += 1;
    conteggi.set(k, cur);
  }
  const out: { dipendente_id: string; commessa_id: string; giorno: string }[] = [];
  for (const { in: i, out: o, t } of conteggi.values()) {
    if (i !== o) out.push({ dipendente_id: t.dipendente_id, commessa_id: t.commessa_id, giorno: t.giorno });
  }
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
