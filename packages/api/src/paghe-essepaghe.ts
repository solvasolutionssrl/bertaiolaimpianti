/**
 * Traduzione delle presenze Kommessa nel tracciato EssePaghe (`DatiMese.txt`).
 *
 * Kommessa resta la fonte della verita': qui non si decide cosa e' successo in
 * una giornata, si traduce un fatto gia' validato nella lingua del consulente
 * del lavoro. Il modulo e' puro (nessun accesso a database o rete) cosi' il
 * tracciato si prova riga per riga senza ambiente.
 *
 * Due regole confermate dal consulente governano tutto:
 * - le ore ordinarie NON si esportano (l'azienda ha un orario settimanale
 *   fisso e il programma paghe conosce il teorico): si comunicano soltanto le
 *   variazioni, cioe' straordinari, assenze e maggiorazioni;
 * - malattia, maternita', infortunio e congedi viaggiano nel record 12, che
 *   descrive un periodo, non giorno per giorno.
 *
 * Il file e' a lunghezza fissa: gli spazi fanno parte del tracciato. Ogni
 * record e' composto dichiarando i campi con le posizioni del manuale
 * (`InterfacciaPresenze`, versione 2026), cosi' il codice si rilegge accanto
 * alla specifica e un campo fuori posto e' un errore, non un carattere in piu'.
 */

import {
  causaleEssePaghe,
  type CausaleEssePaghe,
  type TipoRecordEvento,
} from './paghe-causali';

/**
 * Causali aggiunte dal cliente, fuori dalla tabella importata dallo Studio.
 *
 * La tabella delle causali non e' immutabile: un consulente puo' aprirne una
 * nuova, o un cliente puo' averne di proprie. Chi genera il file passa qui le
 * aggiunte, cosi' il dizionario resta dato e non richiede un rilascio.
 */
export type CausaliExtra = readonly CausaleEssePaghe[];

/** La causale, cercata prima fra quelle del cliente e poi in tabella. */
export function risolviCausale(
  codice: string,
  extra?: CausaliExtra,
): CausaleEssePaghe | undefined {
  const cercato = codice.trim().toUpperCase();
  const propria = extra?.find((c) => c.codice.trim().toUpperCase() === cercato);
  return propria ?? causaleEssePaghe(cercato);
}

/** Lunghezza di ogni record, delimitatori CR LF esclusi. */
export const LUNGHEZZA_RECORD = { '00': 87, '10': 76, '12': 96, '14': 47 } as const;

/** Il tracciato chiude ogni riga con CR LF, non con il solo a capo. */
export const FINE_RIGA = '\r\n';

export const NOME_FILE = 'DatiMese.txt';

// ---------------------------------------------------------------------------
// Campi a lunghezza fissa
// ---------------------------------------------------------------------------

type TipoCampo = 'A' | 'N';

interface Campo {
  /** Prima posizione nel record, 1-based e inclusiva (come il manuale). */
  da: number;
  /** Ultima posizione, inclusiva. */
  a: number;
  tipo: TipoCampo;
  valore: string;
}

/**
 * Sostituisce le lettere accentate con la forma senza accento e butta via
 * tutto cio' che non e' ASCII stampabile: il file e' dichiarato ASCII e un
 * carattere fuori tabella lo renderebbe illeggibile al programma paghe.
 */
export function asciiPulito(testo: string): string {
  return testo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Ore nella forma `999,99`, con i decimali in centesimi: 1,50 e' un'ora e
 * mezza, non un'ora e cinquanta minuti.
 */
export function formattaOreEssePaghe(ore: number): string {
  if (!Number.isFinite(ore) || ore < 0) {
    throw new Error(`ore non valide per il tracciato: ${ore}`);
  }
  if (ore > 999.99) throw new Error(`ore fuori scala per il tracciato: ${ore}`);
  const [intere = '0', decimali = '00'] = ore.toFixed(2).split('.');
  return `${intere.padStart(3, '0')},${decimali}`;
}

/** Ore decimali da minuti, arrotondate al centesimo. */
export function oreDaMinuti(minuti: number): number {
  return Math.round((minuti / 60) * 100) / 100;
}

/** `AAAAMMGG` da una data `AAAA-MM-GG`. */
export function dataCompatta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`data non valida per il tracciato: ${iso}`);
  return `${m[1]}${m[2]}${m[3]}`;
}

