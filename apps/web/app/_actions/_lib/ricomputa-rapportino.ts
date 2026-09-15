import { createServerSupabase } from '@kommessa/api/server';
import {
  arrotondaA,
  esitoAutoApprovazione,
  esitoAutoApprovazioneManuale,
} from '@kommessa/api/kantiere-ore';
import {
  minutiDaTimbrature,
  quoteDaRiga,
  type RigaRapportinoLetta,
  type TrattaMinuti,
} from '@kommessa/api/kantiere-quote';
import { targetTimbratura } from '@kommessa/api/kantiere';
import { romeDayBoundsUtc } from '@kommessa/api/rome-time';
import {
  leggiArrotondamenti,
  leggiPolicyRapportini,
  leggiSogliaAutoSpegnimentoPausa,
} from '@/app/_lib/kantiere-config';
import { chiudiPausaScadutaSePresente } from '@/app/_actions/_lib/viaggio-timbra';
import { leggiStatoGiornata, scriviVersioneRapportino } from './scrivi-versione-rapportino';
import { scriviRigheGiornata, type RigaGiornataPura } from './righe-giornata';

/**
 * Auto-derivazione del rapportino giornaliero dalle timbrature.
 *
 * Idea: ogni giornata timbrata produce automaticamente un rapportino bozza con i
 * minuti puri di lavoro (ingresso→uscita per target) e di viaggio (da
 * timbratura_viaggio), e accanto le quote derivate con la regola del tenant
 * (`scriviRigheGiornata` → `@kommessa/api/kantiere-quote`). Finché il tecnico non SALVA a mano
 * (`auto_compilato=false`), il rapportino resta "automatico" e viene
 * ricalcolato a ogni timbratura / apertura.
 *
 * Tollerante alla migration non ancora applicata: se la colonna
 * `auto_compilato` non esiste, ricalcola SOLO quando non ci sono righe (non
 * sovrascrive mai dati già presenti).
 */

type Supa = ReturnType<typeof createServerSupabase>;

export interface RapportinoBase {
  id: string;
  data: string;
  stato: string;
  note: string | null;
  approvato_da?: string | null;
}

// ── chiave sintetica polimorfica (commessa XOR cantiere) ─────────────────────

export function chiaveTarget(row: { commessa_id: string | null; cantiere_id: string | null }): string {
  const t = targetTimbratura(row);
  if (!t) return '';
  return t.tipo === 'cantiere' ? `cantiere:${t.id}` : `commessa:${t.id}`;
}

export function decodeChiave(key: string): { commessa_id: string | null; cantiere_id: string | null } {
  if (key.startsWith('cantiere:')) return { commessa_id: null, cantiere_id: key.slice('cantiere:'.length) };
  if (key.startsWith('commessa:')) return { commessa_id: key.slice('commessa:'.length), cantiere_id: null };
  return { commessa_id: key || null, cantiere_id: null };
}

export function oreDaMin(min: number): number {
  return Math.round((min / 60) * 100) / 100;
}

// ── tratte di viaggio della giornata ─────────────────────────────────────────

/**
 * Tutte le tratte della giornata come le vuole `minutiDaTimbrature`: quelle
 * legate alle timbrature del giorno (andata, ritorno, passaggi dalla sede) e
 * quelle non legate, con `data` e cantiere di destinazione (ore scritte a mano,
 * trasferimenti fra cantieri).
 *
 * I trasferimenti fanno parte del viaggio (scelta del cliente, 14/09/2026): il
 * loro tempo confermato conta come quello di ogni altra tratta.
 */
