/**
 * Dal fatto di Kommessa alla causale del consulente.
 *
 * Questo modulo tiene separate due cose che e' facile confondere: cosa e'
 * successo davvero (una giornata con due ore oltre l'orario, una settimana di
 * malattia) e come lo si chiama nel programma paghe. Il primo dato appartiene a
 * Kommessa e non si tocca; il secondo e' una convenzione dello Studio che puo'
 * cambiare, quindi vive qui ed e' configurabile per cliente.
 *
 * La regola scritta nella specifica e' rispettata alla lettera: non si deduce
 * una causale dal giorno della settimana quando Kommessa sa gia' di che evento
 * si tratta. Il giorno della settimana serve solo a distinguere fra loro i tre
 * straordinari (feriale, sabato, festivo), che nel programma paghe sono voci
 * diverse, e la regola e' esplicita e modificabile.
 */

import type { CausaliExtra, EventoPaghe, TipoInfoAggiuntiva } from './paghe-essepaghe';
import { oreDaMinuti, risolviCausale } from './paghe-essepaghe';

// ---------------------------------------------------------------------------
// Calendario
// ---------------------------------------------------------------------------

export type TipoGiorno = 'feriale' | 'sabato' | 'festivo';

function giornoUtc(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`data non valida: ${iso}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function isoDaData(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Lunedi' di Pasqua, l'unica festivita' mobile del calendario italiano. */
function pasquetta(anno: number): string {
  // Algoritmo gregoriano anonimo: stesso risultato delle tavole liturgiche.
  const a = anno % 19;
  const b = Math.floor(anno / 100);
  const c = anno % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * m + 114) / 31);
  const giorno = ((h + l - 7 * m + 114) % 31) + 1;
  const pasqua = new Date(Date.UTC(anno, mese - 1, giorno));
  pasqua.setUTCDate(pasqua.getUTCDate() + 1);
  return isoDaData(pasqua);
}

/** Festivita' nazionali a data fissa, nella forma `MM-GG`. */
const FESTIVITA_FISSE = [
  '01-01', // Capodanno
  '01-06', // Epifania
  '04-25', // Liberazione
  '05-01', // Festa del lavoro
  '06-02', // Repubblica
  '08-15', // Ferragosto
  '11-01', // Ognissanti
  '12-08', // Immacolata
  '12-25', // Natale
  '12-26', // Santo Stefano
];

export function festivoItaliano(iso: string): boolean {
  if (FESTIVITA_FISSE.includes(iso.slice(5))) return true;
  return iso === pasquetta(Number(iso.slice(0, 4)));
}

/**
 * Come conta il giorno per il programma paghe. La domenica sta con le
 * festivita' perche' lo straordinario domenicale e' pagato come festivo.
 */
export function tipoGiorno(iso: string): TipoGiorno {
  const settimana = giornoUtc(iso).getUTCDay();
  if (settimana === 0 || festivoItaliano(iso)) return 'festivo';
  if (settimana === 6) return 'sabato';
  return 'feriale';
}

/** I giorni del periodo, estremi inclusi. */
export function giorniDelPeriodo(dal: string, al: string): string[] {
  const out: string[] = [];
  const fine = giornoUtc(al);
  for (let d = giornoUtc(dal); d <= fine; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(isoDaData(d));
  }
  return out;
}

/** Primo e ultimo giorno del mese `AAAA-MM`. */
export function estremiDelMese(periodo: string): { dal: string; al: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo);
  if (!m) throw new Error(`periodo non valido: ${periodo}`);
  const anno = Number(m[1]);
  const mese = Number(m[2]);
  const ultimo = new Date(Date.UTC(anno, mese, 0)).getUTCDate();
  return { dal: `${periodo}-01`, al: `${periodo}-${String(ultimo).padStart(2, '0')}` };
}

/** Taglia un periodo dentro il mese esportato; `null` se non lo tocca. */
export function limitaAlMese(
  dal: string,
  al: string,
  periodo: string,
): { dal: string; al: string } | null {
  const mese = estremiDelMese(periodo);
  const inizio = dal > mese.dal ? dal : mese.dal;
  const fine = al < mese.al ? al : mese.al;
  return inizio > fine ? null : { dal: inizio, al: fine };
}

// ---------------------------------------------------------------------------
// Regole di traduzione
// ---------------------------------------------------------------------------

export interface RegoleCausali {
  /** Straordinario in un giorno lavorativo. */
  straordinarioFeriale: string;
  straordinarioSabato: string;
  straordinarioFestivo: string;
  /** Ore di viaggio oltre l'orario ordinario. */
  viaggioEccedente: string;
  /** Tipo di assenza di Kommessa verso causale; `null` = ancora da decidere. */
  assenze: Record<string, string | null>;
  /** Causale alternativa quando l'assenza e' a ore invece che a giornate. */
  assenzeAOre: Record<string, string>;
  /**
   * Passo di arrotondamento in minuti per straordinari e viaggio, applicato al
   * totale del giorno. Zero significa esportare il dato al minuto.
   */
  arrotondamentoMinuti: number;
}

/**
 * Le corrispondenze di partenza. Quelle lasciate a `null` non sono una
 * dimenticanza: sono i casi in cui il programma paghe ha piu' voci vicine e
 * sceglierne una al posto del consulente sarebbe una decisione sulla busta
 * paga. L'interfaccia le chiede una volta e poi se le ricorda.
 */
export const REGOLE_DEFAULT: RegoleCausali = {
  straordinarioFeriale: 'S0',
  straordinarioSabato: 'S9',
  straordinarioFestivo: 'S7',
  viaggioEccedente: 'V1',
  assenze: {
    ferie: 'FE',
    rol: 'PR',
    par_ex_festivita: 'PR',
    permesso_retribuito: 'P1',
    permesso_non_retribuito: 'P0',
    malattia: 'ML',
    infortunio: 'IN',
    visita_medica: null,
    permesso_104: 'B7',
    lutto: 'C0',
    congedo_matrimoniale: null,
    donazione_sangue: 'DS',
    paternita_obbligatoria: 'C6',
    maternita_obbligatoria: 'MO',
    congedo_parentale: null,
    permesso_elettorale: 'P4',
  },
  assenzeAOre: {
    permesso_104: 'B1',
  },
  arrotondamentoMinuti: 0,
};

/** Fonde le regole salvate per il cliente sopra quelle di partenza. */
export function regoleConfigurate(salvate?: Partial<RegoleCausali> | null): RegoleCausali {
  if (!salvate) return REGOLE_DEFAULT;
  return {
    ...REGOLE_DEFAULT,
    ...salvate,
    assenze: { ...REGOLE_DEFAULT.assenze, ...(salvate.assenze ?? {}) },
    assenzeAOre: { ...REGOLE_DEFAULT.assenzeAOre, ...(salvate.assenzeAOre ?? {}) },
  };
}

export function arrotondaMinuti(minuti: number, passo: number): number {
  if (!Number.isFinite(passo) || passo < 1) return minuti;
  return Math.round(minuti / passo) * passo;
}

// ---------------------------------------------------------------------------
// Traduzione
// ---------------------------------------------------------------------------

export interface GiornataKommessa {
  dipendenteId: string;
  /** Giorno, `AAAA-MM-GG`. */
  data: string;
  /** Minuti di lavoro oltre l'orario ordinario. */
  minutiStraordinari: number;
  /** Minuti di viaggio oltre l'orario ordinario. */
  minutiViaggioEccedente: number;
}

export interface AssenzaKommessa {
  dipendenteId: string;
  /** Codice del catalogo ferie e permessi di Kommessa. */
  tipo: string;
  dal: string;
  al: string;
  tuttoIlGiorno: boolean;
  /** Ore dell'assenza quando non copre la giornata intera. */
  oreParziali?: number | null;
  /**
   * L'attestato collegato, se c'e'. Il tipo lo dichiara chi lo ha inserito
   * (attestato telematico, protocollo cartaceo, codice fiscale dell'ente) e
   * non si deduce dalla causale: un cartaceo spacciato per telematico e' un
   * dato falso.
   */
  certificato?: { tipoInfo: TipoInfoAggiuntiva; numero: string | null } | null;
}

export interface OpzioniTraduzione {
  /** Mese esportato, `AAAA-MM`. */
  periodo: string;
  /** Ore di una giornata piena, dall'orario ordinario del cliente. */
  oreGiornataIntera: number;
  /** Causali aperte dal cliente oltre a quelle della tabella dello Studio. */
  causaliExtra?: CausaliExtra;
}

/** Qualcosa che il file non dice e l'ufficio deve sapere. */
export interface AvvisoTraduzione {
  dipendenteId: string;
  messaggio: string;
}

export interface EsitoTraduzione {
  eventi: EventoPaghe[];
  /**
   * Tipi di assenza incontrati senza una causale decisa. L'ufficio li vede
   * una volta, sceglie, e la scelta resta.
   */
  causaliDaDecidere: string[];
  /**
   * Quello che e' stato tagliato o non e' diventato una riga. Un dato che
   * sparisce in silenzio e' peggio di un dato sbagliato: almeno quello si
   * vede.
   */
  avvisi: AvvisoTraduzione[];
}

function causaleStraordinario(giorno: string, regole: RegoleCausali): string {
  switch (tipoGiorno(giorno)) {
    case 'sabato':
      return regole.straordinarioSabato;
    case 'festivo':
      return regole.straordinarioFestivo;
    default:
      return regole.straordinarioFeriale;
  }
}

/**
 * Le variazioni di una giornata lavorata: lo straordinario e le ore di viaggio
 * oltre l'orario. Le ore ordinarie non compaiono, per scelta del consulente.
 */
export function eventiDaGiornata(
  giornata: GiornataKommessa,
  regole: RegoleCausali = REGOLE_DEFAULT,
): EventoPaghe[] {
  const eventi: EventoPaghe[] = [];
  const passo = regole.arrotondamentoMinuti;

  const straordinari = arrotondaMinuti(Math.max(0, giornata.minutiStraordinari), passo);
  if (straordinari > 0) {
    eventi.push({
      dipendenteId: giornata.dipendenteId,
      causale: causaleStraordinario(giornata.data, regole),
      dal: giornata.data,
      al: giornata.data,
      ore: oreDaMinuti(straordinari),
      record: '14',
      origine: 'kommessa',
    });
  }

  const viaggio = arrotondaMinuti(Math.max(0, giornata.minutiViaggioEccedente), passo);
  if (viaggio > 0) {
    eventi.push({
      dipendenteId: giornata.dipendenteId,
      causale: regole.viaggioEccedente,
      dal: giornata.data,
      al: giornata.data,
      ore: oreDaMinuti(viaggio),
      record: '14',
      origine: 'kommessa',
    });
  }

  return eventi;
}

/**
 * Un'assenza approvata diventa uno o piu' eventi.
 *
 * Le causali per periodo (malattia, maternita', infortunio, congedi) restano un
 * evento solo con le date agli estremi, comprese le domeniche: e' cosi' che il
 * programma paghe conta i giorni indennizzati. Le altre si scrivono giorno per
 * giorno e solo sui giorni lavorativi, altrimenti si manderebbero ferie di
 * domenica.
 */
export function eventiDaAssenza(
  assenza: AssenzaKommessa,
  regole: RegoleCausali,
  opzioni: OpzioniTraduzione,
): EsitoTraduzione {
  const aOre = !assenza.tuttoIlGiorno;
  const codice = aOre
    ? regole.assenzeAOre[assenza.tipo] ?? regole.assenze[assenza.tipo] ?? null
    : regole.assenze[assenza.tipo] ?? null;
  if (!codice) return { eventi: [], causaliDaDecidere: [assenza.tipo], avvisi: [] };

  const dentroIlMese = limitaAlMese(assenza.dal, assenza.al, opzioni.periodo);
  if (!dentroIlMese) return { eventi: [], causaliDaDecidere: [], avvisi: [] };

  const avvisi: AvvisoTraduzione[] = [];
  const causale = risolviCausale(codice, opzioni.causaliExtra);
  const record = causale?.record ?? '14';
  const base = {
    dipendenteId: assenza.dipendenteId,
    causale: codice,
    origine: 'manuale' as const,
  };
  // Il numero dell'attestato viaggia con il tipo dichiarato da chi lo ha
  // inserito. Senza numero non si dichiara nemmeno il tipo: un campo che dice
  // "attestato telematico" e poi e' vuoto confonde e basta.
  const numero = assenza.certificato?.numero?.trim() || null;
  const info = numero
    ? { tipoInfo: assenza.certificato!.tipoInfo, infoAggiuntiva: numero }
    : {};

  if (record === '12') {
    const tagliatoAllInizio = dentroIlMese.dal !== assenza.dal;
    if (tagliatoAllInizio) {
      avvisi.push({
        dipendenteId: assenza.dipendenteId,
        messaggio: `L'assenza ${codice} era cominciata il ${assenza.dal.slice(8, 10)}/${assenza.dal.slice(5, 7)}, prima del mese esportato: nel file parte dal primo giorno del mese.`,
      });
    }
    return {
      eventi: [
        {
          ...base,
          ...info,
          origine: 'kommessa',
          dal: dentroIlMese.dal,
          al: dentroIlMese.al,
          // Un periodo intero non porta ore; una frazione di giornata si
          // comunica da sola, con le sue ore, come chiede il manuale.
          ore: aOre ? assenza.oreParziali ?? 0 : 0,
          record: '12',
          // Il manuale tiene il campo in coda per la data di inizio vera,
          // quando il numero dell'attestato non si puo' dare: e' il solo modo
          // di non perdere l'inizio di una malattia a cavallo di due mesi.
          ...(tagliatoAllInizio && !numero ? { dataRiferimento: assenza.dal } : {}),
        },
      ],
      causaliDaDecidere: [],
      avvisi,
    };
  }

  const giorni = giorniDelPeriodo(dentroIlMese.dal, dentroIlMese.al).filter(
    (g) => tipoGiorno(g) === 'feriale',
  );
  if (giorni.length === 0) {
    avvisi.push({
      dipendenteId: assenza.dipendenteId,
      messaggio: `L'assenza ${codice} del ${dentroIlMese.dal.slice(8, 10)}/${dentroIlMese.dal.slice(5, 7)} cade tutta fra sabato, domenica e festivi: non produce nessuna riga.`,
    });
  }
  const ore = aOre ? assenza.oreParziali ?? 0 : opzioni.oreGiornataIntera;
  return {
    eventi: giorni.map((g) => ({
      ...base,
      ...info,
      origine: 'kommessa' as const,
      dal: g,
      al: g,
      ore,
      record: '14' as const,
    })),
    causaliDaDecidere: [],
    avvisi,
  };
}

