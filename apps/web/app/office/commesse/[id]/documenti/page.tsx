import Link from 'next/link';
import { AlertTriangle, ChevronRight, Folder, FileText, FolderOpen } from 'lucide-react';
import { Card, CardContent } from '@impiantixplus/ui';
import { createServerSupabase } from '@impiantixplus/api/server';
import { getStorageProvider, type StorageObject } from '@impiantixplus/integrations/storage';
import { EmptyState } from '../../../../_components/empty-state';
import { loadCommessa } from '../_lib/get-commessa';
import { fmtBytes, fmtData } from '../../../_lib/format';
import { OpenLocalFolderButton } from './_components/open-local';
import { PdfAnnotateButton } from './_components/pdf-annotate-button';

export const dynamic = 'force-dynamic';

interface SearchParams {
  sub?: string;
}

export default async function DocumentiTab({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: SearchParams;
}) {
  // loadCommessa è cached (React.cache) → il layout l'ha già fetchata,
  // qui è una read in-memory. La query tenant però è indipendente dal
  // load precedente: chiamiamole in parallelo per ridurre latenza.
  const supabase = createServerSupabase();
  const tenantPromise = (async () => {
    const c0 = await loadCommessa(params.id);
    return supabase
      .from('tenants')
      .select('storage_provider, storage_config')
      .eq('id', c0.tenant_id)
      .maybeSingle();
  })();
  const [c, { data: tenant }] = await Promise.all([
    loadCommessa(params.id),
    tenantPromise,
  ]);

  // Normalizza il root: rimuovi leading/trailing slash così la concat con
  // sub produce sempre singolo `/`. Esempio:
  //   cloud_folder_path = "/Rossi_2026-05-18_InstallazioneSplit/"
  //   → root = "Rossi_2026-05-18_InstallazioneSplit"
  const rawRoot = c.cloud_folder_path ?? c.nome_cartella;
  const root = rawRoot ? rawRoot.replace(/^\/+|\/+$/g, '') : null;
  const sub = (searchParams.sub ?? '').replace(/^\/+|\/+$/g, '');
  const fullPath = root ? (sub ? `${root}/${sub}` : root) : '';

  let entries: StorageObject[] = [];
  let error: string | null = null;

  if (!root) {
    error = 'La cartella cloud non è ancora stata creata per questa commessa.';
  } else {
    try {
      // Convenzione DB: storage_config usa camelCase (baseUrl, appPassword)
      // coerente con il resto del codice (crea-commessa.ts, foto.ts, ecc.)
      const cfg = (tenant?.storage_config as Record<string, string> | null) ?? {};
      const provider = getStorageProvider({
        provider: (tenant?.storage_provider as any) ?? 'supabase',
        bucket: cfg.bucket ?? 'commesse',
        baseUrl: cfg.baseUrl,
        user: cfg.user,
        appPassword: cfg.appPassword,
      });
      entries = await provider.listFolder(fullPath);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Errore lettura cartella.';
    }
  }

  const crumbs = sub.split('/').filter(Boolean);

  // Lookup file_refs + summary annotazioni per i PDF visibili in cartella
  // (best-effort: una sola roundtrip per directory, restituisce solo le righe
  // che esistono già; gli "Annota" su PDF non ancora referenziati creeranno
  // la row al volo via risolviFileRefPerPath).
  const pdfPaths = entries
    .filter((e) => !e.isDirectory && /\.pdf$/i.test(e.name))
    .map((e) => e.path);

  const summariesByPath = new Map<
    string,
    { fileRefId: string; total: number; pagine_annotate: number }
  >();
  if (pdfPaths.length > 0) {
    // Step 1: file_refs per path (potrebbero non esistere ancora — verranno
    // creati al primo "Annota" via risolviFileRefPerPath)
    const { data: refs } = await supabase
      .from('file_refs')
      .select('id, path')
      .eq('commessa_id', params.id)
      .in('path', pdfPaths);

    const refIds = (refs ?? []).map((r) => r.id);
    let summaryByRef = new Map<
      string,
      { total: number; pagine_annotate: number }
    >();
    if (refIds.length > 0) {
      const { data: sums } = await supabase
        .from('file_annotations_summary')
        .select('file_ref_id, total, pagine_annotate')
        .in('file_ref_id', refIds);
      for (const s of sums ?? []) {
        summaryByRef.set(s.file_ref_id, {
          total: s.total ?? 0,
          pagine_annotate: s.pagine_annotate ?? 0,
        });
      }
    }

    for (const r of refs ?? []) {
      const s = summaryByRef.get(r.id);
      summariesByPath.set(r.path, {
        fileRefId: r.id,
        total: s?.total ?? 0,
        pagine_annotate: s?.pagine_annotate ?? 0,
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Breadcrumbs commessaId={params.id} sub={sub} root={root} />
        <OpenLocalFolderButton fullPath={fullPath} />
      </div>

      {error ? (
        <EmptyState
          icon={AlertTriangle}
          tone="accent"
          title="Impossibile leggere la cartella"
          description={error}
        />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="Cartella vuota"
          description="Carica file dal portale documenti del cliente, dal mobile dei tecnici o sincronizza la cartella cloud."
        />
      ) : (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {entries.map((e) => {
              const sortKey = e.isDirectory ? 0 : 1;
              return { ...e, sortKey };
            })
              .sort((a, b) =>
                a.sortKey === b.sortKey
                  ? a.name.localeCompare(b.name)
                  : a.sortKey - b.sortKey,
              )
              .map((e) => (
                <FileRow
                  key={e.path}
                  entry={e}
                  commessaId={params.id}
                  currentSub={sub}
                  summary={summariesByPath.get(e.path) ?? null}
                />
              ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Breadcrumbs({
  commessaId,
  sub,
  root,
}: {
  commessaId: string;
  sub: string;
  root: string | null;
}) {
  const parts = sub.split('/').filter(Boolean);
  return (
    <div className="flex flex-wrap items-center gap-1 text-sm">
      <Link
        href={`/office/commesse/${commessaId}/documenti`}
        className="font-mono text-muted-foreground hover:text-foreground"
      >
        {root ?? '(cartella)'}
      </Link>
      {parts.map((p, i) => {
        const path = parts.slice(0, i + 1).join('/');
        return (
          <span key={path} className="inline-flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <Link
              href={`/office/commesse/${commessaId}/documenti?sub=${encodeURIComponent(path)}`}
              className="font-mono hover:text-foreground"
            >
              {p}
            </Link>
          </span>
        );
      })}
    </div>
  );
}

function FileRow({
  entry,
  commessaId,
  currentSub,
  summary,
}: {
  entry: StorageObject;
  commessaId: string;
  currentSub: string;
  summary: { fileRefId: string; total: number; pagine_annotate: number } | null;
}) {
  if (entry.isDirectory) {
    const nextSub = currentSub ? `${currentSub}/${entry.name}` : entry.name;
    return (
      <Link
        href={`/office/commesse/${commessaId}/documenti?sub=${encodeURIComponent(nextSub)}`}
        className="flex items-center gap-3 p-3 text-sm hover:bg-muted/50"
      >
        <Folder className="h-4 w-4 text-secondary" />
        <span className="flex-1 truncate font-medium">{entry.name}</span>
        <span className="text-xs text-muted-foreground">cartella</span>
      </Link>
    );
  }
  const isPdf = /\.pdf$/i.test(entry.name);
  return (
    <div className="flex items-center gap-3 p-3 text-sm">
      <FileText className={['h-4 w-4', isPdf ? 'text-accent' : 'text-muted-foreground'].join(' ')} />
      <span className="flex-1 truncate">{entry.name}</span>
      <span className="hidden text-xs text-muted-foreground sm:inline">
        {fmtBytes(entry.size)}
      </span>
      <span className="hidden text-xs text-muted-foreground md:inline">
        {fmtData(entry.modifiedAt)}
      </span>
      {isPdf ? (
        <PdfAnnotateButton
          commessaId={commessaId}
          path={entry.path}
          filename={entry.name}
          sizeBytes={entry.size}
          summary={summary}
        />
      ) : null}
    </div>
  );
}