/**
 * Compone un record riempiendo di spazi e verificando che i campi dichiarati
 * stiano dove dice il manuale. Gli alfanumerici vanno a sinistra con gli spazi
 * a destra, i numerici a destra con gli zeri a sinistra.
 */
function componiRecord(lunghezza: number, campi: readonly Campo[]): string {
  const buffer = new Array<string>(lunghezza).fill(' ');
  let fine = 0;
  for (const campo of campi) {
    const larghezza = campo.a - campo.da + 1;
    if (campo.da <= fine) {
      throw new Error(`campi sovrapposti nel tracciato alla posizione ${campo.da}`);
    }
    if (campo.a > lunghezza) {
      throw new Error(`campo oltre la fine del record: ${campo.da}-${campo.a}`);
    }
    fine = campo.a;
    const grezzo = campo.tipo === 'A' ? asciiPulito(campo.valore) : campo.valore.trim();
    // Un alfanumerico troppo lungo si taglia (un cognome lungo resta
    // riconoscibile); un numerico no. Tagliare un identificativo lo
    // trasformerebbe in quello di qualcun altro, in silenzio.
    if (campo.tipo === 'N' && grezzo.length > larghezza) {
      throw new Error(
        `valore troppo lungo per il campo numerico ${campo.da}-${campo.a}: "${grezzo}"`,
      );
    }
    const tagliato = campo.tipo === 'A' ? grezzo.slice(0, larghezza) : grezzo;
    const riempito =
      campo.tipo === 'A' ? tagliato.padEnd(larghezza, ' ') : tagliato.padStart(larghezza, '0');
    for (let i = 0; i < larghezza; i++) buffer[campo.da - 1 + i] = riempito[i]!;
  }
  return buffer.join('');
}

/** Progressivo del record: sei cifre con gli zeri davanti. */
function progressivo(n: number): string {
  if (n < 0 || n > 999999) throw new Error(`progressivo fuori scala: ${n}`);
  return String(n).padStart(6, '0');
}

// ---------------------------------------------------------------------------
// I quattro record che usiamo
// ---------------------------------------------------------------------------

export interface IntestazioneFile {
  /** Mese esportato, nella forma `AAAA-MM`. */
  periodo: string;
  /** Nome del programma che ha prodotto le presenze. */
  programmaPresenze?: string;
}

/** Record 00: identifica il file. Sempre il primo, progressivo sempre zero. */
export function record00(intestazione: IntestazioneFile): string {
  const m = /^(\d{4})-(\d{2})$/.exec(intestazione.periodo);
  if (!m) throw new Error(`periodo non valido: ${intestazione.periodo}`);
  return componiRecord(LUNGHEZZA_RECORD['00'], [
    { da: 1, a: 2, tipo: 'A', valore: '00' },
    { da: 4, a: 9, tipo: 'N', valore: '0' },
    { da: 11, a: 25, tipo: 'A', valore: 'DATI MESE' },
    { da: 27, a: 32, tipo: 'N', valore: `${m[1]}${m[2]}` },
    { da: 34, a: 48, tipo: 'A', valore: 'EssePaghe' },
    { da: 50, a: 64, tipo: 'A', valore: intestazione.programmaPresenze ?? 'Kommessa' },
  ]);
}

export interface DipendentePaghe {
  id: string;
  /** Codice delle paghe (in Kommessa e' il codice interno del dipendente). */
  codicePaghe: string | null;
  cognome: string;
  nome: string;
}

/**
 * Il codice delle paghe deve stare in sei cifre.
 *
 * In Kommessa il codice interno e' testo libero e puo' essere generato in
 * automatico nella forma `DIP-001`: un codice cosi' non entra nel campo, e
 * tagliarlo darebbe a nove persone diverse la stessa matricola. Meglio
 * lasciarle fuori dal file e dirlo.
 */
export function codicePagheValido(codice: string | null | undefined): boolean {
  return typeof codice === 'string' && /^\d{1,6}$/.test(codice.trim());
}

