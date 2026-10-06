import { normalizzaTesto, tokenDiRicerca } from './scelta-opzioni';

/**
 * **L'elenco di cosa ha in mano una persona.**
 *
 * ## Perché un modulo, per un ordinamento
 *
 * La home del tecnico mostrava due elenchi separati — «Cosa fare» e «In
 * carico» — tagliati rispettivamente a otto e trenta voci, senza ricerca e
 * senza filtri. Con due commesse va bene; con quindici commesse e venti cose
 * da fare è un muro di schede in cui la voce che serve sta sotto.
 *
 * Unirli in un elenco solo vuol dire dover decidere **in che ordine stanno
 * cose di natura diversa**, e quella decisione è la parte che vale la pena
 * scrivere una volta e provare:
 *
 *   1. Ciò che ha una **data entro cui va fatto** viene prima, dalla più
 *      vicina alla più lontana. Le scadenze passate finiscono in cima da sé,
 *      perché una data passata è più piccola di una futura: non serve un ramo
 *      a parte, e un ramo a parte sarebbe un posto in più dove sbagliarsi.
 *   2. Tutto il resto segue **nell'ordine in cui è stato affidato**, dall'ultimo
 *      al primo: quello che l'ufficio ha appena assegnato è quello di cui la
 *      persona ancora non sa niente.
 *
 * ⚠️ **Una commessa non ha scadenza, una cosa da fare può averla.** Quindi
 * l'ordinamento mescola: una cosa da fare con la data di dopodomani sta sopra
 * una commessa affidata stamattina. È voluto — è l'unica domanda a cui l'elenco
 * deve rispondere, «cosa faccio adesso» — e chi vuole i due mondi separati ha
 * i filtri.
 */

export type TipoVoce = 'commessa' | 'todo' | 'richiesta';

export interface VoceElenco {
  tipo: TipoVoce;
  id: string;
  /** Come si legge a schermo: serve per l'ordine alfabetico. */
  titolo: string;
  /** Tutto ciò su cui la voce si lascia trovare: cliente, indirizzo, codice. */
  cerca?: string;
  /** ISO, se esiste una data entro cui va fatta. */
  scadenza?: string | null;
  /** ISO, quando è finita in mano a questa persona. */
  affidataIl?: string | null;
}

// ─────────────────────────── I filtri ───────────────────────────

export const FILTRI_ELENCO = [
  { valore: 'tutto', etichetta: 'Tutto' },
  { valore: 'commesse', etichetta: 'Commesse' },
  { valore: 'da_fare', etichetta: 'Da fare' },
] as const;

export type FiltroElenco = (typeof FILTRI_ELENCO)[number]['valore'];

/**
 * Una richiesta arrivata al telefono è una cosa da fare che non ha ancora una
 * commessa: sta sotto «Da fare», non in un terzo filtro. Un filtro per una
 * categoria che un tecnico incontra una volta al mese è un filtro che occupa
 * spazio e non si usa.
 */
export function vocePassaFiltro(v: VoceElenco, filtro: FiltroElenco): boolean {
  if (filtro === 'tutto') return true;
  if (filtro === 'commesse') return v.tipo === 'commessa';
  return v.tipo === 'todo' || v.tipo === 'richiesta';
}

// ─────────────────────────── L'ordine ───────────────────────────

export const ORDINI_ELENCO = [
  { valore: 'urgenza', etichetta: 'Prima le scadenze' },
  { valore: 'alfabetico', etichetta: 'In ordine alfabetico' },
] as const;

export type OrdineElenco = (typeof ORDINI_ELENCO)[number]['valore'];

