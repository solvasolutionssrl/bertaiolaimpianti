import type { StatoCollegamento } from './integrazione-salute';

/**
 * Come sta il collegamento con una timbratrice. Pura: la stessa funzione
 * colora il tab del cliente e la console, cosi' non possono dire due cose.
 *
 * Due segnali distinti, perche' misurano due cose diverse:
 *  - **il giro**: ogni due minuti leggiamo noi. Se l'ultimo giro e' vecchio o
 *    e' finito in errore, siamo NOI ad avere un problema (cron, token, rete).
 *  - **i timbri**: se il giro va ma non arriva un timbro da due giorni, o
 *    nessuno timbra (festa, weekend) o il terminale e' spento. Si segnala,
 *    senza gridare: e' «da guardare», non «in avaria».
 */
export interface FotoTimbro {
  stato: 'spento' | 'osservazione' | 'attivo';
  conToken: boolean;
  dal: string | null;
  ultimoGiroAt: string | null;
  ultimoGiroEsito: 'ok' | 'errore' | null;
  ultimoGiroMessaggio: string | null;
  ultimoTimbroAt: string | null;
  /** Timbri validi senza persona (badge non assegnato) ancora parcheggiati. */
  orfani: number;
  /** Timbri validi senza orario. */
  senzaOra: number;
}

export interface DiagnosiTimbro {
  stato: StatoCollegamento;
  motivi: string[];
}

/** Oltre questi minuti senza un giro, il cron non sta girando. */
export const GIRO_FERMO_MIN = 10;
/** Oltre queste ore senza un timbro, il terminale potrebbe essere spento. */
export const SILENZIO_TIMBRI_ORE = 48;

export function valutaTimbro(f: FotoTimbro, adesso: number): DiagnosiTimbro {
  if (f.stato === 'spento') {
    return { stato: 'mai_visto', motivi: ['Collegamento spento.'] };
  }
  if (!f.conToken || !f.dal) {
    return {
      stato: 'mai_visto',
      motivi: [!f.conToken ? 'Manca il token di Timbro.' : 'Manca la data di partenza.'],
    };
  }
  if (!f.ultimoGiroAt) {
    return { stato: 'mai_visto', motivi: ['Nessun giro di lettura ancora fatto.'] };
  }

  const motivi: string[] = [];
  let stato: StatoCollegamento = 'ok';
  const peggiora = (s: StatoCollegamento) => {
    const peso = { ok: 0, mai_visto: 1, attenzione: 2, guasto: 3 } as const;
    if (peso[s] > peso[stato]) stato = s;
  };

  const minutiDalGiro = (adesso - new Date(f.ultimoGiroAt).getTime()) / 60_000;
  if (minutiDalGiro > GIRO_FERMO_MIN) {
    peggiora('guasto');
    motivi.push(`Nessun giro di lettura da ${Math.round(minutiDalGiro)} minuti: il cron non sta girando.`);
  }
  if (f.ultimoGiroEsito === 'errore') {
    peggiora('guasto');
    motivi.push(`L’ultimo giro è finito in errore${f.ultimoGiroMessaggio ? `: ${f.ultimoGiroMessaggio}` : '.'}`);
  }
  if (f.ultimoTimbroAt) {
    const oreDalTimbro = (adesso - new Date(f.ultimoTimbroAt).getTime()) / 3_600_000;
    if (oreDalTimbro > SILENZIO_TIMBRI_ORE) {
      peggiora('attenzione');
      motivi.push(`Nessun timbro da ${Math.round(oreDalTimbro)} ore: terminale spento, o nessuno ha timbrato.`);
    }
  } else {
    peggiora('attenzione');
    motivi.push('Non è ancora arrivato nessun timbro.');
  }
  if (f.orfani > 0) {
    peggiora('attenzione');
    motivi.push(`${f.orfani} ${f.orfani === 1 ? 'timbro' : 'timbri'} senza persona: badge non assegnato.`);
  }
  if (f.senzaOra > 0) {
    peggiora('attenzione');
    motivi.push(`${f.senzaOra} ${f.senzaOra === 1 ? 'timbro' : 'timbri'} senza orario.`);
  }
  if (motivi.length === 0) motivi.push('Legge ogni due minuti, e i timbri arrivano.');
  return { stato, motivi };
}
