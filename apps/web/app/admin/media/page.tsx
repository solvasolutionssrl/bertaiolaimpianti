import Link from 'next/link';
import {
  CloudUpload,
  Image as ImageIcon,
  Video,
  ArrowUpFromLine,
  CheckCircle2,
  Info,
  Loader2,
  AlertTriangle,
  XCircle,
  Trash2,
  Sparkles,
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
    /** Quick filter: '1' = solo problemi (uploaded vecchio + sync_failed + failed). */
    soloProblemi?: string;
  };
}

// Soglia per considerare un file "uploaded da troppo tempo senza sync".
const STALE_UPLOADED_MINUTES = 30;

export default async function MediaSyncPage({ searchParams }: Props) {
  await requirePlatformAdmin();
  const supabase = createServiceSupabase();

  const statusFilter = (searchParams.status ?? '').trim() as Status | '';
  const tenantFilter = (searchParams.tenant ?? '').trim();
  const qFilter = (searchParams.q ?? '').trim();
  const soloProblemi = searchParams.soloProblemi === '1';

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
  // Nota: `r2_thumb_key` introdotta dalla migration 20260528010000.
  let listQuery = supabase
    .from('file_refs')
    .select(
      'id, tenant_id, commessa_id, filename, mime, size_bytes, status, r2_key, r2_thumb_key, path, sync_attempts, last_sync_error, uploaded_at, uploaded_by',
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
  if (soloProblemi) {
    // Solo file con problemi: failed + sync_failed + uploaded "vecchio".
    const staleThreshold = new Date(
      Date.now() - STALE_UPLOADED_MINUTES * 60 * 1000,
    ).toISOString();
    listQuery = listQuery.or(
      `status.eq.failed,status.eq.sync_failed,and(status.eq.uploaded,uploaded_at.lt.${staleThreshold})`,
    );
  }

  // ----- Tenant names (per visualizzare slug nella tabella) -----
  const tenantsPromise = supabase.from('tenants').select('id, slug, nome');

  // ----- Thumbnail coverage (solo immagini in stato "vivo") -----
  // Quante immagini totali "vive" + quante hanno il thumb persistente su R2.
  const thumbStatsPromise = Promise.all([
    supabase
      .from('file_refs')
      .select('id', { count: 'exact', head: true })
      .like('mime', 'image/%')
      .in('status', ['uploaded', 'syncing', 'synced']),
    supabase
      .from('file_refs')
      .select('id', { count: 'exact', head: true })
      .like('mime', 'image/%')
      .in('status', ['uploaded', 'syncing', 'synced'])
      .not('r2_thumb_key' as never, 'is', null),
  ]);

  const [stats, listRes, tenantsRes, thumbStats] = await Promise.all([
    statsPromise,
    listQuery,
    tenantsPromise,
    thumbStatsPromise,
  ]);

  const totalImages = thumbStats[0].count ?? 0;
  const imagesWithThumb = thumbStats[1].count ?? 0;
  const imagesWithoutThumb = Math.max(0, totalImages - imagesWithThumb);
  const pctThumb = totalImages > 0
    ? Math.round((imagesWithThumb / totalImages) * 100)
    : 100;

  const statsMap = new Map(stats);
  const total = stats.reduce((acc, [, n]) => acc + n, 0);
  const pendingSync = (statsMap.get('uploaded') ?? 0) + (statsMap.get('sync_failed') ?? 0);

  // ----- Health globale -----
  // verde:  errori < 5 e backlog (uploaded+sync_failed) ≤ 20 → tutto sotto controllo.
  // giallo: backlog tra 21 e 200 oppure errori 5-50.
  // rosso:  backlog > 200 o errori > 50.
  const erroriTot =
    (statsMap.get('sync_failed') ?? 0) + (statsMap.get('failed') ?? 0);
  const health: 'green' | 'yellow' | 'red' =
    erroriTot > 50 || pendingSync > 200
      ? 'red'
      : erroriTot > 5 || pendingSync > 20
        ? 'yellow'
        : 'green';
  const syncedTot = statsMap.get('synced') ?? 0;
  const totReachable = total - (statsMap.get('deleted') ?? 0);
  const pctSynced =
    totReachable > 0 ? Math.round((syncedTot / totReachable) * 100) : 100;

  const tenantById = new Map(
    (tenantsRes.data ?? []).map((t: { id: string; slug: string; nome: string }) => [
      t.id,
      t,
    ]),
  );

  // Cast: r2_thumb_key è introdotta dalla migration 20260528010000, i types
  // Supabase generati non la conoscono ancora.
  const rows = (listRes.data ?? []) as unknown as Array<{
    id: string;
    tenant_id: string;
    commessa_id: string;
    filename: string;
    mime: string;
    size_bytes: number;
    status: Status;
    r2_key: string | null;
    r2_thumb_key: string | null;
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

      {/* Health globale + legenda stati */}
      <HealthBanner
        health={health}
        pctSynced={pctSynced}
        backlog={pendingSync}
        erroriTot={erroriTot}
        pctThumb={pctThumb}
        imagesWithThumb={imagesWithThumb}
        imagesWithoutThumb={imagesWithoutThumb}
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
        <label className="flex items-center gap-2 self-end pb-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            name="soloProblemi"
            value="1"
            defaultChecked={soloProblemi}
            className="h-4 w-4 cursor-pointer rounded accent-destructive"
          />
          <span className="font-medium">Solo problemi</span>
        </label>
        <button
          type="submit"
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Filtra
        </button>
        {(statusFilter || tenantFilter || qFilter || soloProblemi) && (
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
                    const isImage = r.mime.startsWith('image/');
                    const canRetry =
                      r.status === 'uploaded' || r.status === 'sync_failed';
                    // "Tutto a posto": synced + (per le immagini) thumb pure
                    // generato. La riga si tinge di emerald tenue per dare
                    // un colpo d'occhio "verde = OK".
                    const fullyOk =
                      r.status === 'synced' &&
                      (!isImage || !!r.r2_thumb_key);
                    return (
                      <tr
                        key={r.id}
                        className={
                          'border-b border-border last:border-b-0 ' +
                          (fullyOk
                            ? 'bg-emerald-50/40 hover:bg-emerald-50/70 dark:bg-emerald-950/15 dark:hover:bg-emerald-950/25'
                            : 'hover:bg-muted/20')
                        }
                      >
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            {isVideo ? (
                              <Video className="h-3.5 w-3.5 text-primary" />
                            ) : isImage ? (
                              <ImageIcon className="h-3.5 w-3.5 text-success" />
                            ) : (
                              <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p
                                  className="truncate font-medium"
                                  title={r.filename}
                                >
                                  {r.filename}
                                </p>
                                {isImage ? <ThumbFlag present={!!r.r2_thumb_key} /> : null}
                              </div>
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
                            <details className="mt-1 max-w-[320px]">
                              <summary className="cursor-pointer truncate font-mono text-[10px] text-destructive">
                                {r.last_sync_error.slice(0, 60)}
                                {r.last_sync_error.length > 60 ? '…' : ''}
                              </summary>
                              <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded border border-destructive/30 bg-destructive/5 px-2 py-1 font-mono text-[10px] text-destructive">
                                {r.last_sync_error}
                              </pre>
                            </details>
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
                          <MediaRowActions
                            fileRefId={r.id}
                            canRetry={canRetry}
                            status={r.status}
                          />
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
  // `synced` ha trattamento speciale: badge custom emerald (la chip è il
  // segnale "tutto a posto" più letto nella tabella). Gli altri stati
  // restano sul sistema variants di shadcn.
  if (status === 'synced') {
    return (
      <Badge className="gap-1 border-transparent bg-emerald-100 font-mono text-[10px] text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/50 dark:text-emerald-200 dark:hover:bg-emerald-900/50">
        <CheckCircle2 className="h-3 w-3" />
        synced
      </Badge>
    );
  }

  const variant: 'default' | 'secondary' | 'destructive' | 'outline' = (() => {
    switch (status) {
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
      case 'sync_failed':
        return <AlertTriangle className="h-3 w-3" />;
      case 'failed':
        return <XCircle className="h-3 w-3" />;
      case 'deleted':
        return <Trash2 className="h-3 w-3" />;
      default:
        return null;
    }
  })();
  return (
    <Badge variant={variant} className="gap-1 font-mono text-[10px]">
      {icon}
      {status}
    </Badge>
  );
}

/**
 * Mini-flag "thumb" accanto al filename: verde con checkmark se il file ha
 * il proprio thumbnail R2 generato; outline rosso tenue se manca (utile per
 * scoprire visivamente i file su cui la generazione è fallita).
 * Solo per immagini — non si mostra per video o pdf.
 */
function ThumbFlag({ present }: { present: boolean }) {
  if (present) {
    return (
      <span
        title="Thumbnail 400x400 webp generato su R2"
        className="inline-flex items-center gap-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 px-1 py-0.5 font-mono text-[9px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300"
      >
        <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
        thumb
      </span>
    );
  }
  return (
    <span
      title="Thumbnail R2 non generato (foto vecchia o generazione fallita)"
      className="inline-flex items-center gap-0.5 rounded border border-amber-500/40 bg-amber-500/10 px-1 py-0.5 font-mono text-[9px] uppercase tracking-wider text-amber-700 dark:text-amber-300"
    >
      <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
      no thumb
    </span>
  );
}

function HealthBanner({
  health,
  pctSynced,
  backlog,
  erroriTot,
  pctThumb,
  imagesWithThumb,
  imagesWithoutThumb,
}: {
  health: 'green' | 'yellow' | 'red';
  pctSynced: number;
  backlog: number;
  erroriTot: number;
  pctThumb: number;
  imagesWithThumb: number;
  imagesWithoutThumb: number;
}) {
  const palette =
    health === 'green'
      ? {
          ring: 'ring-emerald-500/30',
          bg: 'bg-emerald-50/60 dark:bg-emerald-950/20',
          dot: 'bg-emerald-500',
          title: 'Tutto sotto controllo',
          msg: 'La pipeline sta lavorando correttamente. R2 archivia i file in tempo reale, Nextcloud si sincronizza in background.',
        }
      : health === 'yellow'
        ? {
            ring: 'ring-amber-500/30',
            bg: 'bg-amber-50/60 dark:bg-amber-950/20',
            dot: 'bg-amber-500',
            title: 'Da tenere d’occhio',
            msg: `Backlog o errori sopra la norma (backlog: ${backlog}, errori: ${erroriTot}). I file sono al sicuro su R2 ma la copia su Nextcloud è in ritardo.`,
          }
        : {
            ring: 'ring-destructive/30',
            bg: 'bg-destructive/5',
            dot: 'bg-destructive',
            title: 'Intervento richiesto',
            msg: `Backlog elevato (${backlog}) o errori frequenti (${erroriTot}). Esegui "Esegui batch ora" e controlla i sync_failed. Niente è perso: i file sono su R2.`,
          };

  return (
    <div
      className={`flex flex-col gap-4 rounded-lg p-4 ring-1 ${palette.bg} ${palette.ring}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-3 w-3 shrink-0 items-center justify-center rounded-full ${palette.dot}`}
          aria-hidden="true"
        >
          {health !== 'green' ? (
            <span className={`h-3 w-3 animate-ping rounded-full ${palette.dot} opacity-60`} />
          ) : null}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{palette.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{palette.msg}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] tabular-nums text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">{pctSynced}%</span> già
              su Nextcloud
              <span className="ml-1 text-muted-foreground/70">
                (synced / non-deleted)
              </span>
            </span>
            <span>
              <Sparkles className="-mt-0.5 mr-0.5 inline h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              <span className="font-medium text-foreground">{pctThumb}%</span> thumb
              generate
              <span className="ml-1 text-muted-foreground/70">
                ({imagesWithThumb.toLocaleString('it-IT')} ok
                {imagesWithoutThumb > 0
                  ? ` · ${imagesWithoutThumb.toLocaleString('it-IT')} da rigenerare`
                  : ''}
                )
              </span>
            </span>
          </div>
        </div>
      </div>

      <details className="group rounded-md border border-border/60 bg-background/50">
        <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium">
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
          Cosa significano gli stati? — clicca per la legenda
        </summary>
        <div className="space-y-2 border-t border-border/60 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
          <LegendItem
            icon={<ArrowUpFromLine className="h-3.5 w-3.5 text-muted-foreground" />}
            label="uploading"
            description="Il client sta ancora caricando il file su R2 (presigned URL emesso). Se resta a lungo qui: probabilmente connessione cliente lenta o tab chiusa a metà."
          />
          <LegendItem
            icon={<ArrowUpFromLine className="h-3.5 w-3.5 text-primary" />}
            label="uploaded"
            description="Il file è ARRIVATO SU R2 ed è già al sicuro (durabilità 11×9). L'utente può andare avanti. La copia su Nextcloud arriverà col prossimo batch (cron */10min)."
          />
          <LegendItem
            icon={<Loader2 className="h-3.5 w-3.5 text-primary" />}
            label="syncing"
            description="Il worker sta copiando il file da R2 a Nextcloud. Stato transitorio."
          />
          <LegendItem
            icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
            label="synced"
            description="Tutto a posto: il file è sia su R2 che su Nextcloud. Nextcloud è la source of truth aziendale."
          />
          <LegendItem
            icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
            label="sync_failed"
            description="L'ultimo tentativo di copia su Nextcloud è fallito (rete, permessi, quota). Il file è comunque su R2 e l'app continua a servirlo. 'Re-sync' o 'Esegui batch ora' ritentano."
          />
          <LegendItem
            icon={<XCircle className="h-3.5 w-3.5 text-destructive" />}
            label="failed"
            description="L'upload su R2 non si è mai concluso (sessione abortita, MAX_ATTEMPTS esauriti). Stato terminale: il file non è disponibile, ma non c'è nulla da recuperare."
          />
          <LegendItem
            icon={<Trash2 className="h-3.5 w-3.5 text-muted-foreground" />}
            label="deleted"
            description="Soft delete dell'app. Il record resta per audit; la pulizia R2 effettiva arriverà in Fase 3."
          />
          <LegendItem
            icon={<Sparkles className="h-3.5 w-3.5 text-emerald-600" />}
            label="thumb"
            description="Solo immagini: il file ha una miniatura 400x400 webp persistente su R2 (~30 KB) usata dalle gallerie per essere reattive. Il flag 'no thumb' su un file recente vuol dire che la generazione è fallita: l'app continua a funzionare ricadendo sul full-size, ma la galleria sarà più lenta su quel file."
          />
        </div>
      </details>
    </div>
  );
}

function LegendItem({
  icon,
  label,
  description,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
}) {
  return (
    <div className="grid grid-cols-[16px_120px_1fr] items-start gap-2">
      <span className="mt-px">{icon}</span>
      <Badge variant="outline" className="font-mono text-[10px]">
        {label}
      </Badge>
      <p className="text-foreground/80">{description}</p>
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
