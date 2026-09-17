import 'server-only';

import { createServerSupabase } from '@kommessa/api/server';
import { leggiPerId, leggiTutto } from '@kommessa/api/pagine';
import { COLONNE_QUOTE, sommaQuote, type RigaRapportinoLetta } from '@kommessa/api/kantiere-quote';
import {
  generaDatiMese,
  risolviCausale,
  type DipendentePaghe,
  type EsitoGenerazione,
  type EventoPaghe,
  type TipoInfoAggiuntiva,
} from '@kommessa/api/paghe-essepaghe';
import {
  estremiDelMese,
  traduciMese,
  type AssenzaKommessa,
  type GiornataKommessa,
} from '@kommessa/api/paghe-mappatura';
import { labelTipoPermesso } from '@kommessa/api/permessi-tipi';

import { leggiImpostazioniKantiere } from '@/app/_lib/kantiere-config';
import { leggiConfigPaghe, type ConfigPaghe } from '@/app/_lib/paghe-config';

/**
 * Il mese visto dalla pagina dell'export.
 *
 * Qui si mette insieme quello che Kommessa sa gia' (giornate approvate, ferie e
 * permessi approvati) con quello che l'ufficio ha scritto a mano per chi ancora
 * non usa l'app, e si traduce tutto nelle causali del consulente. Niente viene
 * copiato o congelato: il mese si ricostruisce a ogni apertura, quindi una
 * correzione su una giornata si vede subito nel file.
 *
 * Le letture sono paginate perche' un mese intero di un cliente cresciuto puo'
 * superare il tetto di righe del database, e un totale calcolato su una lettura
 * a meta' sarebbe sbagliato senza dare errore.
 */

export interface DipendenteMese {
  id: string;
  cognome: string;
  nome: string;
  /** Codice delle paghe: in Kommessa e' il codice interno del dipendente. */
  codicePaghe: string | null;
  attivo: boolean;
  /** Il dipendente ha giornate registrate in Kommessa in questo mese. */
  usaKommessa: boolean;
}

export type OrigineEvento = 'kommessa' | 'manuale';

export interface EventoMese extends EventoPaghe {
  /** Riga di `paghe_eventi`, presente solo per gli eventi scritti a mano. */
  id?: string;
  origine: OrigineEvento;
  /** Descrizione estesa della causale, per non leggere sigle a schermo. */
  descrizione: string;
  /** Da quale assenza di Kommessa arriva, se arriva da li'. */
  tipoAssenza?: string;
  /** Nota interna di chi ha scritto la riga a mano. Non finisce nel file. */
  nota?: string | null;
}

export interface CertificatoMese {
  id: string;
  dipendenteId: string;
  dal: string;
  al: string;
  tipoInfo: TipoInfoAggiuntiva;
  numero: string | null;
  nomeFile: string | null;
  haAllegato: boolean;
  nota: string | null;
  eventoId: string | null;
  permessoId: string | null;
}

/** Giornata del mese non ancora approvata: resta fuori dal file. */
export interface GiornataSospesa {
  dipendenteId: string;
  data: string;
  stato: string;
}

export interface ModelloMese {
  periodo: string;
  stato: 'bozza' | 'consegnato';
  consegnatoAl: string | null;
  note: string | null;
  config: ConfigPaghe;
  /** Ore di una giornata piena, dall'orario ordinario del cliente. */
  oreGiornataIntera: number;
  dipendenti: DipendenteMese[];
  eventi: EventoMese[];
  certificati: CertificatoMese[];
  /** Tipi di assenza incontrati senza una causale decisa. */
  causaliDaDecidere: { tipo: string; label: string; quante: number }[];
  giornateSospese: GiornataSospesa[];
  esito: EsitoGenerazione;
}

type RigaDb = RigaRapportinoLetta & { rapportino_id: string };

function sovrapposti(aDal: string, aAl: string, bDal: string, bAl: string): boolean {
  return aDal <= bAl && bDal <= aAl;
}

/** Una data spostata di N giorni, restando in UTC come il resto del calcolo. */
function scostaGiorni(iso: string, giorni: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + giorni);
  return d.toISOString().slice(0, 10);
}

