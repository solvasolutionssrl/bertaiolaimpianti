/**
 * Salute di un collegamento verso un gestionale esterno.
 *
 * Un'integrazione non si rompe con un errore in faccia: **smette di farsi
 * viva**. L'agente gira su una macchina del cliente, dietro la sua VPN, e se
 * quella macchina si spegne da noi non succede niente di visibile — le ore
 * semplicemente non arrivano piu', e ce ne accorgiamo a fine mese.
 *
 * Per questo il segnale principale non e' l'errore ma il **silenzio**, e per
 * questo il giudizio sta qui: e' logica pura, testabile, e la usano sia la
 * pagina di piattaforma sia il controllo periodico che manda la mail. Se
 * vivesse in due posti, i due posti direbbero due cose diverse.
 *
 * Nessun `Date.now()` qui dentro: l'istante si passa. Altrimenti i test
 * dipenderebbero da quando li lanci.
 */

export type StatoCollegamento = 'ok' | 'attenzione' | 'guasto' | 'mai_visto';

/** Quante ore di silenzio prima di preoccuparsi. Oltre il doppio: guasto. */
export const SOGLIA_SILENZIO_ORE_DEFAULT = 24;

/**
 * Oltre questo scarto fra "scritto sul gestionale" e "comunicato a noi"
 * l'agente sta accumulando arretrato: scrive fuori ma non riesce a
 * riannunciarcelo in tempo.
 */
export const RITARDO_ACK_ATTENZIONE_MIN = 60;

export interface FotoCollegamento {
  tenantId: string;
  tenant: string;
  /** Gestionale dichiarato in configurazione. `null` se non e' stato scelto. */
  sistema: string | null;
  modalita: 'simulazione' | 'attiva';
  /**
   * Ultimo segno di vita, da qualunque parte arrivi: una scrittura annunciata,
   * un giro di lettura, una chiamata autenticata. `null` = mai visto.
   */
  ultimaAttivita: string | null;
  /** Scritture riuscite e fallite nella finestra recente (di norma 24h). */
  scrittureOk: number;
  scrittureErrore: number;
  /** Istante dell'ultimo errore e dell'ultimo successo, per capire se ha ripreso. */
  ultimoErrore: string | null;
  ultimoOk: string | null;
  /** Media dello scarto `registrato_at - scritto_at`, in minuti. */
  ritardoAckMin: number | null;
  /** Giri di lettura aperti e mai chiusi: l'agente e' morto a meta' lavoro. */
  giriAperti: number;
  /** Anagrafiche nostre senza corrispondenza confermata. */
  nonCollegati: number;
  sogliaSilenzioOre: number;
}

export interface Diagnosi {
  stato: StatoCollegamento;
  /** In ore, arrotondato. `null` se non si e' mai fatto vivo. */
  silenzioOre: number | null;
  /** Frasi pronte da mostrare, gia' ordinate per gravita'. */
  motivi: string[];
}

function ore(da: string, a: number): number {
  return (a - new Date(da).getTime()) / 3_600_000;
}

/**
 * Il verdetto. L'ordine dei controlli e' l'ordine della gravita': il primo che
 * scatta decide lo stato, gli altri si accodano ai motivi.
 */
export function valutaCollegamento(f: FotoCollegamento, adesso: number): Diagnosi {
  const motivi: string[] = [];

  if (!f.ultimaAttivita) {
    return {
      stato: 'mai_visto',
      silenzioOre: null,
      motivi: [
        f.sistema
          ? 'Nessun contatto: l’agente non ha mai chiamato.'
          : 'Gestionale non ancora scelto in configurazione.',
      ],
    };
  }

  const silenzio = ore(f.ultimaAttivita, adesso);
  const soglia = f.sogliaSilenzioOre > 0 ? f.sogliaSilenzioOre : SOGLIA_SILENZIO_ORE_DEFAULT;

  let stato: StatoCollegamento = 'ok';
  const peggiora = (s: StatoCollegamento) => {
    const peso = { ok: 0, mai_visto: 1, attenzione: 2, guasto: 3 } as const;
    if (peso[s] > peso[stato]) stato = s;
  };

  if (silenzio >= soglia * 2) {
    peggiora('guasto');
    motivi.push(`Muto da ${Math.round(silenzio)} ore (oltre il doppio della soglia).`);
  } else if (silenzio >= soglia) {
    peggiora('attenzione');
    motivi.push(`Muto da ${Math.round(silenzio)} ore.`);
  }

  // Un errore vecchio a cui e' seguito un successo non e' un guasto: e' un
  // intoppo superato. Conta solo se e' l'ultima cosa successa.
  if (f.scrittureErrore > 0) {
    const fermoSullErrore =
      !!f.ultimoErrore &&
      (!f.ultimoOk || new Date(f.ultimoErrore).getTime() > new Date(f.ultimoOk).getTime());
    if (fermoSullErrore) {
      peggiora('guasto');
      motivi.push(
        `${f.scrittureErrore} scritture in errore e nessuna riuscita dopo l’ultima.`,
      );
    } else {
      peggiora('attenzione');
      motivi.push(`${f.scrittureErrore} scritture in errore, poi ha ripreso.`);
    }
  }

  if (f.giriAperti > 0) {
    peggiora('attenzione');
    motivi.push(
      `${f.giriAperti} ${f.giriAperti === 1 ? 'giro aperto' : 'giri aperti'} e mai conclusi.`,
    );
  }

  if (f.ritardoAckMin !== null && f.ritardoAckMin > RITARDO_ACK_ATTENZIONE_MIN) {
    peggiora('attenzione');
    motivi.push(
      `Ci comunica le scritture con ${Math.round(f.ritardoAckMin)} minuti di ritardo medio.`,
    );
  }

  // Non e' un guasto del collegamento, ma senza abbinamento i dati non sono
  // attribuibili: vale la pena vederlo qui invece che scoprirlo dopo.
  if (f.nonCollegati > 0) {
    peggiora('attenzione');
    motivi.push(`${f.nonCollegati} anagrafiche ancora senza corrispondenza confermata.`);
  }

  if (motivi.length === 0) {
    motivi.push(
      f.scrittureOk > 0
        ? `${f.scrittureOk} scritture riuscite, nessun errore.`
        : 'Collegamento vivo, nessuna scrittura nella finestra.',
    );
  }

  return { stato, silenzioOre: Math.round(silenzio), motivi };
}

/**
 * Chi merita una mail. In **simulazione** no: e' la modalita' di collaudo, un
 * agente che si ferma mentre lo si sta ancora scrivendo e' la normalita' — e
 * un avviso che suona sempre e' un avviso che si impara a ignorare.
 */
export function meritaAvviso(f: FotoCollegamento, d: Diagnosi): boolean {
  return d.stato === 'guasto' && f.modalita === 'attiva';
}
