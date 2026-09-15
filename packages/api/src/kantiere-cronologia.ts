/**
 * Cronologia di una giornata Kantiere: cosa è successo, come, chi, quando.
 *
 * **Ricostruita dai dati, non da un diario parallelo.** Le timbrature sono già
 * gli eventi; le versioni del rapportino sono già le modifiche. Un diario scritto
 * a parte sarebbe una seconda copia della verità: il giorno che una funzione si
 * dimentica di annotare, la storia ha un buco che nessuno vede. Ricostruendo dai
 * dati, se un dato è cambiato la cronologia lo vede per forza.
 *
 * **La modalità viene da `timbrature.modalita`**, scritta nello stesso inserimento
 * della timbratura. `origine` non basta: l'avvio turno da app scrive 'manuale',
 * pausa e ripresa da app scrivono 'qr'. Per le righe vecchie (modalità NULL) la
 * deduciamo e lo diciamo (`ricostruita: true`).
 *
 * Pura: niente database, niente fuso orario. Le ore si formattano qui, gli orari
 * li formatta l'interfaccia.
 */

import { formattaOreGiornata } from './kantiere-ore';

// ---------------------------------------------------------------------------
// Vocabolario
// ---------------------------------------------------------------------------

/** Come può nascere una timbratura. Deve coincidere col CHECK del database. */
export const MODALITA_TIMBRATURA = [
  'qr',
  'app',
  'capo',
  'divisione_fine_turno',
  'giornata_dichiarata',
  'pausa_dichiarata',
  'pausa_chiusa_sistema',
  'ufficio',
] as const;
export type ModalitaTimbratura = (typeof MODALITA_TIMBRATURA)[number];

/** Azioni della cronologia versioni. Deve coincidere col CHECK del database. */
export const AZIONI_VERSIONE_GIORNATA = [
  'invio',
  'modifica_tecnico',
  'modifica_ufficio',
  'approvazione',
  'respinta',
  'riapertura',
  'pausa_ufficio',
  'chiusura_ufficio',
  'ricalcolo',
] as const;
export type AzioneVersioneGiornata = (typeof AZIONI_VERSIONE_GIORNATA)[number];

export const MODALITA_ETICHETTA: Record<ModalitaTimbratura, string> = {
  qr: 'Cartello QR',
  app: 'Dall’app',
  capo: 'Dal capo squadra',
  divisione_fine_turno: 'Divisa a fine turno',
  giornata_dichiarata: 'Dichiarata a fine giornata',
  pausa_dichiarata: 'Dichiarata alla chiusura',
  pausa_chiusa_sistema: 'Chiusa in automatico',
  ufficio: 'Inserita dall’ufficio',
};

/** Chi ha fatto l'azione, per colore e raggruppamento nell'interfaccia. */
export type Attore = 'persona' | 'capo' | 'ufficio' | 'sistema';