/** Record 10: apre il blocco di un dipendente. */
export function record10(
  prog: number,
  codiceDitta: string,
  dipendente: DipendentePaghe,
): string {
  if (!dipendente.codicePaghe) {
    throw new Error(`dipendente senza codice paghe: ${dipendente.cognome} ${dipendente.nome}`);
  }
  return componiRecord(LUNGHEZZA_RECORD['10'], [
    { da: 1, a: 2, tipo: 'A', valore: '10' },
    { da: 4, a: 9, tipo: 'N', valore: progressivo(prog) },
    // Il codice ditta e' alfanumerico: va a sinistra, non riempito di zeri.
    { da: 11, a: 17, tipo: 'A', valore: codiceDitta },
    { da: 19, a: 24, tipo: 'N', valore: dipendente.codicePaghe },
    {
      da: 26,
      a: 75,
      tipo: 'A',
      valore: `${dipendente.cognome} ${dipendente.nome}`.toUpperCase(),
    },
  ]);
}

/** Come si qualifica l'informazione aggiuntiva del record 12. */
export type TipoInfoAggiuntiva = 'C' | 'P' | 'M';

export interface EventoPaghe {
  dipendenteId: string;
  /** Codice causale EssePaghe, per esempio `FE`, `S0`, `ML`. */
  causale: string;
  /** Primo giorno dell'evento, `AAAA-MM-GG`. */
  dal: string;
  /** Ultimo giorno dell'evento; per un evento giornaliero coincide con `dal`. */
  al: string;
  /**
   * Ore dell'evento. Nel record 14 sono obbligatorie; nel record 12 restano a
   * zero quando l'evento copre giornate intere.
   */
  ore: number;
  /** Dove va l'evento. Se assente si usa il record predefinito della causale. */
  record?: TipoRecordEvento;
  /** `C` codice fiscale, `P` numero PUC, `M` protocollo cartaceo. */
  tipoInfo?: TipoInfoAggiuntiva | null;
  /** Il PUC dell'attestato di malattia, o il codice fiscale per la donazione. */
  infoAggiuntiva?: string | null;
  /** Campo in coda al record 12: ripresa maternita' o inizio malattia. */
  dataRiferimento?: string | null;
  /** Riferimento a una domanda di integrazione salariale (001, 002...). */
  opzione?: string | null;
  /** Da dove arriva il dato: serve solo all'interfaccia, non al file. */
  origine?: 'kommessa' | 'manuale';
  /** Centro di costo o cantiere, se il consulente lo vuole nel record 14. */
  centroCosto?: string | null;
}

/** Record 12: un evento che copre un periodo. */
export function record12(prog: number, evento: EventoPaghe): string {
  return componiRecord(LUNGHEZZA_RECORD['12'], [
    { da: 1, a: 2, tipo: 'A', valore: '12' },
    { da: 4, a: 9, tipo: 'N', valore: progressivo(prog) },
    { da: 11, a: 14, tipo: 'A', valore: evento.causale },
    { da: 16, a: 23, tipo: 'N', valore: dataCompatta(evento.dal) },
    { da: 25, a: 32, tipo: 'N', valore: dataCompatta(evento.al) },
    { da: 34, a: 39, tipo: 'N', valore: formattaOreEssePaghe(evento.ore) },
    { da: 52, a: 54, tipo: 'A', valore: evento.opzione ?? '' },
    { da: 56, a: 56, tipo: 'A', valore: evento.tipoInfo ?? '' },
    { da: 58, a: 87, tipo: 'A', valore: evento.infoAggiuntiva ?? '' },
    {
      da: 89,
      a: 96,
      tipo: 'A',
      valore: evento.dataRiferimento ? dataCompatta(evento.dataRiferimento) : '',
    },
  ]);
}

/** Record 14: un evento di una singola giornata. Le ore sono obbligatorie. */
export function record14(prog: number, evento: EventoPaghe): string {
  const giorno = Number(evento.dal.slice(8, 10));
  return componiRecord(LUNGHEZZA_RECORD['14'], [
    { da: 1, a: 2, tipo: 'A', valore: '14' },
    { da: 4, a: 9, tipo: 'N', valore: progressivo(prog) },
    { da: 11, a: 12, tipo: 'N', valore: String(giorno) },
    { da: 14, a: 17, tipo: 'A', valore: evento.causale },
    { da: 19, a: 24, tipo: 'N', valore: formattaOreEssePaghe(evento.ore) },
    { da: 35, a: 46, tipo: 'A', valore: evento.centroCosto ?? '' },
  ]);
}

