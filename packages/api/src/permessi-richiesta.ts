/**
 * La richiesta di ferie o permesso: conti e testi condivisi fra il foglio del
 * telefono e il dialog da computer del tecnico. Puro, senza React.
 */

export type StatoRichiesta = 'in_attesa' | 'approvato' | 'rifiutato' | 'modifica_richiesta';

export interface TipoOpt {
  codice: string;
  label: string;
  unita: 'giorni' | 'ore' | 'entrambi';
  oreDefault?: number | null;
  richiedeGiustificativo?: boolean;
}

export interface RichiestaVista {
  id: string;
  tipoLabel: string;
  dataInizio: string;
  dataFine: string;
  tuttoIlGiorno: boolean;
  oraInizio: string | null;
  oraFine: string | null;
  motivo: string | null;
  stato: StatoRichiesta;
  decisioneNota: string | null;
  creataIl?: string | null;
}

/** HH:MM spostato di `ore` (anche frazionarie), fermo a 23:59. */
export function addOre(hhmm: string, ore: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  let tot = (h ?? 0) * 60 + (m ?? 0) + Math.round(ore * 60);
  if (tot > 23 * 60 + 59) tot = 23 * 60 + 59;
  if (tot < 0) tot = 0;
  return `${String(Math.floor(tot / 60)).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`;
}

/** Minuti fra due HH:MM; negativo se la fine precede l'inizio. */
export function minutiFra(da: string, a: string): number {
  const [h1, m1] = da.split(':').map(Number);
  const [h2, m2] = a.split(':').map(Number);
  return (h2 ?? 0) * 60 + (m2 ?? 0) - ((h1 ?? 0) * 60 + (m1 ?? 0));
}

/** «4 ore», «1 ora e 30 min». */
export function testoDurata(minuti: number): string {
  if (minuti <= 0) return '—';
  const h = Math.floor(minuti / 60);
  const m = minuti % 60;
  if (h === 0) return `${m} min`;
  const ore = h === 1 ? '1 ora' : `${h} ore`;
  return m ? `${ore} e ${m} min` : ore;
}

/** Giorni di calendario fra due AAAA-MM-GG, estremi compresi. */
export function giorniFra(dal: string, al: string): number {
  const a = Date.parse(`${dal}T00:00:00Z`);
  const b = Date.parse(`${al}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

export function fmtData(iso: string, opts: { anno?: boolean } = {}): string {
  const [Y, M, D] = iso.split('-').map(Number);
  if (!Y || !M || !D) return iso;
  return new Date(Date.UTC(Y, M - 1, D)).toLocaleDateString('it-IT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(opts.anno ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
}

/** Quando, in una riga: «ven 24 ott · 08:00-12:00» oppure «lun 27 ott → mer 29 ott». */
export function fmtQuando(r: Pick<RichiestaVista, 'dataInizio' | 'dataFine' | 'tuttoIlGiorno' | 'oraInizio' | 'oraFine'>): string {
  if (!r.tuttoIlGiorno && r.oraInizio && r.oraFine) return `${fmtData(r.dataInizio)} · ${r.oraInizio}-${r.oraFine}`;
  return r.dataInizio === r.dataFine ? fmtData(r.dataInizio) : `${fmtData(r.dataInizio)} → ${fmtData(r.dataFine)}`;
}

/** La quantità: «3 giorni» o «4 ore». */
export function fmtQuantita(r: Pick<RichiestaVista, 'dataInizio' | 'dataFine' | 'tuttoIlGiorno' | 'oraInizio' | 'oraFine'>): string {
  if (!r.tuttoIlGiorno && r.oraInizio && r.oraFine) return testoDurata(minutiFra(r.oraInizio, r.oraFine));
  const n = giorniFra(r.dataInizio, r.dataFine);
  return n === 1 ? '1 giorno' : `${n} giorni`;
}

export const STATO_CLASSE: Record<StatoRichiesta, string> = {
  in_attesa: 'bg-amber-100 text-amber-800',
  approvato: 'bg-emerald-100 text-emerald-800',
  rifiutato: 'bg-rose-100 text-rose-800',
  modifica_richiesta: 'bg-sky-100 text-sky-800',
};

/** Cosa manca o non torna prima di inviare; null = si può inviare. */
export function controllaRichiesta(d: {
  tipo: string;
  aOre: boolean;
  dataInizio: string;
  dataFine: string;
  oraInizio: string;
  oraFine: string;
}): string | null {
  if (!d.tipo) return 'Scegliere il tipo di richiesta.';
  if (!d.dataInizio) return 'Indicare il giorno.';
  if (d.aOre) {
    if (!d.oraInizio || !d.oraFine) return 'Indicare l’ora di inizio e di fine.';
    if (minutiFra(d.oraInizio, d.oraFine) <= 0) return 'L’ora di fine deve essere dopo quella di inizio.';
    return null;
  }
  if (!d.dataFine) return 'Indicare l’ultimo giorno.';
  if (d.dataFine < d.dataInizio) return 'L’ultimo giorno non può precedere il primo.';
  return null;
}
