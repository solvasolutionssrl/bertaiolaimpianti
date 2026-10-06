/**
 * Trascrizione audio: **quale modello**, **come gli si parla**, **con quali
 * parole in mano**.
 *
 * ## Qui dentro non c'è l'elenco dei modelli, ed è il punto
 *
 * Il primo tentativo (06/10/2026) era un file con nome, prezzo e descrizione di
 * ogni modello OpenAI. Si rompe da solo: va riscritto a mano ogni volta che ne
 * esce uno, e finché nessuno lo riscrive ogni cliente resta fermo alla scelta
 * fatta il giorno dell'installazione. È lo stesso difetto dei limiti di invio
 * media prima del 05/10 — una decisione di prodotto scritta nel codice.
 *
 * Quali modelli si possono scegliere e qual è il predefinito sono **dato**, in
 * `platform_settings` riga `modelli_trascrizione`, e si cambiano dal pannello
 * super admin senza un deploy. Esce un modello nuovo? Si scrive il nome.
 *
 * Tre livelli, come per i limiti di invio:
 *
 * | Livello | Dove | Chi lo cambia |
 * |---|---|---|
 * | rete di sicurezza | `MODELLO_ESTREMO` qui sotto | nessuno |
 * | predefinito di piattaforma | `platform_settings`, riga `modelli_trascrizione` | super admin |
 * | scelta del cliente | `tenants.transcribe_model` | super admin, dal pannello del tenant |
 *
 * ## Quello che invece sta giustamente in codice
 *
 * La **grammatica della richiesta**: i modelli non accettano tutti gli stessi
 * campi, e il campo di troppo non viene ignorato, fa fallire la chiamata.
 *
 * | Famiglia | Lingua | Vocabolario | Contesto |
 * |---|---|---|---|
 * | `moderna` (`gpt-transcribe`, `gpt-live-transcribe`) | `languages[]` | `keywords[]` | `prompt` |
 * | `gpt4o` (`gpt-4o-transcribe`, `gpt-4o-mini-transcribe`) | `language` | — | `prompt` |
 * | `whisper` (`whisper-1`) | `language` | — | `prompt`, 224 token |
 *
 * È un fatto sul contratto HTTP, non una preferenza, e si ricava **dal prefisso
 * del nome** invece che da un elenco: così `gpt-transcribe-2`, che oggi non
 * esiste, funziona il giorno in cui qualcuno lo scrive nel pannello.
 *
 * Puro e deterministico: nessun database, nessun `fetch`, nessun env.
 */

// ── la grammatica ───────────────────────────────────────────────────────────

/** Quali campi accetta la richiesta di un modello. */
export type FamigliaTrascrizione = 'moderna' | 'gpt4o' | 'whisper';

/**
 * La famiglia di un modello, dal suo nome.
 *
 * Le regole sono in ordine di specificità: `gpt-4o-transcribe` comincia per
 * `gpt-` ma **non** è della famiglia moderna, quindi i `gpt-4o` si riconoscono
 * per primi. Invertire le due righe è il modo esatto per rompere tutto in
 * silenzio.
 *
 * Un nome che non assomiglia a niente di noto diventa `whisper`: `language` e
 * `prompt` sono accettati da tutte e tre le famiglie, quindi è la scelta che
 * male non fa. Meglio una trascrizione senza vocabolario che una richiesta
 * rifiutata per un campo di troppo.
 */
export function famigliaTrascrizione(modello: string): FamigliaTrascrizione {
  const id = String(modello ?? '').trim().toLowerCase();
  if (id.startsWith('gpt-4o')) return 'gpt4o';
  if (id.startsWith('gpt-transcribe') || id.startsWith('gpt-live-transcribe')) {
    return 'moderna';
  }
  return 'whisper';
}

/** Vero se al modello si può passare l'elenco delle parole attese. */
export function accettaVocabolario(modello: string): boolean {
  return famigliaTrascrizione(modello) === 'moderna';
}

/**
 * L'ultima rete, se il database non risponde e l'ambiente tace. Non è «il
 * modello scelto»: è il nome da usare per non restare muti, e conviene che sia
 * un modello buono invece del più vecchio in circolazione.
 */
export const MODELLO_ESTREMO = 'gpt-transcribe';

/**
 * Forma di un nome plausibile. Ferma il refuso evidente (uno spazio, una
 * virgola, un campo vuoto) **senza** pretendere di sapere quali modelli
 * esistono: quello lo sa OpenAI, non noi.
 */
export function nomeModelloPlausibile(s: unknown): boolean {
  if (typeof s !== 'string') return false;
  const v = s.trim();
  return v.length > 0 && v.length <= 80 && /^[a-z0-9][a-z0-9._-]*$/i.test(v);
}

// ── le impostazioni, che sono dato ──────────────────────────────────────────

export interface ImpostazioniTrascrizione {
  /** Il modello che usa chi non ha scelto niente. `null` = decide l'ambiente. */
  predefinito: string | null;
  /**
   * I modelli che il pannello propone. Un elenco **vuoto non è un divieto**:
   * significa solo «nessun suggerimento», e si può comunque scrivere un nome.
   * Serve a non trasformare questa lista nel catalogo che volevamo evitare.
   */
  ammessi: string[];
}

export const IMPOSTAZIONI_TRASCRIZIONE_VUOTE: ImpostazioniTrascrizione = {
  predefinito: null,
  ammessi: [],
};

