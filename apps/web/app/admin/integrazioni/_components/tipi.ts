/** Tipi condivisi fra la pagina server e il client di `/admin/integrazioni`. */

import type { StatoCollegamento } from '@kommessa/api/integrazione-salute';

/**
 * Una riga della panoramica: un cliente, un gestionale, come sta.
 *
 * Il giudizio (`stato`, `motivi`) arriva gia' fatto dal server — lo calcola
 * `valutaCollegamento`, che e' logica pura e la stessa che decide se mandare
 * la mail. Il client non deve rifarlo, altrimenti la pagina e l'avviso
 * potrebbero dire due cose diverse.
 */
export interface RigaCollegamento {
  tenantId: string;
  tenant: string;
  sistema: string | null;
  /** `simulazione` = sicura di collaudo inserita: nessuno deve scrivere fuori. */
  modalita: 'simulazione' | 'attiva';
  /** Modulo spento = l'API rifiuta tutto, token validi compresi. */
  attivo: boolean;
  stato: StatoCollegamento;
  motivi: string[];
  silenzioOre: number | null;
  ultimaAttivita: string | null;
  scrittureOk: number;
  scrittureErrore: number;
  ritardoMedioMin: number | null;
  giriAperti: number;
  collegate: number;
  nostreTotali: number;
  ultimaLettura: string | null;
}

export interface ScritturaRow {
  id: string;
  tenant: string;
  risorsa: string;
  variante: string;
  esito: string;
  riferimento: string | null;
  errore: string | null;
  scrittoAl: string;
  registratoAl: string;
}

export interface EsecuzioneRow {
  id: string;
  tenant: string;
  sistema: string;
  direzione: string;
  avvio: string;
  esito: string | null;
  letti: number;
  scritti: number;
  errori: number;
  messaggio: string | null;
  avviataAt: string;
  conclusaAt: string | null;
}