// ---------------------------------------------------------------------------
// Generazione del file
// ---------------------------------------------------------------------------

export type GravitaAvviso = 'blocco' | 'attenzione';

export interface AvvisoPaghe {
  gravita: GravitaAvviso;
  messaggio: string;
  dipendenteId?: string;
}

export interface RigaGenerata {
  tipo: '00' | '10' | '12' | '14';
  testo: string;
  /** La stessa riga detta in italiano, per l'anteprima a schermo. */
  glossa: string;
  dipendenteId?: string;
  evento?: EventoPaghe;
}

export interface EsitoGenerazione {
  righe: readonly RigaGenerata[];
  /** Il file completo, con i delimitatori. */
  testo: string;
  avvisi: readonly AvvisoPaghe[];
  totali: {
    dipendenti: number;
    eventi: number;
    record12: number;
    record14: number;
    /** Eventi lasciati fuori dal file perche' bloccati da un avviso. */
    scartati: number;
  };
}

export interface OpzioniGenerazione extends IntestazioneFile {
  /** Codice ditta assegnato dallo Studio, comprensivo del gruppo. */
  codiceDitta: string;
  /** Causali aperte dal cliente oltre a quelle della tabella dello Studio. */
  causaliExtra?: CausaliExtra;
}

function nomeCompleto(d: DipendentePaghe): string {
  return `${d.cognome} ${d.nome}`.trim();
}

function glossaEvento(
  evento: EventoPaghe,
  dipendente: DipendentePaghe,
  tipo: '12' | '14',
  extra?: CausaliExtra,
): string {
  const causale = risolviCausale(evento.causale, extra);
  const descrizione = causale ? causale.descrizione : 'causale sconosciuta';
  const ore = evento.ore > 0 ? ` ${evento.ore.toFixed(2).replace('.', ',')} ore` : '';
  if (tipo === '12') {
    const periodo =
      evento.dal === evento.al
        ? giornoLeggibile(evento.dal)
        : `dal ${giornoLeggibile(evento.dal)} al ${giornoLeggibile(evento.al)}`;
    const puc = evento.infoAggiuntiva ? ` PUC ${evento.infoAggiuntiva}` : '';
    return `${nomeCompleto(dipendente)}: ${descrizione} ${periodo}${ore}${puc}`;
  }
  return `${nomeCompleto(dipendente)}: ${descrizione} il ${giornoLeggibile(evento.dal)}${ore}`;
}

