import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, MapPin } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  StatoBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@impiantixplus/ui';
import { createServerSupabase } from '@impiantixplus/api/server';
import { createServiceSupabase } from '@impiantixplus/api/service';
import { getStorageProvider, type StorageProviderConfig } from '@impiantixplus/integrations/storage';

import { requirePortalContext } from '../../_lib/portal-context';
import {
  isPubliclyVisiblePath,
  relativeFromCommessaRoot,
} from '../../_lib/file-visibility';
import { ProgressFasi } from '../../_components/progress-fasi';
import {
  ListaDocumentiPubblici,
  type DocumentoPubblico,
} from '../../_components/lista-documenti-pubblici';
import {
  TimelineComunicazioni,
  type ComunicazioneItem,
} from '../../_components/timeline-comunicazioni';

export const metadata: Metadata = {
  title: 'Dettaglio commessa',
};

interface CommessaDetail {
  id: string;
  codice_interno: string;
  nome_cartella: string;
  stato: string;
  cloud_folder_path: string | null;
  cliente_indirizzo_cantiere: string | null;
  descrizione_ai_finale: string | null;
  descrizione_ai_proposta: string | null;
  data_apertura: string;
  tenant_id: string;
}

interface VoceRow {
  voce_id: number;
  stato: string;
  voci_catalogo: { nome: string } | null;
}

interface FileRow {
  id: string;
  filename: string;
  mime: string;
  size_bytes: number;
  uploaded_at: string;
  path: string;
}

interface TicketRow {
  id: string;
  codice: string;
  oggetto: string;
}

interface TicketMessageRow {
  id: string;
  ticket_id: string;
  body: string;
  created_at: string;
  is_internal_note: boolean;
  sender_user_id: string | null;
  sender_external_email: string | null;
  users: { display_name: string | null } | null;
}

