/**
 * Mapping stato commessa → cartella fisica su Nextcloud.
 *
 * La macro-cartella del tenant (es. "Bertaiola Impianti") è la root del
 * workspace WebDAV → niente prefisso. Sotto la macro abbiamo 4 cartelle
 * di stato e ogni commessa vive in una di queste.
 *
 *   <macro>/01_Richieste/BER-26-007_Cliente_Lavoro/
 *   <macro>/02_In_Lavorazione/...
 *   <macro>/03_Completate/...
 *   <macro>/04_Archivio/...
 *
 * Lo stato "critica" è un flag UI (badge), NON una cartella separata:
 * la commessa critica resta dove sta (tipicamente 02_In_Lavorazione).
 */

import type { StatoCommessa } from '@impiantixplus/api/types';

export const STATUS_FOLDER_RICHIESTE = '01_Richieste';
export const STATUS_FOLDER_IN_LAVORAZIONE = '02_In_Lavorazione';
export const STATUS_FOLDER_COMPLETATE = '03_Completate';
export const STATUS_FOLDER_ARCHIVIO = '04_Archivio';

/** Ordine canonico per init delle cartelle nella macro tenant. */
export const ALL_STATUS_FOLDERS = [
  STATUS_FOLDER_RICHIESTE,
  STATUS_FOLDER_IN_LAVORAZIONE,
  STATUS_FOLDER_COMPLETATE,
  STATUS_FOLDER_ARCHIVIO,
] as const;

/**
 * Restituisce la sub-cartella di stato dove la commessa deve risiedere
 * fisicamente in funzione del suo `stato` corrente.
 *
 * `critica` è uno stato "trasversale" trattato come badge UI: la commessa
 * critica resta nella cartella corrispondente al suo workflow normale.
 * Per fallback prudente, qui ritorniamo `02_In_Lavorazione`.
 */
export function cloudFolderForStato(stato: StatoCommessa): string {
  switch (stato) {
    case 'bozza':
    case 'aperta':
      return STATUS_FOLDER_RICHIESTE;
    case 'in_corso':
    case 'collaudo':
      return STATUS_FOLDER_IN_LAVORAZIONE;
    case 'completata':
      return STATUS_FOLDER_COMPLETATE;
    case 'archiviata':
      return STATUS_FOLDER_ARCHIVIO;
    default: {
      const _exhaustive: never = stato;
      return _exhaustive;
    }
  }
}

/**
 * Estrae lo `<stato_folder>` da un cloud_folder_path tipo
 *   "/01_Richieste/BER-26-007_X/" → "01_Richieste"
 * Ritorna null se il path non è ancora migrato al nuovo schema.
 */
export function extractStatusFolder(cloudFolderPath: string): string | null {
  const m = cloudFolderPath.match(/^\/?([0-9]{2}_[A-Za-z_]+)\//);
  return m?.[1] ?? null;
}

/**
 * Costruisce un cloud_folder_path completo dato lo stato e il nome cartella.
 *   buildCloudFolderPath('bozza', 'BER-26-007_X') → '/01_Richieste/BER-26-007_X/'
 */
export function buildCloudFolderPath(
  stato: StatoCommessa,
  nomeCartella: string,
): string {
  return `/${cloudFolderForStato(stato)}/${nomeCartella}/`;
}
