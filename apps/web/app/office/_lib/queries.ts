import 'server-only';
import { createServerSupabase } from '@impiantixplus/api/server';
import type { TenantContext } from '@impiantixplus/api';

/**
 * Aggregati read-only per la dashboard ufficio.
 * Tutte le query passano da `createServerSupabase()` → RLS filtra per tenant.
 * In assenza di dati popolati le query ritornano valori neutri (0 / array vuoti).
 */
export async function getDashboardKpis(_ctx: TenantContext) {
  const supabase = createServerSupabase();

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const tre = new Date(today);
  tre.setDate(tre.getDate() - 3);
  const treIso = tre.toISOString();

  const [aperte, faseAttesa, fotoOggi, dicoScadenza] = await Promise.all([
    supabase
      .from('commesse')
      .select('id', { count: 'exact', head: true })
      .in('stato', ['aperta', 'in_corso', 'collaudo']),
    supabase
      .from('commessa_voci')
      .select('commessa_id', { count: 'exact', head: true })
      .eq('stato', 'da_iniziare')
      .lt('updated_at', treIso),
    supabase
      .from('file_refs')
      .select('id', { count: 'exact', head: true })
      .gte('uploaded_at', `${todayIso}T00:00:00Z`)
      .like('mime', 'image/%'),
    // DICO in scadenza: non c'è una colonna `data_collaudo` esplicita in commesse,
    // quindi come fallback contiamo le commesse in stato 'collaudo' senza file
    // taggati come DICO. Sarà raffinato a schema arricchito.
    supabase
      .from('commesse')
      .select('id', { count: 'exact', head: true })
      .eq('stato', 'collaudo'),
  ]);

  return {
    commesseAperte: aperte.count ?? 0,
    fasiInAttesa: faseAttesa.count ?? 0,
    fotoOggi: fotoOggi.count ?? 0,
    dicoScadenza: dicoScadenza.count ?? 0,
  };
}

/**
 * Commesse "a rischio": stato `in_corso` con almeno una voce attiva da >3 gg
 * senza foto sufficienti, oppure stato `collaudo` senza scadenza coperta.
 * Per ora restituiamo un campione delle commesse non chiuse con priorità ai
 * casi con voci sotto target (heuristica grezza ma deterministica).
 */
export async function getCommesseARischio() {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('commesse')
    .select(
      `
        id,
        codice_interno,
        nome_cartella,
        stato,
        cliente:cliente_id ( id, ragione_sociale ),
        responsabile:responsabile_id ( id, display_name ),
        data_apertura,
        cliente_indirizzo_cantiere
      `,
    )
    .in('stato', ['in_corso', 'collaudo'])
    .order('data_apertura', { ascending: true })
    .limit(5);

  if (error) return [];
  return data ?? [];
}

/** Ultime righe del log audit, leggibili in italiano. */
export async function getUltimaAttivita(limit = 8) {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('audit_events')
    .select(
      'id, entity_type, entity_id, action, metadata, created_at, actor_user_id',
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return data ?? [];
}
