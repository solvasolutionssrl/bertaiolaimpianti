import 'server-only';

import type { createServerSupabase } from '@kommessa/api/server';
import { leggiPerId, type EsitoPagina } from '@kommessa/api/pagine';

type Supa = ReturnType<typeof createServerSupabase>;

/**
 * Tutte le righe di `tabella` con `colonnaId` fra gli `id` dati: gruppi da 100
 * id nell'URL, ogni gruppo letto a pagine in ordine di `id`, errore = eccezione
 * con `contesto` (vedi `@kommessa/api/pagine`). Per tabelle con chiave `id`;
 * le altre usano `leggiPerId` con il loro ordinamento stabile.
 */
export function leggiRighePerId<T>(
  supabase: Supa,
  tabella: string,
  colonne: string,
  colonnaId: string,
  id: readonly string[],
  contesto: string,
): Promise<T[]> {
  return leggiPerId<string, T>(
    id,
    (gruppo, da, a) =>
      supabase
        .from(tabella as never)
        .select(colonne)
        .in(colonnaId, gruppo)
        .order('id')
        .range(da, a) as unknown as PromiseLike<EsitoPagina<T>>,
    { contesto },
  );
}