async function tratteGiornata(
  supabase: Supa,
  tenantId: string,
  dipendenteId: string,
  data: string,
  idTimbrature: string[],
): Promise<TrattaMinuti[]> {
  const [legateRes, scioltaRes] = await Promise.all([
    idTimbrature.length > 0
      ? supabase
          .from('timbratura_viaggio' as never)
          .select('timbratura_id, durata_confermata_min')
          .in('timbratura_id', idTimbrature)
      : Promise.resolve({ data: [] as unknown[] }),
    supabase
      .from('timbratura_viaggio' as never)
      .select('cantiere_id, da_cantiere_id, durata_confermata_min')
      .eq('tenant_id', tenantId)
      .eq('dipendente_id', dipendenteId)
      .eq('data', data)
      .is('timbratura_id', null),
  ]);
  const out: TrattaMinuti[] = [];
  for (const r of (legateRes.data as { timbratura_id: string; durata_confermata_min: number | null }[] | null) ?? []) {
    out.push({ minuti: Number(r.durata_confermata_min) || 0, timbraturaId: r.timbratura_id, chiave: null, daChiave: null });
  }
  for (const r of (scioltaRes.data as
    | { cantiere_id: string | null; da_cantiere_id: string | null; durata_confermata_min: number | null }[]
    | null) ?? []) {
    if (!r.cantiere_id) continue;
    out.push({
      minuti: Number(r.durata_confermata_min) || 0,
      timbraturaId: null,
      chiave: `cantiere:${r.cantiere_id}`,
      daChiave: r.da_cantiere_id ? `cantiere:${r.da_cantiere_id}` : null,
    });
  }
  return out;
}

// ── lettura difensiva del flag auto_compilato ────────────────────────────────
// Ritorna true/false se la colonna esiste, null se non ancora migrata.

async function leggiAutoCompilato(supabase: Supa, rapportinoId: string): Promise<boolean | null> {
  const { data, error } = await supabase
    .from('rapportini' as never)
    .select('auto_compilato')
    .eq('id', rapportinoId)
    .maybeSingle();
  if (error) return null;
  const v = (data as { auto_compilato: boolean | null } | null)?.auto_compilato;
  return v == null ? true : v;
}

async function contaRighe(supabase: Supa, rapportinoId: string): Promise<number> {
  const { count } = await supabase
    .from('rapportino_righe' as never)
    .select('id', { count: 'exact', head: true })
    .eq('rapportino_id', rapportinoId);
  return count ?? 0;
}

/**
 * Assicura il rapportino bozza del giorno e — se ancora automatico — ne
 * (ri)calcola le righe dalle timbrature. Best-effort: gli errori non vengono
 * propagati (il chiamante decide). Ritorna la riga rapportino o null.
 */
