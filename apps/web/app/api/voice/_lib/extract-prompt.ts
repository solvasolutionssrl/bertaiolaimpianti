/**
 * Costruisce system + user prompt per Claude Haiku.
 *
 * Obiettivo: estrarre dati strutturati da un transcript di sopralluogo
 * parlato (italiano colloquiale, 30-90 secondi tipici).
 *
 * Vincolo: l'LLM **non inventa** dati assenti dal transcript. Se manca
 * un campo, lo omette dall'output.
 *
 * Output target (JSON):
 * {
 *   "ragione_sociale"?: string,
 *   "telefono"?: string,
 *   "email"?: string,
 *   "indirizzo"?: string,
 *   "voci_ids"?: number[],
 *   "descrizione"?: string,    // CamelCase 1-4 parole, max 30 char
 *   "note"?: string,           // estratto/riassunto della parte libera
 *   "tag_suggeriti"?: string[] // lowercase, max 5
 * }
 */

export interface VoceCat {
  id: number;
  nome: string;
}

export interface BuildPromptInput {
  transcript: string;
  voci: VoceCat[];
  tagEsistenti?: string[];
}

const SYSTEM_BASE = `Sei un assistente che estrae dati strutturati da un audio trascritto in italiano colloquiale.
L'audio è una nota vocale del capocantiere di un'azienda termoidraulica/elettrica durante un sopralluogo: descrive il cliente (persona o azienda), l'indirizzo, il tipo di lavoro e note operative.

REGOLE INDEROGABILI:
- Non inventare dati: se un campo non è chiaramente desumibile dal transcript, OMETTILO dall'output (NON usare null, NON usare stringhe vuote).
- "voci_ids" deve contenere SOLO id presenti nel catalogo qui sotto.
- "descrizione" è il nome cartella in CamelCase, 1-4 parole, max 30 caratteri, niente accenti/spazi/slash. Esempi: "SistemazioneBagno", "InstallazioneCaldaia", "ImpiantoSolareCompleto".
- "tag_suggeriti" sono massimo 5 stringhe lowercase senza spazi (es. "urgente", "garanzia", "bonus_110").
- "telefono" normalizzato a cifre + eventuale prefisso (es. "+39 333 1234567" o "0422 123456").
- "email" lowercase, valida nella forma.
- "indirizzo" stringa libera, SOLO la parte via + civico, NIENTE città.
  IMPORTANTE: estrai l'indirizzo OGNI VOLTA che riconosci uno dei marker
  tipici italiani — anche se appare a metà frase, anche se preceduto da
  "in/su/a/presso". Marker validi:
  • via / v. / viale / vle / vle.
  • piazza / p.zza / pz.
  • corso / c.so
  • largo / lgo
  • strada / str. / s.s. / s.p. / s.r. (anche statale/provinciale)
  • vicolo / vco
  • lungomare / contrada / loc. / località / fraz. / borgo / piazzale
  Esempi che DEVI catturare:
    "in via Primo Maggio 27" → "via Primo Maggio 27"
    "presso piazza Garibaldi 5" → "piazza Garibaldi 5"
    "abita in viale Trieste 100/A" → "viale Trieste 100/A"
    "loc. San Martino civico 14" → "loc. San Martino 14"
    "corso Italia snc" → "corso Italia snc"  (snc = senza numero civico)
- "citta" SOLO il nome città/comune (es. "Treviso", "Castelfranco Veneto").
  IMPORTANTE: cattura la città anche quando preceduta da preposizioni "a", "in", "di", "nel comune di".
  Esempi che DEVI catturare:
    "via Roma 12 a Bussolengo" → citta: "Bussolengo"
    "in via Primo Maggio 27 a Treviso" → indirizzo: "via Primo Maggio 27", citta: "Treviso"
    "presso piazza Garibaldi 5 di Padova" → citta: "Padova"
    "nel comune di Castelfranco Veneto" → citta: "Castelfranco Veneto"
  NON inserire "a/in/di" nel valore di citta — solo il nome.
- "ragione_sociale" così come pronunciata, capitalizzata sensatamente (es. "Rossi Mario", "Comune di Castagnole", "Edilizia Tre S.r.l.").
  ATTENZIONE: se il transcript usa SOLO termini generici ("il cliente", "la cliente", "il proprietario", "la signora", "il signore", "lui", "lei") SENZA un vero nome proprio, OMETTI ragione_sociale (NON inserirla come "cliente" o "il cliente"). Il capo aggiungerà il nome a mano.
- "tipo" è ENUM rigoroso: "persona_fisica" oppure "azienda".
  • "azienda" se il cliente è nominato con: "S.r.l.", "S.p.A.", "S.a.s.", "S.n.c.", "S.r.l.s.", "Ditta", "Impresa", "Studio", "Cooperativa", "Coop.", "Soc.", "ASD", "Comune di", "Parrocchia", "Condominio", "Hotel", "Ristorante", "Albergo", forme similari, OPPURE se il transcript dice esplicitamente "azienda" / "società" / "impresa" / "ditta" parlando del cliente.
  • "persona_fisica" se il cliente è chiamato per nome+cognome (es. "Rossi Mario", "Signor Bianchi", "Signora Verdi") senza qualifica societaria. Se nel dubbio, default "persona_fisica".
- "note" è una sintesi (max 280 caratteri) della parte libera della nota, in italiano.

OUTPUT:
Restituisci ESCLUSIVAMENTE un JSON valido (un oggetto JSON, non un array) conforme allo schema. NIENTE testo prima o dopo. NIENTE code fence markdown.`;

