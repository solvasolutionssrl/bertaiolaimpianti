/**
 * I permessi concedibili a un token dell'API pubblica: un vocabolario solo.
 *
 * **Perche' esiste questo file.** L'elenco degli scope viveva in DUE copie:
 * `ScopeToken` in `apps/web/app/_lib/api-token.ts` (chi verifica) e
 * `ScopeTokenAdmin` in `apps/web/app/admin/_actions/api-tokens.ts` (chi
 * emette). Due elenchi della stessa cosa, in due file che nessuno modifica
 * insieme: il primo scope aggiunto da una parte e non dall'altra diventa un
 * permesso emettibile che nessuno riconosce, o riconosciuto che nessuno puo'
 * emettere. Qui ce n'e' uno, e lo leggono entrambi.
 *
 * ⚠️ In tabella `api_tokens.scopes` e' un `text[]` **senza vincolo**: l'elenco
 * di cio' che esiste sta nel codice, come per i modelli di trascrizione.
 * Aggiungere uno scope non vuole una migration — vuole una voce qui e una
 * rotta che la legga. Il criterio per aggiungerne uno e' lo stesso di sempre:
 * non «sarebbe comodo poterlo concedere», ma «c'e' una rotta che lo chiede».
 */

export type ScopeApi =
  | 'upload'
  | 'integrazione'
  | 'leggi:dipendenti'
  | 'leggi:dipendenti:costi';

export interface VoceScope {
  scope: ScopeApi;
  /** Come si chiama nel pannello di emissione. */
  etichetta: string;
  /** Cosa concede, in una frase, per chi emette il token. */
  descrizione: string;
  /**
   * Se il token agisce per conto di una persona. Vale solo per `upload`: i
   * file caricati risultano suoi e l'audit deve poter dire chi ha fatto cosa.
   * Per gli altri il chiamante e' una macchina, e attribuirlo a qualcuno
   * sporcherebbe il registro con un dato falso.
   */
  vuolePersona: boolean;
  /** Esempio di etichetta, mostrato nel campo del pannello. */
  segnaposto: string;
}

export const SCOPE_API: readonly VoceScope[] = [
  {
    scope: 'upload',
    etichetta: 'Invio file da iPhone',
    descrizione:
      'Comando iOS «Carica su Kommessa»: elenco delle commesse e invio di file. Un telefono, una persona.',
    vuolePersona: true,
    segnaposto: 'iPhone di Luca',
  },
  {
    scope: 'integrazione',
    etichetta: 'Gestionale (accesso completo)',
    descrizione:
      'Agente di sincronizzazione con il gestionale: legge e scrive tutta l’API pubblica, costo orario del personale compreso. Richiede il modulo Integrazione acceso sul cliente.',
    vuolePersona: false,
    segnaposto: 'Agente di sincronizzazione',
  },
  {
    scope: 'leggi:dipendenti',
    etichetta: 'Legge l’anagrafica del personale',
    descrizione:
      'Solo lettura dell’elenco dipendenti, senza costo orario e senza note. È quello che serve a una timbratrice per fare gli auguri di compleanno.',
    vuolePersona: false,
    segnaposto: 'Timbratrice ingresso',
  },
  {
    scope: 'leggi:dipendenti:costi',
    etichetta: 'Legge il personale con il costo orario',
    descrizione:
      'Come sopra, più il costo orario e le note. Da concedere solo a chi deve davvero calcolare dei costi.',
    vuolePersona: false,
    segnaposto: 'Applicativo costi',
  },
];

/**
 * Cosa concede ciascuno scope, **scritto a mano**.
 *
 * ⚠️ La gerarchia NON si deduce dal prefisso del nome. `leggi:dipendenti:costi`
 * comincia per `leggi:dipendenti`, ma dedurlo dalla stringa vorrebbe dire che
 * un domani un `leggi:dipendenti:qualsiasialtracosa` concede il primo per
 * sbaglio, e nessuno se ne accorge: un permesso nato per errore non da'
 * nessun segnale, funziona.
 *
 * ⚠️ `integrazione` **non** concede `upload`, ne' viceversa: chi sincronizza il
 * gestionale non deve poter caricare foto, e chi carica foto non deve poter
 * leggere il personale. Era una scelta gia' scritta nei commenti del pannello,
 * e qui diventa una riga che un test puo' difendere.
 */
const CONCEDE: Record<ScopeApi, readonly ScopeApi[]> = {
  upload: ['upload'],
  integrazione: ['integrazione', 'leggi:dipendenti', 'leggi:dipendenti:costi'],
  'leggi:dipendenti': ['leggi:dipendenti'],
  'leggi:dipendenti:costi': ['leggi:dipendenti:costi', 'leggi:dipendenti'],
};

export function scopeValido(s: string): s is ScopeApi {
  return Object.prototype.hasOwnProperty.call(CONCEDE, s);
}

export function vocePerScope(s: string): VoceScope | null {
  return SCOPE_API.find((v) => v.scope === s) ?? null;
}

/** Il token ha scope che bastano per quello che la rotta chiede? */
export function soddisfa(avuti: readonly string[], richiesto: ScopeApi): boolean {
  return avuti.some(
    (a) => scopeValido(a) && CONCEDE[a].includes(richiesto),
  );
}

/**
 * Serve il modulo Integrazione acceso sul cliente?
 *
 * ⭐ La domanda si fa sugli scope del TOKEN, non su quello che la rotta chiede.
 * Altrimenti un token `integrazione` che chiama una rotta di sola lettura
 * aggirerebbe l'interruttore del modulo: oggi spegnere il modulo ferma
 * l'agente del gestionale, e deve continuare a farlo. Per i token di sola
 * lettura il modulo non si pretende: quei token li emette il super admin uno
 * per uno, e l'autorizzazione e' il token stesso — si toglie revocandolo.
 */
export function richiedeModuloIntegrazione(avuti: readonly string[]): boolean {
  return avuti.includes('integrazione');
}

export type ProfiloDipendenti = 'nessuno' | 'base' | 'completo';

/**
 * Quanto dell'anagrafica del personale puo' vedere questo token.
 * `base` = senza costo orario e senza note; `completo` = tutto.
 */
export function profiloDipendenti(avuti: readonly string[]): ProfiloDipendenti {
  if (soddisfa(avuti, 'leggi:dipendenti:costi')) return 'completo';
  if (soddisfa(avuti, 'leggi:dipendenti')) return 'base';
  return 'nessuno';
}

/** Gli scope che il pannello super admin propone, nell'ordine in cui si leggono. */
export const SCOPE_EMETTIBILI: readonly ScopeApi[] = SCOPE_API.map((v) => v.scope);
