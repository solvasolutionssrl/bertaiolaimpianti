/**
 * La meccanica di ricerca dentro un elenco di scelte: **a token, su più campi,
 * insensibile agli accenti**.
 *
 * Nasce per il menu a tendina con ricerca (`_components/scelta.tsx`) che
 * sostituisce i `<select>` di sistema dove l'elenco è lungo — assegnare un task
 * a una delle trenta persone dell'azienda con la tendina nativa significa
 * scorrere, e su iPhone significa la ruota.
 *
 * ## Perché a token e non per prefisso
 *
 * È la stessa regola già adottata per i cantieri: `«fincantieri monf»` deve
 * trovare «Fincantieri … Monfalcone» anche quando le due parole stanno in campi
 * diversi. Quindi i campi si uniscono in un'unica stringa e **ogni** parola
 * digitata deve comparire da qualche parte. Il match a campo singolo fallisce
 * appena uno cerca «mario rossi» e il nome sta in `etichetta` e il ruolo in
 * `dettaglio`.
 *
 * ## Gli accenti
 *
 * «Nicolò» si cerca scrivendo «nicolo»: chi cerca in fretta non va a prendere
 * l'accento, e su una tastiera fisica italiana la «ò» costa un tasto in più.
 * La piegatura è a senso unico — si normalizza sia il mucchio sia l'ago — quindi
 * «nicolò» continua a trovare «Nicolò».
 *
 * ## L'ordine dei risultati conta
 *
 * Chi scrive «ma» per trovare Marco non vuole vedere per primo «Gianmarco».
 * Le voci che **cominciano** con quello che si è digitato salgono in cima; il
 * resto conserva l'ordine di partenza, che di solito è già significativo
 * (alfabetico, o per ruolo). L'ordinamento è stabile: a parità di punteggio due
 * voci restano nell'ordine in cui sono arrivate.
 *
 * Puro e deterministico: nessun React, nessun database, nessuna data.
 */

export interface OpzioneScelta {
  /** Valore che finisce nel modulo. Univoco nell'elenco. */
  valore: string;
  /** Quello che si legge nella riga. */
  etichetta: string;
  /** Seconda riga piccola sotto l'etichetta: ruolo, codice, città. */
  dettaglio?: string;
  /** Intestazione sotto cui raggruppare la voce. Assente = nessun gruppo. */
  gruppo?: string;
  /**
   * Testo in più su cui cercare ma che non si mostra: email, codice interno,
   * soprannome. Serve a far trovare una persona digitando quello che si ha in
   * mano, non quello che l'app ha deciso di scrivere.
   */
  cerca?: string;
  /** La voce si vede ma non si può scegliere. */
  disabilitata?: boolean;
}

/**
 * Minuscolo, senza accenti, spazi compattati.
 *
 * `normalize('NFD')` separa la lettera dal segno diacritico, e la classe
 * unicode `\p{Diacritic}` toglie i segni rimasti: «Nicolò» → «nicolo».
 */
export function normalizzaTesto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tutto ciò su cui una voce si lascia trovare, in una stringa sola. */
function mucchio(o: OpzioneScelta): string {
  return normalizzaTesto(
    [o.etichetta, o.dettaglio, o.gruppo, o.cerca].filter(Boolean).join(' '),
  );
}

/** Le parole digitate, ripulite. Una query vuota non ha parole. */
export function tokenDiRicerca(query: string): string[] {
  return normalizzaTesto(query).split(' ').filter(Boolean);
}

/**
 * Vero se un testo contiene **tutte** le parole digitate, ovunque esse siano.
 *
 * ⭐ Esportata perché la stessa regola serve fuori dalle tendine: la ricerca
 * della board «Task e Richieste» cerca per titolo **e per nome cliente**, e
 * scrivere lì una seconda meccanica di ricerca vorrebbe dire due ricerche che
 * si comportano diversamente sulla stessa parola accentata.
 *
 * ⚠️ **Il testo in cui cercare va normalizzato da chi chiama**
 * (`normalizzaTesto`): qui non si normalizza, altrimenti una voce già
 * preparata verrebbe ripiegata due volte. Chi ha un mucchio da costruire riga
 * per riga lo normalizza riga per riga — non è un risparmio, è dove sta la
 * responsabilità.
 */