export default async function DettaglioCommessaPage({
  params,
}: {
  params: { id: string };
}) {
  const ctx = await requirePortalContext();
  const supabase = createServerSupabase();

  // 1. Anagrafica commessa (RLS: commesse_tenant_scope + filtro cliente_id)
  const { data: commessa, error: cErr } = await supabase
    .from('commesse')
    .select(
      'id, codice_interno, nome_cartella, stato, cloud_folder_path, cliente_indirizzo_cantiere, descrizione_ai_finale, descrizione_ai_proposta, data_apertura, tenant_id',
    )
    .eq('id', params.id)
    .eq('cliente_id', ctx.clienteId)
    .maybeSingle<CommessaDetail>();

  if (cErr || !commessa) {
    notFound();
  }

  // 2. Fasi
  const { data: vociRaw } = await supabase
    .from('commessa_voci')
    .select('voce_id, stato, voci_catalogo(nome)')
    .eq('commessa_id', commessa.id)
    .returns<VoceRow[]>();
  const voci = vociRaw ?? [];
  const fasiTotali = voci.length;
  const fasiCompletate = voci.filter((v) => v.stato === 'completata').length;

  // 3. File pubblicabili (vista filtrata + secondo backstop applicativo).
  //    NB: la vista `portal_files_view` DEVE essere creata dalla migration
  //    suggerita in fondo a questo file. Finché non esiste, leggiamo da
  //    `file_refs` e filtriamo per path.
  const docs = await caricaDocumentiPubblici({
    tenantId: commessa.tenant_id,
    commessaId: commessa.id,
    cloudFolderPath: commessa.cloud_folder_path,
  });

  // 4. Comunicazioni (ticket_messages dei ticket associati alla commessa).
  const comunicazioni = await caricaComunicazioni(commessa.id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Torna alle commesse
        </Link>
      </div>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
              {commessa.codice_interno}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              {commessa.descrizione_ai_finale ??
                commessa.descrizione_ai_proposta ??
                umanizzaNomeCartella(commessa.nome_cartella)}
            </h1>
          </div>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <StatoBadge stato={commessa.stato as any} />
        </div>
        {commessa.cliente_indirizzo_cantiere ? (
          <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" />
            {commessa.cliente_indirizzo_cantiere}
          </p>
        ) : null}
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Stato lavori</CardTitle>
          <CardDescription>
            Avanzamento delle fasi di lavorazione aggiornato dal cantiere.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ProgressFasi totali={fasiTotali} completate={fasiCompletate} />
          {fasiTotali > 0 ? (
            <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {voci.map((v) => (
                <li
                  key={v.voce_id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm"
                >
                  <span className="truncate">{v.voci_catalogo?.nome ?? `Fase #${v.voce_id}`}</span>
                  <StatoFaseDot stato={v.stato} />
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <Tabs defaultValue="documenti" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-grid">
          <TabsTrigger value="documenti">
            Documenti{docs.length ? ` (${docs.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="comunicazioni">
            Comunicazioni{comunicazioni.length ? ` (${comunicazioni.length})` : ''}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="documenti" className="mt-4">
          <ListaDocumentiPubblici documenti={docs} />
        </TabsContent>

        <TabsContent value="comunicazioni" className="mt-4">
          <TimelineComunicazioni items={comunicazioni} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function umanizzaNomeCartella(s: string): string {
  const last = s.split('_').slice(2).join('_') || s;
  return last.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').trim();
}

function StatoFaseDot({ stato }: { stato: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    da_iniziare: { label: 'Da iniziare', cls: 'bg-muted text-muted-foreground' },
    in_corso: { label: 'In corso', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
    completata: { label: 'Completata', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
    bloccata: { label: 'Bloccata', cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-400' },
  };
  const it = map[stato] ?? { label: stato, cls: 'bg-muted text-muted-foreground' };
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${it.cls}`}>
      {it.label}
    </span>
  );
}

async function caricaDocumentiPubblici(input: {
  tenantId: string;
  commessaId: string;
  cloudFolderPath: string | null;
}): Promise<DocumentoPubblico[]> {
  if (!input.cloudFolderPath) return [];

  const supabase = createServerSupabase();

  // PREFERITO: leggi da `portal_files_view` se esiste (RLS-protected).
  // FALLBACK: leggi da `file_refs` + filtra applicativamente via whitelist.
  const { data: rowsView, error: viewErr } = await supabase
    .from('portal_files_view')
    .select('id, filename, mime, size_bytes, uploaded_at, path')
    .eq('commessa_id', input.commessaId)
    .order('uploaded_at', { ascending: false })
    .returns<FileRow[]>();

  let rows: FileRow[];
  if (!viewErr && rowsView) {
    rows = rowsView;
  } else {
    // Fallback: senza la view, leggiamo file_refs e filtriamo applicativamente.
    const { data: rowsRefs } = await supabase
      .from('file_refs')
      .select('id, filename, mime, size_bytes, uploaded_at, path')
      .eq('commessa_id', input.commessaId)
      .order('uploaded_at', { ascending: false })
      .returns<FileRow[]>();
    rows = (rowsRefs ?? []).filter((r) =>
      isPubliclyVisiblePath(
        relativeFromCommessaRoot(r.path, input.cloudFolderPath!),
      ),
    );
  }

  if (rows.length === 0) return [];

  // Storage provider del tenant
  const config = await caricaStorageConfig(input.tenantId);
  const storage = getStorageProvider(config);

  // Firmiamo URL a 10 minuti (600s) come da spec.
  const docs: DocumentoPubblico[] = [];
  for (const r of rows) {
    try {
      const signed = await storage.getDownloadUrl(r.path, 600);
      docs.push({
        id: r.id,
        filename: r.filename,
        mime: r.mime,
        sizeBytes: r.size_bytes,
        uploadedAt: r.uploaded_at,
        relativePath: relativeFromCommessaRoot(r.path, input.cloudFolderPath!),
        downloadUrl: signed.url,
      });
    } catch (e) {
      console.warn('[portal/commessa] signed url fallita', r.path, e);
    }
  }
  return docs;
}

async function caricaStorageConfig(tenantId: string): Promise<StorageProviderConfig> {
  // Lettura tenants config: usiamo service-role per sicurezza
  // (la riga è la stessa del tenant corrente; useremo i campi non sensibili).
  const service = createServiceSupabase();
  const { data, error } = await service
    .from('tenants')
    .select('storage_provider, storage_config')
    .eq('id', tenantId)
    .maybeSingle<{ storage_provider: 'supabase' | 'nextcloud'; storage_config: Record<string, string> }>();

  if (error || !data) {
    return { provider: 'supabase', bucket: 'commesse' };
  }

  if (data.storage_provider === 'nextcloud') {
    return {
      provider: 'nextcloud',
      baseUrl: data.storage_config.baseUrl,
      user: data.storage_config.user,
      appPassword: data.storage_config.appPassword,
    };
  }
  return {
    provider: 'supabase',
    bucket: data.storage_config.bucket ?? 'commesse',
  };
}

async function caricaComunicazioni(commessaId: string): Promise<ComunicazioneItem[]> {
  const supabase = createServerSupabase();

  // Ticket associati alla commessa: cerco i ticket il cui id figura in
  // `commesse.ticket_id` (one-to-one diretto) o in `file_refs.ticket_id`
  // collegati alla commessa.
  const { data: commessaTicket } = await supabase
    .from('commesse')
    .select('ticket_id')
    .eq('id', commessaId)
    .maybeSingle<{ ticket_id: string | null }>();

  const ticketIds = new Set<string>();
  if (commessaTicket?.ticket_id) ticketIds.add(commessaTicket.ticket_id);

  // Ulteriori ticket: tutti quelli citati dai file_refs di questa commessa.
  const { data: refs } = await supabase
    .from('file_refs')
    .select('ticket_id')
    .eq('commessa_id', commessaId)
    .not('ticket_id', 'is', null)
    .returns<{ ticket_id: string }[]>();
  for (const r of refs ?? []) ticketIds.add(r.ticket_id);

  if (ticketIds.size === 0) return [];

  const { data: tickets } = await supabase
    .from('tickets')
    .select('id, codice, oggetto')
    .in('id', Array.from(ticketIds))
    .returns<TicketRow[]>();

  const ticketMap = new Map<string, TicketRow>();
  for (const t of tickets ?? []) ticketMap.set(t.id, t);

  // Messaggi NON internal (la RLS deve già escluderli per il portale, ma
  // mettiamo il filtro applicativo come backstop).
  const { data: msgs } = await supabase
    .from('ticket_messages')
    .select(
      'id, ticket_id, body, created_at, is_internal_note, sender_user_id, sender_external_email, users(display_name)',
    )
    .in('ticket_id', Array.from(ticketIds))
    .eq('is_internal_note', false)
    .order('created_at', { ascending: true })
    .returns<TicketMessageRow[]>();

  return (msgs ?? []).map((m) => {
    const t = ticketMap.get(m.ticket_id);
    const fromUfficio = !!m.sender_user_id;
    return {
      id: m.id,
      body: m.body,
      createdAt: m.created_at,
      mittente: fromUfficio ? 'ufficio' : 'cliente',
      mittenteLabel: fromUfficio
        ? m.users?.display_name ?? 'Ufficio'
        : m.sender_external_email ?? 'Cliente',
      ticketCodice: t?.codice,
      ticketOggetto: t?.oggetto,
    };
  });
}
