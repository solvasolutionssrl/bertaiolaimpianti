import { createServerSupabase } from '@impiantixplus/api/server';
import { requireTenantContext } from '@impiantixplus/api/tenant';

import { elencaTecniciTenant } from '../../../../_actions/commessa-tecnici';
import { loadCommessa } from '../_lib/get-commessa';
import { LavoriBoard } from './_components/lavori-board';

export const dynamic = 'force-dynamic';

/**
 * Tab Lavori: TODO + Riunioni + storia cronologica.
 *
 * Pannello sticky in alto con i TODO ancora aperti (raggruppati per
 * priorità). Sotto, una timeline che mescola: TODO completati, riunioni,
 * note sui todo, cambi stato della commessa, foto/PDF caricati.
 *
 * Tutto il caricamento avviene qui (server). Il componente client riceve
 * dati materializzati — semplifica auth + RLS e rende veloce il first paint.
 */
export default async function LavoriTab({
  params,
}: {
  params: { id: string };
}) {
  const ctx = await requireTenantContext();
  const c = await loadCommessa(params.id);
  const supabase = createServerSupabase();

  const canWrite = ctx.role === 'admin' || ctx.role === 'office';

  const [todoRes, riuRes, notaRes, auditRes, fileRes, tecniciTenant] =
    await Promise.all([
      supabase
        .from('commessa_todo' as never)
        .select(
          'id, titolo, descrizione, stato, priorita, assegnato_a, scadenza_at, sort_order, metadata, created_by, created_at, updated_at, completato_at, completato_da',
        )
        .eq('commessa_id', params.id)
        .order('sort_order', { ascending: true })
        .limit(500),
      supabase
        .from('commessa_riunione' as never)
        .select(
          'id, data_riunione, titolo, corpo_libero, trascrizione, reportino, reportino_modello, reportino_generato_at, created_by, created_at, updated_at',
        )
        .eq('commessa_id', params.id)
        .order('data_riunione', { ascending: false })
        .limit(100),
      supabase
        .from('commessa_todo_nota' as never)
        .select('id, todo_id, author_id, body, created_at')
        .in(
          'todo_id',
          // subquery via filter? Supabase JS non supporta subquery; usiamo IN
          // sui todo che abbiamo già caricato.
          [],
        )
        .limit(0), // placeholder, riempito sotto
      supabase
        .from('audit_events')
        .select('id, action, metadata, actor_user_id, actor_role, created_at')
        .eq('entity_type', 'commessa')
        .eq('entity_id', params.id)
        .in('action', ['commessa.stato.cambiato', 'commessa.critica.toggle'])
        .order('created_at', { ascending: false })
        .limit(80),
      supabase
        .from('file_refs')
        .select('id, filename, path, taken_at, uploaded_at, uploaded_by, mime, momento')
        .eq('commessa_id', params.id)
        .order('uploaded_at', { ascending: false })
        .limit(30),
      canWrite ? elencaTecniciTenant() : Promise.resolve([]),
    ]);

  const todos = (todoRes.data ?? []) as Array<{
    id: string;
    titolo: string;
    descrizione: string | null;
    stato: 'aperto' | 'in_corso' | 'completato' | 'annullato';
    priorita: 'bassa' | 'media' | 'alta' | 'urgente';
    assegnato_a: string | null;
    scadenza_at: string | null;
    sort_order: number;
    metadata: Record<string, unknown> | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
    completato_at: string | null;
    completato_da: string | null;
  }>;

  // Carica note dei todo (in batch) solo se ci sono todo
  const todoIds = todos.map((t) => t.id);
  let note: Array<{
    id: string;
    todo_id: string;
    author_id: string | null;
    body: string;
    created_at: string;
  }> = [];
  if (todoIds.length > 0) {
    const { data: noteData } = await supabase
      .from('commessa_todo_nota' as never)
      .select('id, todo_id, author_id, body, created_at')
      .in('todo_id', todoIds)
      .order('created_at', { ascending: false })
      .limit(500);
    note = (noteData ?? []) as typeof note;
  }
  // Suppress unused res from initial fetch placeholder
  void notaRes;

  // Risolvi nomi utente per assegnato_a, created_by, completato_da, author_id
  const userIds = new Set<string>();
  for (const t of todos) {
    if (t.assegnato_a) userIds.add(t.assegnato_a);
    if (t.created_by) userIds.add(t.created_by);
    if (t.completato_da) userIds.add(t.completato_da);
  }
  for (const n of note) if (n.author_id) userIds.add(n.author_id);

  const riunioni = (riuRes.data ?? []) as Array<{
    id: string;
    data_riunione: string;
    titolo: string | null;
    corpo_libero: string | null;
    trascrizione: string | null;
    reportino: string | null;
    reportino_modello: string | null;
    reportino_generato_at: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
  }>;
  for (const r of riunioni) if (r.created_by) userIds.add(r.created_by);

  const audit = (auditRes.data ?? []) as Array<{
    id: string;
    action: string;
    metadata: Record<string, unknown> | null;
    actor_user_id: string | null;
    actor_role: string | null;
    created_at: string;
  }>;
  for (const a of audit) if (a.actor_user_id) userIds.add(a.actor_user_id);

  const files = (fileRes.data ?? []) as Array<{
    id: string;
    filename: string | null;
    path: string | null;
    taken_at: string | null;
    uploaded_at: string | null;
    uploaded_by: string | null;
    mime: string | null;
    momento: string | null;
  }>;
  for (const f of files) if (f.uploaded_by) userIds.add(f.uploaded_by);

  let usersMap = new Map<string, { id: string; display_name: string | null }>();
  if (userIds.size > 0) {
    const { data: usersData } = await supabase
      .from('users')
      .select('id, display_name')
      .in('id', Array.from(userIds));
    usersMap = new Map((usersData ?? []).map((u: any) => [u.id, u]));
  }

  return (
    <LavoriBoard
      commessaId={params.id}
      codiceInterno={c.codice_interno}
      currentUserId={ctx.userId}
      currentRole={ctx.role}
      canWrite={canWrite}
      contestoCommessa={[
        c.codice_interno,
        (Array.isArray(c.cliente) ? c.cliente[0] : c.cliente)?.ragione_sociale,
        c.cliente_indirizzo_cantiere,
      ]
        .filter(Boolean)
        .join(' · ')}
      todos={todos.map((t) => ({
        ...t,
        assegnato_a_nome: t.assegnato_a
          ? (usersMap.get(t.assegnato_a)?.display_name ?? null)
          : null,
        created_by_nome: t.created_by
          ? (usersMap.get(t.created_by)?.display_name ?? null)
          : null,
        completato_da_nome: t.completato_da
          ? (usersMap.get(t.completato_da)?.display_name ?? null)
          : null,
      }))}
      note={note.map((n) => ({
        ...n,
        author_nome: n.author_id
          ? (usersMap.get(n.author_id)?.display_name ?? null)
          : null,
      }))}
      riunioni={riunioni.map((r) => ({
        ...r,
        created_by_nome: r.created_by
          ? (usersMap.get(r.created_by)?.display_name ?? null)
          : null,
      }))}
      auditEvents={audit.map((a) => ({
        ...a,
        actor_nome: a.actor_user_id
          ? (usersMap.get(a.actor_user_id)?.display_name ?? null)
          : null,
      }))}
      filesRecenti={files.map((f) => ({
        ...f,
        uploader_nome: f.uploaded_by
          ? (usersMap.get(f.uploaded_by)?.display_name ?? null)
          : null,
      }))}
      tecniciTenant={tecniciTenant as Array<{ id: string; display_name: string | null }>}
    />
  );
}