/**
 * Legge la riga di `platform_settings` senza mai sollevare: una riga storta non
 * deve impedire una dettatura. Tutto ciò che non è un nome plausibile viene
 * scartato in silenzio, qui, in lettura. In **scrittura** invece si rifiuta e si
 * dice perché (`validaImpostazioniTrascrizione`): è la stessa asimmetria dei
 * limiti di invio, e per lo stesso motivo.
 */
export function impostazioniTrascrizioneDaConfig(
  raw: unknown,
): ImpostazioniTrascrizione {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return IMPOSTAZIONI_TRASCRIZIONE_VUOTE;
  }
  const o = raw as Record<string, unknown>;
  const predefinito = nomeModelloPlausibile(o.predefinito)
    ? (o.predefinito as string).trim()
    : null;
  const ammessi = Array.isArray(o.ammessi)
    ? Array.from(
        new Set(
          o.ammessi
            .filter(nomeModelloPlausibile)
            .map((s) => (s as string).trim()),
        ),
      )
    : [];
  return { predefinito, ammessi };
}

export interface EsitoValidazione {
  ok: boolean;
  errori: string[];
}

/**
 * Controlla quello che un umano ha appena scritto nel pannello. Raccoglie
 * **tutti** gli errori invece di fermarsi al primo: chi ha sbagliato due campi
 * vuole saperlo in un colpo solo.
 */
export function validaImpostazioniTrascrizione(input: {
  predefinito?: unknown;
  ammessi?: unknown;
}): EsitoValidazione {
  const errori: string[] = [];

  if (input.predefinito != null && input.predefinito !== '') {
    if (!nomeModelloPlausibile(input.predefinito)) {
      errori.push(
        'Il modello predefinito non ha una forma valida: lettere, cifre, punti e trattini, senza spazi.',
      );
    }
  }

  if (input.ammessi != null) {
    if (!Array.isArray(input.ammessi)) {
      errori.push("L'elenco dei modelli proposti non è una lista.");
    } else {
      for (const a of input.ammessi) {
        if (!nomeModelloPlausibile(a)) {
          errori.push(
            `«${String(a).slice(0, 40)}» non ha la forma di un nome di modello.`,
          );
        }
      }
    }
  }

  return { ok: errori.length === 0, errori };
}

/**
 * Quale modello usare, davvero.
 *
 * Dal più forte al più debole: la scelta fatta per quel cliente, il predefinito
 * di piattaforma, la variabile d'ambiente, la rete di sicurezza. Ogni livello
 * vale solo se è un nome plausibile, così una riga sporca nel database scende di
 * un gradino invece di produrre una chiamata rifiutata.
 *
 * ⚠️ Non si controlla che il modello sia fra gli `ammessi`: quell'elenco è un
 * suggerimento per il pannello, non un permesso. Un super admin che scrive a
 * mano un modello nuovo deve poterlo usare **subito**, senza aspettare che
 * qualcuno aggiorni una lista — che è l'intero motivo per cui la lista non sta
 * nel codice.
 */
export function risolviModelloTrascrizione(livelli: {
  tenant?: unknown;
  globale?: string | null;
  env?: unknown;
}): string {
  for (const livello of [livelli.tenant, livelli.globale, livelli.env]) {
    if (nomeModelloPlausibile(livello)) return (livello as string).trim();
  }
  return MODELLO_ESTREMO;
}

// ── il vocabolario ──────────────────────────────────────────────────────────

/**
 * Quante parole si spediscono al massimo.
 *
 * OpenAI avverte che un elenco troppo lungo peggiora invece di migliorare: il
 * modello comincia a **far comparire termini che nessuno ha detto**. Su un audio
 * che diventa una commessa, un comune inventato è peggio di un comune sbagliato,
 * perché sembra giusto e nessuno va a controllarlo.
 */
export const MAX_VOCABOLARIO = 100;

/** Sotto questa lunghezza una parola non aiuta e fa solo rumore. */
const MIN_PAROLA = 3;
const MAX_PAROLA = 40;

/**
 * Ripulisce l'elenco delle parole attese prima di spedirlo.
 *
 * Toglie i doppioni **senza distinguere maiuscole e accenti** ma conserva la
 * prima grafia incontrata: al modello serve sapere come si scrive «Valeggio sul
 * Mincio», e mandarglielo anche in minuscolo non aggiunge niente.
 *
 * L'ordine di arrivo è l'ordine di importanza, e viene rispettato: chi chiama
 * mette davanti quello che conta di più, perché è la coda a venire tagliata.
 */
export function preparaVocabolario(
  parole: readonly unknown[],
  max: number = MAX_VOCABOLARIO,
): string[] {
  const viste = new Set<string>();
  const out: string[] = [];
  for (const p of parole) {
    if (typeof p !== 'string') continue;
    const v = p.trim().replace(/\s+/g, ' ');
    if (v.length < MIN_PAROLA || v.length > MAX_PAROLA) continue;
    const chiave = v
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
    if (viste.has(chiave)) continue;
    viste.add(chiave);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Il suggerimento testuale per i modelli che non hanno un campo dedicato.
 * È la tecnica documentata da OpenAI per Whisper, che ha una finestra di 224
 * token: si sta larghi e si tronca a 800 caratteri.
 */
export function promptConVocabolario(
  contesto: string | undefined,
  vocabolario: readonly string[],
): string | undefined {
  const parti: string[] = [];
  if (contesto?.trim()) parti.push(contesto.trim());
  if (vocabolario.length > 0) {
    parti.push(`Termini ricorrenti: ${vocabolario.join(', ')}.`);
  }
  if (parti.length === 0) return undefined;
  return parti.join(' ').slice(0, 800);
}
