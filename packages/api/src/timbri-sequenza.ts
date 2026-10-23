/**
 * Da una sequenza di **eventi** a una sequenza di **ingressi e uscite**.
 *
 * Perche' esiste. Un terminale badge non sa se il tocco e' un'entrata o
 * un'uscita: sa che un badge e' passato a un certo istante. L'app di Kommessa
 * invece lo dichiara, perche' «Inizia turno» e «Fine turno» sono due tasti
 * diversi. Quando le due bocche convivono — si apre dall'app e si chiude al
 * terminale — **nessuno dei due sistemi vede la sequenza intera**, quindi
 * nessuno dei due puo' dedurre la direzione da solo: chi la vede intera e' chi
 * tiene il registro.
 *
 * ⭐ **Si ricalcola la giornata, non si appende.** La funzione prende TUTTI gli
 * eventi del giorno e li risolve da zero. E' l'unico modo che regge quando un
 * evento arriva in ritardo o fuori ordine — e capita: un giro di
 * riconciliazione porta roba di mezz'ora prima, e una correzione porta roba di
 * ieri. Appendere vorrebbe dire che l'ordine di arrivo decide la direzione.
 * E' anche lo stesso atteggiamento di `ricomputaRapportinoAuto`, che le ore le
 * **ri-deriva sempre** dalle timbrature invece di aggiornarle.
 *
 * ⚠️ Cosa questa funzione NON fa: non calcola la pausa. La pausa in Kommessa e'
 * il buco fra un'uscita e l'ingresso successivo e la ricava gia'
 * `minutiPerCommessa`. Qui si fa una cosa sola.
 */

export type TipoTimbro = 'ingresso' | 'uscita';

/**
 * Quanto e' credibile l'orologio che ha segnato l'istante.
 * `fisso` = un terminale con l'ora sincronizzata; `telefono` = un dispositivo
 * personale, che puo' avere l'ora sfasata o essere stato offline.
 * ⚠️ Il vocabolario di chi fornisce gli eventi non entra qui: la traduzione da
 * `time_source` o da qualunque altro campo la fa chi chiama.
 */
export type Orologio = 'fisso' | 'telefono';

export interface EventoTimbro {
  /** Identificativo stabile dell'evento: serve a non contarlo due volte. */
  id: string;
  /** Istante del tocco, in millisecondi. */
  ms: number;
  /** `null` = da dedurre. Valorizzato = **dichiarato** da chi l'ha generato. */
  tipo: TipoTimbro | null;
  orologio: Orologio;
  /**
   * Istante ESATTO (o un indice crescente), per l'ordine a parita' di `ms`:
   * con le timbrature arrotondate al passo (23/10/2026) una ripresa e una fine
   * nello stesso slot cadono sullo stesso `ms`, e l'ordine in cui sono
   * avvenute non deve andare perso.
   */
  ordine?: number;
}

export interface TimbroRisolto {
  id: string;
  ms: number;
  tipo: TipoTimbro;
  /** `true` se la direzione l'abbiamo dedotta noi, `false` se era dichiarata. */
  dedotto: boolean;
}

export interface EventoScartato {
  id: string;
  motivo: 'doppione' | 'senza_ora';
  /** Per un doppione: l'evento che e' rimasto al suo posto. */
  vinceId?: string;
}

export interface SequenzaRisolta {
  timbri: TimbroRisolto[];
  scartati: EventoScartato[];
  /** La giornata finisce con un ingresso spaiato: qualcuno e' ancora dentro. */
  aperta: boolean;
  /**
   * Una direzione **dichiarata** contraddice la sequenza (un ingresso mentre si
   * era gia' dentro, un'uscita mentre si era fuori). La dichiarazione si
   * rispetta comunque — e' un fatto misurato, non un'opinione — ma la giornata
   * non torna e chi legge deve dirlo invece di far finta.
   */
  incoerente: boolean;
}

/**
 * Due tocchi piu' vicini di cosi' sono lo stesso gesto, non due.
 *
 * Perche' serve: con due bocche sullo stesso orologio, una persona che timbra
 * al terminale e intanto l'app non lo sa ancora puo' generare **due** eventi
 * per un solo gesto. Il dedupe applicativo che Kommessa ha oggi copre 25
 * secondi, pensato per il doppio tocco su un bottone: non basta a coprire il
 * ritardo con cui un evento esterno arriva.
 *
 * Era 2 minuti; portata a 1 il 22/10/2026 su un caso vero: un badge alle
 * 10:26 e uno alle 10:27 (91 secondi) erano un'uscita e un rientro, non un
 * doppione. Un minuto copre ancora il ritardo fra le due bocche e lascia
 * valere chi esce e rientra subito.
 */
