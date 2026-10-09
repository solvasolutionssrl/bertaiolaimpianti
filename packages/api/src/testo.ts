/**
 * **Tagliare un testo senza spezzare una parola.**
 *
 * Una riga sola, ma vive in un posto condiviso perché il taglio a metà parola
 * non è un difetto estetico: la descrizione di una commessa diventa il nome
 * della cartella su Nextcloud, che non si rinomina più, e «…Rifacimento
 * Impiant» resta così per sempre.
 */

/**
 * Le prime parole intere che stanno dentro `max` caratteri.
 *
 * ⚠️ **Se la prima parola da sola sfonda il limite, si taglia lei**: non c'è
 * altro modo di stare dentro il bordo, e tornare una stringa vuota sarebbe
 * peggio (chi chiama si ritroverebbe un campo obbligatorio svuotato).
 *
 * ⚠️ Gli spazi multipli si compattano prima di misurare: un testo che arriva
 * da una trascrizione ne ha spesso due di fila, e conterebbero come caratteri
 * buoni spesi per niente.
 */
export function tagliaAParolaIntera(testo: string, max: number): string {
  if (max <= 0) return '';
  const pulito = testo.replace(/\s+/g, ' ').trim();
  if (pulito.length <= max) return pulito;

  let fuori = '';
  for (const parola of pulito.split(' ')) {
    const candidato = fuori ? `${fuori} ${parola}` : parola;
    if (candidato.length > max) break;
    fuori = candidato;
  }
  // Nemmeno la prima parola ci sta: si taglia lei, perché un campo
  // obbligatorio tornato vuoto blocca chi sta lavorando.
  return fuori || pulito.slice(0, max);
}

/**
 * Ripulisce una parola cercata **prima** di interpolarla in un `or=(…)` di
 * PostgREST.
 *
 * ⚠️ **Una virgola spezza il filtro.** PostgREST divide il corpo di `or` sulle
 * virgole di primo livello: cercando «Rossi, via Verdi» si ottengono quattro
 * termini, due dei quali non sono filtri, e la richiesta torna **400**. Lo
 * stesso fanno le parentesi, le virgolette, la barra rovescia e l'asterisco
 * (che in `ilike` è il jolly). In una ricerca per sottostringa non servono a
 * niente, e lasciarli dentro vuol dire — a seconda di come chi chiama tratta
 * l'errore — una pagina d'errore oppure, peggio, **nessun risultato in
 * silenzio**: chi cerca conclude che il dato non c'è.
 *
 * ⭐ Dove si può, meglio non passare affatto dal database per il testo (vedi
 * la board «Task e Richieste»). Questa funzione è per le ricerche che un
 * filtro lato server ce l'hanno davvero.
 */
export function testoPerFiltroOr(testo: string | null | undefined): string {
  return (testo ?? '').replace(/[,()"\\*]/g, ' ').replace(/\s+/g, ' ').trim();
}
