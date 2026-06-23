/**
 * Utility fuso orario Europe/Rome (UTC+1 inverno / UTC+2 estate DST).
 *
 * Il server gira in UTC: per ragionare sul "giorno italiano" e su orari
 * digitati dall'ufficio servono conversioni esplicite. Funzioni pure, niente
 * dipendenze esterne (usano solo Intl).
 */

/** Offset di Europe/Rome in minuti per un dato istante (es. +60 inverno, +120 estate). */
export function romeOffsetMinutes(instant: Date): number {
  // toLocaleString rende il wall-clock nel fuso indicato; ri-parsandolo nel
  // fuso locale del runtime per entrambi (UTC e Rome) la differenza è l'offset.
  const utc = new Date(instant.toLocaleString('en-US', { timeZone: 'UTC' }));
  const rome = new Date(instant.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
  return Math.round((rome.getTime() - utc.getTime()) / 60000);
}

/** Giorno calendario Europe/Rome ('YYYY-MM-DD') per un istante. */
export function romeDay(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(instant);
}

/**
 * Converte un orario "da muro" italiano (giorno 'YYYY-MM-DD' + 'HH:MM') nell'ISO
 * UTC corrispondente. Es. ('2026-07-15','08:00') → '2026-07-15T06:00:00.000Z'.
 */
export function romeWallToUtcIso(day: string, hhmm: string): string {
  const dp = day.split('-');
  const tp = hhmm.split(':');
  const Y = Number(dp[0]);
  const M = Number(dp[1]);
  const D = Number(dp[2]);
  const h = Number(tp[0]);
  const mi = Number(tp[1]);
  // Interpreta i componenti come se fossero UTC, poi sottrai l'offset di Rome.
  const asIfUtc = Date.UTC(Y, M - 1, D, h, mi, 0);
  const offset = romeOffsetMinutes(new Date(asIfUtc));
  return new Date(asIfUtc - offset * 60000).toISOString();
}

/**
 * Estremi UTC del giorno italiano: [giorno 00:00 Rome, giorno+1 00:00 Rome).
 * Per query `ts >= fromIso AND ts < toIso` che selezionano le timbrature del
 * giorno calendario italiano esatto.
 */
export function romeDayBoundsUtc(day: string): { fromIso: string; toIso: string } {
  const fromIso = romeWallToUtcIso(day, '00:00');
  const dp = day.split('-');
  const Y = Number(dp[0]);
  const M = Number(dp[1]);
  const D = Number(dp[2]);
  const nextDay = new Date(Date.UTC(Y, M - 1, D + 1)).toISOString().slice(0, 10);
  const toIso = romeWallToUtcIso(nextDay, '00:00');
  return { fromIso, toIso };
}
