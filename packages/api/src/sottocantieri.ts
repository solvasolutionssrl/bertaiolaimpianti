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

/**
 * ⚠️ Lo stesso obbligo su una SPESA o su una PIANIFICAZIONE non si dice con le
 * stesse parole: li' non si e' lavorato, si sta registrando o programmando.
 */
export const MESSAGGIO_FASE_RICHIESTA_SPESA = 'Questo cantiere ha delle fasi: indica a quale va questa spesa.';
export const MESSAGGIO_FASE_RICHIESTA_PIANIFICAZIONE =
  'Questo cantiere ha delle fasi: indica su quale e\' previsto il lavoro.';

/** Il messaggio che nomina i cantieri a cui manca la fase, invece di tacerlo. */
export function messaggioFaseRichiesta(nomi: readonly string[], base = MESSAGGIO_FASE_RICHIESTA): string {
  const puliti = nomi.map((n) => n.trim()).filter(Boolean);
  if (puliti.length === 0) return base;
  if (puliti.length === 1) return base.replace('Questo cantiere', `Il cantiere ${puliti[0]}`);
  return base.replace('Questo cantiere ha delle fasi', `Questi cantieri hanno delle fasi: ${puliti.join(', ')}`);
}

export type DecisioneFase<T> =
  | { modo: 'nessuna' }
  | { modo: 'automatica'; fase: T }
  | { modo: 'chiedi'; fasi: T[]; obbligatoria: boolean };

/**
 * Chiedere la fase, prenderla da soli, o lasciar perdere.
 *
 * La regola, decisa da Luca il 26/10/2026: **dove le fasi sono piu' d'una la
 * scelta e' obbligatoria; dove ce n'e' una sola si prende quella senza
 * chiedere.** Una domanda con una risposta sola non e' una domanda: e' un
 * tocco in piu' che qualcuno dimentichera'.
 *
 * ⚠️ L'automatismo vale **solo dove il cliente pretende la fase**
 * (`fase_obbligatoria`). Senza quel flag, riempire da soli una colonna che
 * finora restava vuota cambierebbe in silenzio cio' che esce verso il
 * gestionale, e l'invariante e' che nessuna riga esistente cambi.
 */
export function decidiFase<T extends { id: string; stato?: string | null }>(
  fasi: readonly T[] | null | undefined,
  { obbligatoria = false }: { obbligatoria?: boolean } = {},
): DecisioneFase<T> {
  const attive = fasiScegibili(fasi);
  if (attive.length === 0) return { modo: 'nessuna' };
  if (attive.length === 1 && obbligatoria) return { modo: 'automatica', fase: attive[0]! };
  return { modo: 'chiedi', fasi: attive, obbligatoria };
}

/**
 * L'ordine in cui si mostrano le fasi, ovunque: per codice con i numeri in
 * ordine naturale («25151.2» prima di «25151.10»), poi per nome. Era scritto
 * due volte (picker del telefono e API) con lo stesso comparatore: una copia
 * sola, cosi' il giorno che cambia cambia dappertutto.
 */
export function ordinaFasi<T extends { codice: string | null; nome: string }>(fasi: readonly T[] | null | undefined): T[] {
  return [...(fasi ?? [])].sort(
    (a, b) => (a.codice ?? '').localeCompare(b.codice ?? '', 'it', { numeric: true }) || a.nome.localeCompare(b.nome, 'it'),
  );
}
