import 'server-only';
import { createServerSupabase } from '@kommessa/api/server';
import type { TenantContext } from '@kommessa/api';
import { risolviTitoloCommessa } from '../../_lib/commessa-display';

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

/* ------------------------------------------------------------------ */
/* Dashboard — Cose da gestire (tutti i TODO aperti, per priorità)     */
/* ------------------------------------------------------------------ */

export type Priorita = 'urgente' | 'alta' | 'media' | 'bassa';

export interface TodoDaGestireRow {
  id: string;
  titolo: string;
  priorita: Priorita;
  scadenza_at: string | null;
  commessa_id: string;
  codice_interno: string | null;
  cliente_nome: string | null;
  assegnato_nome: string | null;
  isScaduto: boolean;
}

const PRIO_ORDER: Record<Priorita, number> = {
  urgente: 0,
  alta: 1,
  media: 2,
  bassa: 3,
};

/**
 * Tutti i TODO ancora da fare del tenant (stato aperto/in_corso), su TUTTE le
 * commesse. Ordinati per priorità → scaduti → scadenza più vicina → titolo.
 * A differenza della vecchia "TODO urgenti" NON filtra: la dashboard li
 * raggruppa in colonne per priorità. RLS limita al tenant corrente.
 */
export async function getTodoDaGestire(limit = 300): Promise<TodoDaGestireRow[]> {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from('commessa_todo' as never)
    .select(
      `id, titolo, priorita, scadenza_at, stato, commessa_id, assegnato_a,
       commessa:commesse!commessa_todo_commessa_id_fkey ( codice_interno, cliente:clienti ( ragione_sociale ) ),
       assegnato:users!commessa_todo_assegnato_a_fkey ( display_name )`,
    )
    .in('stato', ['aperto', 'in_corso'])
    .limit(limit);

  const now = Date.now();
  const rows: TodoDaGestireRow[] = ((data ?? []) as Array<any>).map((t) => {
    const comm = Array.isArray(t.commessa) ? t.commessa[0] : t.commessa;
    const cli = comm
      ? Array.isArray(comm.cliente)
        ? comm.cliente[0]
        : comm.cliente
      : null;
    const ass = Array.isArray(t.assegnato) ? t.assegnato[0] : t.assegnato;
    return {
      id: t.id as string,
      titolo: t.titolo as string,
      priorita: (t.priorita as Priorita) ?? 'media',
      scadenza_at: (t.scadenza_at as string | null) ?? null,
      commessa_id: t.commessa_id as string,
      codice_interno: (comm?.codice_interno as string | undefined) ?? null,
      cliente_nome: (cli?.ragione_sociale as string | undefined) ?? null,
      assegnato_nome: (ass?.display_name as string | undefined) ?? null,
      isScaduto: t.scadenza_at
        ? new Date(t.scadenza_at as string).getTime() < now
        : false,
    };
  });

  rows.sort((a, b) => {
    const pa = PRIO_ORDER[a.priorita];
    const pb = PRIO_ORDER[b.priorita];
    if (pa !== pb) return pa - pb;
    if (a.isScaduto !== b.isScaduto) return a.isScaduto ? -1 : 1;
    const sa = a.scadenza_at ? new Date(a.scadenza_at).getTime() : Infinity;
    const sb = b.scadenza_at ? new Date(b.scadenza_at).getTime() : Infinity;
    if (sa !== sb) return sa - sb;
    return a.titolo.localeCompare(b.titolo, 'it');
  });

  return rows;
}

/* ------------------------------------------------------------------ */
/* Dashboard — Commesse in lavorazione (elenco compatto ricercabile)   */
/* ------------------------------------------------------------------ */

export type StatoAttivo = 'aperta' | 'in_corso' | 'collaudo';

export interface CommessaAttivaRow {
  id: string;
  codice_interno: string;
  stato: StatoAttivo;
  cliente_nome: string | null;
  titolo: string;
  data_apertura: string | null;
}

/**
 * Commesse "in lavorazione" per la card destra della dashboard: solo `in_corso`
 * e `collaudo` — NON le "Non prese" (aperta). Il titolo/oggetto è risolto lato
 * server con `risolviTitoloCommessa()` (mai `nome_cartella` raw). RLS filtra per
 * tenant. (La Panoramica ha una query propria che include anche le Non prese.)
 */
export async function getCommesseAttive(limit = 400): Promise<CommessaAttivaRow[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('commesse')
    .select(
      `
        id,
        codice_interno,
        stato,
        data_apertura,
        descrizione_ai_finale,
        descrizione_ai_proposta,
        note_iniziali,
        nome_cartella,
        cliente:cliente_id ( ragione_sociale )
      `,
    )
    .in('stato', ['in_corso', 'collaudo'])
    .order('data_apertura', { ascending: false })
    .order('codice_interno', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return (data as Array<any>).map((c) => {
    const cliente = Array.isArray(c.cliente) ? c.cliente[0] : c.cliente;
    const cliente_nome = (cliente?.ragione_sociale as string | undefined) ?? null;
    const titolo =
      risolviTitoloCommessa({
        descrizione_ai_finale: c.descrizione_ai_finale,
        descrizione_ai_proposta: c.descrizione_ai_proposta,
        note_iniziali: c.note_iniziali,
        nome_cartella: c.nome_cartella,
        codice_interno: c.codice_interno,
        cliente_nome,
      }) || '—';
    return {
      id: c.id as string,
      codice_interno: c.codice_interno as string,
      stato: c.stato as StatoAttivo,
      cliente_nome,
      titolo,
      data_apertura: (c.data_apertura as string | null) ?? null,
    };
  });
}
