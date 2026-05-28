import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  ArrowLeft,
  Camera,
  Phone,
  FileText,
  Folder,
  ChevronRight,
  CloudUpload,
  User,
} from 'lucide-react';

import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
import { Button, StatoLed, Tabs, TabsContent, TabsList, TabsTrigger } from '@kommessa/ui';
import type { StatoCommessa } from '@kommessa/api/types';
import {
  getStorageProvider,
  type StorageObject,
  type StorageProviderName,
} from '@kommessa/integrations/storage';

import { guardMobile } from '../../_lib/guard';
import { fmtData } from '../../../office/_lib/format';
import {
  Divider,
  CornerTicks,
  Hero,
} from '../../_components/blueprint';
import { FotoTab, type FotoItem } from './_components/foto-tab';
import {
  CommessaTodoMobile,
  type TodoMobileRow,
} from './_components/commessa-todo-mobile';
import {
  CommessaRiunioniMobile,
  type RiunioneMobileRow,
} from './_components/commessa-riunioni-mobile';
import { CommessaLavoriMobile } from './_components/commessa-lavori-mobile';
import { CartellaEntries } from './cartella/_components/cartella-entries';
import { DettagliEdit } from '../../../_components/dettagli-edit';
import { TecniciMobile } from './_components/tecnici-mobile';
import {
  elencaTecniciAssegnati,
  elencaTecniciTenant,
} from '../../../_actions/commessa-tecnici';
import { canView, loadFolderAclMap } from '../../../_lib/folder-acl';
import { CloudRetry } from './_components/cloud-retry';

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  return { title: `Commessa ${params.id.slice(0, 8)}` };
}

/**
 * Pagina commessa — "casa del lavoro" mobile.
 *
 * Layout a blueprint con sezioni numerate:
 *   01 / Identità (codice, stato LED, cliente, indirizzo, contatti, meta)
 *   02 / Briefing (nota del capo / descrizione AI finale)
 *   03 / Documentazione (tab: Foto · File · Aggiornamenti)
 *
 * FAB camera in basso a destra per scatto rapido. Tutte le azioni
 * principali sono raggiungibili con il pollice in modalità one-handed.
 */