const FEW_SHOT = `ESEMPI:

[1] Persona fisica:
Transcript: "Allora sopralluogo da Rossi Mario via Roma 12 Treviso, mi ha chiesto di sostituire la caldaia e di rifargli due bagni completi, urgente perché parte a febbraio. Telefono 333 4567890."
Output JSON:
{"ragione_sociale":"Rossi Mario","tipo":"persona_fisica","telefono":"+39 333 4567890","indirizzo":"via Roma 12","citta":"Treviso","voci_ids":[19,13,31],"descrizione":"CaldaiaEDueBagni","note":"Sostituzione caldaia + rifacimento due bagni completi. Parte febbraio.","tag_suggeriti":["urgente"]}

[2] Azienda:
Transcript: "Sopralluogo dalla ditta Edilizia Tre S.r.l. in via dell'Industria 8 Castelfranco Veneto, vogliono rifare l'impianto gas dello stabilimento. Riferimento Marco Bianchi 0423 987654."
Output JSON:
{"ragione_sociale":"Edilizia Tre S.r.l.","tipo":"azienda","telefono":"0423 987654","indirizzo":"via dell'Industria 8","citta":"Castelfranco Veneto","voci_ids":[15],"descrizione":"ImpiantoGasStabilimento","note":"Rifacimento impianto gas stabilimento. Riferimento: Marco Bianchi.","tag_suggeriti":[]}

[3] Ente pubblico → azienda:
Transcript: "Sopralluogo al Comune di Castagnole, lavoro sull'impianto termico della scuola elementare."
Output JSON:
{"ragione_sociale":"Comune di Castagnole","tipo":"azienda","citta":"Castagnole","voci_ids":[15],"descrizione":"ImpiantoTermicoScuola","note":"Lavoro impianto termico scuola elementare."}

[4] Apertura colloquiale + indirizzo a metà frase (caso comune del capocantiere):
Transcript: "Sono stato da Mario Pezzini in via Primo Maggio 27. Ho fatto un sopralluogo e c'era bisogno di installare una pompa di calore in camera da letto."
Output JSON:
{"ragione_sociale":"Mario Pezzini","tipo":"persona_fisica","indirizzo":"via Primo Maggio 27","voci_ids":[14],"descrizione":"PompaDiCalore","note":"Sopralluogo: installare pompa di calore in camera da letto."}

[5] Senza marker esplicito "cliente/sopralluogo":
Transcript: "Ho fatto due ore da Bianchi in piazza Marconi 8 Verona, vuole rifare l'impianto fotovoltaico sul tetto."
Output JSON:
{"ragione_sociale":"Bianchi","tipo":"persona_fisica","indirizzo":"piazza Marconi 8","citta":"Verona","voci_ids":[18],"descrizione":"ImpiantoFotovoltaico","note":"Rifacimento impianto fotovoltaico sul tetto."}

[6] CRUCIALE — nome NON pronunciato (solo "il cliente"), città con preposizione "a":
Transcript: "Il cliente in via Primo Maggio 27 a Bussolengo vuole una pompa di calore installata in casa, uno split in camera da letto e uno in salotto."
Output JSON — NOTARE: niente ragione_sociale (è solo "il cliente", non un nome vero):
{"indirizzo":"via Primo Maggio 27","citta":"Bussolengo","voci_ids":[14],"descrizione":"PompaDiCaloreESplit","note":"Pompa di calore in casa, split in camera da letto e in salotto."}

(Gli id voci negli esempi sono illustrativi: usa SEMPRE gli id reali del catalogo fornito qui sotto.)`;

