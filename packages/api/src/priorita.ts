/**
 * La priorità di un task, di una richiesta al telefono e di un ticket: **una
 * scala sola, tre livelli, un vocabolario**.
 *
 * Fino al 06/10/2026 la stessa colonna del database si presentava a schermo in
 * nove modi diversi: nella pagina Task era una pastiglia «Bassa/Media/Alta»,
 * nel dialog della richiesta al telefono diventava «Quando capita / Normale /
 * Presto», nei ticket era testo colorato con un'altra tavolozza, e nella scheda
 * del ticket compariva **il valore grezzo del database in minuscolo**. Otto
 * tavolozze divergenti, cinque mappe di ordinamento identiche copiate a mano,
 * quindici dichiarazioni dello stesso tipo. Questo file è l'unica verità.
 *
 * ## Perché tre livelli e non quattro
 *
 * Il database nasce con quattro valori (`bassa/media/alta/urgente`) e con
 * `media` come default. Guardando i dati veri del 06/10/2026: **53 task su
 * `media`, 22 su `alta`, 3 su `urgente`, zero su `bassa`**. Nessuno ha mai
 * scelto il fondo della scala — `media` non è una scelta, è ciò che esce quando
 * non si sceglie. Quattro gradini di cui uno inutilizzato e uno riempito dal
 * default non sono una scala: sono tre gradini con un passaggio di troppo.
 *
 * I 53 `media` sono quindi diventati `bassa`, che è il nuovo default: dire «3 -
 * Bassa» su un task che nessuno ha marcato è la verità, dire «Media» era un
 * modo elegante di non dire niente. L'ordine relativo nelle liste non cambia.
 *
 * ## `media` resta nel tipo Postgres, e non è una dimenticanza
 *
 * Togliere un valore da un `enum` Postgres significa ricreare il tipo, e quel
 * tipo è usato da una chiave primaria (`sla_policy`), da un trigger e da due
 * default. Il guadagno sarebbe estetico, il rischio no. Il valore resta
 * accettato dal database e **mai più scritto** dall'applicazione; chi legge
 * passa da `normalizzaPriorita`, che lo traduce. Vedi la migration
 * `20261006090000_priorita_tre_livelli.sql`.
 *
 * ## Il numero fa parte del nome
 *
 * L'etichetta canonica è «1 - Urgente», non «Urgente». Il numero dà la scala a
 * colpo d'occhio senza bisogno di ricordare se «alta» viene prima o dopo
 * «media», ed è la richiesta esplicita del cliente. `parola` esiste solo per i
 * pochi punti in cui lo spazio non basta davvero.
 *
 * Puro e deterministico: nessun accesso al database, nessuna data, nessun env,
 * nessun componente React. Le icone sono **nomi**, non componenti: un'icona
 * Lucide non attraversa il confine server → client come prop.
 */

/** I tre livelli, dal più urgente al meno urgente. L'ordine è quello di lettura. */
export const PRIORITA = ['urgente', 'alta', 'bassa'] as const;

export type Priorita = (typeof PRIORITA)[number];

/**
 * Quello che si scrive quando nessuno sceglie. Era `media`, ed è il motivo per
 * cui `media` contava 53 righe su 78.
 */
export const PRIORITA_DEFAULT: Priorita = 'bassa';

/**
 * Valori che il database accetta ancora ma che l'applicazione non scrive più.
 * Letti, vengono tradotti da `normalizzaPriorita`.
 */
export const PRIORITA_DISMESSE = ['media'] as const;

/** Nome di un'icona Lucide. Stringa, non componente: deve poter essere una prop. */
export type NomeIconaPriorita = 'Flame' | 'AlertCircle' | 'Circle';

export interface MetaPriorita {
  valore: Priorita;
  /** 1, 2, 3. È anche il peso di ordinamento: più basso = più urgente. */
  numero: 1 | 2 | 3;
  /** Come si scrive ovunque ci sia spazio: «1 - Urgente». */
  etichetta: string;
  /** Solo dove l'etichetta intera non ci sta: «Urgente». */
  parola: string;
  /** Classi della pastiglia: sfondo, testo, bordo. */
  chip: string;
  /** Classe del pallino pieno, per le liste a colonne. */
  punto: string;
  /**
   * Solo il colore del testo (e quindi di un'icona), senza sfondo né bordo:
   * per le righe così strette che una pastiglia costerebbe una riga intera.
   */
  testo: string;
  /** Anello di evidenza, usato solo dove la riga è grande (board Lavori). */
  anello: string;
  icona: NomeIconaPriorita;
}