export function testoCorrisponde(mucchioNormalizzato: string, query: string): boolean {
  const token = tokenDiRicerca(query);
  if (token.length === 0) return true;
  return token.every((t) => mucchioNormalizzato.includes(t));
}

/** Vero se la voce contiene **tutte** le parole digitate, ovunque esse siano. */
export function opzioneCorrisponde(o: OpzioneScelta, query: string): boolean {
  return testoCorrisponde(mucchio(o), query);
}

/**
 * Punteggio di rilevanza, più basso = più in alto.
 *   0 l'etichetta comincia con quello che si è digitato
 *   1 una parola dell'etichetta comincia con quello che si è digitato
 *   2 tutto il resto (c'è dentro, magari nel dettaglio o nel testo nascosto)
 */
function punteggio(o: OpzioneScelta, query: string): number {
  const q = normalizzaTesto(query);
  if (!q) return 2;
  const et = normalizzaTesto(o.etichetta);
  if (et.startsWith(q)) return 0;
  if (et.split(' ').some((p) => p.startsWith(q))) return 1;
  return 2;
}

/**
 * Filtra e riordina. Una query vuota restituisce l'elenco **intatto**, nello
 * stesso ordine: aprire la tendina non deve rimescolare niente.
 */
export function filtraOpzioni(
  opzioni: readonly OpzioneScelta[],
  query: string,
): OpzioneScelta[] {
  if (tokenDiRicerca(query).length === 0) return [...opzioni];
  const tenute = opzioni.filter((o) => opzioneCorrisponde(o, query));
  // `map` con l'indice e poi confronto sull'indice: `Array.prototype.sort` è
  // stabile dalla ES2019 in poi, ma dirlo esplicitamente costa poco e non
  // dipende dal motore.
  return tenute
    .map((o, i) => ({ o, i, p: punteggio(o, query) }))
    .sort((a, b) => a.p - b.p || a.i - b.i)
    .map((x) => x.o);
}

export interface GruppoOpzioni {
  /** `null` = voci senza gruppo. */
  gruppo: string | null;
  opzioni: OpzioneScelta[];
}

/**
 * Raggruppa conservando l'ordine di **prima apparizione** dei gruppi, non
 * l'alfabetico: chi costruisce l'elenco ha già deciso che i tecnici vengono
 * dopo l'ufficio, e non tocca a questa funzione ribaltarlo.
 *
 * Le voci senza gruppo finiscono in un unico blocco `null` in fondo.
 */
export function raggruppaOpzioni(
  opzioni: readonly OpzioneScelta[],
): GruppoOpzioni[] {
  const ordine: string[] = [];
  const per = new Map<string, OpzioneScelta[]>();
  const senza: OpzioneScelta[] = [];

  for (const o of opzioni) {
    if (!o.gruppo) {
      senza.push(o);
      continue;
    }
    if (!per.has(o.gruppo)) {
      per.set(o.gruppo, []);
      ordine.push(o.gruppo);
    }
    per.get(o.gruppo)!.push(o);
  }

  const out: GruppoOpzioni[] = ordine.map((g) => ({
    gruppo: g,
    opzioni: per.get(g)!,
  }));
  if (senza.length > 0) out.push({ gruppo: null, opzioni: senza });
  return out;
}

/**
 * L'indice della prossima voce scegliibile muovendosi con le frecce.
 *
 * Salta le voci disabilitate invece di fermarcisi sopra — una freccia che non
 * si muove sembra un tasto rotto. Se non c'è nessuna voce scegliibile torna
 * `-1`. Non gira in tondo: arrivato in fondo resta in fondo, così tenendo
 * premuto non si riparte dall'alto senza accorgersene.
 */
export function prossimoIndice(
  opzioni: readonly OpzioneScelta[],
  da: number,
  passo: 1 | -1,
): number {
  for (let i = da + passo; i >= 0 && i < opzioni.length; i += passo) {
    if (!opzioni[i]!.disabilitata) return i;
  }
  // Nessuna voce libera in quella direzione: si resta dove si è, purché valido.
  return da >= 0 && da < opzioni.length && !opzioni[da]!.disabilitata ? da : -1;
}

/** Il primo indice scegliibile, o `-1`. */
export function primoIndiceUtile(opzioni: readonly OpzioneScelta[]): number {
  return prossimoIndice(opzioni, -1, 1);
}
