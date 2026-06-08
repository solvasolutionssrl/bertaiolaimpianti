import { type NextRequest } from 'next/server';

import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';

/**
 * GET /api/bozze — elenco delle bozze ATTIVE dell'utente corrente.
 *
 * La RLS author-scoped (commessa_bozze_autore) limita già le righe a quelle
 * di chi chiama; qui filtriamo solo lo stato e ordiniamo per ultima modifica.
 * Usato al boot del client per fondere (last-write-wins) con le bozze locali
 * in IndexedDB e per la sezione "Da completare".
 */
export async function GET(_request: NextRequest) {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return Response.json({ error: 'Non autenticato' }, { status: 401 });
  }
  void ctx;

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('commessa_bozze' as never)
    .select('id, numero_bozza, payload, created_at, updated_at')
    .eq('stato' as never, 'attiva')
    .order('updated_at', { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const rows = (data as unknown as Array<{
    id: string;
    numero_bozza: number | null;
    payload: unknown;
    created_at: string;
    updated_at: string;
  }>) ?? [];

  return Response.json({
    bozze: rows.map((r) => ({
      id: r.id,
      numeroBozza: r.numero_bozza,
      payload: r.payload,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
}
