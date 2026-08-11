/** Tipi condivisi fra la pagina server e il client di `/admin/integrazioni`. */

export interface CodaTenant {
  tenantId: string;
  tenant: string;
  sistema: string;
  /** `simulazione` = sicura di collaudo inserita: nessuno deve scrivere fuori. */
  modalita: string;
  /** Identificativi esterni aperti anche in simulazione. */
  collaudoEsterni: number;
  scrittureOk: number;
  scrittureErrore: number;
  /** Ultima scrittura riuscita: se e' vecchia, il collegamento e' fermo. */
  ultimaScrittura: string | null;
  ultimoGiroOk: string | null;
  ultimoGiro: string | null;
  /**
   * Minuti medi fra quando una cosa e' finita sul gestionale e quando ce
   * l'hanno detto. Se cresce, l'agente sta accumulando ritardo.
   */
  ritardoMedioMin: number | null;
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