export async function ricomputaRapportinoAuto(
  supabase: Supa,
  tenantId: string,
  dipendenteId: string,
  data: string,
  /**
   * `versione: false` quando il chiamante scrive la sua versione, più precisa
   * (es. «pausa aggiunta dall'ufficio»): altrimenti ne uscirebbero due.
   */
  opzioni: { versione?: boolean } = {},
): Promise<RapportinoBase | null> {
  // 1. Trova o crea il rapportino del giorno.
  const { data: esistente } = await supabase
    .from('rapportini' as never)
    .select('id, data, stato, note, approvato_da')
    .eq('tenant_id', tenantId)
    .eq('dipendente_id', dipendenteId)
    .eq('data', data)
    .maybeSingle();
  let rapp = esistente as RapportinoBase | null;

  if (!rapp) {
    const { data: nuovoRaw, error } = await supabase
      .from('rapportini' as never)
      .insert({ tenant_id: tenantId, dipendente_id: dipendenteId, data, stato: 'bozza' } as never)
      .select('id, data, stato, note, approvato_da')
      .single();
    if (error || !nuovoRaw) {
      // Race: già creato da un'altra chiamata simultanea → rileggi.
      const { data: raceRaw } = await supabase
        .from('rapportini' as never)
        .select('id, data, stato, note, approvato_da')
        .eq('tenant_id', tenantId)
        .eq('dipendente_id', dipendenteId)
        .eq('data', data)
        .maybeSingle();
      rapp = raceRaw as RapportinoBase | null;
    } else {
      rapp = nuovoRaw as RapportinoBase;
    }
  }
  if (!rapp) return null;

  // 2. È CONGELATA solo se l'ufficio ci ha messo mano: approvata/respinta da
  //    office (approvato_da valorizzato) o stato non gestito dal sistema. In
  //    quel caso non si tocca. Tutto il resto (bozza / auto-approvato dal
  //    sistema con approvato_da NULL) è "forma": riflette le timbrature.
  const gestitaDalSistema =
    rapp.stato === 'bozza' || (rapp.stato === 'approvato' && !rapp.approvato_da);
  if (!gestitaDalSistema) return rapp;

  // 2b. Rete di sicurezza: se una pausa pranzo è rimasta aperta oltre la soglia
  //     (dimenticata, es. app chiusa), materializza la RIPRESA PRIMA di leggere
  //     le timbrature, così il calcolo ore la include e scala esattamente la
  //     soglia. Best-effort: non deve mai bloccare il ricalcolo.
  try {
    const sogliaAuto = await leggiSogliaAutoSpegnimentoPausa(supabase, tenantId);
    await chiudiPausaScadutaSePresente(supabase, {
      tenantId,
      dipendenteId,
      data,
      sogliaOre: sogliaAuto,
    });
  } catch {
    // best-effort
  }

  // 3. Timbrature del giorno italiano esatto (confini in Europe/Rome).
  const { fromIso, toIso } = romeDayBoundsUtc(data);
  const { data: timbRaw } = await supabase
    .from('timbrature' as never)
    .select('id, commessa_id, cantiere_id, tipo, ts, pausa')
    .eq('tenant_id', tenantId)
    .eq('dipendente_id', dipendenteId)
    .gte('ts', fromIso)
    .lt('ts', toIso)
    .order('ts', { ascending: true });
  const timbrature = (timbRaw as {
    id: string;
    commessa_id: string | null;
    cantiere_id: string | null;
    tipo: 'ingresso' | 'uscita';
    ts: string;
    pausa: boolean | null;
  }[]) ?? [];

  // 3b. Override manuale: se le ore sono state corrette a mano
  //     (auto_compilato=false) quella correzione VINCE e non viene sovrascritta
  //     dal ricalcolo — anche su una giornata CON timbrature (altrimenti la
  //     "Modifica giornata" del tecnico/ufficio sparirebbe alla prima
  //     riapertura). La pausa, essendo una timbratura, continua a riflettersi.
  //     Se NON ci sono timbrature e la colonna è legacy (null) ma esistono righe
  //     manuali, non sovrascriviamo (fallback "non ho timbrato").
  {
    const auto = await leggiAutoCompilato(supabase, rapp.id);
    const legacyManuale =
      auto === null && timbrature.length === 0 && (await contaRighe(supabase, rapp.id)) > 0;
    if (auto === false || legacyManuale) {
      // Le ore NON si toccano — sono state scritte da una persona e vincono.
      // Ma la giornata va comunque giudicata: prima si usciva di qui e basta,
      // e una giornata dichiarata a mano restava in bozza per sempre, quindi
      // non arrivava mai al gestionale. Ora si approva da sola come le altre.
      return await approvaSeManualeOk(supabase, tenantId, rapp, timbrature);
    }
  }

  // 4. Minuti puri per target: lavoro dalle timbrature, viaggio dalle tratte. Il
  //    viaggio fatto dentro l'orario (trasferimenti, passaggi dalla sede) si
  //    toglie dal lavoro: vedi `minutiDaTimbrature`.
  const tratte = await tratteGiornata(
    supabase,
    tenantId,
    dipendenteId,
    data,
    timbrature.map((t) => t.id),
  );
  const perTarget = minutiDaTimbrature(
    timbrature.map((t) => ({ id: t.id, tipo: t.tipo, ms: Date.parse(t.ts), chiave: chiaveTarget(t) || null })),
    tratte,
  );
  // Arrotondamento ore-lavoro: default 0 = nessuno (dettaglio massimo).
  const { oreMin: stepOre } = await leggiArrotondamenti(supabase, tenantId);
  // L'orario ordinario si riempie nell'ordine della giornata: i cantieri come
  // compaiono nelle timbrature, poi quelli con solo viaggio.
  const ordine = [
    ...new Set([...timbrature.map((t) => chiaveTarget(t)).filter(Boolean), ...perTarget.keys()]),
  ];
  const righePure: RigaGiornataPura[] = ordine.flatMap((key) => {
    const v = perTarget.get(key);
    if (!v) return [];
    return [{ ...decodeChiave(key), minutiLavoro: arrotondaA(v.minutiLavoro, stepOre), minutiViaggio: v.minutiViaggio }];
  });

  // 4b. Com'era prima, per la cronologia. Solo se la giornata era già chiusa:
  //     durante un turno in corso ogni timbratura cambia le ore, e quelle sono
  //     già raccontate dalle timbrature stesse. È la giornata approvata che si
  //     sposta dopo a dover lasciare scritto.
  const primaDelRicalcolo =
    opzioni.versione !== false && rapp.stato === 'approvato'
      ? await leggiStatoGiornata(supabase as never, rapp.id)
      : null;

  // 5. Sostituisci le righe (replace completo: è ancora automatico), minuti puri
  //    e quote derivate insieme.
  await scriviRigheGiornata(supabase, { tenantId, rapportinoId: rapp.id, data, righe: righePure });

  // 6. AUTO-APPROVAZIONE. Le timbrature sono le ore effettive: una giornata
  //    CHIUSA (ingressi === uscite) ed entro soglia si approva da sola (sistema,
  //    approvato_da NULL). Aperta o oltre soglia → resta "da verificare" (bozza)
  //    per l'ufficio. Si ri-valuta a ogni ricalcolo, così riaprire un turno
  //    riporta la giornata in bozza in automatico. Disattivabile per tenant.
  const policy = await leggiPolicyRapportini(supabase, tenantId);
  const ingressi = timbrature.filter((t) => t.tipo === 'ingresso').length;
  const uscite = timbrature.filter((t) => t.tipo === 'uscita').length;
  const minutiLavoratiTotali = righePure.reduce((a, r) => a + r.minutiLavoro, 0);
  // Giornata ferma in pausa = ultimo evento cronologico è un'uscita di pausa.
  // In quel caso ingressi/uscite tornano ma il turno è aperto → non auto-approva.
  const ultimaTimb = timbrature[timbrature.length - 1];
  const inPausa = !!ultimaTimb && ultimaTimb.tipo === 'uscita' && !!ultimaTimb.pausa;

  let nuovoStato = 'bozza';
  let approvatoAt: string | null = null;
  if (policy.autoApprova) {
    const esito = esitoAutoApprovazione({
      ingressi,
      uscite,
      minutiLavoratiTotali,
      sogliaOreMax: policy.sogliaAnomaliaTurnoOre,
      inPausa,
    });
    if (esito.autoApprova) {
      nuovoStato = 'approvato';
      approvatoAt = new Date().toISOString();
    }
  }

  // Aggiorna stato + rimette auto_compilato=true (la giornata, ricalcolata
  // dalle timbrature, è di nuovo gestita dal sistema). Sempre, così un giorno
  // ex-manuale con timbrature torna "auto" anche se lo stato non cambia.
  await supabase
    .from('rapportini' as never)
    .update({
      stato: nuovoStato,
      approvato_da: null,
      approvato_at: approvatoAt,
      auto_compilato: true,
    } as never)
    .eq('id', rapp.id);
  rapp.stato = nuovoStato;

  // Se le ore di una giornata chiusa sono cambiate, resta scritto. Se non sono
  // cambiate `scriviVersioneRapportino` non scrive niente.
  if (primaDelRicalcolo) {
    await scriviVersioneRapportino({
      supabase: supabase as never,
      rapportinoId: rapp.id,
      tenantId,
      azione: 'ricalcolo',
      modificatoDa: null,
      modificatoDaNome: null,
      prima: primaDelRicalcolo,
    });
  }

  return rapp;
}

