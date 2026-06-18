/**
 * Helper condiviso: aggiunge voci/tipologie a una commessa esistente
 * (SOLO aggiunta, mai rimozione) e provisiona le cartelle mancanti.
 *
 * Modulo server-only interno (NON `'use server'`): da chiamare da server
 * action DOPO aver verificato i permessi del chiamante (admin/office).
 *
 * Regola ferrea: le voci si aggiungono soltanto. Le cartelle Nextcloud sono
 * fisiche: rimuovere una voce lascerebbe cartelle orfane → non lo facciamo mai.
 */

import { createServerSupabase } from '@kommessa/api/server';
import { provisionaCartelle } from './provisiona-cartelle';

export interface AggiungiVociResult {
  ok: boolean;
  /** Voci effettivamente aggiunte (escluse quelle già presenti). */
  added: number[];
  /** Esito best-effort del provisioning cartelle. */
  storageOk: boolean;
  error?: string;
}

export async function aggiungiVociEProvisiona(opts: {
  tenantId: string;
  commessaId: string;
  nomeCartella: string;
  cloudFolderPath: string;
  vociRichieste: number[];
}): Promise<AggiungiVociResult> {
  const supabase = createServerSupabase();

  const { data: esistentiRaw, error: selErr } = await supabase
    .from('commessa_voci')
    .select('voce_id')
    .eq('commessa_id', opts.commessaId);
  if (selErr) {
    return { ok: false, added: [], storageOk: false, error: selErr.message };
  }
  const esistenti = new Set<number>(
    (esistentiRaw ?? []).map((r) => r.voce_id as number),
  );

  const added = Array.from(new Set(opts.vociRichieste)).filter(
    (v) => !esistenti.has(v),
  );
  if (added.length === 0) {
    return { ok: true, added: [], storageOk: true };
  }

  const rows = added.map((voceId) => ({
    commessa_id: opts.commessaId,
    voce_id: voceId,
    tenant_id: opts.tenantId,
    stato: 'da_iniziare' as const,
    note: null as string | null,
  }));
  const { error: insErr } = await supabase.from('commessa_voci').insert(rows);
  if (insErr) {
    return { ok: false, added: [], storageOk: false, error: insErr.message };
  }

  // Provisioning cartelle best-effort: passiamo l'unione vecchie+nuove così
  // provisionaCartelle crea solo quelle mancanti (idempotente). Non fatale.
  const unione = Array.from(new Set<number>([...esistenti, ...added]));
  const res = await provisionaCartelle({
    tenantId: opts.tenantId,
    nomeCartella: opts.nomeCartella,
    cloudFolderPath: opts.cloudFolderPath,
    vociAttive: unione,
  });

  return { ok: true, added, storageOk: res.provisioned === true };
}
