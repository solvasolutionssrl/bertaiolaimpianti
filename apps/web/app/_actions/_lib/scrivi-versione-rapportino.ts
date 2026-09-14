import { createServerSupabase } from '@kommessa/api/server';
import { versioneSenzaCambiamenti } from '@kommessa/api/kantiere-cronologia';

export type AzioneVersione =
  | 'invio'
  | 'modifica_tecnico'
  | 'modifica_ufficio'
  | 'approvazione'
  | 'respinta'
  | 'riapertura'
  // Dal 14/09/2026: le modifiche dell'ufficio che prima non lasciavano traccia,
  // e il ricalcolo che sposta le ore di una giornata già chiusa.
  | 'pausa_ufficio'
  | 'chiusura_ufficio'
  | 'ricalcolo';

type Supa = ReturnType<typeof createServerSupabase>;

interface RigaSnapshot {
  commessa_id: string | null;
  cantiere_id: string | null;
  ore_ordinarie: number;
  ore_straordinarie: number;
  ore_viaggio: number;
  note?: string | null;
}

/** Com'è una giornata in un certo momento: serve a raccontare «prima → dopo». */
export interface StatoGiornata {
  stato: string;
  totali: { ore_ordinarie: number; ore_straordinarie: number; ore_viaggio: number };
  righe: RigaSnapshot[];
}

/** Le modifiche: se non cambiano niente non si scrivono. Le transizioni di stato sì, sempre. */
const AZIONI_MODIFICA: ReadonlySet<AzioneVersione> = new Set([
  'modifica_tecnico',
  'modifica_ufficio',
  'pausa_ufficio',
  'chiusura_ufficio',
  'ricalcolo',
]);

async function leggiRighe(supabase: Supa, rapportinoId: string): Promise<RigaSnapshot[]> {
  const { data } = await supabase
    .from('rapportino_righe' as never)
    .select('commessa_id, cantiere_id, ore_ordinarie, ore_straordinarie, ore_viaggio, note')
    .eq('rapportino_id', rapportinoId);
  return (data as RigaSnapshot[] | null) ?? [];
}

function sommaTotali(righe: RigaSnapshot[]): StatoGiornata['totali'] {
  return righe.reduce(
    (a, x) => ({
      ore_ordinarie: a.ore_ordinarie + Number(x.ore_ordinarie || 0),
      ore_straordinarie: a.ore_straordinarie + Number(x.ore_straordinarie || 0),
      ore_viaggio: a.ore_viaggio + Number(x.ore_viaggio || 0),
    }),
    { ore_ordinarie: 0, ore_straordinarie: 0, ore_viaggio: 0 },
  );
}

/**
 * Lo stato di una giornata ADESSO. Va letto prima di modificarla, da chi la
 * modifica: dopo non c'è più modo di sapere com'era. Best-effort.
 */
export async function leggiStatoGiornata(
  supabase: Supa,
  rapportinoId: string | null | undefined,
): Promise<StatoGiornata | null> {
  if (!rapportinoId) return null;
  try {
    const { data } = await supabase
      .from('rapportini' as never)
      .select('stato')
      .eq('id', rapportinoId)
      .maybeSingle();
    const stato = (data as { stato: string } | null)?.stato;
    if (!stato) return null;
    const righe = await leggiRighe(supabase, rapportinoId);
    return { stato, totali: sommaTotali(righe), righe };
  } catch {
    return null;
  }
}

/** Come `leggiStatoGiornata`, cercando la giornata per persona e data. */
export async function statoGiornataPerData(
  supabase: Supa,
  tenantId: string,
  dipendenteId: string,
  data: string,
): Promise<StatoGiornata | null> {
  try {
    const { data: row } = await supabase
      .from('rapportini' as never)
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('dipendente_id', dipendenteId)
      .eq('data', data)
      .maybeSingle();
    return await leggiStatoGiornata(supabase, (row as { id: string } | null)?.id);
  } catch {
    return null;
  }
}

/**
 * Scrive uno snapshot versionato del rapportino in `rapportino_versioni`.
 *
 * Best-effort: non lancia mai, il versioning non deve rompere l'operazione.
 *
 * - **Le modifiche che non cambiano niente non si scrivono.** Prima ogni
 *   salvataggio lasciava una versione, anche a ore identiche: chi apriva la
 *   cronologia trovava voci che non dicevano niente, ed è lì che si smette di
 *   fidarsi del registro. Le transizioni di stato (approvazione, respinta,
 *   riapertura) si scrivono sempre.
 * - **`prima`**: chi modifica una giornata passa com'era, così la cronologia può
 *   dire «lavoro 8:00 → 7:00». Se manca si usa l'ultima versione salvata.
 *
 * Ritorna `true` se ha scritto.
 */
export async function scriviVersioneRapportino(params: {
  supabase: Supa;
  rapportinoId: string;
  tenantId: string;
  azione: AzioneVersione;
  modificatoDa: string | null;
  modificatoDaNome: string | null;
  prima?: StatoGiornata | null;
}): Promise<boolean> {
  const { supabase, rapportinoId, tenantId, azione, modificatoDa, modificatoDaNome } = params;
  try {
    const { data: rappRaw } = await supabase
      .from('rapportini' as never)
      .select('data, stato, note')
      .eq('id', rapportinoId)
      .maybeSingle();
    const rapp = rappRaw as { data: string; stato: string; note: string | null } | null;
    if (!rapp) return false;

    const righe = await leggiRighe(supabase, rapportinoId);
    const totali = sommaTotali(righe);

    const { data: lastRaw } = await supabase
      .from('rapportino_versioni' as never)
      .select('versione, snapshot')
      .eq('rapportino_id', rapportinoId)
      .order('versione', { ascending: false })
      .limit(1)
      .maybeSingle();
    const last = lastRaw as {
      versione: number;
      snapshot: { stato?: string; totali?: StatoGiornata['totali']; righe?: RigaSnapshot[] } | null;
    } | null;

    const base =
      params.prima ??
      (last?.snapshot
        ? { stato: last.snapshot.stato, totali: last.snapshot.totali, righe: last.snapshot.righe }
        : null);

    if (
      AZIONI_MODIFICA.has(azione) &&
      base &&
      versioneSenzaCambiamenti(base, { stato: rapp.stato, totali, righe })
    ) {
      return false;
    }

    await supabase.from('rapportino_versioni' as never).insert({
      rapportino_id: rapportinoId,
      tenant_id: tenantId,
      versione: (last?.versione ?? 0) + 1,
      snapshot: { data: rapp.data, stato: rapp.stato, note: rapp.note, righe, totali, prima: base },
      azione,
      modificato_da: modificatoDa,
      modificato_da_nome: modificatoDaNome,
    } as never);
    return true;
  } catch {
    return false;
  }
}