export default async function CommessaDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const ctx = await guardMobile();
  const supabase = createServerSupabase();
  const canEditDettagli = ctx.role === 'admin';
  const canManageTecnici = ctx.role === 'admin' || ctx.role === 'office';

  // Carica tecnici assegnati + rosa disponibile (rosa solo se admin/office)
  const [tecniciAssegnati, tecniciTenant] = await Promise.all([
    elencaTecniciAssegnati(params.id),
    canManageTecnici ? elencaTecniciTenant() : Promise.resolve([]),
  ]);

  // Gate accesso per i tecnici: possono aprire solo le commesse a cui sono assegnati.
  // Admin/office vedono tutto. Super_admin SOLVA bypassa via service role (TODO se serve).
  if (ctx.role === 'tecnico') {
    const { data: assign } = await supabase
      .from('commessa_tecnici')
      .select('commessa_id')
      .eq('commessa_id', params.id)
      .eq('user_id', ctx.userId)
      .maybeSingle();
    if (!assign) {
      // Non assegnato: redirect alla home invece di mostrare 404 — UX più gentile.
      const { redirect } = await import('next/navigation');
      redirect('/mobile');
    }
  }

  // 1) Commessa + cliente + responsabile
  const { data: rawCommessa, error } = await supabase
    .from('commesse')
    .select(
      `
        id, codice_interno, nome_cartella, stato, tenant_id,
        cliente_indirizzo_cantiere, cloud_folder_path,
        descrizione_ai_finale, descrizione_ai_proposta, note_iniziali, is_critica, data_apertura,
        cliente:clienti (
          id, ragione_sociale, email, telefoni, citta, cap, provincia,
          contatti:contatto_cliente ( id, nome, ruolo, telefono, email, is_primary, ordine, commessa_id )
        ),
        responsabile:users!commesse_responsabile_id_fkey ( display_name )
      `,
    )
    .eq('id', params.id)
    .single();

  if (error || !rawCommessa) notFound();

  // 2) Foto e video: solo quelle effettivamente caricate (esclude 'uploading'
  //    bloccate da errori CORS/rete che creerebbero duplicati nella gallery).
  const fotoQuery = supabase
    .from('file_refs')
    .select('id, filename, thumbnail_url, momento, uploaded_at, mime, r2_key')
    .eq('commessa_id', params.id)
    .or('mime.like.image/%,mime.like.video/%')
    .in('status', ['uploaded', 'syncing', 'synced', 'sync_failed'])
    .is('deleted_at', null)
    .order('uploaded_at', { ascending: false })
    .limit(60);

  // 4-bis) TODO della commessa (aperti + completati recenti)
  const todoQuery = supabase
    .from('commessa_todo' as never)
    .select(
      'id, titolo, descrizione, stato, priorita, assegnato_a, scadenza_at, created_at, completato_at, created_by, completato_da',
    )
    .eq('commessa_id', params.id)
    .order('sort_order', { ascending: true })
    .limit(200);

  // 4-ter) Riunioni della commessa (più recenti prima)
  const riunioniQuery = supabase
    .from('commessa_riunione' as never)
    .select(
      'id, data_riunione, titolo, reportino, corpo_libero, trascrizione, created_by, created_at',
    )
    .eq('commessa_id', params.id)
    .order('data_riunione', { ascending: false })
    .limit(20);

  const [fotoRes, todoRes, riunioniRes] = await Promise.all([
    fotoQuery,
    todoQuery,
    riunioniQuery,
  ]);

  // Note dei todo (in batch) + risoluzione nomi
  const todosRaw = (todoRes.data ?? []) as Array<{
    id: string;
    titolo: string;
    descrizione: string | null;
    stato: 'aperto' | 'in_corso' | 'completato' | 'annullato';
    priorita: 'bassa' | 'media' | 'alta' | 'urgente';
    assegnato_a: string | null;
    scadenza_at: string | null;
    created_at: string;
    completato_at: string | null;
    created_by: string | null;
    completato_da: string | null;
  }>;
  const todoIds = todosRaw.map((t) => t.id);
  const riunioniRaw = (riunioniRes.data ?? []) as Array<{
    id: string;
    data_riunione: string;
    titolo: string | null;
    reportino: string | null;
    corpo_libero: string | null;
    trascrizione: string | null;
    created_by: string | null;
    created_at: string;
  }>;
  const todoUserIds = new Set<string>();
  for (const t of todosRaw) {
    if (t.assegnato_a) todoUserIds.add(t.assegnato_a);
    if (t.created_by) todoUserIds.add(t.created_by);
    if (t.completato_da) todoUserIds.add(t.completato_da);
  }
  for (const r of riunioniRaw) {
    if (r.created_by) todoUserIds.add(r.created_by);
  }
  const [noteRes, todoUsersRes] = await Promise.all([
    todoIds.length > 0
      ? supabase
          .from('commessa_todo_nota' as never)
          .select('id, todo_id, author_id, body, created_at')
          .in('todo_id', todoIds)
          .order('created_at', { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [] }),
    todoUserIds.size > 0
      ? supabase
          .from('users')
          .select('id, display_name')
          .in('id', Array.from(todoUserIds))
      : Promise.resolve({ data: [] }),
  ]);
  const todoNote = ((noteRes.data ?? []) as Array<{
    id: string;
    todo_id: string;
    author_id: string | null;
    body: string;
    created_at: string;
  }>);
  const todoUsersMap = new Map<string, string | null>(
    ((todoUsersRes.data ?? []) as Array<{ id: string; display_name: string | null }>).map(
      (u) => [u.id, u.display_name],
    ),
  );
  // Carica anche author_id delle note nel users map
  const noteAuthorIds = Array.from(
    new Set(todoNote.map((n) => n.author_id).filter((v): v is string => !!v)),
  ).filter((id) => !todoUsersMap.has(id));
  if (noteAuthorIds.length > 0) {
    const { data: extra } = await supabase
      .from('users')
      .select('id, display_name')
      .in('id', noteAuthorIds);
    for (const u of (extra ?? []) as Array<{ id: string; display_name: string | null }>) {
      todoUsersMap.set(u.id, u.display_name);
    }
  }

  const todosMobile: TodoMobileRow[] = todosRaw.map((t) => ({
    id: t.id,
    titolo: t.titolo,
    descrizione: t.descrizione,
    stato: t.stato,
    priorita: t.priorita,
    assegnato_a: t.assegnato_a,
    assegnato_a_nome: t.assegnato_a ? (todoUsersMap.get(t.assegnato_a) ?? null) : null,
    scadenza_at: t.scadenza_at,
    created_at: t.created_at,
    created_by_nome: t.created_by ? (todoUsersMap.get(t.created_by) ?? null) : null,
    completato_at: t.completato_at,
    completato_da_nome: t.completato_da ? (todoUsersMap.get(t.completato_da) ?? null) : null,
    note: todoNote
      .filter((n) => n.todo_id === t.id)
      .map((n) => ({
        id: n.id,
        body: n.body,
        created_at: n.created_at,
        author_nome: n.author_id ? (todoUsersMap.get(n.author_id) ?? null) : null,
      })),
  }));

  const todoApertiCount = todosMobile.filter(
    (t) => t.stato === 'aperto' || t.stato === 'in_corso',
  ).length;

  // Carica gli allegati delle riunioni con join su file_refs
  const riunioniIds = riunioniRaw.map((r) => r.id);
  let allegatiByRiu = new Map<
    string,
    Array<{
      id: string;
      file_ref_id: string;
      filename: string;
      mime: string;
      path: string | null;
      kind: 'foto' | 'pdf_acquisito';
    }>
  >();
  if (riunioniIds.length > 0) {
    const { data: allRes } = await supabase
      .from('commessa_riunione_allegato' as never)
      .select(
        `id, riunione_id, kind,
         file_ref:file_refs!commessa_riunione_allegato_file_ref_id_fkey (
           id, filename, mime, path
         )`,
      )
      .in('riunione_id', riunioniIds);
    for (const a of (allRes ?? []) as Array<any>) {
      const fr = Array.isArray(a.file_ref) ? a.file_ref[0] : a.file_ref;
      if (!fr) continue;
      const list = allegatiByRiu.get(a.riunione_id) ?? [];
      list.push({
        id: a.id as string,
        file_ref_id: fr.id as string,
        filename: (fr.filename as string) ?? 'allegato',
        mime: (fr.mime as string) ?? '',
        path: (fr.path as string | null) ?? null,
        kind: a.kind as 'foto' | 'pdf_acquisito',
      });
      allegatiByRiu.set(a.riunione_id, list);
    }
  }

  const riunioniMobile: RiunioneMobileRow[] = riunioniRaw.map((r) => ({
    id: r.id,
    data_riunione: r.data_riunione,
    titolo: r.titolo,
    reportino: r.reportino,
    corpo_libero: r.corpo_libero,
    trascrizione: r.trascrizione,
    created_by_nome: r.created_by ? (todoUsersMap.get(r.created_by) ?? null) : null,
    allegati: allegatiByRiu.get(r.id) ?? [],
  }));

  const commessa = rawCommessa as any;

  // 5) Cloud entries (root della cartella commessa) per la tab File
  let cloudEntries: StorageObject[] | null = null;
  let cloudError: string | null = null;
  if (commessa.nome_cartella && commessa.tenant_id) {
    try {
      const service = createServiceSupabase();
      const { data: tenantRow } = await service
        .from('tenants')
        .select('storage_provider, storage_config')
        .eq('id', commessa.tenant_id)
        .maybeSingle();

      const providerName = (tenantRow?.storage_provider as StorageProviderName) ?? 'supabase';
      const cfg = (tenantRow?.storage_config as Record<string, string> | null) ?? {};

      if (providerName === 'nextcloud' && cfg.baseUrl && cfg.user && cfg.appPassword) {
        const provider = getStorageProvider({
          provider: 'nextcloud',
          baseUrl: cfg.baseUrl,
          user: cfg.user,
          appPassword: cfg.appPassword,
        basePath: typeof cfg.basePath === "string" ? cfg.basePath : undefined,
        });
        const cloudRoot = (commessa.cloud_folder_path ?? commessa.nome_cartella).replace(/^\/+|\/+$/g, '');
        cloudEntries = await provider.listFolder(cloudRoot);
      } else if (providerName === 'supabase') {
        const provider = getStorageProvider({
          provider: 'supabase',
          bucket: (cfg.bucket as string | undefined) ?? 'commesse',
        });
        cloudEntries = await provider.listFolder(commessa.nome_cartella);
      } else {
        cloudError = `Provider ${providerName} non configurato`;
      }
    } catch (e) {
      cloudError = e instanceof Error ? e.message : 'Errore caricamento cartella';
    }
  }

  // ACL filtering: nascondi le cartelle/file non visibili per il ruolo corrente.
  const aclMapHome = await loadFolderAclMap(commessa.tenant_id, commessa.id);
  const filteredCloudEntries = (cloudEntries ?? []).filter((e) => {
    if (!e.name || e.name.startsWith('.')) return false;
    // Alla root: checkPath = directory name; file alla root → permessi root (deny default)
    const checkPath = e.isDirectory ? e.name : '';
    if (!checkPath) return ctx.role === 'admin' || ctx.role === 'office';
    return canView(ctx.role, checkPath, aclMapHome);
  });

  const sortedCloudEntries = filteredCloudEntries.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });
  const cloudFileCount = sortedCloudEntries.filter((e) => !e.isDirectory).length;
  const cliente = Array.isArray(commessa.cliente) ? commessa.cliente[0] : commessa.cliente;
  const responsabile = Array.isArray(commessa.responsabile)
    ? commessa.responsabile[0]
    : commessa.responsabile;
  const stato = commessa.stato as StatoCommessa;

  const tutteFoto = (fotoRes.data ?? []) as FotoItem[];
  const fotoSopralluogo = tutteFoto.filter((f) => f.momento === 'sopralluogo').reverse();
  const fotoInCorso = tutteFoto.filter((f) => f.momento === 'in_corso');
  const fotoFinali = tutteFoto.filter((f) => f.momento === 'finale');
  const fotoTot = tutteFoto.length;

  // "Dettagli" = trascrizione integrale del capo (verità sacrosanta).
  // Fallback su descrizione AI per le commesse create prima dell'introduzione
  // del campo note_iniziali.
  const dettagliTesto: string | null =
    commessa.note_iniziali ??
    commessa.descrizione_ai_finale ??
    commessa.descrizione_ai_proposta ??
    null;

  const telefono = (cliente?.telefoni as string[] | undefined)?.[0];

  // Contatti referente (Ondata 4.1): union dei contatti del cliente
  // (commessa_id NULL) + contatti specifici di QUESTA commessa
  // (commessa_id = params.id). Ordine: primary cliente prima, poi gli
  // altri cliente, poi i contatti commessa.
  type ContattoMobile = {
    id: string;
    nome: string;
    ruolo: string | null;
    telefono: string | null;
    email: string | null;
    is_primary: boolean;
    ordine: number;
    commessa_id?: string | null;
  };
  const contattiClienteRaw = (cliente as { contatti?: ContattoMobile[] } | null)
    ?.contatti;
  const contattiCliente: ContattoMobile[] = Array.isArray(contattiClienteRaw)
    ? [...contattiClienteRaw]
        .filter((c) => !c.commessa_id || c.commessa_id === params.id)
        .sort((a, b) => {
          // 1) Contatti del cliente prima, poi quelli della commessa
          const aScope = a.commessa_id == null ? 0 : 1;
          const bScope = b.commessa_id == null ? 0 : 1;
          if (aScope !== bScope) return aScope - bScope;
          // 2) Tra i cliente, primary first
          if (a.commessa_id == null) {
            if (a.is_primary !== b.is_primary) {
              return a.is_primary ? -1 : 1;
            }
          }
          return a.ordine - b.ordine || a.nome.localeCompare(b.nome);
        })
    : [];

  return (
    <div className="flex min-h-[100dvh] flex-col pb-28">
      {/* Hero dark con codice + cliente + LED */}
      <Hero>
        <div className="flex items-center justify-between">
          <Link
            href="/mobile"
            className="inline-flex items-center gap-1.5 text-primary-foreground/80 transition-colors hover:text-primary-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span className="font-mono text-[11px] uppercase tracking-[0.18em]">Indietro</span>
          </Link>
          <div className="inline-flex items-center gap-2">
            {commessa.is_critica && (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/25 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-destructive ring-1 ring-destructive/40">
                <span aria-hidden="true">●</span> Critica
              </span>
            )}
            <span className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-2.5 py-1">
              <StatoLed stato={stato} />
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary-foreground/90">
                {{
                  aperta: 'Aperta',
                  in_corso: 'In corso',
                  collaudo: 'Collaudo',
                  bozza: 'Bozza',
                  completata: 'Completata',
                  archiviata: 'Archiviata',
                }[stato] ?? stato}
              </span>
            </span>
          </div>
        </div>

        {/* Hero compattato — meno spazio sprecato, lascia più verticale al
            contenuto. Cliente in alto perché è quello che si cerca a colpo
            d'occhio; codice come "etichetta" sopra. */}
        {/* Hero compatto — gerarchia ribilanciata: il TITOLO della commessa
            (descrizione AI / nota capo) è la cosa più grande, cliente +
            indirizzo come meta sotto, codice/data come micro-tag sopra. */}
        <div className="mt-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary-foreground/60">
            {commessa.codice_interno} · {fmtData(commessa.data_apertura)}
            {responsabile?.display_name ? ` · Resp ${responsabile.display_name}` : ''}
          </p>
          <h1 className="mt-1 text-xl font-semibold leading-snug tracking-tight text-primary-foreground">
            {pickCommessaTitolo(commessa) ?? commessa.nome_cartella ?? '—'}
          </h1>
          <p className="mt-1 text-sm font-medium text-primary-foreground/85">
            {cliente?.ragione_sociale ?? '—'}
          </p>
          {(commessa.cliente_indirizzo_cantiere || cliente?.citta) && (
            <p className="mt-0.5 text-xs text-primary-foreground/70">
              {[commessa.cliente_indirizzo_cantiere, cliente?.citta].filter(Boolean).join(' · ')}
            </p>
          )}

          {/* Dettagli nel hero — preview 3 righe, edit per admin */}
          {(dettagliTesto || canEditDettagli) ? (
            <div className="relative mt-3 border-t border-primary-foreground/10 pt-3">
              {dettagliTesto ? (
                <p className="pr-7 text-[13px] leading-relaxed text-primary-foreground/90 line-clamp-3">
                  <span className="mr-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-primary-foreground/45">Dettagli:</span>
                  {dettagliTesto}
                </p>
              ) : (
                <p className="pr-7 text-[11px] italic text-primary-foreground/40">
                  <span className="mr-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-primary-foreground/35">Dettagli:</span>
                  Nessun dettaglio lavoro.
                </p>
              )}
              <DettagliEdit
                commessaId={params.id}
                initial={commessa.note_iniziali ?? dettagliTesto ?? null}
                canEdit={canEditDettagli}
                triggerClassName="text-primary-foreground/40 hover:bg-primary-foreground/10 hover:text-primary-foreground"
              />
            </div>
          ) : null}

          {/* Contatti referente — chip tap-to-call per ciascuno.
              Fallback al vecchio singolo telefono se la rubrica è vuota. */}
          {contattiCliente.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {contattiCliente.slice(0, 4).map((c) =>
                c.telefono ? (
                  <a
                    key={c.id}
                    href={`tel:${c.telefono}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-3 py-1 text-xs text-primary-foreground/85 transition-colors hover:bg-primary-foreground/15 active:bg-primary-foreground/20"
                    title={`Chiama ${c.nome}${c.ruolo ? ` (${c.ruolo})` : ''}`}
                  >
                    <Phone className="h-3 w-3" aria-hidden="true" />
                    <span className="font-medium">{c.nome}</span>
                    {c.ruolo ? (
                      <span className="text-primary-foreground/60">· {c.ruolo}</span>
                    ) : null}
                  </a>
                ) : (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary-foreground/20 bg-primary-foreground/5 px-3 py-1 text-xs text-primary-foreground/60"
                    title={c.nome}
                  >
                    {c.nome}
                    {c.ruolo ? (
                      <span className="text-primary-foreground/45">· {c.ruolo}</span>
                    ) : null}
                  </span>
                ),
              )}
            </div>
          ) : telefono ? (
            <div className="mt-3">
              <a
                href={`tel:${telefono}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-3 py-1 text-xs text-primary-foreground/80 transition-colors hover:bg-primary-foreground/15 active:bg-primary-foreground/20"
              >
                <Phone className="h-3 w-3" aria-hidden="true" />
                {telefono}
              </a>
            </div>
          ) : null}
        </div>
      </Hero>

      <div className="flex flex-col gap-5 px-4 pt-4">

      {/* ── Tab principali — l'utente si muove qui dentro ─────────── */}
      <section className="animate-fade-up [animation-delay:60ms]">
        <Tabs
          defaultValue={
            todoApertiCount > 0 || riunioniMobile.length > 0 ? 'todo' : 'foto'
          }
          className="w-full"
        >
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
          <TabsList className="grid h-10 w-full grid-cols-4 items-center rounded-none border-b border-border/60 bg-muted p-1">
            <TabsTrigger
              value="todo"
              className="h-8 rounded-md font-mono text-[10px] font-semibold uppercase tracking-[0.10em] text-muted-foreground transition-all data-[state=active]:rounded-b-none data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow"
            >
              Lavori
              <span className="ml-1 font-sans text-[9px] tabular-nums opacity-70">
                {todoApertiCount + riunioniMobile.length}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="foto"
              className="h-8 rounded-md font-mono text-[10px] font-semibold uppercase tracking-[0.10em] text-muted-foreground transition-all data-[state=active]:rounded-b-none data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow"
            >
              Foto
              <span className="ml-1 font-sans text-[9px] tabular-nums opacity-70">
                {fotoTot}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="file"
              className="h-8 rounded-md font-mono text-[10px] font-semibold uppercase tracking-[0.10em] text-muted-foreground transition-all data-[state=active]:rounded-b-none data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow"
            >
              File
              <span className="ml-1 font-sans text-[9px] tabular-nums opacity-70">
                {cloudFileCount}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="tecnici"
              className="h-8 rounded-md font-mono text-[10px] font-semibold uppercase tracking-[0.10em] text-muted-foreground transition-all data-[state=active]:rounded-b-none data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow"
            >
              <User className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="ml-0.5">Team</span>
              <span className="ml-1 font-sans text-[9px] tabular-nums opacity-70">
                {tecniciAssegnati.length}
              </span>
            </TabsTrigger>
          </TabsList>

          {/* ───────────── LAVORI (TODO + Riunioni) ───────────── */}
          <TabsContent value="todo" className="m-0 bg-muted/30 p-3 pt-4">
            <CommessaLavoriMobile
              commessaId={params.id}
              contestoCommessa={[
                commessa.codice_interno,
                cliente?.ragione_sociale,
                commessa.cliente_indirizzo_cantiere,
              ]
                .filter(Boolean)
                .join(' · ')}
              currentUserId={ctx.userId}
              canWrite={canManageTecnici}
              todos={todosMobile}
              riunioni={riunioniMobile}
              tecniciTenant={tecniciTenant}
            />
          </TabsContent>

          {/* ───────────── FOTO/VIDEO ───────────── */}
          <TabsContent value="foto" className="m-0 bg-muted/30 p-3 pt-4">
            <FotoTab
              commessaId={params.id}
              sopralluogo={fotoSopralluogo}
              inCorso={fotoInCorso}
              finali={fotoFinali}
            />
          </TabsContent>

          {/* ───────────── FILE (cloud diretto) ───────────── */}
          <TabsContent value="file" className="m-0 space-y-3 bg-muted/30 p-3 pt-4">
            {cloudError ? (
              <CloudRetry />
            ) : sortedCloudEntries.length === 0 ? (
              <EmptyBlock
                icon={<Folder className="h-5 w-5" />}
                title="Cartella vuota"
                hint="Carica foto/video dal mobile o documenti dall'ufficio"
              />
            ) : (
              <CartellaEntries
                entries={sortedCloudEntries}
                commessaId={params.id}
                subPath=""
                rootName={(commessa.cloud_folder_path ?? commessa.nome_cartella).replace(/^\/+|\/+$/g, '')}
              />
            )}

            {/* Report: visibile solo quando la commessa è in fase avanzata */}
            {(['collaudo', 'completata', 'archiviata'] as const).includes(stato as any) && (
              <>
                <Divider label="Documenti generati" />
                <Link
                  href={`/mobile/commessa/${params.id}/report`}
                  className="group relative flex items-center gap-3 overflow-hidden rounded-lg border border-accent/30 bg-gradient-to-br from-accent/8 via-card to-primary/5 p-3.5 shadow-soft transition-all active:scale-[0.995]"
                >
                  <CornerTicks />
                  <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-md border border-accent/40 bg-accent text-accent-foreground font-mono text-[9px] font-black leading-none">
                    <FileText className="h-3.5 w-3.5 mb-0.5" aria-hidden="true" />
                    <span>PDF</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-accent-soft-foreground">
                      Report chiusura
                    </p>
                    <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
                      Riepilogo completo commessa
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      Cliente · foto · fasi · DICO
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-accent-soft-foreground" aria-hidden="true" />
                </Link>
              </>
            )}

            {/* Banner sync: i file caricati ora possono richiedere fino a 10 min */}
            <div className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/30 p-2.5 text-[11px] text-muted-foreground">
              <CloudUpload className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" aria-hidden="true" />
              <p>
                I file appena caricati possono richiedere fino a <strong>10 minuti</strong> per
                comparire qui (sync automatico verso Nextcloud).
              </p>
            </div>
          </TabsContent>

          {/* ───────────── TECNICI ───────────── */}
          <TabsContent value="tecnici" className="m-0 bg-muted/30 p-3 pt-4">
            <TecniciMobile
              commessaId={params.id}
              assigned={tecniciAssegnati}
              available={tecniciTenant}
              canManage={canManageTecnici}
            />
          </TabsContent>
          </div>
        </Tabs>
      </section>
      </div>

      {/* FAB camera fisso — bottom calcolato per non sovrapporsi
          al bottom-nav nemmeno con safe-area home indicator iPhone */}
      <Link
        href={`/mobile/commessa/${params.id}/scatto`}
        aria-label="Scatta foto"
        className="fixed right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full border border-primary/20 bg-primary text-primary-foreground shadow-glow-brand transition-transform active:scale-[0.92]"
        style={{
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)',
        }}
      >
        <Camera className="h-6 w-6" aria-hidden="true" />
      </Link>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function EmptyBlock({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center">
      <span className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function pickCommessaTitolo(c: {
  descrizione_ai_finale?: string | null;
  descrizione_ai_proposta?: string | null;
  note_iniziali?: string | null;
}): string | null {
  const raw =
    c.descrizione_ai_finale ??
    c.descrizione_ai_proposta ??
    c.note_iniziali ??
    null;
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const firstLine = trimmed.split(/\r?\n/)[0]!;
  const firstPeriod = firstLine.indexOf('. ');
  if (firstPeriod > 10) return firstLine.slice(0, firstPeriod).trim();
  return firstLine;
}

