import Link from 'next/link';
import {
  CloudUpload,
  Image as ImageIcon,
  Video,
  ArrowUpFromLine,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  XCircle,
  Trash2,
} from 'lucide-react';
import { Badge, Card, CardContent } from '@kommessa/ui';
import { createServiceSupabase } from '@kommessa/api/service';

import { requirePlatformAdmin } from '../_lib/guard';
import { SectionHeader } from '../../_components/section-header';
import { MediaRowActions } from './_components/media-row-actions';
import { SyncBatchButton } from './_components/sync-batch-button';

export const metadata = { title: 'Platform · Media & sync' };
export const dynamic = 'force-dynamic';

type Status =
  | 'uploading'
  | 'uploaded'
  | 'syncing'
  | 'synced'
  | 'sync_failed'
  | 'failed'
  | 'deleted';

const ALL_STATUSES: Status[] = [
  'uploading',
  'uploaded',
  'syncing',
  'synced',
  'sync_failed',
  'failed',
  'deleted',
];

interface Props {
  searchParams: {
    status?: string;
    tenant?: string;
    q?: string;
  };
}

export default async function MediaSyncPage({ searchParams }: Props) {
  await requirePlatformAdmin();
  const supabase = createServiceSupabase();

  const statusFilter = (searchParams.status ?? '').trim() as Status | '';
  const tenantFilter = (searchParams.tenant ?? '').trim();
  const qFilter = (searchParams.q ?? '').trim();

  // ----- Stats (count per status, parallelo) -----
  const statsPromise = Promise.all(
    ALL_STATUSES.map(async (s) => {
      const { count } = await supabase
        .from('file_refs')
        .select('id', { count: 'exact', head: true })
        .eq('status', s);
      return [s, count ?? 0] as const;
    }),
  );

  // ----- Lista file (limit 50) -----
  let listQuery = supabase
    .from('file_refs')
    .select(
      'id, tenant_id, commessa_id, filename, mime, size_bytes, status, r2_key, path, sync_attempts, last_sync_error, uploaded_at, uploaded_by',
    )
    .order('uploaded_at', { ascending: false })
    .limit(50);

  if (statusFilter && ALL_STATUSES.includes(statusFilter as Status)) {
    listQuery = listQuery.eq('status', statusFilter as Status);
  }
  if (tenantFilter) {
    listQuery = listQuery.eq('tenant_id', tenantFilter);
  }
  if (qFilter) {
    listQuery = listQuery.ilike('filename', `%${qFilter}%`);
  }

  // ----- Tenant names (per visualizzare slug nella tabella) -----
  const tenantsPromise = supabase.from('tenants').select('id, slug, nome');

  const [stats, listRes, tenantsRes] = await Promise.all([
    statsPromise,
    listQuery,
    tenantsPromise,
  ]);

  const statsMap = new Map(stats);
  const total = stats.reduce((acc, [, n]) => acc + n, 0);
  const pendingSync = (statsMap.get('uploaded') ?? 0) + (statsMap.get('sync_failed') ?? 0);

  const tenantById = new Map(
    (tenantsRes.data ?? []).map((t: { id: string; slug: string; nome: string }) => [
      t.id,
      t,
    ]),
  );

  const rows = (listRes.data ?? []) as Array<{
    id: string;
    tenant_id: string;
    commessa_id: string;
    filename: string;
    mime: string;
    size_bytes: number;
    status: Status;
    r2_key: string | null;
    path: string;
    sync_attempts: number;
    last_sync_error: string | null;
    uploaded_at: string;
    uploaded_by: string | null;
  }>;

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Platform"
        title="Media & sync"
        description={`${total.toLocaleString('it-IT')} media totali · ${pendingSync.toLocaleString('it-IT')} in attesa di sync su Nextcloud`}
        icon={<CloudUpload />}
        actions={<SyncBatchButton />}
      />

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <StatusCard label="Totali" count={total} icon={ImageIcon} />
        <StatusCard label="Uploading" count={statsMap.get('uploading') ?? 0} icon={ArrowUpFromLine} />
        <StatusCard
          label="Su R2 (pending sync)"
          count={statsMap.get('uploaded') ?? 0}
          icon={ArrowUpFromLine}
          tone="primary"
        />
        <StatusCard
          label="Syncing"
          count={statsMap.get('syncing') ?? 0}
          icon={Loader2}
          tone="primary"
        />
        <StatusCard
          label="Synced Nextcloud"
          count={statsMap.get('synced') ?? 0}
          icon={CheckCircle2}
          tone="success"
        />
        <StatusCard
          label="Sync failed"
          count={statsMap.get('sync_failed') ?? 0}
          icon={AlertTriangle}
          tone="warning"
        />
        <StatusCard
          label="Failed"
          count={statsMap.get('failed') ?? 0}
          icon={XCircle}
          tone="destructive"
        />
      </div>

      {/* Filters */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3"
      >
        <div className="flex flex-col">
          <label className="mb-1 text-xs text-muted-foreground" htmlFor="status">
            Stato
          </label>
          <select
            id="status"
            name="status"
            defaultValue={statusFilter}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">Tutti</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="mb-1 text-xs text-muted-foreground" htmlFor="tenant">
            Tenant ID
          </label>
          <input
            id="tenant"
            name="tenant"
            defaultValue={tenantFilter}
            placeholder="uuid"
            className="h-9 w-64 rounded-md border border-input bg-background px-2 font-mono text-xs"
          />
        </div>
        <div className="flex flex-1 flex-col">
          <label className="mb-1 text-xs text-muted-foreground" htmlFor="q">
            Cerca filename
          </label>
          <input
            id="q"
            name="q"
            defaultValue={qFilter}
            placeholder="es. IMG_2025…"
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Filtra
        </button>
        {(statusFilter || tenantFilter || qFilter) && (
          <Link
            href="/admin/media"
            className="h-9 rounded-md border border-border px-3 text-sm leading-9 text-muted-foreground hover:bg-muted"
          >
            Reset
          </Link>
        )}
      </form>

      {/* Tabella */}
      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Nessun file con i filtri attuali.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">File</th>
                    <th className="px-3 py-2 text-left">Tenant</th>
                    <th className="px-3 py-2 text-left">Stato</th>
                    <th className="px-3 py-2 text-right">Size</th>
                    <th className="px-3 py-2 text-right">Tentativi</th>
                    <th className="px-3 py-2 text-left">Caricato</th>
                    <th className="px-3 py-2 text-right">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const t = tenantById.get(r.tenant_id);
                    const isVideo = r.mime.startsWith('video/');
                    const canRetry =
                      r.status === 'uploaded' || r.status === 'sync_failed';
                    return (
                      <tr
                        key={r.id}
                        className="border-b border-border last:border-b-0 hover:bg-muted/20"
                      >
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            {isVideo ? (
                              <Video className="h-3.5 w-3.5 text-primary" />
                            ) : r.mime.startsWith('image/') ? (
                              <ImageIcon className="h-3.5 w-3.5 text-success" />
                            ) : (
                              <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                            <div className="min-w-0">
                              <p className="truncate font-medium" title={r.filename}>
                                {r.filename}
                              </p>
                              <p
                                className="truncate font-mono text-[10px] text-muted-foreground"
                                title={r.path}
                              >
                                {r.path}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top">
                          {t ? (
                            <span className="font-mono text-xs">{t.slug}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {r.tenant_id.slice(0, 8)}…
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <StatusBadge status={r.status} />
                          {r.last_sync_error && (
                            <p
                              className="mt-1 max-w-[260px] truncate font-mono text-[10px] text-destructive"
                              title={r.last_sync_error}
                            >
                              {r.last_sync_error}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right align-top font-mono text-xs tabular-nums">
                          {formatBytes(r.size_bytes)}
                        </td>
                        <td className="px-3 py-2 text-right align-top font-mono text-xs tabular-nums">
                          {r.sync_attempts}
                        </td>
                        <td className="px-3 py-2 align-top text-xs text-muted-foreground">
                          {new Date(r.uploaded_at).toLocaleString('it-IT', {
                            day: '2-digit',
                            month: '2-digit',
                            year: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <MediaRowActions fileRefId={r.id} canRetry={canRetry} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Cron Vercel <code className="font-mono">*/10 min</code> esegue il batch
        automatico. Il bottone "Esegui batch ora" forza un giro immediato. "Re-sync"
        ritenta un singolo file. Dopo "uploaded" il sync parte anche fire-and-forget
        dal complete endpoint.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function StatusCard({
  label,
  count,
  icon: Icon,
  tone,
}: {
  label: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'primary' | 'success' | 'warning' | 'destructive';
}) {
  const toneClass =
    tone === 'success'
      ? 'border-success/30 bg-success/5 text-success'
      : tone === 'warning'
        ? 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400'
        : tone === 'destructive'
          ? 'border-destructive/30 bg-destructive/5 text-destructive'
          : tone === 'primary'
            ? 'border-primary/30 bg-primary/5 text-primary'
            : 'border-border bg-card text-muted-foreground';
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums">
        {count.toLocaleString('it-IT')}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const variant: 'default' | 'secondary' | 'destructive' | 'outline' = (() => {
    switch (status) {
      case 'synced':
        return 'default';
      case 'uploaded':
      case 'syncing':
        return 'secondary';
      case 'sync_failed':
      case 'failed':
        return 'destructive';
      default:
        return 'outline';
    }
  })();
  const icon = (() => {
    switch (status) {
      case 'uploading':
      case 'syncing':
        return <Loader2 className="h-3 w-3 animate-spin" />;
      case 'uploaded':
        return <ArrowUpFromLine className="h-3 w-3" />;
      case 'synced':
        return <CheckCircle2 className="h-3 w-3" />;
      case 'sync_failed':
        return <AlertTriangle className="h-3 w-3" />;
      case 'failed':
        return <XCircle className="h-3 w-3" />;
      case 'deleted':
        return <Trash2 className="h-3 w-3" />;
    }
  })();
  return (
    <Badge variant={variant} className="gap-1 font-mono text-[10px]">
      {icon}
      {status}
    </Badge>
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
