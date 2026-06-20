import { createServerSupabase } from '@kommessa/api/server';

export type AzioneVersione =
  | 'invio'
  | 'modifica_tecnico'
  | 'modifica_ufficio'
  | 'approvazione'
  | 'respinta'
  | 'riapertura';

/**
 * Scrive uno snapshot versionato del rapportino in `rapportino_versioni`.
 * Best-effort: non lancia mai (il versioning non deve rompere l'operazione
 * principale). La versione 1 è tipicamente l'invio (la "prima versione" che
 * l'ufficio può consultare); le successive tracciano modifiche/transizioni.
 */
export async function scriviVersioneRapportino(params: {
  supabase: ReturnType<typeof createServerSupabase>;
  rapportinoId: string;
  tenantId: string;
  azione: AzioneVersione;
  modificatoDa: string | null;
  modificatoDaNome: string | null;
}): Promise<void> {
  const { supabase, rapportinoId, tenantId, azione, modificatoDa, modificatoDaNome } = params;
  try {
    const { data: rappRaw } = await supabase
      .from('rapportini' as never)
      .select('data, stato, note')
      .eq('id', rapportinoId)
      .maybeSingle();
    const rapp = rappRaw as { data: string; stato: string; note: string | null } | null;
    if (!rapp) return;

    const { data: righeRaw } = await supabase
      .from('rapportino_righe' as never)
      .select('commessa_id, cantiere_id, ore_ordinarie, ore_straordinarie, ore_viaggio, note')
      .eq('rapportino_id', rapportinoId);
    const righe = (righeRaw as {
      commessa_id: string | null;
      cantiere_id: string | null;
      ore_ordinarie: number;
      ore_straordinarie: number;
      ore_viaggio: number;
      note: string | null;
    }[]) ?? [];

    const totali = righe.reduce(
      (a, x) => ({
        ore_ordinarie: a.ore_ordinarie + Number(x.ore_ordinarie || 0),
        ore_straordinarie: a.ore_straordinarie + Number(x.ore_straordinarie || 0),
        ore_viaggio: a.ore_viaggio + Number(x.ore_viaggio || 0),
      }),
      { ore_ordinarie: 0, ore_straordinarie: 0, ore_viaggio: 0 },
    );

    const { data: lastRaw } = await supabase
      .from('rapportino_versioni' as never)
      .select('versione')
      .eq('rapportino_id', rapportinoId)
      .order('versione', { ascending: false })
      .limit(1)
      .maybeSingle();
    const next = ((lastRaw as { versione: number } | null)?.versione ?? 0) + 1;

    await supabase.from('rapportino_versioni' as never).insert({
      rapportino_id: rapportinoId,
      tenant_id: tenantId,
      versione: next,
      snapshot: { data: rapp.data, stato: rapp.stato, note: rapp.note, righe, totali },
      azione,
      modificato_da: modificatoDa,
      modificato_da_nome: modificatoDaNome,
    } as never);
  } catch {
    // best-effort: ignora errori di versioning
  }
}
