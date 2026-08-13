/**
 * Smistamento delle categorie che arrivano dal gestionale di un cliente.
 *
 * Il modello e' quello del reference data management: le categorie canoniche
 * sono **nostre**, i valori della sorgente si agganciano a quelle. Tre regole,
 * e sono vincolanti:
 *
 * 1. **Non si blocca mai** l'ingestione per un valore mai visto.
 * 2. **Non si crea mai in silenzio** una categoria canonica da un valore
 *    esterno: altrimenti la nostra lista diventa lo specchio della sorgente
 *    piu' disordinata, e un refuso del gestionale entra in casa per sempre.
 * 3. Il grezzo si conserva **sempre**, e il valore sconosciuto finisce in una
 *    coda "da smistare" dove decide una persona.
 *
 * L'unica eccezione alla regola 2 e' l'**uguaglianza esatta**: se il valore
 * normalizzato coincide con una categoria che gia' abbiamo, agganciarlo non e'
 * un'ipotesi, e' un'identita'. Su FPM copre 10 valori su 11 al primo giro.
 */

export interface CategoriaNostra {
  id: string;
  nome: string;
}

export interface MappaturaEsistente {
  valoreEsterno: string;
  categoriaId: string | null;
}

export interface EsitoSmistamento {
  /** Valore esterno → categoria nostra, per uguaglianza esatta. */
  daCollegare: Array<{ valoreEsterno: string; categoriaId: string }>;
  /** Mai visti prima e senza gemello: vanno in coda, non si inventano. */
  daSmistare: string[];
  /** Gia' presenti in mappatura: si aggiorna solo il contatore. */
  giaNoti: string[];
}

/**
 * Chiave di confronto: minuscole, senza spazi ai bordi, spazi interni
 * compattati. `"Quadri"`, `"QUADRI "` e `"quadri"` sono la stessa cosa — ed e'
 * esattamente il doppione che questo impianto esiste per evitare.
 *
 * Non si va oltre: togliere trattini o punteggiatura renderebbe uguali
 * `QUADRI` e `QUADRI - CL`, che sul gestionale di FPM sono due cose diverse.
 */
export function chiaveCategoria(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function smistaCategorie(
  valoriEsterni: string[],
  nostre: CategoriaNostra[],
  esistenti: MappaturaEsistente[],
): EsitoSmistamento {
  const perChiave = new Map(nostre.map((c) => [chiaveCategoria(c.nome), c.id]));
  const giaMappato = new Set(esistenti.map((m) => chiaveCategoria(m.valoreEsterno)));

  const daCollegare: EsitoSmistamento['daCollegare'] = [];
  const daSmistare: string[] = [];
  const giaNoti: string[] = [];
  const visti = new Set<string>();

  for (const grezzo of valoriEsterni) {
    const valore = (grezzo ?? '').trim();
    if (!valore) continue;
    const k = chiaveCategoria(valore);
    if (visti.has(k)) continue;
    visti.add(k);

    if (giaMappato.has(k)) {
      giaNoti.push(valore);
      continue;
    }
    const id = perChiave.get(k);
    if (id) daCollegare.push({ valoreEsterno: valore, categoriaId: id });
    else daSmistare.push(valore);
  }

  return { daCollegare, daSmistare, giaNoti };
}

/**
 * La categoria da scrivere su un cantiere nuovo.
 *
 * Se il valore e' smistato si usa **il nome nostro** — e' il punto di tutto
 * l'impianto: a schermo compare il nostro vocabolario, non quello del
 * gestionale. Se non lo e' ancora, si scrive il grezzo: meglio un cantiere con
 * la categoria della sorgente che uno senza, e quando l'ufficio smistera' il
 * valore i cantieri si riallineano.
 */
export function categoriaDaScrivere(
  valoreEsterno: string | null | undefined,
  mappa: Map<string, string>,
): string | null {
  const v = (valoreEsterno ?? '').trim();
  if (!v) return null;
  return mappa.get(chiaveCategoria(v)) ?? v;
}