export function buildExtractPrompt(input: BuildPromptInput): {
  system: string;
  user: string;
} {
  const vociList = input.voci
    .map((v) => `  ${v.id}. ${v.nome}`)
    .join('\n');

  const tagSection =
    input.tagEsistenti && input.tagEsistenti.length > 0
      ? `\n\nTAG GIÀ USATI NEL TENANT (prediligili se pertinenti, altrimenti proponi nuovi tag):\n${input.tagEsistenti
          .slice(0, 30)
          .map((t) => `- ${t}`)
          .join('\n')}`
      : '';

  const system = [
    SYSTEM_BASE,
    '',
    'CATALOGO VOCI (id. nome):',
    vociList,
    tagSection,
    '',
    FEW_SHOT,
  ].join('\n');

  const user = [
    'TRANSCRIPT (italiano colloquiale, può contenere disfluenze):',
    '"""',
    input.transcript.trim(),
    '"""',
    '',
    'Restituisci il JSON di estrazione, nient\'altro.',
  ].join('\n');

  return { system, user };
}

/**
 * Mapping euristico voce → parole chiave italiane. Usato dal fallback
 * locale quando Claude non è disponibile (preview mode).
 *
 * Le voci 1..10 + 26 sono "sempre attive" (Sezione A) e non vanno
 * proposte qui (sono già selezionate di default).
 */
export const VOCI_KEYWORDS: ReadonlyArray<{
  id: number;
  keywords: string[];
}> = [
  { id: 13, keywords: ['bagno', 'bagni', 'sistemazione bagno', 'doccia', 'wc', 'sanitari'] },
  { id: 14, keywords: ['condizionatore', 'condizionamento', 'climatizzatore', 'split', 'pompa di calore', 'aria condizionata'] },
  { id: 15, keywords: ['gas', 'metano', 'gpl'] },
  { id: 16, keywords: ['aspirazione', 'centralizzata', 'aspirapolvere'] },
  { id: 17, keywords: ['solare', 'pannelli solari', 'termico'] },
  { id: 18, keywords: ['fotovoltaico', 'pannelli fotovoltaici', 'inverter', 'accumulo'] },
  { id: 19, keywords: ['caldaia', 'condensazione'] },
  { id: 11, keywords: ['sanitario', 'sanitari', 'colonne sanitario', 'tubi acqua'] },
  { id: 12, keywords: ['riscaldamento', 'colonne riscaldamento', 'radiatori', 'termosifoni'] },
  { id: 28, keywords: ['piatto doccia', 'piatti doccia'] },
  { id: 30, keywords: ['pavimento radiante', 'riscaldamento a pavimento', 'serpentine'] },
  { id: 31, keywords: ['montaggio bagno', 'montaggio bagni', 'piastrelle bagno'] },
  { id: 32, keywords: ['centrale termica', 'centrale', 'locale tecnico'] },
  { id: 20, keywords: ['ventilazione', 'vmc', 'recuperatore'] },
  { id: 21, keywords: ['collaudo', 'prova tenuta', 'pressione'] },
  { id: 33, keywords: ['allaccio', 'allacciamento'] },
  { id: 34, keywords: ['contatore'] },
  { id: 35, keywords: ['ape', 'attestato', 'certificato'] },
  { id: 22, keywords: ['pratica enea', 'enea', 'documentazione', 'pratica fiscale'] },
  { id: 23, keywords: ['libretto impianto', 'libretto'] },
  { id: 24, keywords: ['dichiarazione conformità', 'di.co.'] },
  { id: 25, keywords: ['relazione tecnica'] },
  { id: 36, keywords: ['supporto tecnico', 'consulenza'] },
  { id: 37, keywords: ['progetto', 'progettazione'] },
  { id: 38, keywords: ['quadro elettrico', 'alimentazione', 'cablaggio', 'elettrico'] },
];

const TAG_KEYWORDS: ReadonlyArray<{ tag: string; keywords: string[] }> = [
  { tag: 'urgente', keywords: ['urgente', 'subito', 'priorità', 'entro pochi giorni', 'entro la settimana'] },
  { tag: 'garanzia', keywords: ['garanzia', 'in garanzia'] },
  { tag: 'bonus_110', keywords: ['superbonus', '110', 'bonus 110'] },
  { tag: 'ecobonus', keywords: ['ecobonus', 'detrazione', 'detrazioni', '65%', '50%'] },
  { tag: 'manutenzione', keywords: ['manutenzione', 'tagliando', 'controllo periodico'] },
  { tag: 'sostituzione', keywords: ['sostituire', 'sostituzione', 'cambio'] },
  { tag: 'nuovo_impianto', keywords: ['nuovo impianto', 'da zero', 'prima installazione'] },
  { tag: 'cliente_top', keywords: ['cliente top', 'cliente storico', 'cliente importante'] },
];

interface LocalExtractResult {
  ragione_sociale?: string;
  tipo?: 'persona_fisica' | 'azienda';
  telefono?: string;
  email?: string;
  indirizzo?: string;
  citta?: string;
  voci_ids?: number[];
  descrizione?: string;
  note?: string;
  tag_suggeriti?: string[];
}

