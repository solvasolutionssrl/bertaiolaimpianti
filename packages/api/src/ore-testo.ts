/**
 * Le ore scritte a mano, in qualunque forma venga naturale (24/10/2026).
 *
 * Il campo delle ore nel dialog da scrivania mostrava un numero di minuti con
 * uno zero fisso che andava cancellato ogni volta. Qui si legge cio' che una
 * persona scrive davvero e lo si porta a minuti:
 *   «7:30» «7.30»? no: il punto e la virgola sono DECIMALI («7,5» = 7:30);
 *   «730» e «0730» = 7:30; «7h30» «7h» «7 h 30» = 7:30 / 7:00;
 *   «90m» «90 min» = 90 minuti; un intero nudo fino a 24 sono ORE («8» = 8:00),
 *   oltre sono MINUTI («90» = 1:30, come si scriveva prima).
 * Vuoto = 0. Qualcosa che non si capisce = null (il campo lo dice).
 */
export function minutiDaTesto(testo: string): number | null {
  const t = testo.trim().toLowerCase().replace(/\s+/g, '');
  if (t === '') return 0;
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^(\d{1,2}):(\d{1,2})$/))) return +m[1]! * 60 + +m[2]!;
  if ((m = t.match(/^(\d{1,2})h(\d{1,2})?(m|min)?$/))) return +m[1]! * 60 + (m[2] ? +m[2] : 0);
  if ((m = t.match(/^(\d+)(m|min|')$/))) return +m[1]!;
  if ((m = t.match(/^(\d{1,2})[.,](\d{1,2})$/))) {
    const dec = m[2]!.length === 1 ? +m[2]! / 10 : +m[2]! / 100;
    return Math.round((+m[1]! + dec) * 60);
  }
  if ((m = t.match(/^(\d{3,4})$/))) {
    const s = m[1]!.padStart(4, '0');
    const h = +s.slice(0, 2);
    const mm = +s.slice(2);
    return mm < 60 ? h * 60 + mm : null;
  }
  if ((m = t.match(/^(\d{1,2})$/))) return +m[1]! <= 24 ? +m[1]! * 60 : +m[1]!;
  return null;
}

/** «7:30»; zero = stringa vuota, cosi' il campo non mostra niente da cancellare. */
export function testoDaMinuti(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return '';
  const m = Math.round(min);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}