export async function caricaMese(tenantId: string, periodo: string): Promise<ModelloMese> {
  const supabase = createServerSupabase();
  const mese = estremiDelMese(periodo);

  const [config, impostazioni] = await Promise.all([
    leggiConfigPaghe(supabase, tenantId),
    leggiImpostazioniKantiere(supabase, tenantId),
  ]);
  const oreGiornataIntera = Math.round((impostazioni.orarioOrdinarioMin / 60) * 100) / 100;

  const [dipendentiRaw, rapportini, permessi, eventiManuali, certificatiRaw, statoMese] =
    await Promise.all([
      leggiTutto<{
        id: string;
        nome: string;
        cognome: string;
        codice_interno: string | null;
        stato_attivo: boolean;
      }>(
        (da, a) =>
          supabase
            .from('dipendenti' as never)
            .select('id, nome, cognome, codice_interno, stato_attivo')
            .eq('tenant_id', tenantId)
            .order('cognome')
            .order('id')
            .range(da, a) as never,
        { contesto: 'dipendenti export paghe' },
      ),
      leggiTutto<{ id: string; dipendente_id: string; data: string; stato: string }>(
        (da, a) =>
          supabase
            .from('rapportini' as never)
            .select('id, dipendente_id, data, stato')
            .eq('tenant_id', tenantId)
            .gte('data', mese.dal)
            .lte('data', mese.al)
            .order('data')
            .order('id')
            .range(da, a) as never,
        { contesto: 'giornate export paghe' },
      ),
      leggiTutto<{
        id: string;
        dipendente_id: string;
        tipo: string;
        data_inizio: string;
        data_fine: string;
        tutto_il_giorno: boolean;
        ora_inizio: string | null;
        ora_fine: string | null;
      }>(
        (da, a) =>
          supabase
            .from('permesso_richieste' as never)
            .select(
              'id, dipendente_id, tipo, data_inizio, data_fine, tutto_il_giorno, ora_inizio, ora_fine',
            )
            .eq('tenant_id', tenantId)
            .eq('stato', 'approvato')
            .lte('data_inizio', mese.al)
            .gte('data_fine', mese.dal)
            .order('data_inizio')
            .order('id')
            .range(da, a) as never,
        { contesto: 'assenze export paghe' },
      ),
      leggiTutto<{
        id: string;
        dipendente_id: string;
        causale: string;
        dal: string;
        al: string;
        ore: number;
        record: '12' | '14';
        nota: string | null;
      }>(
        (da, a) =>
          supabase
            .from('paghe_eventi' as never)
            .select('id, dipendente_id, causale, dal, al, ore, record, nota')
            .eq('tenant_id', tenantId)
            .eq('periodo', periodo)
            .order('dal')
            .order('id')
            .range(da, a) as never,
        { contesto: 'variazioni a mano export paghe' },
      ),
      leggiTutto<{
        id: string;
        dipendente_id: string;
        permesso_id: string | null;
        evento_id: string | null;
        dal: string;
        al: string;
        tipo_info: TipoInfoAggiuntiva;
        numero: string | null;
        r2_key: string | null;
        nome_file: string | null;
        nota: string | null;
      }>(
        (da, a) =>
          supabase
            .from('paghe_certificati' as never)
            .select(
              'id, dipendente_id, permesso_id, evento_id, dal, al, tipo_info, numero, r2_key, nome_file, nota',
            )
            .eq('tenant_id', tenantId)
            // Finestra piu' larga del mese: un attestato puo' essere datato
            // qualche giorno prima o dopo l'assenza a cui si riferisce, e
            // cercarlo solo dentro il mese lo farebbe risultare mancante.
            .lte('dal', scostaGiorni(mese.al, 60))
            .gte('al', scostaGiorni(mese.dal, -60))
            .order('dal')
            .order('id')
            .range(da, a) as never,
        { contesto: 'certificati export paghe' },
      ),
      supabase
        .from('paghe_mesi' as never)
        .select('stato, consegnato_at, note')
        .eq('tenant_id', tenantId)
        .eq('periodo', periodo)
        .maybeSingle(),
    ]);

  // Le righe delle giornate si leggono a gruppi di id: la lista puo' essere
  // lunga e finirebbe tutta nell'indirizzo della richiesta.
  const idGiornate = rapportini.filter((r) => r.stato === 'approvato').map((r) => r.id);
  const righe = await leggiPerId<string, RigaDb>(
    idGiornate,
    (gruppo, da, a) =>
      supabase
        .from('rapportino_righe' as never)
        .select(`rapportino_id, ${COLONNE_QUOTE}`)
        .in('rapportino_id', gruppo)
        .order('rapportino_id')
        .order('id')
        .range(da, a) as never,
    { contesto: 'ore export paghe' },
  );

  const righePerGiornata = new Map<string, RigaDb[]>();
  for (const riga of righe) {
    const lista = righePerGiornata.get(riga.rapportino_id);
    if (lista) lista.push(riga);
    else righePerGiornata.set(riga.rapportino_id, [riga]);
  }

  const giornate: GiornataKommessa[] = [];
  const giornateSospese: GiornataSospesa[] = [];
  const conGiornate = new Set<string>();
  for (const giornata of rapportini) {
    if (giornata.stato !== 'approvato') {
      giornateSospese.push({
        dipendenteId: giornata.dipendente_id,
        data: giornata.data,
        stato: giornata.stato,
      });
      continue;
    }
    conGiornate.add(giornata.dipendente_id);
    const totali = sommaQuote(righePerGiornata.get(giornata.id) ?? []);
    giornate.push({
      dipendenteId: giornata.dipendente_id,
      data: giornata.data,
      minutiStraordinari: totali.minutiStraordinari,
      minutiViaggioEccedente: totali.minutiViaggioEccedenti,
    });
  }

  const certificati: CertificatoMese[] = certificatiRaw.map((c) => ({
    id: c.id,
    dipendenteId: c.dipendente_id,
    dal: c.dal,
    al: c.al,
    tipoInfo: c.tipo_info,
    numero: c.numero,
    nomeFile: c.nome_file,
    haAllegato: Boolean(c.r2_key),
    nota: c.nota,
    eventoId: c.evento_id,
    permessoId: c.permesso_id,
  }));

  /**
   * L'attestato di un'assenza. Prima si guarda il collegamento esplicito: e'
   * l'unico modo sicuro quando nello stesso mese ci sono due malattie. Solo se
   * manca si ripiega sulle date, escludendo i certificati gia' agganciati a
   * un'altra assenza e quelli di tipo `C`, che portano il codice fiscale di un
   * ente e non un numero di attestato.
   */
  function certificatoPerAssenza(permessoId: string, dipendenteId: string, dal: string, al: string) {
    const collegato = certificati.find((c) => c.permessoId === permessoId);
    if (collegato) return collegato;
    return certificati.find(
      (c) =>
        c.dipendenteId === dipendenteId &&
        c.permessoId === null &&
        c.eventoId === null &&
        c.tipoInfo !== 'C' &&
        sovrapposti(c.dal, c.al, dal, al),
    );
  }

  const assenze: AssenzaKommessa[] = permessi.map((p) => {
    const certificato = certificatoPerAssenza(p.id, p.dipendente_id, p.data_inizio, p.data_fine);
    return {
      dipendenteId: p.dipendente_id,
      tipo: p.tipo,
      dal: p.data_inizio,
      al: p.data_fine,
      tuttoIlGiorno: p.tutto_il_giorno,
      oreParziali: oreFraOrari(p.ora_inizio, p.ora_fine),
      certificato: certificato
        ? { tipoInfo: certificato.tipoInfo, numero: certificato.numero }
        : null,
    };
  });

  const tradotto = traduciMese({ giornate, assenze }, config.regole, {
    periodo,
    oreGiornataIntera,
    causaliExtra: config.causaliExtra,
  });

  const daKommessa: EventoMese[] = tradotto.eventi.map((e) => ({
    ...e,
    origine: 'kommessa',
    descrizione: risolviCausale(e.causale, config.causaliExtra)?.descrizione ?? e.causale,
  }));

  const aMano: EventoMese[] = eventiManuali.map((r) => {
    const certificato = certificati.find((c) => c.eventoId === r.id);
    return {
      id: r.id,
      dipendenteId: r.dipendente_id,
      causale: r.causale,
      dal: r.dal,
      al: r.al,
      ore: Number(r.ore),
      record: r.record,
      origine: 'manuale',
      nota: r.nota,
      descrizione: risolviCausale(r.causale, config.causaliExtra)?.descrizione ?? r.causale,
      tipoInfo: certificato?.tipoInfo ?? null,
      infoAggiuntiva: certificato?.numero ?? null,
    };
  });

  const eventi = [...daKommessa, ...aMano];

  const dipendenti: DipendenteMese[] = dipendentiRaw.map((d) => ({
    id: d.id,
    cognome: d.cognome,
    nome: d.nome,
    codicePaghe: d.codice_interno,
    attivo: d.stato_attivo,
    usaKommessa: conGiornate.has(d.id),
  }));

  const perGenerazione: DipendentePaghe[] = dipendenti.map((d) => ({
    id: d.id,
    codicePaghe: d.codicePaghe,
    cognome: d.cognome,
    nome: d.nome,
  }));

  const generato = generaDatiMese(perGenerazione, eventi, {
    periodo,
    codiceDitta: config.codiceDitta,
    programmaPresenze: config.programmaPresenze,
    causaliExtra: config.causaliExtra,
  });

  // Quello che si e' perso per strada, detto con il nome della persona: un
  // dato che sparisce in silenzio e' peggio di uno sbagliato.
  const nomeDi = new Map(dipendenti.map((d) => [d.id, `${d.cognome} ${d.nome}`]));
  const avvisiInPiu = tradotto.avvisi.map((a) => ({
    gravita: 'attenzione' as const,
    dipendenteId: a.dipendenteId,
    messaggio: `${nomeDi.get(a.dipendenteId) ?? 'Dipendente'}: ${a.messaggio}`,
  }));

  // Doppioni fra un'assenza approvata e la stessa scritta a mano: succede nel
  // passaggio dal foglio di prima, e raddoppierebbe le ore senza dire niente.
  for (const riga of aMano) {
    const gemella = daKommessa.find(
      (k) =>
        k.dipendenteId === riga.dipendenteId &&
        k.causale === riga.causale &&
        sovrapposti(k.dal, k.al, riga.dal, riga.al),
    );
    if (gemella) {
      avvisiInPiu.push({
        gravita: 'attenzione' as const,
        dipendenteId: riga.dipendenteId,
        messaggio: `${nomeDi.get(riga.dipendenteId) ?? 'Dipendente'}: ${riga.causale} del ${riga.dal.slice(8, 10)}/${riga.dal.slice(5, 7)} c'e' due volte, una da Kommessa e una scritta a mano. Nel file escono entrambe.`,
      });
    }
  }

  const esito = { ...generato, avvisi: [...avvisiInPiu, ...generato.avvisi] };

  const conteggioDaDecidere = new Map<string, number>();
  for (const tipo of tradotto.causaliDaDecidere) {
    const quante = assenze.filter((a) => a.tipo === tipo).length;
    conteggioDaDecidere.set(tipo, quante);
  }

  const riga = statoMese.data as
    | { stato: 'bozza' | 'consegnato'; consegnato_at: string | null; note: string | null }
    | null;

  return {
    periodo,
    stato: riga?.stato ?? 'bozza',
    consegnatoAl: riga?.consegnato_at ?? null,
    note: riga?.note ?? null,
    config,
    oreGiornataIntera,
    dipendenti,
    eventi,
    certificati,
    causaliDaDecidere: [...conteggioDaDecidere].map(([tipo, quante]) => ({
      tipo,
      label: labelTipoPermesso(tipo),
      quante,
    })),
    giornateSospese,
    esito,
  };
}

/** Ore fra due orari `HH:MM`, per i permessi che non coprono la giornata. */
function oreFraOrari(inizio: string | null, fine: string | null): number | null {
  if (!inizio || !fine) return null;
  const minuti = (o: string) => Number(o.slice(0, 2)) * 60 + Number(o.slice(3, 5));
  const durata = minuti(fine) - minuti(inizio);
  if (!Number.isFinite(durata) || durata <= 0) return null;
  return Math.round((durata / 60) * 100) / 100;
}