/** Tutte le variazioni del mese, giornate e assenze insieme. */
export function traduciMese(
  dati: { giornate: readonly GiornataKommessa[]; assenze: readonly AssenzaKommessa[] },
  regole: RegoleCausali,
  opzioni: OpzioniTraduzione,
): EsitoTraduzione {
  const eventi: EventoPaghe[] = [];
  const daDecidere = new Set<string>();
  const avvisi: AvvisoTraduzione[] = [];

  for (const giornata of dati.giornate) {
    if (!giornata.data.startsWith(opzioni.periodo)) continue;
    const suoi = eventiDaGiornata(giornata, regole);
    eventi.push(...suoi);
    // L'arrotondamento puo' mangiarsi pochi minuti fino a farli sparire: e'
    // una scelta legittima, ma va detta.
    const minuti = giornata.minutiStraordinari + giornata.minutiViaggioEccedente;
    if (minuti > 0 && suoi.length === 0) {
      avvisi.push({
        dipendenteId: giornata.dipendenteId,
        messaggio: `Il ${giornata.data.slice(8, 10)}/${giornata.data.slice(5, 7)} ci sono ${minuti} minuti fra straordinario e viaggio, azzerati dall'arrotondamento di ${regole.arrotondamentoMinuti} minuti.`,
      });
    }
  }
  for (const assenza of dati.assenze) {
    const esito = eventiDaAssenza(assenza, regole, opzioni);
    eventi.push(...esito.eventi);
    for (const tipo of esito.causaliDaDecidere) daDecidere.add(tipo);
    avvisi.push(...esito.avvisi);
  }

  return { eventi, causaliDaDecidere: [...daDecidere], avvisi };
}