/**
 * Giudica una giornata scritta A MANO senza ricalcolarne le ore.
 *
 * La sostanza qui sono le ore dichiarate, non le timbrature: le somma dalle
 * righe e applica la stessa soglia delle altre giornate.
 *
 * ⚠️ Non tocca MAI `auto_compilato`: deve restare `false`, altrimenti al giro
 * dopo il ricalcolo si riprenderebbe la giornata e cancellerebbe le ore
 * scritte a mano. È la ragione per cui questo pezzo è separato dal percorso
 * normale invece di essere un ramo dentro di esso.
 */
async function approvaSeManualeOk(
  supabase: Supa,
  tenantId: string,
  rapp: RapportinoBase,
  timbrature: { tipo: 'ingresso' | 'uscita'; pausa: boolean | null }[],
): Promise<RapportinoBase> {
  try {
    const policy = await leggiPolicyRapportini(supabase, tenantId);
    if (!policy.autoApprova) return rapp;

    const { data: righeRaw } = await supabase
      .from('rapportino_righe' as never)
      .select('minuti_lavoro, ore_ordinarie, ore_straordinarie, ore_viaggio_ordinarie, ore_viaggio_eccedenti')
      .eq('rapportino_id', rapp.id);
    const righe = (righeRaw as RigaRapportinoLetta[] | null) ?? [];
    const minutiDichiarati = righe.reduce((a, r) => a + quoteDaRiga(r).minutiLavoro, 0);

    const ultima = timbrature[timbrature.length - 1];
    const esito = esitoAutoApprovazioneManuale({
      minutiDichiarati,
      sogliaOreMax: policy.sogliaAnomaliaTurnoOre,
      ingressi: timbrature.filter((t) => t.tipo === 'ingresso').length,
      uscite: timbrature.filter((t) => t.tipo === 'uscita').length,
      inPausa: !!ultima && ultima.tipo === 'uscita' && !!ultima.pausa,
    });

    const nuovoStato = esito.autoApprova ? 'approvato' : 'bozza';
    if (nuovoStato === rapp.stato) return rapp;

    const { error: eStato } = await supabase
      .from('rapportini' as never)
      .update({
        stato: nuovoStato,
        approvato_da: null,
        approvato_at: esito.autoApprova ? new Date().toISOString() : null,
      } as never)
      .eq('id', rapp.id);
    if (eStato) {
      console.error('[ricomputa-rapportino] stato della giornata non aggiornato:', eStato.message);
      return rapp;
    }
    rapp.stato = nuovoStato;
  } catch {
    // Il giudizio è un di piu': se fallisce, la giornata resta com'era.
  }
  return rapp;
}

