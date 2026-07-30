/**
 * Politica pura della coda di upload: chi parte, quando si ritenta, quando si
 * rinuncia. Nessun React, nessun DOM → unit-testabile.
 *
 * ─── Perché esiste (bug del 30/07/2026) ────────────────────────────────────
 * Il `pump` del provider selezionava i candidati guardando SOLO
 * `status === 'queued'` e **ignorando `nextAttemptAt`**, mentre il commento
 * accanto diceva il contrario. Siccome `pump()` viene richiamato nel `finally`
 * del job appena fallito, il retry ripartiva **istantaneamente**: il backoff
 * esponenziale non ha mai avuto alcun effetto e i 5 tentativi si bruciavano in
 * pochi secondi.
 *
 * Vedi `documentazione_generale/08_LOGICHE/Logiche_Upload_Media.md`.
 */

export const MAX_TENTATIVI = 5;

/** Attesa prima del tentativo N (indice 0 = dopo il 1° fallimento). */
export const RITARDI_RETRY_MS: readonly number[] = [
  2_000, // 2s
  8_000, // 8s
  30_000, // 30s
  120_000, // 2min
  600_000, // 10min
];

/** Stati in cui un job occupa uno slot del pool. */
export const STATI_ATTIVI = ['init', 'uploading', 'finalizing'] as const;

/** Vista minima di un job: qualunque oggetto con questi campi va bene. */
export interface JobPolicy {
  id: string;
  status: string;
  nextAttemptAt: number | null;
}

export function occupaSlot(status: string): boolean {
  return (STATI_ATTIVI as readonly string[]).includes(status);
}

/**
 * Un job in coda è pronto se non ha un `nextAttemptAt` futuro.
 * È QUI che vive il backoff: senza questo controllo i retry partono subito.
 */
export function prontoPerPartire(job: JobPolicy, ora: number): boolean {
  if (job.status !== 'queued') return false;
  if (job.nextAttemptAt != null && job.nextAttemptAt > ora) return false;
  return true;
}

/** Id dei job da avviare adesso, rispettando slot liberi e backoff. */
export function jobDaAvviare(opzioni: {
  jobs: readonly JobPolicy[];
  ora: number;
  maxConcorrenti: number;
  /** Job già dispatchati al worker (per non partire due volte). */
  inEsecuzione: ReadonlySet<string>;
}): string[] {
  const { jobs, ora, maxConcorrenti, inEsecuzione } = opzioni;
  const attivi = jobs.filter((j) => occupaSlot(j.status)).length;
  const liberi = maxConcorrenti - attivi;
  if (liberi <= 0) return [];
  return jobs
    .filter((j) => !inEsecuzione.has(j.id) && prontoPerPartire(j, ora))
    .slice(0, liberi)
    .map((j) => j.id);
}

/**
 * Fra quanti ms va risvegliato il pump perché un retry in attesa diventi
 * eleggibile. `null` se non c'è nulla in attesa.
 */
export function prossimoRisveglioMs(
  jobs: readonly JobPolicy[],
  ora: number,
): number | null {
  const futuri = jobs
    .filter(
      (j) =>
        j.status === 'queued' && j.nextAttemptAt != null && j.nextAttemptAt > ora,
    )
    .map((j) => j.nextAttemptAt as number);
  if (futuri.length === 0) return null;
  return Math.max(50, Math.min(...futuri) - ora + 10);
}

export type EsitoTentativo =
  | { status: 'canceled'; attempt: number; nextAttemptAt: null }
  | { status: 'failed'; attempt: number; nextAttemptAt: null }
  | { status: 'queued'; attempt: number; nextAttemptAt: number };

/**
 * Cosa fare dopo un tentativo fallito.
 * `tentativiFatti` = valore di `attempt` PRIMA di questo fallimento.
 */
export function esitoTentativoFallito(opzioni: {
  tentativiFatti: number;
  annullato: boolean;
  ora: number;
  maxTentativi?: number;
}): EsitoTentativo {
  const { tentativiFatti, annullato, ora } = opzioni;
  const maxTentativi = opzioni.maxTentativi ?? MAX_TENTATIVI;
  const attempt = tentativiFatti + 1;
  if (annullato) return { status: 'canceled', attempt, nextAttemptAt: null };
  if (attempt >= maxTentativi) {
    return { status: 'failed', attempt, nextAttemptAt: null };
  }
  const ritardo =
    RITARDI_RETRY_MS[Math.min(attempt - 1, RITARDI_RETRY_MS.length - 1)] ??
    60_000;
  return { status: 'queued', attempt, nextAttemptAt: ora + ritardo };
}

/**
 * Un job che è stato ripreso da IndexedDB dopo la chiusura dell'app è
 * "in ripresa": l'utente aveva già iniziato a caricarlo in una sessione
 * precedente. Serve alla UI per distinguerlo dai file appena aggiunti.
 */
export function eInRipresa(job: { ripreso?: boolean | null }): boolean {
  return job.ripreso === true;
}