/**
 * La tavolozza. Rosso e ambra restano quelli che l'app già usava per urgente e
 * alta: cambiare anche i colori avrebbe reso irriconoscibile una pagina che le
 * persone usano tutti i giorni. Il livello 3 è volutamente **spento**: è la
 * condizione normale, non deve chiamare l'occhio.
 */
export const PRIORITA_META: Record<Priorita, MetaPriorita> = {
  urgente: {
    valore: 'urgente',
    numero: 1,
    etichetta: '1 - Urgente',
    parola: 'Urgente',
    chip: 'bg-red-500/15 text-red-700 border-red-500/40 dark:text-red-400',
    punto: 'bg-red-500',
    testo: 'text-red-600 dark:text-red-400',
    anello: 'ring-red-500/30',
    icona: 'Flame',
  },
  alta: {
    valore: 'alta',
    numero: 2,
    etichetta: '2 - Alta',
    parola: 'Alta',
    chip: 'bg-amber-500/15 text-amber-700 border-amber-500/40 dark:text-amber-400',
    punto: 'bg-amber-500',
    testo: 'text-amber-600 dark:text-amber-400',
    anello: 'ring-amber-500/30',
    icona: 'AlertCircle',
  },
  bassa: {
    valore: 'bassa',
    numero: 3,
    etichetta: '3 - Bassa',
    parola: 'Bassa',
    chip: 'bg-muted text-muted-foreground border-border',
    punto: 'bg-slate-400',
    testo: 'text-muted-foreground',
    anello: '',
    icona: 'Circle',
  },
};

/**
 * Traduce qualunque cosa arrivi dal database in uno dei tre livelli.
 *
 * Non solleva mai e non restituisce mai `null`: una priorità sconosciuta su una
 * riga non deve impedire di vedere il task. `media` → `bassa` perché era il
 * default, cioè l'assenza di scelta; qualunque altro valore inatteso finisce
 * anch'esso su `bassa`, che è il livello che non grida.
 */
export function normalizzaPriorita(raw: unknown): Priorita {
  if (typeof raw !== 'string') return PRIORITA_DEFAULT;
  const v = raw.trim().toLowerCase();
  if ((PRIORITA as readonly string[]).includes(v)) return v as Priorita;
  // `media` e ogni altro residuo: l'assenza di scelta vale 3 - Bassa.
  return PRIORITA_DEFAULT;
}

/** La riga della tavolozza, partendo da un valore anche sporco. */
export function metaPriorita(raw: unknown): MetaPriorita {
  return PRIORITA_META[normalizzaPriorita(raw)];
}

/** «1 - Urgente». La forma canonica: usare questa salvo spazio insufficiente. */
export function etichettaPriorita(raw: unknown): string {
  return metaPriorita(raw).etichetta;
}

/** «Urgente». Solo dove l'etichetta intera non ci sta. */
export function parolaPriorita(raw: unknown): string {
  return metaPriorita(raw).parola;
}

/**
 * Peso di ordinamento: 1 urgente, 3 bassa. Più basso viene prima.
 *
 * Sostituisce cinque mappe `{ urgente: 0, alta: 1, media: 2, bassa: 3 }`
 * scritte a mano in cinque file diversi, che per fortuna concordavano.
 */
export function pesoPriorita(raw: unknown): number {
  return metaPriorita(raw).numero;
}

/**
 * Comparatore pronto per `Array.prototype.sort`: prima le urgenti.
 * A parità di priorità non decide nulla (torna 0): sta al chiamante
 * concatenare i criteri successivi (scadenza, titolo).
 */
export function confrontaPriorita(a: unknown, b: unknown): number {
  return pesoPriorita(a) - pesoPriorita(b);
}

/**
 * I tre livelli nell'ordine in cui si mostrano nei selettori e nei filtri:
 * dall'urgente al normale. Sostituisce gli array `ORDINE`/`ORDER` locali.
 */
export const PRIORITA_IN_ORDINE: readonly MetaPriorita[] = PRIORITA.map(
  (p) => PRIORITA_META[p],
);

/** Vero se il valore grezzo è uno dei tre livelli vivi (senza normalizzare). */
export function ePrioritaViva(raw: unknown): raw is Priorita {
  return typeof raw === 'string' && (PRIORITA as readonly string[]).includes(raw);
}
