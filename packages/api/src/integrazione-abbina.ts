/**
 * Abbinamento delle anagrafiche: i nostri cantieri/commesse ↔ quelli del
 * gestionale del cliente.
 *
 * E' il passaggio piu' delicato dell'intera integrazione. Un abbinamento
 * sbagliato non da' errore: manda le ore sulla commessa di un altro, e sul
 * gestionale non si cancella. Per questo qui si **propone** soltanto, con un
 * motivo leggibile, e la conferma resta all'ufficio.
 *
 * Puro e testabile: nessuna query. Chi chiama ha gia' letto le due liste.
 */

export interface CandidatoNostro {
  id: string;
  /** Codice commessa/cantiere, se lo abbiamo. E' l'aggancio piu' affidabile. */
  codice: string | null;
  nome: string;
  cliente?: string | null;
}

export interface CandidatoEsterno {
  externalId: string;
  codice: string | null;
  nome: string;
  cliente?: string | null;
}

export type ForzaAbbinamento = 'certo' | 'probabile' | 'debole' | 'nessuno';

export interface Abbinamento {
  nostroId: string;
  externalId: string | null;
  /** 0..1. Solo per ordinare: la decisione la prende una persona. */
  punteggio: number;
  forza: ForzaAbbinamento;
  /** Frase da mostrare in interfaccia: perche' questo e non un altro. */
  motivo: string;
}

// ---------------------------------------------------------------------------
// Normalizzazione
// ---------------------------------------------------------------------------

/**
 * Toglie accenti, punteggiatura e parole di servizio. Serve perche' lo stesso
 * cantiere in due sistemi diventa "FINCANTIERI S.p.A. - Monfalcone" e
 * "Fincantieri Monfalcone": senza normalizzare non si somigliano affatto.
 */
