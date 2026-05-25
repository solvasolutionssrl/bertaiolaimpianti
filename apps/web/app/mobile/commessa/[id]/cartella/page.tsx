import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  ArrowLeft,
  Folder,
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
import { Hero, HeroMeta, MetaLine } from '../../../_components/blueprint';
import { CartellaEntries } from './_components/cartella-entries';
import { canView, loadFolderAclMap } from '../../../../_lib/folder-acl';

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
  const ctx = await guardMobile();
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

  // Filtro ACL: rimuovi entries che il ruolo corrente non può vedere
  // (admin/office vedono tutto; tecnico solo le cartelle classificate per il ruolo).
  // Il filtro è basato sul path relativo alla root commessa.
  const aclMap = await loadFolderAclMap(c.tenant_id, c.id);
  const filteredEntries = (entries ?? []).filter((e) => {
    if (!e.name || e.name.startsWith('.')) return false;
    // Path relativo dell'entry rispetto alla root commessa
    const relPath = subPath ? `${subPath}/${e.name}` : e.name;
    // Per le directory controlliamo direttamente; per i file controlliamo
    // la directory che li contiene (più permissivo: se vedi la cartella,
    // vedi i file dentro).
    const checkPath = e.isDirectory ? relPath : subPath || relPath;
    if (!checkPath) return true;
    return canView(ctx.role, checkPath, aclMap);
  });

  const sortedEntries = filteredEntries.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });

  const breadcrumbs = buildBreadcrumbs(c.nome_cartella, subPath, params.id);
  const backHref = breadcrumbs.length > 1
    ? breadcrumbs[breadcrumbs.length - 2]!.href
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
            <CartellaEntries
              entries={sortedEntries}
              commessaId={params.id}
              subPath={subPath}
              rootName={c.nome_cartella}
            />
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