export const FINESTRA_DOPPIONE_MIN = 1;

/** Lo stesso gesto, visto da due parti? */
function stessoGesto(a: EventoTimbro, b: EventoTimbro): boolean {
  // ⚠️ Due direzioni DICHIARATE e opposte non sono lo stesso gesto, nemmeno a
  // un secondo di distanza: sono due fatti, e fonderli ne cancellerebbe uno.
  if (a.tipo !== null && b.tipo !== null && a.tipo !== b.tipo) return false;
  return true;
}

/** Fra due eventi dello stesso gesto, quale resta. */
function vince(a: EventoTimbro, b: EventoTimbro): EventoTimbro {
  // L'orologio fisso batte il telefono: il primo e' sincronizzato, il secondo
  // puo' avere l'ora sbagliata o essere stato senza rete.
  if (a.orologio !== b.orologio) return a.orologio === 'fisso' ? a : b;
  // A parita' di orologio resta una direzione dichiarata, che e' un fatto,
  // contro una da dedurre.
  if ((a.tipo === null) !== (b.tipo === null)) return a.tipo !== null ? a : b;
  // Altrimenti il primo in ordine di tempo: e' quello che e' stato misurato.
  return a;
}

export function risolviSequenza(
  eventi: readonly EventoTimbro[],
  opzioni?: { finestraDoppioneMin?: number },
): SequenzaRisolta {
  const finestraMs =
    Math.max(0, opzioni?.finestraDoppioneMin ?? FINESTRA_DOPPIONE_MIN) * 60_000;
  const scartati: EventoScartato[] = [];

  // 1. Un evento senza un istante utilizzabile non si indovina: si dichiara.
  const conOra: EventoTimbro[] = [];
  for (const e of eventi) {
    if (!Number.isFinite(e.ms)) scartati.push({ id: e.id, motivo: 'senza_ora' });
    else conOra.push(e);
  }

  // 2. Ordine per istante, e l'id come spareggio: a parita' di millisecondo il
  //    risultato deve essere lo stesso a ogni ricalcolo, o la giornata cambia
  //    da sola fra due letture.
  const ordinati = [...conOra].sort(
    (x, y) => x.ms - y.ms || (x.ordine ?? x.ms) - (y.ordine ?? y.ms) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0),
  );

  // 3. I doppioni collassano sul gesto, non sulla riga. La distanza si misura
  //    sull'istante ESATTO (`ordine`, se c'e'): con le timbrature arrotondate
  //    al passo una pausa, una ripresa e una fine nello stesso slot cadono
  //    tutte sullo stesso `ms`, ma sono tre gesti a mezzo minuto l'uno
  //    dall'altro, non un doppione.
  const esatto = (e: EventoTimbro) => e.ordine ?? e.ms;
  const tenuti: EventoTimbro[] = [];
  for (const e of ordinati) {
    const ultimo = tenuti[tenuti.length - 1];
    if (ultimo && esatto(e) - esatto(ultimo) <= finestraMs && stessoGesto(ultimo, e)) {
      const resta = vince(ultimo, e);
      const esce = resta === ultimo ? e : ultimo;
      tenuti[tenuti.length - 1] = resta;
      scartati.push({ id: esce.id, motivo: 'doppione', vinceId: resta.id });
      continue;
    }
    tenuti.push(e);
  }

  // 4. Si alterna partendo da fuori. Una direzione dichiarata e' un punto
  //    fermo; le altre seguono.
  const timbri: TimbroRisolto[] = [];
  let dentro = false;
  let incoerente = false;
  for (const e of tenuti) {
    if (e.tipo !== null) {
      if ((e.tipo === 'ingresso') === dentro) incoerente = true;
      timbri.push({ id: e.id, ms: e.ms, tipo: e.tipo, dedotto: false });
      dentro = e.tipo === 'ingresso';
    } else {
      const tipo: TipoTimbro = dentro ? 'uscita' : 'ingresso';
      timbri.push({ id: e.id, ms: e.ms, tipo, dedotto: true });
      dentro = !dentro;
    }
  }

  return { timbri, scartati, aperta: dentro, incoerente };
}