const AZIENDA_KEYWORDS = [
  's.r.l.', 'srl', 'srls', 's.r.l.s.', 's.p.a.', 'spa', 's.a.s.', 'sas',
  's.n.c.', 'snc', 'soc.', 'società', 'societa',
  'ditta', 'impresa', 'studio', 'cooperativa', 'coop.',
  'comune di', 'parrocchia', 'condominio',
  'hotel', 'albergo', 'ristorante', 'bar ', 'azienda', 'asd',
];

/**
 * Fallback locale (regex + heuristics) usato quando ANTHROPIC_API_KEY
 * non è configurata. Non sostituisce l'LLM ma è plausibile per la demo.
 */
export function localExtract(transcript: string): LocalExtractResult {
  const t = transcript.toLowerCase();
  const result: LocalExtractResult = {};

  // --- Telefono: 9-13 cifre con eventuali spazi/punti/+ ---
  const phoneMatch = transcript.match(
    /(?:\+?\s?39\s?)?(?:0\d{1,3}|3\d{2})[\s.-]?\d{3,4}[\s.-]?\d{3,4}/,
  );
  if (phoneMatch) {
    result.telefono = phoneMatch[0].replace(/\s+/g, ' ').trim();
  }

  // --- Email ---
  const emailMatch = transcript.match(
    /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
  );
  if (emailMatch) result.email = emailMatch[0].toLowerCase();

  // --- Indirizzo: pattern "via/viale/piazza/corso/strada X civico, Città" ---
  const addrMatch = transcript.match(
    /\b(?:via|viale|piazza|corso|strada|p\.zza|p\.za|loc\.|località)\s+[A-Za-zàèéìòù'\s.]{2,60}?\s+\d{1,4}[a-z]?(?:[\s,]+([A-Za-zàèéìòù'\s.]{2,30}))?/i,
  );
  if (addrMatch) {
    result.indirizzo = addrMatch[0].replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim();
  }

  // --- Ragione sociale: pattern "cliente <Nome Cognome|Azienda>" o
  //     "da <Nome Cognome>" o "signor/signora <X>" ---
  const ragMatch =
    transcript.match(
      /\b(?:cliente|sopralluogo da|da)\s+(?:il\s+|la\s+)?(?:signor[ae]?\s+)?([A-Z][a-zàèéìòù']+(?:\s+[A-Z][a-zàèéìòù']+){0,3})/,
    ) ||
    transcript.match(
      /\bsignor[ae]?\s+([A-Z][a-zàèéìòù']+(?:\s+[A-Z][a-zàèéìòù']+){0,2})/,
    );
  if (ragMatch && ragMatch[1]) {
    result.ragione_sociale = ragMatch[1].trim();
  }

  // --- Tipo cliente: persona_fisica vs azienda ---
  // Cerca markers societari nel transcript completo (case-insensitive)
  const tLower = transcript.toLowerCase();
  const isAzienda = AZIENDA_KEYWORDS.some((kw) => tLower.includes(kw));
  result.tipo = isAzienda ? 'azienda' : 'persona_fisica';

  // --- Voci ---
  const vociFound = new Set<number>();
  for (const { id, keywords } of VOCI_KEYWORDS) {
    if (keywords.some((kw) => t.includes(kw))) vociFound.add(id);
  }
  if (vociFound.size > 0) {
    result.voci_ids = [...vociFound].sort((a, b) => a - b);
  }

  // --- Tag ---
  const tagsFound = new Set<string>();
  for (const { tag, keywords } of TAG_KEYWORDS) {
    if (keywords.some((kw) => t.includes(kw))) tagsFound.add(tag);
  }
  if (tagsFound.size > 0) {
    result.tag_suggeriti = [...tagsFound];
  }

  // --- Descrizione: usa stessa logica di suggerisci-nome per le voci
  //     più "dominanti", o fallback dalle note. ---
  if (result.voci_ids && result.voci_ids.length > 0) {
    const DOMINANT = new Map<number, string>([
      [17, 'ImpiantoSolare'],
      [18, 'Fotovoltaico'],
      [19, 'InstallazioneCaldaia'],
      [15, 'ImpiantoGas'],
      [14, 'ImpiantoCondizionamento'],
      [13, 'SistemazioneBagno'],
      [31, 'MontaggioBagni'],
      [30, 'PavimentoRadiante'],
      [32, 'CentraleTermica'],
      [16, 'AspirazioneCentralizzata'],
    ]);
    for (const id of result.voci_ids) {
      const label = DOMINANT.get(id);
      if (label) {
        result.descrizione = label;
        break;
      }
    }
  }

  // --- Note: sintesi grezza (prima frase utile, max 280 char) ---
  const cleaned = transcript.replace(/\s+/g, ' ').trim();
  if (cleaned.length > 0) {
    result.note = cleaned.length > 280 ? cleaned.slice(0, 277) + '…' : cleaned;
  }

  return result;
}
