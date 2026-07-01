import { createServerSupabase } from '@kommessa/api/server';
import {
  minutiPerCommessa,
  calcolaOreGiornata,
  minutiViaggioPerTarget,
  arrotondaA,
  esitoAutoApprovazione,
} from '@kommessa/api/kantiere-ore';
import { targetTimbratura } from '@kommessa/api/kantiere';
import { romeDayBoundsUtc } from '@kommessa/api/rome-time';
import {
  leggiArrotondamenti,
  leggiPolicyRapportini,
  leggiSogliaAutoSpegnimentoPausa,
} from '@/app/_lib/kantiere-config';
import { chiudiPausaScadutaSePresente } from '@/app/_actions/_lib/viaggio-timbra';

/**
 * Auto-derivazione del rapportino giornaliero dalle timbrature.
 *
 * Idea: ogni giornata timbrata produce automaticamente un rapportino bozza con
 * le ore ord/straord (da ingresso→uscita per target, con soglia tenant) + le
 * ore di viaggio (da timbratura_viaggio). Finché il tecnico non SALVA a mano
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

// ── soglia ore ordinarie del tenant ──────────────────────────────────────────

export async function sogliaOreTenant(supabase: Supa, tenantId: string): Promise<number> {
  const { data } = await supabase
    .from('tenant_modules' as never)
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('module_code', 'kantiere')
    .maybeSingle();
  const row = data as { config: Record<string, unknown> | null } | null;
  const val = row?.config?.['soglia_ore_ordinarie'];
  if (typeof val === 'number' && val > 0) return val;
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 8;
}

// ── viaggio per target (somma durata_confermata_min) ─────────────────────────

async function viaggioPerTarget(
  supabase: Supa,
  timbrature: { id: string; commessa_id: string | null; cantiere_id: string | null }[],
): Promise<Map<string, number>> {
  if (timbrature.length === 0) return new Map();
  const idToKey = new Map<string, string>();
  for (const t of timbrature) {
    const key = chiaveTarget(t);
    if (key) idToKey.set(t.id, key);
  }
  const ids = Array.from(idToKey.keys());
  if (ids.length === 0) return new Map();
  const { data } = await supabase
    .from('timbratura_viaggio' as never)
    .select('timbratura_id, durata_confermata_min')
    .in('timbratura_id', ids);
  const rows = (data as { timbratura_id: string; durata_confermata_min: number }[] | null) ?? [];
  const viaggi = rows.map((r) => ({
    targetKey: idToKey.get(r.timbratura_id) ?? '',
    minuti: Number(r.durata_confermata_min) || 0,
  }));
  return minutiViaggioPerTarget(viaggi);
}

/** Tratte manuali (timbratura_id null) per cantiere+data → viaggio per target. */
async function viaggioManualePerTarget(
  supabase: Supa,
  tenantId: string,
  dipendenteId: string,
  data: string,
): Promise<Map<string, number>> {
  const { data: rows } = await supabase
    .from('timbratura_viaggio' as never)
    .select('cantiere_id, durata_confermata_min')
    .eq('tenant_id', tenantId)
    .eq('dipendente_id', dipendenteId)
    .eq('data', data)
    .is('timbratura_id', null);
  const out = new Map<string, number>();
  for (const r of (rows as { cantiere_id: string | null; durata_confermata_min: number }[] | null) ?? []) {
    if (!r.cantiere_id) continue;
    const key = `cantiere:${r.cantiere_id}`;
    out.set(key, (out.get(key) ?? 0) + (Number(r.durata_confermata_min) || 0));
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
    .select('id, commessa_id, cantiere_id, tipo, ts')
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
  }[]) ?? [];

  // 3b. Le timbrature sono la verità: se ci sono, il rapportino le riflette
  //     SEMPRE (anche se in passato era stato toccato a mano: lo rimettiamo
  //     "auto"). Se NON ci sono timbrature, NON sovrascriviamo un eventuale
  //     inserimento manuale (es. fallback "non ho timbrato").
  if (timbrature.length === 0) {
    const auto = await leggiAutoCompilato(supabase, rapp.id);
    if (auto === false) return rapp;
    if (auto === null && (await contaRighe(supabase, rapp.id)) > 0) return rapp;
  }

  // 4. Minuti lavorati per target + viaggio (da timbrature + tratte manuali).
  const sintetiche = timbrature
    .map((t) => {
      const k = chiaveTarget(t);
      return k ? { commessa_id: k, tipo: t.tipo, ts: t.ts } : null;
    })
    .filter((t): t is { commessa_id: string; tipo: 'ingresso' | 'uscita'; ts: string } => t !== null);

  const minutiMap = minutiPerCommessa(sintetiche);
  const soglia = await sogliaOreTenant(supabase, tenantId);
  // Arrotondamento ore-lavoro: default 0 = nessuno (dettaglio massimo, ore
  // identiche a oggi). Configurabile dall'ufficio per arrotondare in futuro.
  const { oreMin: stepOre } = await leggiArrotondamenti(supabase, tenantId);
  const risultato = calcolaOreGiornata({
    minutiLavoratiPerCommessa: Array.from(minutiMap.entries()).map(([commessa_id, minuti]) => ({
      commessa_id,
      minuti: arrotondaA(minuti, stepOre),
    })),
    sogliaOreOrdinarie: soglia,
  });

  const [viaQR, viaMan] = await Promise.all([
    viaggioPerTarget(supabase, timbrature),
    viaggioManualePerTarget(supabase, tenantId, dipendenteId, data),
  ]);

  const righeMap = new Map<string, { ord: number; straord: number; viaggioMin: number }>();
  for (const rr of risultato.righe) {
    righeMap.set(rr.commessa_id, { ord: rr.ore_ordinarie, straord: rr.ore_straordinarie, viaggioMin: 0 });
  }
  for (const [key, min] of viaQR) {
    const e = righeMap.get(key) ?? { ord: 0, straord: 0, viaggioMin: 0 };
    e.viaggioMin += min;
    righeMap.set(key, e);
  }
  for (const [key, min] of viaMan) {
    const e = righeMap.get(key) ?? { ord: 0, straord: 0, viaggioMin: 0 };
    e.viaggioMin += min;
    righeMap.set(key, e);
  }

  // 5. Sostituisci le righe (replace completo: è ancora automatico).
  await supabase.from('rapportino_righe' as never).delete().eq('rapportino_id', rapp.id);

  const righeInsert = Array.from(righeMap.entries())
    .filter(([, v]) => v.ord > 0 || v.straord > 0 || v.viaggioMin > 0)
    .map(([key, v]) => {
      const fk = decodeChiave(key);
      return {
        rapportino_id: rapp!.id,
        commessa_id: fk.commessa_id,
        cantiere_id: fk.cantiere_id,
        ore_ordinarie: v.ord,
        ore_straordinarie: v.straord,
        ore_viaggio: oreDaMin(v.viaggioMin),
      };
    });

  if (righeInsert.length > 0) {
    await supabase.from('rapportino_righe' as never).insert(righeInsert as never);
  }

  // 6. AUTO-APPROVAZIONE. Le timbrature sono le ore effettive: una giornata
  //    CHIUSA (ingressi === uscite) ed entro soglia si approva da sola (sistema,
  //    approvato_da NULL). Aperta o oltre soglia → resta "da verificare" (bozza)
  //    per l'ufficio. Si ri-valuta a ogni ricalcolo, così riaprire un turno
  //    riporta la giornata in bozza in automatico. Disattivabile per tenant.
  const policy = await leggiPolicyRapportini(supabase, tenantId);
  const ingressi = timbrature.filter((t) => t.tipo === 'ingresso').length;
  const uscite = timbrature.filter((t) => t.tipo === 'uscita').length;
  let minutiLavoratiTotali = 0;
  for (const m of minutiMap.values()) minutiLavoratiTotali += m;

  let nuovoStato = 'bozza';
  let approvatoAt: string | null = null;
  if (policy.autoApprova) {
    const esito = esitoAutoApprovazione({
      ingressi,
      uscite,
      minutiLavoratiTotali,
      sogliaOreMax: policy.sogliaAnomaliaTurnoOre,
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

  return rapp;
}

/** Marca un rapportino come modificato a mano (stop all'auto-ricalcolo). Best-effort. */
export async function marcaRapportinoManuale(supabase: Supa, rapportinoId: string): Promise<void> {
  try {
    await supabase
      .from('rapportini' as never)
      .update({ auto_compilato: false } as never)
      .eq('id', rapportinoId);
  } catch {
    // colonna non ancora migrata: ignora
  }
}
