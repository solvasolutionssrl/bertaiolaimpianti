/**
 * **Come si chiamano le due domande su chi se ne occupa.**
 *
 * Su una richiesta al telefono ci sono due fatti diversi, e sono due fatti
 * perche' la segretaria affida la richiesta a un caposquadra e lui la gira a
 * uno o piu' tecnici:
 *
 *   `commessa_todo.assegnato_a`   chi ne RISPONDE
 *   `commessa_todo_squadra`       chi ci VA
 *
 * ⚠️ **Il modello era giusto e le parole no.** A schermo si leggeva «In mano
 * a: Nessuno» con, una riga sotto, «Ci va: Mario»: due modi di dire casalinghi
 * che sembravano contraddirsi, su una richiesta che era stata girata a Mario e
 * basta. Chi legge non deve ricostruire un modello di dati: deve leggere una
 * frase che sta in piedi. Quindi:
 *
 *   - «In mano a» → **Responsabile**. Non «tecnico assegnato»: ⚠️ chi ne
 *     risponde **non e' per forza un tecnico** (`elencaAssegnabiliTenant` non
 *     filtra per ruolo, e in Bertaiola il caposquadra ha ruolo `office`).
 *     «Ordina la pompa» e' roba d'ufficio.
 *   - «Ci va / Ci vanno» → **Tecnico assegnato / Tecnici assegnati**. Quelli
 *     sono tecnici per davvero.
 *
 * ⭐ **E la riga vuota non si scrive.** «Responsabile: Nessuno» accanto a un
 * nome e' la frase che ha fatto nascere la domanda: sembra che l'applicazione
 * si smentisca. Una riga che non ha un valore non e' un'informazione, e' un
 * punto interrogativo in piu'. Se non c'e' nessuno in nessuno dei due posti si
 * dice una volta sola che non e' assegnata.
 *
 * Le stesse parole valgono anche per la colonna dell'elenco commesse
 * d'ufficio, che fa la stessa domanda su `commessa_tecnici`: era «In mano a»,
 * e accanto allo stato «Non presa» si leggeva male — due etichette che
 * differiscono per una lettera e vogliono dire cose diverse.
 */

export const ETICHETTA_RESPONSABILE = 'Responsabile';
export const ETICHETTA_TECNICO_UNO = 'Tecnico assegnato';
export const ETICHETTA_TECNICI_PIU = 'Tecnici assegnati';

/** «Tecnico assegnato» con uno, «Tecnici assegnati» con nessuno o piu' di uno. */
export function etichettaTecnici(quanti: number): string {
  return quanti === 1 ? ETICHETTA_TECNICO_UNO : ETICHETTA_TECNICI_PIU;
}

/**
 * Il genere della cosa di cui si parla: una **richiesta** e' femminile, un
 * **task** maschile, e «Non assegnato» su una richiesta si legge storto.
 */
export type GenereLavoro = 'richiesta' | 'task';

/** «Non assegnata» / «Non assegnato». */
export function etichettaNonAssegnato(genere: GenereLavoro): string {
  return genere === 'richiesta' ? 'Non assegnata' : 'Non assegnato';
}

export interface Assegnazione {
  /** Il nome di chi ne risponde (`assegnato_a`), o null. */
  responsabile: string | null;
  /** I nomi di chi ci va (`commessa_todo_squadra`). */
  tecnici: readonly string[];
}

export interface RigaAssegnazione {
  etichetta: string;
  valore: string;
  /** Vero quando non c'e' nessuno: a schermo si rende in corsivo spento. */
  vuoto: boolean;
}

/**
 * Le righe da mostrare, nell'ordine in cui si leggono: prima chi ne risponde,
 * poi chi ci va. Le righe senza valore non ci sono.
 */
export function descriviAssegnazione(
  a: Assegnazione,
  genere: GenereLavoro = 'richiesta',
): RigaAssegnazione[] {
  const responsabile = (a.responsabile ?? '').trim();
  const tecnici = a.tecnici.map((t) => t.trim()).filter(Boolean);

  if (!responsabile && tecnici.length === 0) {
    return [
      {
        etichetta: genere === 'richiesta' ? 'Assegnazione' : 'Assegnato a',
        valore: etichettaNonAssegnato(genere),
        vuoto: true,
      },
    ];
  }

  const righe: RigaAssegnazione[] = [];
  if (responsabile) {
    righe.push({ etichetta: ETICHETTA_RESPONSABILE, valore: responsabile, vuoto: false });
  }
  if (tecnici.length > 0) {
    righe.push({
      etichetta: etichettaTecnici(tecnici.length),
      valore: tecnici.join(', '),
      vuoto: false,
    });
  }
  return righe;
}

/**
 * La stessa cosa in una riga sola, per gli elenchi densi (la board
 * d'ufficio): «Erica → Luca, Thomas». La freccia dice la catena, che e'
 * l'unica cosa che le due colonne di un elenco non riescono a dire.
 */
export function assegnazioneInBreve(
  a: Assegnazione,
  genere: GenereLavoro = 'richiesta',
): string {
  const righe = descriviAssegnazione(a, genere);
  if (righe.length === 1 && righe[0]?.vuoto) return etichettaNonAssegnato(genere);
  return righe.map((r) => r.valore).join(' → ');
}
