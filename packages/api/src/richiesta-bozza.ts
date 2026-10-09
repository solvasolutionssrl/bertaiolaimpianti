/**
 * Da richiesta telefonica a bozza di commessa.
 *
 * L'ufficio risponde al telefono e registra una **richiesta**: un task senza
 * commessa, con quel poco che si riesce a scrivere mentre si parla. Quando il
 * lavoro si concretizza, quella richiesta deve diventare una commessa — ma una
 * commessa nasce dal sopralluogo, brucia un codice interno da un contatore
 * senza buchi e crea una quindicina di cartelle su Nextcloud, cose
 * irreversibili.
 *
 * In mezzo c'è già il posto giusto: la **bozza** (`commessa_bozze`), che costa
 * un INSERT, non brucia niente, vive 30 giorni e si riprende dal form di
 * creazione, che chiede il resto. Questo modulo traduce l'una nell'altra.
 *
 * Due regole che vengono da vincoli reali, non da gusto:
 *
 * 1. **La descrizione non si tronca.** Diventerebbe il `nome_cartella` su
 *    Nextcloud, che non si può più rinominare: meglio nessuna descrizione (e il
 *    form la chiede) che una descrizione tagliata di netto a metà parola.
 * 2. **Niente si perde.** Tutto ciò che è stato battuto al telefono finisce in
 *    `noteIniziali`, comprese le cose che non hanno un campo dove andare (il
 *    numero per richiamare, quando il cliente è già in anagrafica).
 *
 * Puro e deterministico.
 */
import { MAX_DESCRIZIONE_COMMESSA } from './nome-cartella';

/**
 * Lo stesso tetto che accetta `creaCommessa`, importato e non ricopiato.
 *
 * ⚠️ Qui c'era un `60` con il commento «lo schema di `creaCommessa` accetta al
 * massimo 60»: vero quando è stato scritto, e invisibile il giorno in cui
 * quello cambia. Il nome vecchio resta esportato perché lo usano i test.
 */
export const DESCRIZIONE_MAX = MAX_DESCRIZIONE_COMMESSA;

/** La richiesta, nei soli campi che servono alla conversione. */
export interface RichiestaDaConvertire {
  id: string;
  titolo: string;
  descrizione: string | null;
  contatto: string | null;
  clienteId: string | null;
  clienteTesto: string | null;
  /** Ragione sociale del cliente collegato, per il display al resume. */
  clienteLabel?: string | null;
  /** Dove bisogna andare, se l'ufficio l'ha scritto sulla richiesta. */
  indirizzo?: string | null;
}

/** Il payload della bozza: un `Partial` dell'input di `creaCommessa`. */
export interface PayloadBozzaDaRichiesta {
  clienteId?: string;
  clienteNew?: {
    ragione_sociale: string;
    telefoni?: string[];
    email?: string[];
  };
  descrizioneFinale?: string;
  noteIniziali?: string;
  /**
   * Il posto dove si va, se la richiesta lo diceva.
   *
   * ⚠️ Finisce in «Indirizzo cantiere» del modulo, non nell'indirizzo del
   * cliente: su una richiesta quel campo e' gia' «se diverso da quello del
   * cliente», ed e' la stessa domanda.
   */
  indirizzoCantiere?: string;
  _clienteLabel?: string;
  /** Da quale richiesta viene: serve ad agganciarla alla commessa creata. */
  _richiestaTodoId: string;
}

function pulito(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t.length > 0 ? t : null;
}

/** Un contatto con la chiocciola è una email, tutto il resto è un numero. */
function eEmail(contatto: string): boolean {
  return contatto.includes('@');
}

export function payloadBozzaDaRichiesta(
  r: RichiestaDaConvertire,
): PayloadBozzaDaRichiesta {
  const titolo = pulito(r.titolo) ?? '';
  const descrizione = pulito(r.descrizione);
  const contatto = pulito(r.contatto);
  const clienteTesto = pulito(r.clienteTesto);
  const dove = pulito(r.indirizzo);

  const out: PayloadBozzaDaRichiesta = { _richiestaTodoId: r.id };

  // ─── il cliente: collegato se c'era, altrimenti il nome che si è sentito ──
  if (r.clienteId) {
    out.clienteId = r.clienteId;
    const label = pulito(r.clienteLabel);
    if (label) out._clienteLabel = label;
  } else if (clienteTesto) {
    out.clienteNew = { ragione_sociale: clienteTesto };
    if (contatto) {
      if (eEmail(contatto)) out.clienteNew.email = [contatto];
      else out.clienteNew.telefoni = [contatto];
    }
  }

  // ─── dove si va ──────────────────────────────────────────────────────────
  if (dove) out.indirizzoCantiere = dove;

  // ─── la descrizione, solo se ci sta intera ───────────────────────────────
  if (titolo.length > 0 && titolo.length <= DESCRIZIONE_MAX) {
    out.descrizioneFinale = titolo;
  }

  // ─── le note: tutto quello che è stato detto, in ordine di lettura ───────
  const righe: string[] = [];
  if (titolo) righe.push(`Richiesta al telefono: ${titolo}`);
  if (descrizione) righe.push(descrizione);
  // Il contatto si ripete nelle note quando non ha trovato posto nei campi del
  // cliente (cliente già in anagrafica, o nessun nome): altrimenti il numero
  // per richiamare si perderebbe nel passaggio.
  if (contatto && !out.clienteNew) righe.push(`Contatto: ${contatto}`);
  if (righe.length > 0) out.noteIniziali = righe.join('\n');

  return out;
}
