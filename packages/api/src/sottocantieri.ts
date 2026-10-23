/**
 * Sottocantieri (fasi) di un cantiere — il vocabolario condiviso.
 *
 * Dal 23/10/2026 un cantiere del mondo Kantiere puo' avere delle fasi, e le
 * ore si possono attribuire a una fase. Il **luogo** di una riga di lavoro e'
 * quindi una coppia: il cantiere, sempre, e la fase, facoltativa.
 *
 * Tutti i motori delle ore raggruppano per una chiave testuale
 * (`cantiere:<id>`): la fase entra nella chiave come suffisso
 * (`cantiere:<id>/<fase>`), cosi' le righe nascono per fase e il totale per
 * cantiere si ottiene sommando. Il viaggio resta per cantiere: chi lo
 * attribuisce confronta la **radice** della chiave (`radiceChiave`).
 *
 * I pannelli che fanno scegliere un cantiere ricevono un valore unico per
 * voce: `valoreLuogo` / `luogoDaValore` (`<cantiere>` oppure `<cantiere>/<fase>`).
 */

export interface Luogo {
  cantiereId: string;
  sottocantiereId: string | null;
}

/** Cio' che un pannello di scelta deve sapere di una fase. */
export interface SottocantiereLite {
  id: string;
  nome: string;
  codice: string | null;
  descrizione?: string | null;
  stato?: 'attivo' | 'chiuso' | string | null;
}

/** Fra il nome del cantiere e quello della fase, a video. */
export const SEPARATORE_FASE = ' › ';

export function chiaveCantiere(cantiereId: string, sottocantiereId?: string | null): string {
  return sottocantiereId ? `cantiere:${cantiereId}/${sottocantiereId}` : `cantiere:${cantiereId}`;
}

/** La chiave senza la fase: `cantiere:<id>/<fase>` → `cantiere:<id>`. */
export function radiceChiave(chiave: string): string {
  const i = chiave.indexOf('/');
  return i < 0 ? chiave : chiave.slice(0, i);
}

/** La fase dentro una chiave, se c'e'. */
export function faseDiChiave(chiave: string): string | null {
  const i = chiave.indexOf('/');
  return i < 0 ? null : chiave.slice(i + 1) || null;
}

export function luogoDaChiave(chiave: string): Luogo | null {
  if (!chiave.startsWith('cantiere:')) return null;
  const corpo = chiave.slice('cantiere:'.length);
  const i = corpo.indexOf('/');
  if (i < 0) return corpo ? { cantiereId: corpo, sottocantiereId: null } : null;
  const cantiereId = corpo.slice(0, i);
  return cantiereId ? { cantiereId, sottocantiereId: corpo.slice(i + 1) || null } : null;
}

/** Il valore di una voce in un pannello di scelta: `<cantiere>` o `<cantiere>/<fase>`. */
export function valoreLuogo(cantiereId: string, sottocantiereId?: string | null): string {
  return sottocantiereId ? `${cantiereId}/${sottocantiereId}` : cantiereId;
}

export function luogoDaValore(valore: string | null | undefined): Luogo | null {
  if (!valore) return null;
  const i = valore.indexOf('/');
  if (i < 0) return { cantiereId: valore, sottocantiereId: null };
  const cantiereId = valore.slice(0, i);
  return cantiereId ? { cantiereId, sottocantiereId: valore.slice(i + 1) || null } : null;
}

export function stessoLuogo(a: Luogo, b: Luogo): boolean {
  return a.cantiereId === b.cantiereId && (a.sottocantiereId ?? null) === (b.sottocantiereId ?? null);
}

/** «Cantiere › Fase», o il solo cantiere. */
export function etichettaLuogo(cantiere: string, fase?: string | null): string {
  return fase ? `${cantiere}${SEPARATORE_FASE}${fase}` : cantiere;
}

/** Quante fasi ancora scegibili ha un cantiere (per il pallino nei pannelli). */
export function fasiScegibili<T extends { stato?: string | null }>(fasi: readonly T[] | null | undefined): T[] {
  return (fasi ?? []).filter((f) => !f.stato || f.stato === 'attivo');
}

/**
 * Il messaggio quando il cliente pretende la fase (`fase_obbligatoria`) e un
 * cantiere con fasi arriva senza: lo usano le interfacce per il codice
 * `FASE_RICHIESTA` del server.
 */
export const MESSAGGIO_FASE_RICHIESTA = 'Questo cantiere ha delle fasi: indica su quale hai lavorato.';
