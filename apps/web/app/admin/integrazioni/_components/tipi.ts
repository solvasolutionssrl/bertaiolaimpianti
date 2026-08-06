/** Tipi condivisi fra la pagina server e il client di `/admin/integrazioni`. */

export interface CodaTenant {
  tenantId: string;
  tenant: string;
  sistema: string;
  sincManuale: boolean;
  autoPush: boolean;
  inAttesa: number;
  inCorso: number;
  inErrore: number;
  inviate: number;
  /** Ultimo giro concluso con esito utile: è il segno che l'agente è vivo. */
  ultimoGiroOk: string | null;
  ultimoGiro: string | null;
}

export interface OperazioneRow {
  id: string;
  tenant: string;
  sistema: string;
  tipo: string;
  stato: string;
  tentativi: number;
  errore: string | null;
  descrizione: string | null;
  esitoEsterno: string | null;
  creataAt: string;
  inviataAt: string | null;
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
