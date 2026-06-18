/**
 * Helper interno: scrive una riga in `commessa_versioni`.
 *
 * Modulo server-only (NON `'use server'`). Best-effort: il versioning non deve
 * mai far fallire l'operazione di modifica. La tabella è nuova e non è ancora
 * nei type generati di Supabase → cast `as never` (stesso pattern di
 * commessa_bozze).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { CommessaSnapshot, DiffEntry } from '../../_lib/versioni/snapshot';

type AnySupabase = SupabaseClient<any, any, any>;

export type AzioneVersione =
  | 'creazione'
  | 'modifica'
  | 'aggiunta_tipologie'
  | 'ripristino';

export async function scriviVersione(
  supabase: AnySupabase,
  opts: {
    tenantId: string;
    commessaId: string;
    snapshot: CommessaSnapshot;
    diff: DiffEntry[];
    azione: AzioneVersione;
    modificatoDa: string | null;
    modificatoDaNome: string | null;
  },
): Promise<{ ok: boolean; versione?: number; error?: string }> {
  try {
    const { data: prossima, error: rpcErr } = await supabase.rpc(
      'genera_versione_commessa' as never,
      { p_commessa_id: opts.commessaId } as never,
    );
    if (rpcErr) return { ok: false, error: rpcErr.message };
    const versione = (prossima as unknown as number) ?? 1;

    const { error: insErr } = await supabase
      .from('commessa_versioni' as never)
      .insert({
        tenant_id: opts.tenantId,
        commessa_id: opts.commessaId,
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

/** Lookup display_name di un utente per la denormalizzazione. Best-effort. */
export async function nomeUtente(
  supabase: AnySupabase,
  userId: string | null,
): Promise<string | null> {
  if (!userId) return null;
  try {
    const { data } = await supabase
      .from('users')
      .select('display_name')
      .eq('id', userId)
      .maybeSingle();
    return ((data as { display_name?: string | null } | null)?.display_name ?? null) || null;
  } catch {
    return null;
  }
}
