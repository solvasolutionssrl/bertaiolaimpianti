/**
 * Helper interno: scrive una riga in `spese_versioni`.
 * Server-only (NON `'use server'`). Best-effort: il versioning non deve mai far
 * fallire la modifica; se la tabella non è ancora applicata, ritorna ok:false.
 * Stesso pattern di ./scrivi-versione (commesse).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { SpesaSnapshot, DiffEntry } from '../../_lib/versioni/snapshot-spesa';

type AnySupabase = SupabaseClient<any, any, any>;

export type AzioneVersioneSpesa = 'creazione' | 'modifica' | 'ripristino';

export async function scriviVersioneSpesa(
  supabase: AnySupabase,
  opts: {
    tenantId: string;
    spesaId: string;
    snapshot: SpesaSnapshot;
    diff: DiffEntry[];
    azione: AzioneVersioneSpesa;
    modificatoDa: string | null;
    modificatoDaNome: string | null;
  },
): Promise<{ ok: boolean; versione?: number; error?: string }> {
  try {
    const { data: prossima, error: rpcErr } = await supabase.rpc(
      'genera_versione_spesa' as never,
      { p_spesa_id: opts.spesaId } as never,
    );
    if (rpcErr) return { ok: false, error: rpcErr.message };
    const versione = (prossima as unknown as number) ?? 1;

    const { error: insErr } = await supabase
      .from('spese_versioni' as never)
      .insert({
        tenant_id: opts.tenantId,
        spesa_id: opts.spesaId,
        versione,
        snapshot: opts.snapshot,
        diff: opts.diff,
        modificato_da: opts.modificatoDa,
        modificato_da_nome: opts.modificatoDaNome,
        azione: opts.azione,
      } as never);
    if (insErr) return { ok: false, error: insErr.message };

    return { ok: true, versione };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' };
  }
}