/** Millisecondi, oppure `null` se la data non c'è o non si legge. */
function istante(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Ordina senza toccare l'array di partenza.
 *
 * ⚠️ Il confronto finisce **sempre** sul titolo e poi sull'id. Senza
 * quell'ultimo passo due voci identiche possono scambiarsi di posto fra un
 * ridisegno e l'altro, e un elenco che si muove da solo mentre lo leggi fa
 * perdere il segno. Stessa ragione per cui le letture paginate ordinano
 * sempre in ultimo su una colonna unica.
 */
export function ordinaElenco(
  voci: readonly VoceElenco[],
  ordine: OrdineElenco,
): VoceElenco[] {
  const out = [...voci];

  if (ordine === 'alfabetico') {
    out.sort(
      (a, b) =>
        a.titolo.localeCompare(b.titolo, 'it', { sensitivity: 'base' }) ||
        a.id.localeCompare(b.id),
    );
    return out;
  }

  out.sort((a, b) => {
    const sa = istante(a.scadenza);
    const sb = istante(b.scadenza);

    // Chi ha una data viene prima di chi non ne ha.
    if (sa !== null && sb === null) return -1;
    if (sa === null && sb !== null) return 1;

    // Entrambe con data: la più vicina prima. Le scadenze passate salgono in
    // cima da sé, perché sono numeri più piccoli.
    if (sa !== null && sb !== null && sa !== sb) return sa - sb;

    // Nessuna data: l'ultima affidata per prima. Chi non ha nemmeno quella
    // scende in fondo, invece di finire in testa come farebbe uno zero.
    if (sa === null && sb === null) {
      const aa = istante(a.affidataIl);
      const ab = istante(b.affidataIl);
      if (aa !== null && ab === null) return -1;
      if (aa === null && ab !== null) return 1;
      if (aa !== null && ab !== null && aa !== ab) return ab - aa;
    }

    return (
      a.titolo.localeCompare(b.titolo, 'it', { sensitivity: 'base' }) ||
      a.id.localeCompare(b.id)
    );
  });
  return out;
}

// ─────────────────────────── La ricerca ───────────────────────────

/**
 * Ogni parola battuta deve comparire da qualche parte nella voce, non
 * necessariamente nello stesso campo.
 *
 * ⚠️ È la stessa regola della ricerca cantieri: «rossi valeggio» deve trovare
 * la commessa del signor Rossi a Valeggio anche se il cognome sta nel cliente e
 * il paese nell'indirizzo. Il confronto su un campo solo non la trova, e chi
 * cerca conclude che la commessa non c'è.
 *
 * Normalizzazione e spezzettamento arrivano da `scelta-opzioni`: sono le stesse
 * usate dai menu a tendina con ricerca, e due regole diverse su come si piega
 * un accento vorrebbero dire che la stessa parola trova in un posto e non
 * nell'altro.
 */
export function voceCorrisponde(v: VoceElenco, query: string): boolean {
  const token = tokenDiRicerca(query);
  if (token.length === 0) return true;
  const mucchio = normalizzaTesto([v.titolo, v.cerca].filter(Boolean).join(' '));
  return token.every((t) => mucchio.includes(t));
}

/** Filtro, ricerca e ordine in un passaggio solo. */
export function componiElenco(
  voci: readonly VoceElenco[],
  opt: { filtro?: FiltroElenco; query?: string; ordine?: OrdineElenco } = {},
): VoceElenco[] {
  const filtro = opt.filtro ?? 'tutto';
  const query = opt.query ?? '';
  return ordinaElenco(
    voci.filter((v) => vocePassaFiltro(v, filtro) && voceCorrisponde(v, query)),
    opt.ordine ?? 'urgenza',
  );
}

/**
 * Quante voci ci sono per ciascun filtro, **dopo la ricerca**.
 *
 * ⚠️ Dopo, non prima: se cerco «caldaia» e la pastiglia «Commesse» continua a
 * dire 12 mentre a schermo ne vedo 2, il numero smette di voler dire qualcosa.
 */
export function contaPerFiltro(
  voci: readonly VoceElenco[],
  query = '',
): Record<FiltroElenco, number> {
  const visibili = voci.filter((v) => voceCorrisponde(v, query));
  return {
    tutto: visibili.length,
    commesse: visibili.filter((v) => vocePassaFiltro(v, 'commesse')).length,
    da_fare: visibili.filter((v) => vocePassaFiltro(v, 'da_fare')).length,
  };
}
