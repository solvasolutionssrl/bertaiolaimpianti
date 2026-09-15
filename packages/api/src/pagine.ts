/**
 * Letture complete oltre il tetto di righe di PostgREST.
 *
 * Il database restituisce al massimo 1000 righe per richiesta anche se se ne
 * chiedono di più (`.limit(20000)` compreso), e non lo segnala: un totale, un
 * export o un report calcolati su una lettura sola possono risultare sbagliati
 * senza nessun errore. Verificato sul progetto il 15/09/2026: chieste 5000
 * righe, arrivate 1000.
 *
 * `leggiTutto` legge a pagine con `.range()` finché una pagina non arriva
 * corta; `leggiPerGruppi` spezza le liste di id dei filtri `in(...)`, che
 * finiscono nell'URL e oltre qualche centinaio di id superano i limiti del
 * gateway. Sono pure: ricevono la funzione che costruisce la query, così si
 * provano senza database.
 *
 * Due regole per chi le usa:
 * - la query deve avere un ordinamento stabile che finisce su una colonna
 *   unica (es. `.order('ts').order('id')`), altrimenti fra una pagina e
 *   l'altra le righe possono spostarsi, ripetersi o mancare;
 * - un errore interrompe la lettura con un'eccezione: meglio una pagina
 *   d'errore che ore o importi calcolati su dati a metà.
 */

/** Righe per pagina: il tetto di PostgREST del progetto. Non va superato. */
export const RIGHE_PER_PAGINA = 1000;

/** Id per richiesta nei filtri `in(...)`: un uuid occupa circa 38 caratteri nell'URL. */
export const ID_PER_RICHIESTA = 100;

/** Protezione contro i cicli senza fine (query senza filtro su tabelle enormi). */
export const MASSIMO_RIGHE = 200_000;

/** Quello che restituisce una query di supabase-js (`{ data, error }`). */
export interface EsitoPagina<T> {
  data: T[] | null;
  error: { message: string } | null;
}

export interface OpzioniLettura {
  /** Cosa si sta leggendo, per il messaggio d'errore. */
  contesto?: string;
  perPagina?: number;
  massimoRighe?: number;
}

/**
 * Tutte le righe di una query, pagina per pagina.
 *
 * @param pagina costruisce la query per l'intervallo `[da, a]` (estremi
 *   inclusi, come `.range(da, a)`).
 */
export async function leggiTutto<T>(
  pagina: (da: number, a: number) => PromiseLike<EsitoPagina<T>>,
  opts: OpzioniLettura = {},
): Promise<T[]> {
  const perPagina = opts.perPagina ?? RIGHE_PER_PAGINA;
  const massimo = opts.massimoRighe ?? MASSIMO_RIGHE;
  const contesto = opts.contesto ?? 'lettura';
  if (!Number.isInteger(perPagina) || perPagina < 1) {
    throw new Error(`${contesto}: righe per pagina non valide (${perPagina})`);
  }

  const righe: T[] = [];
  for (let da = 0; ; da += perPagina) {
    const { data, error } = await pagina(da, da + perPagina - 1);
    if (error) throw new Error(`${contesto}: ${error.message}`);
    const lette = data ?? [];
    for (const r of lette) righe.push(r);
    if (lette.length < perPagina) return righe;
    if (righe.length >= massimo) {
      throw new Error(`${contesto}: più di ${massimo} righe, restringere la lettura`);
    }
  }
}

/**
 * Esegue `leggi` a gruppi di id (senza doppioni) e unisce i risultati, in
 * ordine di gruppo. Con zero id non fa nessuna richiesta.
 */
export async function leggiPerGruppi<I, T>(
  id: readonly I[],
  leggi: (gruppo: I[]) => Promise<T[]>,
  perGruppo: number = ID_PER_RICHIESTA,
): Promise<T[]> {
  if (!Number.isInteger(perGruppo) || perGruppo < 1) {
    throw new Error(`id per richiesta non validi (${perGruppo})`);
  }
  const unici = [...new Set(id)];
  const out: T[] = [];
  for (let i = 0; i < unici.length; i += perGruppo) {
    const parte = await leggi(unici.slice(i, i + perGruppo));
    for (const r of parte) out.push(r);
  }
  return out;
}

/**
 * Le righe che corrispondono a una lista di id, qualunque sia la sua lunghezza:
 * gruppi da `ID_PER_RICHIESTA` id, ogni gruppo letto a pagine. La query riceve
 * il gruppo e l'intervallo (`.in(colonna, gruppo).order(…).order('id').range(da, a)`).
 */
export function leggiPerId<I, T>(
  id: readonly I[],
  pagina: (gruppo: I[], da: number, a: number) => PromiseLike<EsitoPagina<T>>,
  opts: OpzioniLettura & { perGruppo?: number } = {},
): Promise<T[]> {
  const { perGruppo, ...lettura } = opts;
  return leggiPerGruppi(
    id,
    (gruppo) => leggiTutto((da, a) => pagina(gruppo, da, a), lettura),
    perGruppo,
  );
}