export function normalizza(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    // Forme societarie, parole di servizio e toponimi generici: compaiono in
    // meta' dei nomi e non distinguono niente. Senza toglierli, "Via Roma" e
    // "Via Milano" risultano somiglianti al 50% per via del solo "via".
    .replace(
      /\b(spa|srl|snc|sas|s\s*p\s*a|s\s*r\s*l|di|del|della|lavori|cantiere|commessa|via|viale|piazza|corso|localita|loc|presso)\b/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

/** Codice confrontabile: via zeri iniziali e separatori. */
export function normalizzaCodice(s: string | null | undefined): string {
  const base = (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return base.replace(/^0+(?=\d)/, '');
}

function token(s: string): Set<string> {
  return new Set(normalizza(s).split(' ').filter((t) => t.length > 2));
}

/** Quanta parte delle parole dell'uno compare nell'altro (0..1). */
export function somiglianza(a: string, b: string): number {
  const ta = token(a);
  const tb = token(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let comuni = 0;
  for (const t of ta) if (tb.has(t)) comuni += 1;
  return comuni / Math.min(ta.size, tb.size);
}

// ---------------------------------------------------------------------------
// Proposta
// ---------------------------------------------------------------------------

interface Coppia {
  nostroId: string;
  externalId: string;
  punteggio: number;
  motivo: string;
  forza: ForzaAbbinamento;
}

function valuta(n: CandidatoNostro, e: CandidatoEsterno): Coppia | null {
  const cn = normalizzaCodice(n.codice);
  const ce = normalizzaCodice(e.codice);
  // Molti gestionali non hanno un "codice" separato: l'identificativo E' il
  // codice (su ERGO l'`objectId`, che e' proprio il numero che l'ufficio
  // trascrive nel nostro `codice_commessa`). Confrontare anche l'id recupera
  // gli abbinamenti certi che altrimenti scivolerebbero sulla somiglianza dei
  // nomi — molto piu' debole e piena di falsi.
  const cid = normalizzaCodice(e.externalId);

  // Il codice, quando c'e' da entrambe le parti, batte qualunque somiglianza
  // di nome: e' un identificativo, non un indizio.
  if (cn && ((ce && cn === ce) || cn === cid)) {
    return {
      nostroId: n.id,
      externalId: e.externalId,
      punteggio: 1,
      motivo: `stesso codice (${n.codice})`,
      forza: 'certo',
    };
  }

  const sim = somiglianza(n.nome, e.nome);
  const stessoCliente =
    !!n.cliente && !!e.cliente && somiglianza(n.cliente, e.cliente) >= 0.6;

  if (sim >= 0.99) {
    return {
      nostroId: n.id,
      externalId: e.externalId,
      punteggio: 0.95,
      motivo: stessoCliente ? 'nome e cliente identici' : 'nome identico',
      forza: stessoCliente ? 'certo' : 'probabile',
    };
  }
  if (sim >= 0.6) {
    return {
      nostroId: n.id,
      externalId: e.externalId,
      // Il cliente uguale alza la fiducia: due cantieri con nome simile ma
      // committenti diversi sono quasi sempre cose diverse.
      punteggio: stessoCliente ? Math.min(0.9, sim + 0.15) : sim * 0.8,
      motivo: stessoCliente ? 'nome simile, stesso cliente' : 'nome simile',
      forza: stessoCliente ? 'probabile' : 'debole',
    };
  }
  return null;
}

/**
 * Propone un abbinamento per ciascuno dei nostri record.
 *
 * Regole:
 * - chi e' gia' mappato non viene toccato (l'ufficio l'ha gia' deciso);
 * - un id del gestionale non puo' finire su due nostri record — se le ore
 *   andassero su due commesse, i costi sarebbero doppi. Si assegna prima chi
 *   ha il punteggio piu' alto, gli altri restano scoperti;
 * - chi non ha un candidato decente resta `nessuno`: meglio un buco visibile
 *   che un abbinamento inventato.
 */
export function proponiAbbinamenti(
  nostri: CandidatoNostro[],
  esterni: CandidatoEsterno[],
  giaMappati: { nostroId: string; externalId: string }[] = [],
): Abbinamento[] {
  const nostriMappati = new Set(giaMappati.map((m) => m.nostroId));
  const esterniOccupati = new Set(giaMappati.map((m) => m.externalId));

  const coppie: Coppia[] = [];
  for (const n of nostri) {
    if (nostriMappati.has(n.id)) continue;
    for (const e of esterni) {
      if (esterniOccupati.has(e.externalId)) continue;
      const c = valuta(n, e);
      if (c) coppie.push(c);
    }
  }

  // Prima i punteggi alti: cosi' un abbinamento certo non viene "rubato" da un
  // abbinamento debole che capitava prima nell'elenco.
  coppie.sort((a, b) => b.punteggio - a.punteggio);

  const presi = new Set<string>();
  const usati = new Set<string>();
  const scelte = new Map<string, Coppia>();

  for (const c of coppie) {
    if (presi.has(c.nostroId) || usati.has(c.externalId)) continue;
    presi.add(c.nostroId);
    usati.add(c.externalId);
    scelte.set(c.nostroId, c);
  }

  return nostri
    .filter((n) => !nostriMappati.has(n.id))
    .map((n) => {
      const c = scelte.get(n.id);
      if (!c) {
        return {
          nostroId: n.id,
          externalId: null,
          punteggio: 0,
          forza: 'nessuno' as const,
          motivo: 'nessun candidato: da collegare a mano',
        };
      }
      return {
        nostroId: c.nostroId,
        externalId: c.externalId,
        punteggio: c.punteggio,
        forza: c.forza,
        motivo: c.motivo,
      };
    });
}

/**
 * Duplicati in una selezione fatta a mano: lo stesso id del gestionale scelto
 * per due record diversi. Va bloccato **prima** di salvare — a valle nessuno se
 * ne accorgerebbe finche' i costi non risultano doppi.
 */
export function duplicati(
  scelte: { nostroId: string; externalId: string | null }[],
): { externalId: string; nostriId: string[] }[] {
  const per = new Map<string, string[]>();
  for (const s of scelte) {
    if (!s.externalId) continue;
    per.set(s.externalId, [...(per.get(s.externalId) ?? []), s.nostroId]);
  }
  return [...per.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([externalId, nostriId]) => ({ externalId, nostriId }));
}