export function eModalitaValida(v: unknown): v is ModalitaTimbratura {
  return typeof v === 'string' && (MODALITA_TIMBRATURA as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Ingressi della ricostruzione
// ---------------------------------------------------------------------------

export interface TimbraturaCronologia {
  id: string;
  tipo: 'ingresso' | 'uscita';
  ts: string;
  origine: string | null;
  modalita: string | null;
  pausa: boolean | null;
  autoChiusa: boolean | null;
  createdAt: string | null;
  creatoDa: string | null;
  creatoNome: string | null;
  /** Il QR registra la posizione; pausa e ripresa da app no. Serve per le righe vecchie. */
  haGeo: boolean;
  cantiere: string | null;
  /** Sede in cui si è lavorato sul cantiere («Lavoro dalla sede sul progetto»); null = in cantiere. */
  sedeLavoro?: string | null;
}

export interface ViaggioCronologia {
  id: string;
  direzione: string;
  /** La timbratura a cui è legata la tratta (andata → ingresso, ritorno → uscita). */
  timbraturaId: string | null;
  createdAt: string;
  daCantiere: string | null;
  sede: string | null;
  cantiere: string | null;
  km: number | null;
  minutiPagati: number | null;
  autista: boolean;
}

export interface TotaliSnapshot {
  ore_ordinarie?: number;
  ore_straordinarie?: number;
  ore_viaggio?: number;
}

export interface RigaSnapshotCronologia {
  cantiere_id?: string | null;
  commessa_id?: string | null;
  ore_ordinarie?: number;
  ore_straordinarie?: number;
  ore_viaggio?: number;
}

export interface StatoConfrontabile {
  stato?: string;
  totali?: TotaliSnapshot;
  righe?: RigaSnapshotCronologia[];
}

export interface SnapshotGiornata extends StatoConfrontabile {
  /** Lo stato di prima, scritto dalle modifiche che lo conoscono. */
  prima?: StatoConfrontabile | null;
}

export interface VersioneCronologia {
  versione: number;
  azione: string;
  quando: string;
  chi: string | null;
  snapshot: SnapshotGiornata | null;
}

// ---------------------------------------------------------------------------
// Uscita
// ---------------------------------------------------------------------------

export type TipoEvento =
  | 'inizio_turno'
  | 'nuovo_ingresso'
  | 'cambio_cantiere'
  | 'inizio_pausa'
  | 'fine_pausa'
  | 'uscita'
  | 'fine_turno'
  | 'viaggio'
  | 'trasferimento'
  /** Ore di lavoro scritte a mano, senza timbrature che dicano quando. */
  | 'lavoro_dichiarato'
  | 'approvata_auto'
  | 'modifica';

export interface EventoCronologia {
  chiave: string;
  /** Il momento a cui si riferisce l'evento (per una timbratura: il suo orario). */
  quando: string;
  /**
   * Quando è arrivato davvero, se lontano da `quando`. Per le modalità
   * dichiarate è «registrata alle»; per QR e app è il ritardo di rete.
   */
  arrivatoAl: string | null;
  arrivoDichiarato: boolean;
  tipo: TipoEvento;
  titolo: string;
  modalita: string | null;
  attore: Attore;
  chi: string | null;
  dettaglio: string[];
  ricostruita: boolean;
  dopoApprovazione: boolean;
  attenzione: boolean;
  /** Nessun orario vero da mostrare (ore scritte a mano): la UI non scrive l'ora. */
  senzaOrario?: boolean;
}

export type Affidabilita = 'timbrata' | 'in_parte_a_mano' | 'corretta_ufficio';

export const AFFIDABILITA_ETICHETTA: Record<Affidabilita, string> = {
  timbrata: 'Tutta timbrata',
  in_parte_a_mano: 'In parte a mano',
  corretta_ufficio: 'Corretta dall’ufficio',
};

// ---------------------------------------------------------------------------
// Modalità di una timbratura
// ---------------------------------------------------------------------------

const MIN = 60_000;
/** Oltre questo scarto fra orario e registrazione vale la pena dirlo. */
const SOGLIA_ARRIVO_TARDIVO_MIN = 15;

/**
 * La modalità di una timbratura. Se è scritta si usa quella; altrimenti la si
 * deduce da `origine`, autore, posizione e ritardo, e lo si dichiara.
 *
 * `giornataConTimbratureVere`: se nella giornata c'è almeno un QR o un tasto
 * app, una riga 'manuale' scritta molto dopo è una divisione a fine turno;
 * altrimenti è una giornata dichiarata.
 */
export function modalitaDi(
  t: Pick<
    TimbraturaCronologia,
    'modalita' | 'origine' | 'pausa' | 'autoChiusa' | 'creatoDa' | 'haGeo' | 'ts' | 'createdAt'
  >,
  contesto: { userIdPersona: string | null; giornataConTimbratureVere: boolean },
): { modalita: ModalitaTimbratura; ricostruita: boolean } {
  if (eModalitaValida(t.modalita)) return { modalita: t.modalita, ricostruita: false };

  const ric = (modalita: ModalitaTimbratura) => ({ modalita, ricostruita: true });

  if (t.autoChiusa) return ric('pausa_chiusa_sistema');
  if (t.origine === 'capo') return ric('capo');
  if (t.creatoDa && contesto.userIdPersona && t.creatoDa !== contesto.userIdPersona) {
    return ric('ufficio');
  }
  if (t.origine === 'cronometro') return ric('app');
  if (t.origine === 'qr') {
    // Il QR salva la posizione, pausa e ripresa da app no: è l'unica traccia
    // che le distingue sulle righe vecchie.
    return ric(t.pausa && !t.haGeo ? 'app' : 'qr');
  }
  // origine 'manuale'
  if (t.pausa) return ric('pausa_dichiarata');
  const ritardoMin =
    t.createdAt && t.ts ? (Date.parse(t.createdAt) - Date.parse(t.ts)) / MIN : 0;
  if (ritardoMin <= 10) return ric('app');
  return ric(contesto.giornataConTimbratureVere ? 'divisione_fine_turno' : 'giornata_dichiarata');
}

function attoreDaModalita(m: ModalitaTimbratura): Attore {
  if (m === 'ufficio') return 'ufficio';
  if (m === 'capo') return 'capo';
  if (m === 'pausa_chiusa_sistema') return 'sistema';
  return 'persona';
}

const MODALITA_DICHIARATE: ReadonlySet<ModalitaTimbratura> = new Set([
  'divisione_fine_turno',
  'giornata_dichiarata',
  'pausa_dichiarata',
  'ufficio',
]);

// ---------------------------------------------------------------------------
// Differenze fra versioni
// ---------------------------------------------------------------------------

function minutiLavoro(t: TotaliSnapshot | undefined): number {
  if (!t) return 0;
  return Math.round(((Number(t.ore_ordinarie) || 0) + (Number(t.ore_straordinarie) || 0)) * 60);
}
function minutiViaggio(t: TotaliSnapshot | undefined): number {
  if (!t) return 0;
  return Math.round((Number(t.ore_viaggio) || 0) * 60);
}

/** Le ore per cantiere in forma confrontabile. Null se lo snapshot non le ha. */
function firmaRighe(righe: RigaSnapshotCronologia[] | undefined): string | null {
  if (!righe) return null;
  return righe
    .map((r) => {
      const chiave = r.cantiere_id ?? r.commessa_id ?? '-';
      const min = Math.round(
        ((Number(r.ore_ordinarie) || 0) + (Number(r.ore_straordinarie) || 0) + (Number(r.ore_viaggio) || 0)) * 60,
      );
      return `${chiave}:${min}`;
    })
    .filter((s) => !s.endsWith(':0'))
    .sort()
    .join('|');
}

function righeCambiate(prima: StatoConfrontabile, dopo: StatoConfrontabile): boolean {
  const a = firmaRighe(prima.righe);
  const b = firmaRighe(dopo.righe);
  return a !== null && b !== null && a !== b;
}

const STATO_ETICHETTA: Record<string, string> = {
  bozza: 'da verificare',
  approvato: 'approvata',
  respinto: 'respinta',
  inviato: 'inviata',
  verificato: 'verificata',
  esportato: 'esportata',
};

/** Le righe «prima → dopo» di una modifica. Vuoto se non è cambiato niente. */
export function differenzeGiornata(
  prima: StatoConfrontabile | null | undefined,
  dopo: StatoConfrontabile | null | undefined,
): string[] {
  if (!prima || !dopo) return [];
  const righe: string[] = [];
  const lp = minutiLavoro(prima.totali);
  const ld = minutiLavoro(dopo.totali);
  if (lp !== ld) righe.push(`Lavoro ${formattaOreGiornata(lp)} → ${formattaOreGiornata(ld)}`);
  const vp = minutiViaggio(prima.totali);
  const vd = minutiViaggio(dopo.totali);
  if (vp !== vd) righe.push(`Viaggio ${formattaOreGiornata(vp)} → ${formattaOreGiornata(vd)}`);
  if (lp === ld && vp === vd && righeCambiate(prima, dopo)) {
    righe.push('Ore spostate fra cantieri');
  }
  if (prima.stato && dopo.stato && prima.stato !== dopo.stato) {
    righe.push(
      `Stato ${STATO_ETICHETTA[prima.stato] ?? prima.stato} → ${STATO_ETICHETTA[dopo.stato] ?? dopo.stato}`,
    );
  }
  return righe;
}

/** Stesse ore e stesso stato: salvare questa versione non racconta niente. */
export function versioneSenzaCambiamenti(
  prima: StatoConfrontabile | null | undefined,
  dopo: StatoConfrontabile | null | undefined,
): boolean {
  if (!prima || !dopo) return false;
  return (
    minutiLavoro(prima.totali) === minutiLavoro(dopo.totali) &&
    minutiViaggio(prima.totali) === minutiViaggio(dopo.totali) &&
    (prima.stato ?? null) === (dopo.stato ?? null) &&
    !righeCambiate(prima, dopo)
  );
}

// ---------------------------------------------------------------------------
// Ricostruzione
// ---------------------------------------------------------------------------

const TITOLO_AZIONE: Record<string, string> = {
  invio: 'Giornata inviata',
  modifica_tecnico: 'Ore corrette dalla persona',
  modifica_ufficio: 'Ore corrette dall’ufficio',
  pausa_ufficio: 'Pausa aggiunta dall’ufficio',
  chiusura_ufficio: 'Turno chiuso dall’ufficio',
  approvazione: 'Giornata approvata dall’ufficio',
  respinta: 'Giornata respinta',
  riapertura: 'Giornata riaperta',
  ricalcolo: 'Ore ricalcolate',
};

function attoreDaAzione(azione: string): Attore {
  if (azione === 'modifica_tecnico' || azione === 'invio') return 'persona';
  if (azione === 'ricalcolo') return 'sistema';
  return 'ufficio';
}

const AZIONI_MODIFICA: ReadonlySet<string> = new Set([
  'modifica_tecnico',
  'modifica_ufficio',
  'pausa_ufficio',
  'chiusura_ufficio',
  'ricalcolo',
]);

/** Due timbrature entro questo scarto su cantieri diversi sono un cambio cantiere. */
const CAMBIO_CANTIERE_MAX_MIN = 3;

export interface InputCronologia {
  timbrature: TimbraturaCronologia[];
  viaggi: ViaggioCronologia[];
  versioni: VersioneCronologia[];
  userIdPersona: string | null;
  /** Approvata in automatico: quando (se lo stato attuale lo è). */
  approvataAutoAl: string | null;
  /** Il giorno della giornata (YYYY-MM-DD). */
  data?: string;
  /**
   * Le ore del rapportino per cantiere. Servono quando la giornata non ha
   * timbrature di lavoro (ore scritte a mano): senza, il lavoro non avrebbe
   * nessun pallino e si vedrebbe solo il viaggio.
   */
  lavoro?: { cantiere: string | null; minutiOrdinari: number; minutiStraordinari: number }[];
}

export function costruisciCronologia(input: InputCronologia): EventoCronologia[] {
  const eventi: EventoCronologia[] = [];
  const timb = [...input.timbrature].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const giornataConTimbratureVere = timb.some(
    (t) => t.modalita === 'qr' || t.modalita === 'app' || t.origine === 'qr' || t.origine === 'cronometro',
  );
  const tsPerTimbratura = new Map(timb.map((t) => [t.id, t.ts]));

  const lavoro = timb.filter((t) => !t.pausa);
  const ultimaUscitaLavoro = [...lavoro].reverse().find((t) => t.tipo === 'uscita')?.id ?? null;
  const assorbite = new Set<string>();
  // Il cantiere sotto ogni evento serve solo se la giornata ne ha più d'uno, e
  // solo quando cambia: con un cantiere solo è già in testa, ripeterlo è rumore.
  const piuCantieri = new Set(timb.map((t) => t.cantiere).filter(Boolean)).size > 1;
  let ultimoCantiereMostrato: string | null = null;

  for (let i = 0; i < timb.length; i += 1) {
    const t = timb[i]!;
    if (assorbite.has(t.id)) continue;
    const { modalita, ricostruita } = modalitaDi(t, {
      userIdPersona: input.userIdPersona,
      giornataConTimbratureVere,
    });

    let tipo: TipoEvento;
    let titolo: string;
    let cantiere = t.cantiere;
    // L'ingresso che apre il lavoro: dice se si lavorava dalla sede.
    let entrata: TimbraturaCronologia | undefined = t.tipo === 'ingresso' && !t.pausa ? t : undefined;

    if (t.pausa) {
      tipo = t.tipo === 'uscita' ? 'inizio_pausa' : 'fine_pausa';
      titolo = t.tipo === 'uscita' ? 'Inizio pausa' : 'Fine pausa';
    } else if (t.tipo === 'ingresso') {
      const primaIngresso = !timb.slice(0, i).some((x) => !x.pausa);
      tipo = primaIngresso ? 'inizio_turno' : 'nuovo_ingresso';
      titolo = primaIngresso ? 'Inizio turno' : 'Nuovo ingresso';
    } else {
      // Uscita seguita subito da un ingresso su un altro cantiere: è un cambio.
      const dopo = timb.slice(i + 1).find((x) => !x.pausa);
      const eCambio =
        !!dopo &&
        dopo.tipo === 'ingresso' &&
        dopo.cantiere !== t.cantiere &&
        (Date.parse(dopo.ts) - Date.parse(t.ts)) / MIN <= CAMBIO_CANTIERE_MAX_MIN;
      if (eCambio && dopo) {
        assorbite.add(dopo.id);
        entrata = dopo;
        tipo = 'cambio_cantiere';
        titolo = 'Cambio cantiere';
        cantiere = t.cantiere && dopo.cantiere ? `${t.cantiere} → ${dopo.cantiere}` : dopo.cantiere;
        ultimoCantiereMostrato = dopo.cantiere;
      } else if (t.id === ultimaUscitaLavoro) {
        tipo = 'fine_turno';
        titolo = 'Fine turno';
      } else {
        tipo = 'uscita';
        titolo = 'Uscita';
      }
    }

    const ritardoMin = t.createdAt ? (Date.parse(t.createdAt) - Date.parse(t.ts)) / MIN : 0;
    const dichiarata = MODALITA_DICHIARATE.has(modalita);
    // Il ritardo si mostra solo dove racconta un fatto. Per una modalità
    // dichiarata è «registrata alle»; per QR e app vale solo se la modalità è
    // scritta davvero: sulle righe vecchie quei ritardi erano caricamenti in
    // blocco (16/07, collaudo del 13/08), non la giornata della persona.
    const ritardoCredibile = dichiarata || !ricostruita;
    const arrivatoAl =
      t.createdAt &&
      ritardoMin > SOGLIA_ARRIVO_TARDIVO_MIN &&
      ritardoCredibile &&
      modalita !== 'pausa_chiusa_sistema'
        ? t.createdAt
        : null;
    const attore = attoreDaModalita(modalita);

    eventi.push({
      chiave: `t:${t.id}`,
      quando: t.ts,
      arrivatoAl,
      arrivoDichiarato: dichiarata,
      tipo,
      titolo,
      modalita: MODALITA_ETICHETTA[modalita],
      attore,
      chi: attore === 'persona' ? null : attore === 'sistema' ? null : t.creatoNome,
      dettaglio: (() => {
        const sede = entrata?.sedeLavoro ? [`Lavoro dalla sede ${entrata.sedeLavoro}`] : [];
        if (tipo === 'cambio_cantiere') return [...(cantiere ? [cantiere] : []), ...sede];
        if (!piuCantieri || !cantiere || cantiere === ultimoCantiereMostrato) return sede;
        ultimoCantiereMostrato = cantiere;
        return [cantiere, ...sede];
      })(),
      ricostruita,
      dopoApprovazione: false,
      attenzione: modalita === 'pausa_chiusa_sistema' || modalita === 'ufficio',
    });
  }

  const quandoAndate: number[] = [];
  const quandoRitorni: number[] = [];
  for (const v of input.viaggi) {
    const trasferimento = !!v.daCantiere;
    const tsLegato = v.timbraturaId ? tsPerTimbratura.get(v.timbraturaId) : undefined;
    // L'andata viene prima dell'ingresso a cui è legata, il ritorno dopo l'uscita.
    const base = tsLegato ?? v.createdAt;
    const spostamento = v.direzione === 'andata' ? -1 : 1;
    const quando = new Date(Date.parse(base) + spostamento).toISOString();
    if (!trasferimento) (v.direzione === 'andata' ? quandoAndate : quandoRitorni).push(Date.parse(quando));

    const parti: string[] = [];
    if (trasferimento) parti.push(`${v.daCantiere} → ${v.cantiere ?? '—'}`);
    else if (v.direzione === 'andata') parti.push(`${v.sede ?? 'Partenza'} → ${v.cantiere ?? 'cantiere'}`);
    else parti.push(`${v.cantiere ?? 'Cantiere'} → ${v.sede ?? 'rientro'}`);
    const misure: string[] = [];
    if (v.km != null && v.km > 0) misure.push(`${Math.round(v.km)} km`);
    if (v.minutiPagati != null && v.minutiPagati > 0) misure.push(formattaOreGiornata(v.minutiPagati));
    misure.push(v.autista ? 'alla guida' : 'passeggero');

    eventi.push({
      chiave: `v:${v.id}`,
      quando,
      arrivatoAl: null,
      arrivoDichiarato: false,
      tipo: trasferimento ? 'trasferimento' : 'viaggio',
      titolo: trasferimento
        ? 'Trasferimento fra cantieri'
        : v.direzione === 'andata'
          ? 'Viaggio di andata'
          : 'Viaggio di ritorno',
      modalita: null,
      attore: 'persona',
      chi: null,
      dettaglio: [parti.join(''), misure.join(' · ')],
      ricostruita: false,
      dopoApprovazione: false,
      attenzione: false,
    });
  }

  const versioni = [...input.versioni].sort((a, b) => a.versione - b.versione);
  let precedente: SnapshotGiornata | null = null;
  for (const v of versioni) {
    const snap = v.snapshot ?? null;
    const prima = snap?.prima ?? precedente;
    const diff = differenzeGiornata(prima, snap);
    const eModifica = AZIONI_MODIFICA.has(v.azione);

    // Le versioni vecchie salvate senza cambiare niente sono rumore: non si mostrano.
    if (eModifica && prima && diff.length === 0) {
      precedente = snap;
      continue;
    }

    // Se prima non c'era niente, non è una correzione: è la prima scrittura.
    const primaVuota =
      !!prima && minutiLavoro(prima.totali) === 0 && minutiViaggio(prima.totali) === 0;
    const titolo =
      primaVuota && v.azione === 'modifica_tecnico'
        ? 'Ore scritte a mano dalla persona'
        : primaVuota && v.azione === 'modifica_ufficio'
          ? 'Ore inserite dall’ufficio'
          : (TITOLO_AZIONE[v.azione] ?? 'Modifica');

    eventi.push({
      chiave: `r:${v.versione}`,
      quando: v.quando,
      arrivatoAl: null,
      arrivoDichiarato: false,
      tipo: 'modifica',
      titolo,
      modalita: null,
      attore: attoreDaAzione(v.azione),
      chi: v.azione === 'ricalcolo' ? null : v.chi,
      dettaglio: diff,
      ricostruita: false,
      dopoApprovazione: eModifica && prima?.stato === 'approvato',
      attenzione: eModifica && prima?.stato === 'approvato',
    });
    precedente = snap;
  }

  if (input.approvataAutoAl) {
    eventi.push({
      chiave: 'a:auto',
      quando: input.approvataAutoAl,
      arrivatoAl: null,
      arrivoDichiarato: false,
      tipo: 'approvata_auto',
      titolo: 'Approvata in automatico',
      modalita: null,
      attore: 'sistema',
      chi: null,
      dettaglio: [],
      ricostruita: false,
      dopoApprovazione: false,
      attenzione: false,
    });
  }

  // Ore scritte a mano senza timbrature: nessuna timbratura dice quando il
  // lavoro è cominciato, e senza un pallino la giornata sembrerebbe fatta del
  // solo viaggio. Un evento generico, senza orario, messo dove sta logicamente:
  // dopo l'andata e prima del ritorno. Il totale giusto è già in testa al
  // pannello; questo serve a leggere la giornata.
  const righeLavoro = (input.lavoro ?? []).filter((r) => r.minutiOrdinari + r.minutiStraordinari > 0);
  if (righeLavoro.length > 0 && !timb.some((t) => !t.pausa)) {
    const ordinari = righeLavoro.reduce((a, r) => a + r.minutiOrdinari, 0);
    const straordinari = righeLavoro.reduce((a, r) => a + r.minutiStraordinari, 0);

    const dopoAndata = quandoAndate.length > 0 ? Math.max(...quandoAndate) + 1 : null;
    const primaRitorno = quandoRitorni.length > 0 ? Math.min(...quandoRitorni) - 1 : null;
    const quandoMs =
      primaRitorno != null && (dopoAndata == null || primaRitorno >= dopoAndata)
        ? primaRitorno
        : dopoAndata != null
          ? dopoAndata
          : eventi.length > 0
            ? Math.min(...eventi.map((e) => Date.parse(e.quando))) - 1
            : Date.parse(`${input.data ?? '1970-01-01'}T10:00:00Z`);

    const dettaglio: string[] = [];
    if (straordinari > 0) {
      dettaglio.push(`${formattaOreGiornata(ordinari)} ordinario · ${formattaOreGiornata(straordinari)} straordinario`);
    }
    if (new Set(righeLavoro.map((r) => r.cantiere)).size > 1) {
      for (const r of righeLavoro) {
        dettaglio.push(`${r.cantiere ?? 'Cantiere'} · ${formattaOreGiornata(r.minutiOrdinari + r.minutiStraordinari)}`);
      }
    }
    dettaglio.push('Senza timbrature: l’orario non è indicato');

    // Chi le ha scritte: l'ultima scrittura a mano delle ore.
    const autore = [...input.versioni]
      .sort((a, b) => b.versione - a.versione)
      .find((v) => v.azione === 'modifica_tecnico' || v.azione === 'modifica_ufficio');
    const dallUfficio = autore?.azione === 'modifica_ufficio';

    eventi.push({
      chiave: 'l:dichiarato',
      quando: new Date(quandoMs).toISOString(),
      arrivatoAl: null,
      arrivoDichiarato: false,
      tipo: 'lavoro_dichiarato',
      titolo:
        straordinari > 0
          ? `${formattaOreGiornata(ordinari + straordinari)} di lavoro`
          : `${formattaOreGiornata(ordinari)} di lavoro ordinario`,
      modalita: null,
      attore: dallUfficio ? 'ufficio' : 'persona',
      chi: dallUfficio ? (autore?.chi ?? null) : null,
      dettaglio,
      ricostruita: false,
      dopoApprovazione: false,
      attenzione: false,
      senzaOrario: true,
    });
  }

  return eventi.sort((a, b) => Date.parse(a.quando) - Date.parse(b.quando));
}

// ---------------------------------------------------------------------------
// Riassunto delle versioni (per gli elenchi)
// ---------------------------------------------------------------------------

/**
 * Cosa raccontano davvero le versioni di una giornata, senza ricostruirla tutta.
 *
 * - `azioniSignificative`: le azioni che hanno cambiato qualcosa (le versioni
 *   vecchie salvate a ore identiche non contano: altrimenti una giornata
 *   risulterebbe «corretta» senza esserlo).
 * - `modificheDopoApprovazione`: quante modifiche vere sono arrivate quando la
 *   giornata era già approvata.
 */
export function riassuntoVersioni(versioni: VersioneCronologia[]): {
  azioniSignificative: string[];
  modificheDopoApprovazione: number;
} {
  const ordinate = [...versioni].sort((a, b) => a.versione - b.versione);
  const azioni: string[] = [];
  let dopo = 0;
  let precedente: SnapshotGiornata | null = null;
  for (const v of ordinate) {
    const snap = v.snapshot ?? null;
    const prima = snap?.prima ?? precedente;
    const eModifica = AZIONI_MODIFICA.has(v.azione);
    const cambiata = !eModifica || !prima || differenzeGiornata(prima, snap).length > 0;
    if (cambiata) {
      azioni.push(v.azione);
      if (eModifica && prima?.stato === 'approvato') dopo += 1;
    }
    precedente = snap;
  }
  return { azioniSignificative: azioni, modificheDopoApprovazione: dopo };
}

// ---------------------------------------------------------------------------
// Affidabilità
// ---------------------------------------------------------------------------

/**
 * Quanto ci si può fidare delle ore di una giornata, a colpo d'occhio.
 *
 *  - corretta dall'ufficio: qualcuno in ufficio ha cambiato le ore o inserito
 *    timbrature per la persona;
 *  - in parte a mano: c'è almeno un pezzo dichiarato (giornata scritta a mano,
 *    divisione a fine turno, pausa dichiarata) o la persona ha corretto le ore;
 *  - tutta timbrata: solo QR, app o capo squadra.
 */
export function affidabilitaGiornata(input: {
  timbrature: Pick<
    TimbraturaCronologia,
    'modalita' | 'origine' | 'pausa' | 'autoChiusa' | 'creatoDa' | 'haGeo' | 'ts' | 'createdAt'
  >[];
  azioniVersioni: string[];
  scrittaAMano: boolean;
  userIdPersona: string | null;
}): Affidabilita {
  const giornataConTimbratureVere = input.timbrature.some(
    (t) => t.modalita === 'qr' || t.modalita === 'app' || t.origine === 'qr' || t.origine === 'cronometro',
  );
  const modalita = input.timbrature.map(
    (t) =>
      modalitaDi(t, { userIdPersona: input.userIdPersona, giornataConTimbratureVere }).modalita,
  );

  if (
    modalita.includes('ufficio') ||
    input.azioniVersioni.some((a) =>
      ['modifica_ufficio', 'pausa_ufficio', 'chiusura_ufficio'].includes(a),
    )
  ) {
    return 'corretta_ufficio';
  }
  if (
    input.scrittaAMano ||
    modalita.some((m) => MODALITA_DICHIARATE.has(m)) ||
    input.azioniVersioni.includes('modifica_tecnico')
  ) {
    return 'in_parte_a_mano';
  }
  return 'timbrata';
}
