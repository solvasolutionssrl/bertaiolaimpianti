import type { createServerSupabase } from '@kommessa/api/server';
import { oreDaMinuti, quoteDaRiga, quoteGiornata, type RigaRapportinoLetta } from '@kommessa/api/kantiere-quote';
import { leggiRegolaQuote } from '@/app/_lib/kantiere-config';

/**
 * L'unico punto che scrive le righe di una giornata (`rapportino_righe`).
 *
 * Riceve i **minuti puri** (lavoro e viaggio per cantiere) e scrive accanto le
 * quote derivate con la regola del tenant: ordinarie, straordinarie, viaggio
 * ordinario ed eccedente. Prima le scrivevano cinque funzioni, ognuna a modo suo:
 * il ricalcolo divideva 8 + 2, il tecnico metteva tutto nelle ordinarie,
 * l'ufficio le digitava separate. Qualunque strada nuova deve passare di qui.
 *
 * Le giornate precedenti a `quote_ore_dal` (config del tenant) non prendono le
 * quote di viaggio: restano come erano, anche quando si ricalcolano.
 */

type Supa = ReturnType<typeof createServerSupabase>;

export interface RigaGiornataPura {
  commessa_id: string | null;
  cantiere_id: string | null;
  minutiLavoro: number;
  minutiViaggio: number;
  note?: string | null;
}

const COLONNE_LETTE =
  'commessa_id, cantiere_id, note, minuti_lavoro, minuti_viaggio, ore_ordinarie, ore_straordinarie, ore_viaggio, ore_viaggio_ordinarie, ore_viaggio_eccedenti';

const chiaveTarget = (r: { commessa_id: string | null; cantiere_id: string | null }) =>
  r.cantiere_id ? `cantiere:${r.cantiere_id}` : r.commessa_id ? `commessa:${r.commessa_id}` : '';

/**
 * Sostituisce tutte le righe della giornata con quelle date. L'ordine conta:
 * l'orario ordinario si riempie riga per riga nell'ordine ricevuto.
 */
export async function scriviRigheGiornata(
  supabase: Supa,
  opts: { tenantId: string; rapportinoId: string; data: string; righe: RigaGiornataPura[] },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const regola = await leggiRegolaQuote(supabase, opts.tenantId);
  const conViaggioDerivato = !regola.quoteDal || opts.data >= regola.quoteDal;

  const valide = opts.righe
    .map((r) => ({
      ...r,
      minutiLavoro: Math.max(0, Math.round(r.minutiLavoro)),
      minutiViaggio: Math.max(0, Math.round(r.minutiViaggio)),
    }))
    .filter((r) => (r.minutiLavoro > 0 || r.minutiViaggio > 0) && (r.cantiere_id || r.commessa_id));

  const { righe: quote } = quoteGiornata(
    valide.map((r, i) => ({ chiave: String(i), minutiLavoro: r.minutiLavoro, minutiViaggio: r.minutiViaggio })),
    regola.orarioOrdinarioMin,
  );

  const insert = valide.map((r, i) => {
    const q = quote[i]!;
    return {
      rapportino_id: opts.rapportinoId,
      commessa_id: r.commessa_id,
      cantiere_id: r.cantiere_id,
      note: r.note ?? null,
      minuti_lavoro: q.minutiLavoro,
      minuti_viaggio: q.minutiViaggio,
      ore_ordinarie: oreDaMinuti(q.minutiOrdinari),
      ore_straordinarie: oreDaMinuti(q.minutiStraordinari),
      ore_viaggio: oreDaMinuti(q.minutiViaggio),
      ore_viaggio_ordinarie: conViaggioDerivato ? oreDaMinuti(q.minutiViaggioOrdinari) : null,
      ore_viaggio_eccedenti: conViaggioDerivato ? oreDaMinuti(q.minutiViaggioEccedenti) : null,
    };
  });

  // Prima le righe nuove, poi via le vecchie: se l'inserimento fallisce la
  // giornata resta com'era, invece di restare senza ore.
  const { data: vecchieRaw, error: eLett } = await supabase
    .from('rapportino_righe' as never)
    .select('id')
    .eq('rapportino_id', opts.rapportinoId);
  if (eLett) return { ok: false, error: eLett.message };
  const vecchie = ((vecchieRaw as { id: string }[] | null) ?? []).map((r) => r.id);

  let nuove: string[] = [];
  if (insert.length > 0) {
    const { data: nuoveRaw, error: eIns } = await supabase
      .from('rapportino_righe' as never)
      .insert(insert as never)
      .select('id');
    if (eIns) return { ok: false, error: eIns.message };
    nuove = ((nuoveRaw as { id: string }[] | null) ?? []).map((r) => r.id);
  }

  if (vecchie.length > 0) {
    const { error: eDel } = await supabase.from('rapportino_righe' as never).delete().in('id', vecchie);
    if (eDel) {
      // Le vecchie sono rimaste: si tolgono le nuove per non contare le ore due volte.
      if (nuove.length > 0) {
        const { error: eRip } = await supabase.from('rapportino_righe' as never).delete().in('id', nuove);
        if (eRip) console.error('[righe-giornata] righe doppie da togliere a mano:', opts.rapportinoId, eRip.message);
      }
      return { ok: false, error: eDel.message };
    }
  }

  const { error: eOrario } = await supabase
    .from('rapportini' as never)
    .update({ orario_ordinario_min: conViaggioDerivato ? regola.orarioOrdinarioMin : null } as never)
    .eq('id', opts.rapportinoId);
  if (eOrario) return { ok: false, error: eOrario.message };
  return { ok: true };
}

/** Le righe della giornata come minuti puri, qualunque sia l'epoca in cui sono state scritte. */
export async function leggiRigheGiornata(supabase: Supa, rapportinoId: string): Promise<RigaGiornataPura[]> {
  const { data } = await supabase
    .from('rapportino_righe' as never)
    .select(COLONNE_LETTE)
    .eq('rapportino_id', rapportinoId);
  return ((data as (RigaRapportinoLetta & {
    commessa_id: string | null;
    cantiere_id: string | null;
    note: string | null;
  })[] | null) ?? []).map((r) => {
    const q = quoteDaRiga(r);
    return {
      commessa_id: r.commessa_id,
      cantiere_id: r.cantiere_id,
      note: r.note,
      minutiLavoro: q.minutiLavoro,
      minutiViaggio: q.minutiViaggio,
    };
  });
}

/**
 * Cambia lavoro e viaggio di alcuni cantieri della giornata e ricalcola le quote
 * di tutte le righe (l'orario ordinario è della giornata, non della riga). Le
 * righe non toccate restano con i loro minuti; quelle nuove si aggiungono in fondo.
 */
export async function aggiornaRigheGiornata(
  supabase: Supa,
  opts: { tenantId: string; rapportinoId: string; data: string; modifiche: RigaGiornataPura[] },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const esistenti = await leggiRigheGiornata(supabase, opts.rapportinoId);
  const perChiave = new Map(opts.modifiche.map((m) => [chiaveTarget(m), m]));
  const unite: RigaGiornataPura[] = esistenti.map((r) => {
    const m = perChiave.get(chiaveTarget(r));
    if (!m) return r;
    perChiave.delete(chiaveTarget(r));
    return { ...r, minutiLavoro: m.minutiLavoro, minutiViaggio: m.minutiViaggio, note: m.note !== undefined ? m.note : r.note };
  });
  unite.push(...perChiave.values());
  return scriviRigheGiornata(supabase, { ...opts, righe: unite });
}
