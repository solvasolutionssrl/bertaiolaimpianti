import 'server-only';
import { cache } from 'react';
import { createServerSupabase } from '@impiantixplus/api/server';
import { notFound } from 'next/navigation';

export type CommessaDettaglio = Awaited<ReturnType<typeof loadCommessa>>;

/**
 * Carica il dettaglio commessa. Avvolta in `React.cache` per deduplicare
 * la stessa fetch tra layout + page + tab (es. layout + documenti tab
 * chiamano entrambi `loadCommessa(id)` nella stessa request → 1 sola
 * query effettiva).
 */
export const loadCommessa = cache(async (id: string) => {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('commesse')
    .select(
      `
        id,
        tenant_id,
        codice_interno,
        nome_cartella,
        cloud_folder_path,
        cliente_indirizzo_cantiere,
        descrizione_ai_finale,
        descrizione_ai_proposta,
        stato,
        data_apertura,
        created_at,
        updated_at,
        cliente:cliente_id ( id, ragione_sociale, telefoni, email, indirizzo, citta ),
        responsabile:responsabile_id ( id, display_name ),
        ticket:ticket_id ( id, codice )
      `,
    )
    .eq('id', id)
    .maybeSingle();

  if (error || !data) notFound();
  return data;
});
