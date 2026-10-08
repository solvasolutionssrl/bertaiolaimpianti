/**
 * **Il nome della cartella si deriva dal titolo, non lo sostituisce.**
 *
 * Per mesi `commesse.descrizione_ai_finale` ha fatto due mestieri: era il
 * **titolo mostrato** della commessa e, insieme, il **terzo segmento del nome
 * cartella** su Nextcloud. Siccome il secondo dei due non tollera spazi,
 * vinceva lui: l'AI proponeva direttamente `ImpiantiMeccaniciCasaLegno`, quel
 * valore finiva in tabella, e a schermo si leggeva un nome di cartella al
 * posto di una frase.
 *
 * ⭐ **I due mestieri si separano senza una colonna nuova**, perché il
 * CamelCase ha gia' una casa definitiva: `commesse.nome_cartella`, che per
 * regola ferrea non si rinomina mai. Quindi la descrizione torna a essere una
 * frase umana e il segmento di cartella si **calcola una volta sola**, alla
 * creazione, con le funzioni di questo file.
 *
 * ## Perche' qui dentro e non nell'azione
 *
 * Perche' la stessa regola serve in **quattro** posti: il server che scrive
 * davvero la cartella, e le tre anteprime che la mostrano prima di salvare
 * (modulo desktop, sopralluogo, dettatura). Erano tre copie scritte a mano, e
 * ⚠️ **due mostravano un formato abbandonato** — `Cliente_2026-10-08_Lavoro`,
 * con la data in mezzo, quando il formato vero e' `codice_cliente_lavoro` e la
 * data e' gia' dentro il codice. La terza scriveva la sigla «BER» a mano,
 * quindi era falsa per ogni altro cliente. Un'anteprima che non combacia con
 * cio' che nascera' e' peggio di nessuna anteprima: insegna un percorso
 * sbagliato a chi poi dovra' cercare quella cartella.
 */

/** Quanto puo' essere lungo un segmento del nome cartella. */
export const MAX_SEGMENTO = 40;

/** Cosa si scrive quando non c'e' niente da scrivere. */
export const SEGMENTO_CLIENTE_VUOTO = 'Cliente';
export const SEGMENTO_DESCRIZIONE_VUOTA = 'Commessa';

/** La cartella di stato in cui ogni commessa nasce (`_lib/commessa-stato-folder`). */
export const CARTELLA_ALLA_NASCITA = '01_Richieste';

/** Toglie accenti e tutto cio' che non e' lettera o cifra. */
function soloLettereECifre(testo: string): string {
  return testo
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Za-z0-9]+/g, '');
}

/**
 * Spezza in parole su qualunque cosa non sia lettera o cifra.
 *
 * ⚠️ Gli accenti si tolgono **prima** di spezzare. In forma NFD «città» e'
 * `citta` piu' un segno combinante, che non e' una lettera: spezzando per
 * primo si otterrebbero due parole, `citt` e `a`, e il segmento diventerebbe
 * `CittA`.
 */
function parole(testo: string): string[] {
  return testo
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

/**
 * Da una frase umana al segmento CamelCase che finisce nel nome cartella.
 *
 *   «Impianti meccanici casa legno» → `ImpiantiMeccaniciCasaLegno`
 *
 * ⭐ **Una parola che ha gia' una maiuscola non si tocca.** Senza questa
 * regola, chi scrive ancora all'antica (`ImpiantiMeccanici`) si vedrebbe il
 * testo appiattito in `Impiantimeccanici`, e un'unita' di misura come `kW`
 * diventerebbe `KW`. Si alza solo la prima lettera di una parola tutta
 * minuscola; il resto resta come l'ha scritto chi l'ha scritto.
 *
 * ⚠️ **Il taglio e' a parola intera.** Il vecchio `sanitize()` troncava al
 * quarantesimo carattere qualunque cosa ci fosse li' in mezzo, e una cartella
 * che si chiama `SostituzioneCaldaiaERifacimentoImpiant` non si rinomina mai
 * piu'. Se la prima parola da sola sfonda il limite, allora si taglia lei —
 * non c'e' altro modo di stare dentro il bordo.
 */
export function aCamelCase(testo: string, max: number = MAX_SEGMENTO): string {
  if (max <= 0) return '';
  let fuori = '';
  for (const parola of parole(testo)) {
    const pezzo = /[A-Z]/.test(parola)
      ? parola
      : parola.charAt(0).toUpperCase() + parola.slice(1);
    if (fuori.length === 0) {
      fuori = pezzo.length > max ? pezzo.slice(0, max) : pezzo;
      continue;
    }
    if (fuori.length + pezzo.length > max) break;
    fuori += pezzo;
  }
  return fuori;
}

/**
 * Il segmento «cosa si fa» del nome cartella, dalla descrizione della commessa.
 * Non torna mai vuoto: una cartella senza terzo segmento avrebbe due underscore
 * di fila e nessuno saprebbe leggerla.
 */
export function segmentoDescrizione(descrizione: string | null | undefined): string {
  return aCamelCase(descrizione ?? '') || SEGMENTO_DESCRIZIONE_VUOTA;
}

/**
 * Il segmento «di chi e'» del nome cartella.
 *
 * ⚠️ **Qui NON si ricapitalizza niente**, ed e' voluto: le ragioni sociali
 * arrivano dall'anagrafica gia' scritte come vanno scritte, e alzare le
 * iniziali trasformerebbe «Comune di Castagnole» in «ComuneDiCastagnole»,
 * cioe' in un nome che nessuno ha mai scelto. Si tolgono solo gli spazi e la
 * punteggiatura, esattamente come faceva `crea-commessa.ts` prima: cambiare
 * questa riga cambierebbe il nome delle cartelle nuove rispetto alle vecchie.
 */
export function segmentoCliente(ragioneSociale: string | null | undefined): string {
  const pulito = soloLettereECifre((ragioneSociale ?? '').trim()).slice(0, MAX_SEGMENTO);
  return pulito || SEGMENTO_CLIENTE_VUOTO;
}

export interface PezziNomeCartella {
  /** Il codice interno assegnato al salvataggio (`BER-1026-007`). */
  codice: string;
  /** Ragione sociale del cliente, come sta in anagrafica. */
  cliente: string | null | undefined;
  /** La descrizione umana del lavoro, con gli spazi. */
  descrizione: string | null | undefined;
}

/**
 * Il nome cartella canonico: `<codice>_<cliente>_<lavoro>`.
 * Niente data: e' gia' dentro il codice (`BER-MMAA-progressivo`).
 */
export function componiNomeCartella(p: PezziNomeCartella): string {
  return `${p.codice}_${segmentoCliente(p.cliente)}_${segmentoDescrizione(p.descrizione)}`;
}

/**
 * Il percorso da mostrare **prima** di salvare, quando il codice non esiste
 * ancora perche' lo assegna la RPC al salvataggio.
 *
 * ⚠️ Il codice si lascia come segnaposto dichiarato invece di indovinarlo: la
 * vecchia anteprima del modulo desktop costruiva `BER-MMAA-XXX` con la sigla
 * scritta a mano nel codice sorgente, quindi mostrava «BER» anche agli altri
 * clienti dell'applicazione.
 */
export function anteprimaNomeCartella(
  p: Omit<PezziNomeCartella, 'codice'> & { codice?: string },
): string {
  const codice = p.codice?.trim() || '<codice>';
  return `${CARTELLA_ALLA_NASCITA}/${componiNomeCartella({ ...p, codice })}/`;
}
