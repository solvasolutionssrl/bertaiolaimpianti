/**
 * Tipi del progresso upload mostrato dalla `MediaAttachSection`.
 *
 * ─── Storia (30/07/2026) ──────────────────────────────────────────────────
 * Questo file conteneva `uploadMediaBatch`, un **secondo motore di upload**
 * parallelo alla coda persistente: comprimeva tutte le immagini in blocco e poi
 * caricava video e PDF **in sequenza**, tenendo i file solo nello state di
 * React. Da lì venivano i due problemi segnalati dal cliente:
 *
 *  - i video della creazione commessa partivano molto dopo quelli della
 *    riunione (che invece finivano subito nella coda);
 *  - chiudendo l'app durante la creazione, i file non ancora caricati si
 *    perdevano: la bozza sopravviveva, i byte no.
 *
 * Aveva inoltre lo **stesso difetto** della coda (worker fratelli non abortiti
 * al primo errore), che andava quindi corretto due volte.
 *
 * Ora esiste un solo motore: `UploadQueueProvider` + `_lib/upload-queue/`,
 * con l'orchestrazione pura e unit-testata in `@kommessa/api/upload-multipart`.
 * Qui restano soltanto i tipi usati dalla UI.
 *
 * Vedi `documentazione_generale/08_LOGICHE/Logiche_Upload_Media.md`.
 */

export type UploadProgressStep =
  | 'compressing'
  | 'uploading'
  | 'processing'
  | 'done'
  | 'error';

export type UploadProgressMap = Map<
  string,
  { pct: number; step: UploadProgressStep }
>;
