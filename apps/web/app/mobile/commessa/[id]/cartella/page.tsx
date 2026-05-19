import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  ArrowLeft,
  Folder,
  FileText,
  ImageIcon,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';

import { createServerSupabase } from '@impiantixplus/api/server';
import { createServiceSupabase } from '@impiantixplus/api/service';
import {
  getStorageProvider,
  type StorageObject,
  type StorageProviderName,
} from '@impiantixplus/integrations/storage';

import { guardMobile } from '../../../_lib/guard';
import { Hero, HeroMeta, MetaLine, Stagger } from '../../../_components/blueprint';

export const metadata: Metadata = {
  title: 'Cartella cloud',
};

export const dynamic = 'force-dynamic';

/**
 * File browser navigabile del cloud storage del tenant per una commessa.
 *
 * URL: /mobile/commessa/[id]/cartella?path=<sub/path>
 *  - Path è relativo alla root della cartella commessa (`nome_cartella`)
 *  - Mostra breadcrumb del path corrente
 *  - Lista folder/file → folder navigabili, file aprono via proxy
 *
 * Fallback chiari quando lo storage non è configurato (decisione TBD —
 * CLAUDE.md): il messaggio guida l'utente a contattare admin.
 */
export default async function CartellaPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { path?: string };
}) {
  await guardMobile();
  const supabase = createServerSupabase();

  const { data: commessa } = await supabase
    .from('commesse')
    .select('id, codice_interno, nome_cartella, tenant_id, cliente:clienti(ragione_sociale)')
    .eq('id', params.id)
    .single();

  if (!commessa) notFound();

  const c = commessa as any;
  const cliente = Array.isArray(c.cliente) ? c.cliente[0] : c.cliente;

  // Path sotto la cartella commessa (es. "Foto/Sopralluogo")
  const subPath = (searchParams?.path ?? '')
    .replace(/\.\./g, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  const fullPath = subPath ? `${c.nome_cartella}/${subPath}` : c.nome_cartella;

  // Carica config storage del tenant
  const service = createServiceSupabase();
  const { data: tenantRow } = await service
    .from('tenants')
    .select('storage_provider, storage_config')
    .eq('id', c.tenant_id)
    .maybeSingle();

  const providerName = (tenantRow?.storage_provider as StorageProviderName) ?? 'supabase';
  const cfg = (tenantRow?.storage_config as Record<string, string> | null) ?? {};

  let entries: StorageObject[] | null = null;
  let storageError: string | null = null;
  let providerLabel = 'Cloud';

  try {
    if (providerName === 'nextcloud') {
      providerLabel = 'Nextcloud';
      if (!cfg.baseUrl || !cfg.user || !cfg.appPassword) {
        storageError = 'Storage Nextcloud non configurato per questo tenant.';
      } else {
        const provider = getStorageProvider({
          provider: 'nextcloud',
          baseUrl: cfg.baseUrl,
          user: cfg.user,
          appPassword: cfg.appPassword,
        });
        entries = await provider.listFolder(fullPath);
      }
    } else if (providerName === 'supabase') {
      providerLabel = 'Supabase';
      const provider = getStorageProvider({
        provider: 'supabase',
        bucket: (cfg.bucket as string | undefined) ?? 'commesse',
      });
      entries = await provider.listFolder(fullPath);
    } else {
      storageError = `Provider non supportato: ${providerName}`;
    }
  } catch (e) {
    storageError = e instanceof Error ? e.message : 'Errore nel caricamento cartella';
  }

  const sortedEntries = (entries ?? [])
    .filter((e) => e.name && !e.name.startsWith('.'))
    .sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

  const breadcrumbs = buildBreadcrumbs(c.nome_cartella, subPath, params.id);
  const backHref = breadcrumbs.length > 1
    ? breadcrumbs[breadcrumbs.length - 2].href
    : `/mobile/commessa/${params.id}`;

  return (
    <div className="flex min-h-[100dvh] flex-col pb-24">
      {/* Hero dark */}
      <Hero>
        <div className="flex items-center justify-between">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-primary-foreground/80 transition-colors hover:text-primary-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span className="font-mono text-[11px] uppercase tracking-[0.18em]">Indietro</span>
          </Link>
          <span className="rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-primary-foreground/90">
            {providerLabel}
          </span>
        </div>

        <div className="mt-5">
          <HeroMeta>
            {c.codice_interno} · {cliente?.ragione_sociale ?? '—'}
          </HeroMeta>
          <h1 className="mt-1 font-mono text-2xl font-bold leading-none tracking-tightest text-primary-foreground">
            CARTELLA
          </h1>
          <p className="mt-2 text-sm text-primary-foreground/70">Esplora i file del cantiere</p>
        </div>
      </Hero>

      <div className="flex flex-col gap-5 px-4 pt-4">
        {/* Breadcrumb */}
        <nav
          aria-label="Percorso cartella"
          className="-mt-10 rounded-xl border border-border bg-card p-3 shadow-soft-lg animate-fade-up"
        >
          <MetaLine className="mb-1.5">Percorso</MetaLine>
          <div className="flex flex-wrap items-center gap-1 text-sm">
            {breadcrumbs.map((b, idx) => (
              <span key={b.href} className="inline-flex items-center gap-1">
                {idx > 0 && <span className="text-muted-foreground/40">/</span>}
                {idx === breadcrumbs.length - 1 ? (
                  <span className="font-mono font-semibold text-foreground break-all">{b.label}</span>
                ) : (
                  <Link
                    href={b.href}
                    className="font-mono text-muted-foreground hover:text-primary hover:underline break-all"
                  >
                    {b.label}
                  </Link>
                )}
              </span>
            ))}
          </div>
        </nav>

        {/* Content */}
        {storageError ? (
          <ErrorCard message={storageError} provider={providerLabel} />
        ) : sortedEntries.length === 0 ? (
          <EmptyCard />
        ) : (
          <section className="space-y-3 animate-fade-up [animation-delay:60ms]">
            <div className="flex items-baseline justify-between">
              <MetaLine>Contenuto</MetaLine>
              <MetaLine>
                {String(sortedEntries.length).padStart(2, '0')}{' '}
                {sortedEntries.length === 1 ? 'elemento' : 'elementi'}
              </MetaLine>
            </div>
            <Stagger className="flex flex-col gap-1.5">
              {sortedEntries.map((entry) => (
                <EntryRow
                  key={entry.path}
                  entry={entry}
                  commessaId={params.id}
                  subPath={subPath}
                  rootName={c.nome_cartella}
                />
              ))}
            </Stagger>
          </section>
        )}
      </div>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildBreadcrumbs(
  rootName: string,
  subPath: string,
  commessaId: string,
): Array<{ label: string; href: string }> {
  const base = `/mobile/commessa/${commessaId}/cartella`;
  const out: Array<{ label: string; href: string }> = [
    { label: rootName, href: base },
  ];
  if (!subPath) return out;
  const parts = subPath.split('/').filter(Boolean);
  let acc = '';
  for (const p of parts) {
    acc = acc ? `${acc}/${p}` : p;
    out.push({ label: p, href: `${base}?path=${encodeURIComponent(acc)}` });
  }
  return out;
}

function EntryRow({
  entry,
  commessaId,
  subPath,
  rootName,
}: {
  entry: StorageObject;
  commessaId: string;
  subPath: string;
  rootName: string;
}) {
  if (entry.isDirectory) {
    const nextPath = subPath ? `${subPath}/${entry.name}` : entry.name;
    return (
      <Link
        href={`/mobile/commessa/${commessaId}/cartella?path=${encodeURIComponent(nextPath)}`}
        className="group flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 shadow-soft transition-all active:scale-[0.995] active:bg-muted"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/8 text-primary">
          <Folder className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{entry.name}</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Cartella
          </p>
        </div>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-active:translate-x-0.5"
          aria-hidden="true"
        />
      </Link>
    );
  }

  const ext = entry.name.split('.').pop()?.toUpperCase() ?? '?';
  const isImage = entry.mimeType.startsWith('image/');
  const isPdf = ext === 'PDF';
  const sizeLabel = formatBytes(entry.size);
  // Path completo lato cloud = root commessa + subPath + filename
  const cloudPath = [rootName, subPath, entry.name].filter(Boolean).join('/');
  const proxyUrl = `/api/cloud/file?path=${encodeURIComponent(cloudPath)}`;

  return (
    <a
      href={proxyUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 shadow-soft transition-all active:scale-[0.995] active:bg-muted"
    >
      <span
        className={
          'flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-md font-mono text-[9px] font-bold leading-none ' +
          (isPdf
            ? 'border border-accent/40 bg-accent/10 text-accent-soft-foreground'
            : isImage
              ? 'border border-success/30 bg-success/10 text-success'
              : 'border border-border bg-muted text-muted-foreground')
        }
      >
        {isImage ? (
          <ImageIcon className="h-3.5 w-3.5 mb-0.5" aria-hidden="true" />
        ) : (
          <FileText className="h-3.5 w-3.5 mb-0.5" aria-hidden="true" />
        )}
        <span className="tracking-tight">{ext.slice(0, 4)}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{entry.name}</p>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {sizeLabel}
        </p>
      </div>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </a>
  );
}

function EmptyCard() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center animate-fade-up">
      <span className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Folder className="h-4 w-4" aria-hidden="true" />
      </span>
      <p className="text-sm font-medium text-foreground">Cartella vuota</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Carica documenti dal Web Ufficio o aggiungi foto da mobile
      </p>
    </div>
  );
}

function ErrorCard({ message, provider }: { message: string; provider: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-stato-collaudo/30 bg-stato-collaudo/5 p-4 animate-fade-up">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stato-collaudo/10 text-stato-collaudo">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">Storage non disponibile</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Provider: {provider}. {message}
        </p>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
          Contatta l'amministratore del tenant
        </p>
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (!n || n <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}