function giornoLeggibile(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** Ordina per codice paghe, che e' il criterio con cui lo Studio li legge. */
function ordinaDipendenti(a: DipendentePaghe, b: DipendentePaghe): number {
  const na = Number(a.codicePaghe ?? '0');
  const nb = Number(b.codicePaghe ?? '0');
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return nomeCompleto(a).localeCompare(nomeCompleto(b), 'it');
}

/**
 * Controlla un evento prima di scriverlo. Torna l'avviso bloccante se l'evento
 * non puo' entrare nel file, altrimenti `null`; gli avvisi non bloccanti
 * finiscono in `accumula`.
 */
function verificaEvento(
  evento: EventoPaghe,
  dipendente: DipendentePaghe,
  periodo: string,
  accumula: AvvisoPaghe[],
  extra?: CausaliExtra,
): AvvisoPaghe | null {
  const chi = nomeCompleto(dipendente);
  const causale = risolviCausale(evento.causale, extra);
  if (!causale) {
    return {
      gravita: 'blocco',
      dipendenteId: dipendente.id,
      messaggio: `${chi}: la causale ${evento.causale} non esiste nella tabella dello Studio.`,
    };
  }
  if (evento.al < evento.dal) {
    return {
      gravita: 'blocco',
      dipendenteId: dipendente.id,
      messaggio: `${chi}: l'evento ${evento.causale} finisce prima di cominciare.`,
    };
  }
  if (!evento.dal.startsWith(periodo) || !evento.al.startsWith(periodo)) {
    return {
      gravita: 'blocco',
      dipendenteId: dipendente.id,
      messaggio: `${chi}: l'evento ${evento.causale} del ${giornoLeggibile(evento.dal)} esce dal mese esportato.`,
    };
  }
  if (evento.ore < 0) {
    return {
      gravita: 'blocco',
      dipendenteId: dipendente.id,
      messaggio: `${chi}: ore negative sull'evento ${evento.causale}.`,
    };
  }
  if (evento.ore > 999.99) {
    return {
      gravita: 'blocco',
      dipendenteId: dipendente.id,
      messaggio: `${chi}: l'evento ${evento.causale} ha ${evento.ore} ore, piu' di quante ne entrino nel campo.`,
    };
  }
  const tipo = evento.record ?? causale.record;
  if (tipo === '14' && evento.ore <= 0) {
    return {
      gravita: 'blocco',
      dipendenteId: dipendente.id,
      messaggio: `${chi}: l'evento ${evento.causale} del ${giornoLeggibile(evento.dal)} e' giornaliero e le ore sono obbligatorie.`,
    };
  }
  if (tipo === '14' && evento.dal !== evento.al) {
    return {
      gravita: 'blocco',
      dipendenteId: dipendente.id,
      messaggio: `${chi}: l'evento ${evento.causale} copre piu' giorni e va comunicato come periodo.`,
    };
  }
  if (causale.obbligatorioRecord12 && tipo !== '12') {
    return {
      gravita: 'blocco',
      dipendenteId: dipendente.id,
      messaggio: `${chi}: ${causale.descrizione} deve essere comunicata come periodo, non giorno per giorno.`,
    };
  }
  // Il PUC non si inventa: il file esce lo stesso, ma lo Studio deve saperlo.
  if (evento.causale === 'ML' && !evento.infoAggiuntiva) {
    accumula.push({
      gravita: 'attenzione',
      dipendenteId: dipendente.id,
      messaggio: `${chi}: malattia dal ${giornoLeggibile(evento.dal)} senza PUC, lo Studio dovra' inserirlo a mano.`,
    });
  }
  return null;
}

/**
 * Costruisce `DatiMese.txt` a partire dagli eventi gia' tradotti in causali.
 *
 * Gli eventi arrivano ordinati per dipendente; chi non ha eventi non compare
 * nel file, perche' una giornata normale non si comunica. Un evento bloccato
 * viene scartato e segnalato: meglio un file incompleto e dichiarato che una
 * riga sbagliata dentro le paghe.
 */
export function generaDatiMese(
  dipendenti: readonly DipendentePaghe[],
  eventi: readonly EventoPaghe[],
  opzioni: OpzioniGenerazione,
): EsitoGenerazione {
  const avvisi: AvvisoPaghe[] = [];
  const righe: RigaGenerata[] = [];

  const codiceDitta = opzioni.codiceDitta.trim();
  if (!codiceDitta) {
    avvisi.push({
      gravita: 'blocco',
      messaggio: 'Manca il codice ditta dello Studio: senza, il file non si puo' + "' generare.",
    });
    return {
      righe,
      testo: '',
      avvisi,
      totali: { dipendenti: 0, eventi: 0, record12: 0, record14: 0, scartati: eventi.length },
    };
  }

  const perDipendente = new Map<string, EventoPaghe[]>();
  for (const evento of eventi) {
    const lista = perDipendente.get(evento.dipendenteId);
    if (lista) lista.push(evento);
    else perDipendente.set(evento.dipendenteId, [evento]);
  }

  righe.push({
    tipo: '00',
    testo: record00(opzioni),
    glossa: `Intestazione del file: presenze di ${opzioni.periodo} da ${opzioni.programmaPresenze ?? 'Kommessa'}.`,
  });

  let prog = 0;
  let scartati = 0;
  let record12Contati = 0;
  let record14Contati = 0;
  let dipendentiScritti = 0;

  const ordinati = [...dipendenti].sort(ordinaDipendenti);
  for (const dipendente of ordinati) {
    const suoi = perDipendente.get(dipendente.id);
    if (!suoi || suoi.length === 0) continue;

    if (!dipendente.codicePaghe) {
      scartati += suoi.length;
      avvisi.push({
        gravita: 'blocco',
        dipendenteId: dipendente.id,
        messaggio: `${nomeCompleto(dipendente)} non ha il codice paghe: le sue ${suoi.length} righe restano fuori dal file.`,
      });
      continue;
    }
    if (!codicePagheValido(dipendente.codicePaghe)) {
      scartati += suoi.length;
      avvisi.push({
        gravita: 'blocco',
        dipendenteId: dipendente.id,
        messaggio: `${nomeCompleto(dipendente)} ha il codice paghe "${dipendente.codicePaghe}", che non e' un numero di sei cifre: correggilo in anagrafica, altrimenti le sue ${suoi.length} righe restano fuori.`,
      });
      continue;
    }

    const validi: EventoPaghe[] = [];
    for (const evento of suoi) {
      const blocco = verificaEvento(
        evento,
        dipendente,
        opzioni.periodo,
        avvisi,
        opzioni.causaliExtra,
      );
      if (blocco) {
        avvisi.push(blocco);
        scartati++;
        continue;
      }
      validi.push(evento);
    }
    if (validi.length === 0) continue;

    validi.sort((a, b) => (a.dal === b.dal ? a.causale.localeCompare(b.causale) : a.dal < b.dal ? -1 : 1));

    prog++;
    righe.push({
      tipo: '10',
      testo: record10(prog, codiceDitta, dipendente),
      glossa: `${nomeCompleto(dipendente)}, codice paghe ${dipendente.codicePaghe}.`,
      dipendenteId: dipendente.id,
    });
    dipendentiScritti++;

    for (const evento of validi) {
      const tipo = evento.record ?? risolviCausale(evento.causale, opzioni.causaliExtra)!.record;
      // Ultima rete: se un valore non entra nel suo campo si scarta la riga e
      // si dice quale, invece di far cadere la pagina intera.
      let testo: string;
      try {
        testo = tipo === '12' ? record12(prog + 1, evento) : record14(prog + 1, evento);
      } catch (errore) {
        scartati++;
        avvisi.push({
          gravita: 'blocco',
          dipendenteId: dipendente.id,
          messaggio: `${nomeCompleto(dipendente)}: la riga ${evento.causale} del ${giornoLeggibile(evento.dal)} non entra nel tracciato (${errore instanceof Error ? errore.message : 'valore non valido'}).`,
        });
        continue;
      }
      prog++;
      if (tipo === '12') record12Contati++;
      else record14Contati++;
      righe.push({
        tipo,
        testo,
        glossa: glossaEvento(evento, dipendente, tipo, opzioni.causaliExtra),
        dipendenteId: dipendente.id,
        evento,
      });
    }

    // Se tutte le sue righe sono cadute, il dipendente resta nel file con il
    // solo record 10: inutile e sospetto. Si toglie.
    if (righe.at(-1)?.tipo === '10') {
      righe.pop();
      prog--;
      dipendentiScritti--;
    }
  }

  const testo = righe.map((r) => r.testo).join(FINE_RIGA) + FINE_RIGA;
  return {
    righe,
    testo,
    avvisi,
    totali: {
      dipendenti: dipendentiScritti,
      eventi: record12Contati + record14Contati,
      record12: record12Contati,
      record14: record14Contati,
      scartati,
    },
  };
}

/**
 * Rilegge il file generato con gli occhi del programma paghe: lunghezze,
 * caratteri ammessi e delimitatori. E' l'ultimo controllo prima del download.
 */
export function validaTracciato(testo: string): AvvisoPaghe[] {
  const problemi: AvvisoPaghe[] = [];
  if (testo.length === 0) return problemi;
  if (!testo.endsWith(FINE_RIGA)) {
    problemi.push({ gravita: 'blocco', messaggio: "L'ultima riga non finisce con CR LF." });
  }
  const righe = testo.split(FINE_RIGA).slice(0, -1);
  righe.forEach((riga, i) => {
    const numero = i + 1;
    const tipo = riga.slice(0, 2) as keyof typeof LUNGHEZZA_RECORD;
    const attesa = LUNGHEZZA_RECORD[tipo];
    if (!attesa) {
      problemi.push({ gravita: 'blocco', messaggio: `Riga ${numero}: tipo record "${tipo}" non previsto.` });
      return;
    }
    if (riga.length !== attesa) {
      problemi.push({
        gravita: 'blocco',
        messaggio: `Riga ${numero}: lunghezza ${riga.length} invece di ${attesa}.`,
      });
    }
    if (/[^\x20-\x7e]/.test(riga)) {
      problemi.push({ gravita: 'blocco', messaggio: `Riga ${numero}: contiene caratteri fuori dall'ASCII.` });
    }
  });
  return problemi;
}