/**
 * Marca un rapportino come modificato a mano (stop all'auto-ricalcolo) **e lo
 * giudica**. Best-effort.
 *
 * Il giudizio sta qui e non nei cinque punti che la chiamano perché questo è
 * esattamente il momento in cui le ore a mano sono appena state scritte: fatto
 * qui, vale per tutte le strade — ufficio, tecnico, «registra giornata» — e per
 * quelle che verranno.
 */
export async function marcaRapportinoManuale(supabase: Supa, rapportinoId: string): Promise<void> {
  // Senza questo segno il ricalcolo successivo riscriverebbe le ore dalle
  // timbrature e cancellerebbe quelle scritte a mano: l'errore va registrato.
  const { error: eMarca } = await supabase
    .from('rapportini' as never)
    .update({ auto_compilato: false } as never)
    .eq('id', rapportinoId);
  if (eMarca) {
    console.error('[ricomputa-rapportino] giornata non marcata come scritta a mano:', eMarca.message);
  }

  try {
    const { data: raw } = await supabase
      .from('rapportini' as never)
      .select('id, tenant_id, dipendente_id, data, stato, note, approvato_da')
      .eq('id', rapportinoId)
      .maybeSingle();
    const r = raw as (RapportinoBase & {
      tenant_id: string;
      dipendente_id: string;
      data: string;
    }) | null;
    if (!r) return;

    // Stessa regola del percorso normale: se l'ufficio ci ha messo mano, non si
    // tocca. Auto-approvata dal sistema (`approvato_da` nullo) invece sì.
    const gestitaDalSistema =
      r.stato === 'bozza' || (r.stato === 'approvato' && !r.approvato_da);
    if (!gestitaDalSistema) return;

    const { fromIso, toIso } = romeDayBoundsUtc(r.data);
    const { data: timbRaw } = await supabase
      .from('timbrature' as never)
      .select('tipo, ts, pausa')
      .eq('tenant_id', r.tenant_id)
      .eq('dipendente_id', r.dipendente_id)
      .gte('ts', fromIso)
      .lt('ts', toIso)
      .order('ts', { ascending: true });

    await approvaSeManualeOk(
      supabase,
      r.tenant_id,
      r,
      (timbRaw as { tipo: 'ingresso' | 'uscita'; pausa: boolean | null }[]) ?? [],
    );
  } catch {
    // Il giudizio è un di piu': le ore sono già salvate, che è la cosa che conta.
  }
}
