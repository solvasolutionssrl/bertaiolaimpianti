'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CircleSlash,
  FileCheck,
  Folder,
  FolderOpen,
  HelpCircle,
  Loader2,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Trash2,
  Wrench,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  cn,
} from '@kommessa/ui';

import { aggiornaTenant } from '../../../_actions/tenants';
import {
  listRemoteBasePath,
  listRemoteRoot,
  testStorageConnection,
  type StorageFolderEntry,
  type StorageTestResult,
} from '../../../_actions/storage-tools';
import {
  cancellaCartellaOrfana,
  rimettiAPostoCommessa,
  verificaCartelle,
  type CommessaCheck,
  type FolderConsistencyResult,
  type OrphanFolder,
} from '../../../_actions/folder-consistency';
import { useAlert, useConfirm } from '@/app/_components/confirm-provider';

interface Props {
  tenantId: string;
  tenantNome: string;
  storageProvider: 'supabase' | 'nextcloud' | 'r2' | null;
  storageConfig: Record<string, unknown>;
  creaCartelle?: boolean;
}

/**
 * Tab Storage del super-admin: gestione provider + diagnostica live.
 *
 * Sezioni:
 *  1. Stato salute storage (test connessione + scaffold)
 *  2. Configurazione provider (form)
 *  3. Esplora cartelle remote (per scegliere basePath)
 *  4. Contenuto basePath corrente (per verificare scaffold)
 *  5. Guida configurazione step-by-step
 *  6. FAQ
 */
export function TabStorage({
  tenantId,
  tenantNome,
  storageProvider,
  storageConfig,
  creaCartelle: creaCartelleProp,
}: Props) {
  const router = useRouter();
  const showAlert = useAlert();
  const askConfirm = useConfirm();
  const [pending, start] = React.useTransition();

  const [provider, setProvider] = React.useState<'supabase' | 'nextcloud' | 'r2'>(
    storageProvider ?? 'supabase',
  );

  const [creaCartelle, setCreaCartelle] = React.useState<boolean>(
    creaCartelleProp ?? (storageProvider !== 'r2'),
  );
  const [baseUrl, setBaseUrl] = React.useState(
    String(
      (storageConfig?.baseUrl as string) ??
        (storageConfig?.base_url as string) ??
        '',
    ),
  );
  const [user, setUser] = React.useState(
    String((storageConfig?.user as string) ?? ''),
  );
  const [pwd, setPwd] = React.useState(
    String(
      (storageConfig?.appPassword as string) ??
        (storageConfig?.app_password as string) ??
        '',
    ),
  );
  const [basePath, setBasePath] = React.useState(
    String((storageConfig?.basePath as string) ?? ''),
  );
  const [pwdTouched, setPwdTouched] = React.useState(false);
  const pwdDisplay = pwdTouched ? pwd : pwd ? '••••••••' : '';

  const dirty =
    provider !== (storageProvider ?? 'supabase') ||
    baseUrl !== String(storageConfig?.baseUrl ?? storageConfig?.base_url ?? '') ||
    user !== String(storageConfig?.user ?? '') ||
    basePath !== String(storageConfig?.basePath ?? '') ||
    pwdTouched ||
    creaCartelle !== (creaCartelleProp ?? (storageProvider !== 'r2'));

  // Health check state
  const [testing, setTesting] = React.useState(false);
  const [test, setTest] = React.useState<StorageTestResult | null>(null);

  const runTest = React.useCallback(() => {
    setTesting(true);
    void testStorageConnection({ tenantId })
      .then((r) => setTest(r))
      .finally(() => setTesting(false));
  }, [tenantId]);

  // Auto-run test al mount se il provider è già configurato
  React.useEffect(() => {
    if (storageProvider === 'nextcloud' && storageConfig?.baseUrl) {
      runTest();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSave = () => {
    start(async () => {
      const cfg: Record<string, unknown> = { ...storageConfig };
      if (provider === 'nextcloud') {
        cfg.baseUrl = baseUrl.trim();
        cfg.user = user.trim();
        if (pwdTouched) cfg.appPassword = pwd;
        const bp = basePath.trim();
        if (bp) cfg.basePath = bp.startsWith('/') ? bp : `/${bp}`;
        else delete cfg.basePath;
        delete cfg.base_url;
        delete cfg.app_password;
      } else {
        delete cfg.baseUrl;
        delete cfg.user;
        delete cfg.appPassword;
        delete cfg.basePath;
        delete cfg.base_url;
        delete cfg.app_password;
      }
      const res = await aggiornaTenant({
        tenantId,
        storage_provider: provider,
        storage_config: cfg,
        r2_config: provider === 'r2' ? {} : undefined,
        crea_cartelle: creaCartelle,
      });
      if (!res.ok) {
        await showAlert({ title: 'Errore salvataggio', body: res.error });
        return;
      }
      setPwdTouched(false);
      router.refresh();
      // ri-testa dopo il salvataggio
      runTest();
    });
  };

  return (
    <div className="space-y-4">
      {/* ─── Stato salute ──────────────────────────────────────────── */}
      <HealthCard
        provider={provider}
        testing={testing}
        result={test}
        onRetest={runTest}
      />

      {/* ─── Configurazione ───────────────────────────────────────── */}
      <Card>
        <CardContent className="space-y-5 py-5">
          <SectionTitle
            icon={<Server className="h-3.5 w-3.5" />}
            title="Provider e credenziali"
            hint="Scegli il backend di storage e (per Nextcloud) la cartella condivisa entro cui scrivere."
          />

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(
              [
                { value: 'supabase', label: 'Supabase', desc: 'Bucket S3 gestito (default, no setup)' },
                { value: 'nextcloud', label: 'Nextcloud', desc: 'WebDAV — Nextcloud / Hetzner Storage Share' },
                { value: 'r2', label: 'Cloudflare R2', desc: 'Solo R2 (senza cartelle Nextcloud)' },
              ] as const
            ).map((p) => (
              <button
                type="button"
                key={p.value}
                onClick={() => {
                  setProvider(p.value);
                  setCreaCartelle(p.value !== 'r2');
                }}
                className={cn(
                  'rounded-md border px-3 py-2.5 text-left transition-colors',
                  provider === p.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card hover:bg-muted/40',
                )}
              >
                <p className="text-sm font-semibold">{p.label}</p>
                <p className="text-xs text-muted-foreground">{p.desc}</p>
              </button>
            ))}
          </div>

          {provider === 'r2' ? (
            <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              Storage gestito (Cloudflare R2 di SOLVA). I file dei tenant sono isolati per
              prefisso{' '}
              <code className="font-mono text-xs">tenants/{'{slug}'}/ </code>
              nel bucket condiviso — nessuna credenziale da inserire.
            </div>
          ) : null}

          {provider === 'nextcloud' ? (
            <div className="space-y-4 rounded-md border border-border bg-muted/30 p-4">
              <div>
                <Label htmlFor="s_base_url">Base URL Nextcloud</Label>
                <Input
                  id="s_base_url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://nx12345.your-storageshare.de"
                  className="mt-1.5 h-10 font-mono text-xs"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Solo l'origine del server, senza
                  {' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
                    /remote.php/dav/files/&lt;user&gt;
                  </code>
                  {' '}
                  — il path WebDAV lo aggiunge il provider.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="s_user">User app Nextcloud</Label>
                  <Input
                    id="s_user"
                    value={user}
                    onChange={(e) => setUser(e.target.value)}
                    placeholder="kommessa-app"
                    className="mt-1.5 h-10"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Account dedicato all'app — non quello del cliente.
                  </p>
                </div>
                <div>
                  <Label htmlFor="s_pwd">App password</Label>
                  <Input
                    id="s_pwd"
                    type="password"
                    value={pwdDisplay}
                    onChange={(e) => {
                      setPwdTouched(true);
                      setPwd(e.target.value);
                    }}
                    placeholder={pwd ? 'lascia invariato' : 'xxxxx-xxxxx-xxxxx-xxxxx-xxxxx'}
                    className="mt-1.5 h-10 font-mono"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Generata in Nextcloud → Impostazioni → Sicurezza → Crea
                    nuova app password.
                  </p>
                </div>
              </div>

              <div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label htmlFor="s_basepath">
                      Cartella condivisa (basePath)
                    </Label>
                    <Input
                      id="s_basepath"
                      value={basePath}
                      onChange={(e) => setBasePath(e.target.value)}
                      placeholder="/Bertaiola Impianti"
                      className="mt-1.5 h-10 font-mono"
                    />
                  </div>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Sotto-cartella della home dell'utente app dentro cui creare
                  lo scaffold (01_Richieste / 02_In_Lavorazione / ecc.).
                  Tipicamente è il nome della cartella condivisa dal cliente
                  con l'utente app. Lascia vuoto per scrivere nella root della
                  home.
                </p>
              </div>
            </div>
          ) : null}

          {/* Crea struttura cartelle commessa */}
          <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border px-3 py-2.5 hover:bg-muted/30">
            <input
              type="checkbox"
              checked={creaCartelle}
              onChange={(e) => setCreaCartelle(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <span className="text-sm">Crea struttura cartelle commessa</span>
          </label>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={testing || !storageConfig?.baseUrl}
              onClick={runTest}
            >
              {testing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Test connessione
            </Button>
            <Button disabled={pending || !dirty} onClick={onSave}>
              <Save className="h-3.5 w-3.5" />
              Salva configurazione
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ─── Esplora cartelle remote ──────────────────────────────── */}
      {provider === 'nextcloud' && storageConfig?.baseUrl ? (
        <RemoteRootExplorer
          tenantId={tenantId}
          currentBasePath={basePath}
          onPickBasePath={async (name) => {
            const path = name.startsWith('/') ? name : `/${name}`;
            if (
              !(await askConfirm({
                title: `Usare "${name}" come basePath?`,
                description: `Tutte le commesse di ${tenantNome} verranno scritte dentro questa cartella su Nextcloud. La modifica entra in vigore al prossimo salva.`,
              }))
            )
              return;
            setBasePath(path);
          }}
        />
      ) : null}

      {/* ─── Contenuto basePath ───────────────────────────────────── */}
      {provider === 'nextcloud' && storageConfig?.basePath ? (
        <BasePathInspector tenantId={tenantId} />
      ) : null}

      {/* ─── Consistenza cartelle commesse ────────────────────────── */}
      {provider === 'nextcloud' && storageConfig?.basePath ? (
        <FolderConsistencyPanel tenantId={tenantId} />
      ) : null}

      {/* ─── Guida ────────────────────────────────────────────────── */}
      <GuidaSetupNextcloud />

      {/* ─── FAQ ──────────────────────────────────────────────────── */}
      <FaqStorage />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════

function SectionTitle({
  icon,
  title,
  hint,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div>
      <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {icon}
        {title}
      </h2>
      {hint ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function HealthCard({
  provider,
  testing,
  result,
  onRetest,
}: {
  provider: 'supabase' | 'nextcloud' | 'r2';
  testing: boolean;
  result: StorageTestResult | null;
  onRetest: () => void;
}) {
  if (provider === 'supabase') {
    return (
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="flex items-center gap-3 py-4">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <div className="flex-1">
            <p className="text-sm font-semibold">Provider gestito (Supabase)</p>
            <p className="text-xs text-muted-foreground">
              Nessuna configurazione manuale richiesta. Il bucket è gestito
              dalla piattaforma.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (provider === 'r2') {
    return (
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="flex items-center gap-3 py-4">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <div className="flex-1">
            <p className="text-sm font-semibold">Provider gestito (Cloudflare R2)</p>
            <p className="text-xs text-muted-foreground">
              Bucket condiviso SOLVA, prefisso per tenant — nessuna
              configurazione manuale richiesta.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (testing && !result) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Test connessione in corso…</p>
        </CardContent>
      </Card>
    );
  }

  if (!result) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-4">
          <CircleSlash className="h-5 w-5 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-sm font-semibold">Stato sconosciuto</p>
            <p className="text-xs text-muted-foreground">
              Premi "Test connessione" per sondare credenziali e basePath.
            </p>
          </div>
          <Button variant="outline" onClick={onRetest}>
            <RefreshCw className="h-3.5 w-3.5" />
            Test connessione
          </Button>
        </CardContent>
      </Card>
    );
  }

  const healthy = result.ok;
  return (
    <Card
      className={cn(
        healthy
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : result.rootReachable
            ? 'border-amber-500/30 bg-amber-500/5'
            : 'border-destructive/30 bg-destructive/5',
      )}
    >
      <CardContent className="space-y-3 py-4">
        <div className="flex items-start gap-3">
          {healthy ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
          ) : result.rootReachable ? (
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
          ) : (
            <XCircle className="mt-0.5 h-5 w-5 text-destructive" />
          )}
          <div className="flex-1">
            <p className="text-sm font-semibold">
              {healthy
                ? 'Storage OK'
                : result.rootReachable
                  ? 'Configurazione incompleta'
                  : 'Storage non raggiungibile'}
            </p>
            <p className="text-xs text-muted-foreground">
              {result.host ? (
                <>
                  Host{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
                    {result.host}
                  </code>{' '}
                  · user{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
                    {result.user}
                  </code>
                </>
              ) : (
                'Nessuna configurazione attiva'
              )}
            </p>
          </div>
          <Button variant="outline" onClick={onRetest} disabled={testing}>
            {testing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Ri-testa
          </Button>
        </div>

        {/* griglia check */}
        <div className="grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-2">
          <HealthRow
            ok={result.rootReachable}
            label="Auth + raggiungibilità host"
          />
          <HealthRow
            ok={!!result.basePath && result.basePathExists}
            label={
              result.basePath
                ? `Cartella basePath (${result.basePath})`
                : 'basePath: non configurato'
            }
            neutral={!result.basePath}
          />
          <HealthRow
            ok={result.scaffoldComplete}
            label={`Scaffold 4 cartelle (${result.scaffoldFolders.filter((f) => f.exists).length}/4)`}
            neutral={!result.basePathExists}
          />
          <HealthRow
            ok={result.basePathEntries !== null && result.basePathEntries > 0}
            label={
              result.basePathEntries !== null
                ? `${result.basePathEntries} entry nella cartella`
                : 'Contenuto basePath: n/a'
            }
            neutral={result.basePathEntries === null}
          />
        </div>

        {/* dettaglio scaffold */}
        {result.basePathExists ? (
          <div className="rounded-md border border-border bg-card/50 p-2">
            <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              Scaffold cartelle di stato
            </p>
            <div className="flex flex-wrap gap-1.5">
              {result.scaffoldFolders.map((f) => (
                <Badge
                  key={f.name}
                  variant={f.exists ? 'default' : 'outline'}
                  className={cn(
                    'font-mono text-[10px]',
                    f.exists
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-700',
                  )}
                >
                  {f.exists ? '✓' : '○'} {f.name}
                </Badge>
              ))}
            </div>
            {!result.scaffoldComplete ? (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Le cartelle mancanti vengono create automaticamente alla prima
                commessa in quello stato.
              </p>
            ) : null}
          </div>
        ) : null}

        {result.error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-[11px] text-destructive">
            <strong>Dettaglio errore:</strong> {result.error}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function HealthRow({
  ok,
  label,
  neutral = false,
}: {
  ok: boolean;
  label: string;
  neutral?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {neutral ? (
        <CircleSlash className="h-3 w-3 text-muted-foreground/50" />
      ) : ok ? (
        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
      ) : (
        <XCircle className="h-3 w-3 text-destructive" />
      )}
      <span
        className={cn(
          neutral
            ? 'text-muted-foreground'
            : ok
              ? 'text-foreground'
              : 'text-destructive',
        )}
      >
        {label}
      </span>
    </div>
  );
}

function RemoteRootExplorer({
  tenantId,
  currentBasePath,
  onPickBasePath,
}: {
  tenantId: string;
  currentBasePath: string;
  onPickBasePath: (name: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [entries, setEntries] = React.useState<StorageFolderEntry[] | null>(
    null,
  );
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    void listRemoteRoot({ tenantId })
      .then((r) => {
        if (r.ok) setEntries(r.entries);
        else setError(r.error);
      })
      .finally(() => setLoading(false));
  }, [tenantId]);

  React.useEffect(() => {
    if (open && !entries && !loading) load();
  }, [open, entries, loading, load]);

  return (
    <Card>
      <CardContent className="py-4">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between text-left"
        >
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <FolderOpen className="h-3.5 w-3.5" />
              Cartelle nella home utente app
            </h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Sfoglia la root WebDAV dell'utente app per scegliere quale
              cartella condivisa usare come basePath.
            </p>
          </div>
          <ChevronRight
            className={cn(
              'h-4 w-4 transition-transform',
              open && 'rotate-90',
            )}
          />
        </button>

        {open ? (
          <div className="mt-3 space-y-2">
            {loading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Caricamento…
              </div>
            ) : error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                {error}
              </div>
            ) : entries && entries.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nessuna cartella nella home dell'utente app.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border">
                {entries?.map((e) => {
                  const isCurrent =
                    currentBasePath === `/${e.name}` ||
                    currentBasePath === e.name;
                  return (
                    <li
                      key={e.path}
                      className="flex items-center gap-2 px-3 py-2 text-sm"
                    >
                      <Folder className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="flex-1 font-mono text-xs">
                        {e.name}
                      </span>
                      {isCurrent ? (
                        <Badge
                          variant="default"
                          className="text-[10px] uppercase tracking-wide"
                        >
                          Attiva
                        </Badge>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onPickBasePath(e.name)}
                        >
                          Imposta come basePath
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
                <RefreshCw className="h-3 w-3" />
                Ricarica
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function BasePathInspector({ tenantId }: { tenantId: string }) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<{
    basePath: string;
    entries: StorageFolderEntry[];
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    void listRemoteBasePath({ tenantId })
      .then((r) => {
        if (r.ok) setData({ basePath: r.basePath, entries: r.entries });
        else setError(r.error);
      })
      .finally(() => setLoading(false));
  }, [tenantId]);

  React.useEffect(() => {
    if (open && !data && !loading) load();
  }, [open, data, loading, load]);

  return (
    <Card>
      <CardContent className="py-4">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between text-left"
        >
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <Folder className="h-3.5 w-3.5" />
              Contenuto basePath
            </h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Vedi lo scaffold di stato e le commesse esistenti dentro la
              cartella linkata.
            </p>
          </div>
          <ChevronRight
            className={cn(
              'h-4 w-4 transition-transform',
              open && 'rotate-90',
            )}
          />
        </button>

        {open ? (
          <div className="mt-3 space-y-2">
            {loading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Caricamento…
              </div>
            ) : error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                {error}
              </div>
            ) : data && data.entries.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Cartella vuota.
              </p>
            ) : (
              <>
                <p className="text-[11px] text-muted-foreground">
                  Path:{' '}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                    {data?.basePath}
                  </code>
                </p>
                <ul className="divide-y divide-border rounded-md border border-border">
                  {data?.entries.map((e) => (
                    <li
                      key={e.path}
                      className="flex items-center gap-2 px-3 py-2 text-sm"
                    >
                      {e.isDirectory ? (
                        <Folder className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <span className="h-3.5 w-3.5 rounded-sm bg-muted" />
                      )}
                      <span className="flex-1 font-mono text-xs">
                        {e.name}
                      </span>
                      {!e.isDirectory ? (
                        <span className="text-[10px] text-muted-foreground">
                          {formatBytes(e.size)}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
                <RefreshCw className="h-3 w-3" />
                Ricarica
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function FolderConsistencyPanel({ tenantId }: { tenantId: string }) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<FolderConsistencyResult | null>(null);
  const [fixingId, setFixingId] = React.useState<string | null>(null);
  const [deletingPath, setDeletingPath] = React.useState<string | null>(null);
  const showAlert = useAlert();
  const askConfirm = useConfirm();

  const load = React.useCallback(() => {
    setLoading(true);
    void verificaCartelle({ tenantId })
      .then((r) => setResult(r))
      .finally(() => setLoading(false));
  }, [tenantId]);

  React.useEffect(() => {
    if (open && !result && !loading) load();
  }, [open, result, loading, load]);

  const fixCommessa = async (c: CommessaCheck) => {
    const ok = await askConfirm({
      title: `Riportare ${c.codice_interno} a posto?`,
      description:
        c.status === 'missing'
          ? `Crea la cartella mancante in ${c.expected_path}.`
          : `Sposta la cartella da ${c.found_in}/ a ${c.expected_folder}/. Il MOVE Nextcloud è atomico — i file dentro restano dove sono.`,
    });
    if (!ok) return;
    setFixingId(c.id);
    const res = await rimettiAPostoCommessa({ tenantId, commessaId: c.id });
    setFixingId(null);
    if (!res.ok) {
      await showAlert({ title: 'Errore', body: res.error });
      return;
    }
    load();
  };

  const deleteOrphan = async (o: OrphanFolder) => {
    const ok = await askConfirm({
      title: `Eliminare la cartella orfana "${o.name}"?`,
      description: `Path: ${o.path}. Nessuna commessa nel DB punta qui. Operazione IRREVERSIBILE — i file dentro vengono cancellati.`,
      destructive: true,
      confirmLabel: 'Elimina',
    });
    if (!ok) return;
    setDeletingPath(o.path);
    const res = await cancellaCartellaOrfana({ tenantId, path: o.path });
    setDeletingPath(null);
    if (!res.ok) {
      await showAlert({ title: 'Errore', body: res.error });
      return;
    }
    load();
  };

  return (
    <Card>
      <CardContent className="py-4">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-start justify-between gap-2 text-left"
        >
          <div className="flex-1">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <FileCheck className="h-3.5 w-3.5" />
              Stato cartelle commesse
            </h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Verifica che ogni commessa nel DB abbia la sua cartella nel
              posto giusto su Nextcloud (in base allo stato), e che non ci
              siano cartelle orfane senza commessa associata.
            </p>
            {result?.ok ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Pill ok>{result.totals.ok} OK</Pill>
                {result.totals.wrong_position > 0 ? (
                  <Pill warn>{result.totals.wrong_position} fuori posto</Pill>
                ) : null}
                {result.totals.missing > 0 ? (
                  <Pill bad>{result.totals.missing} mancanti</Pill>
                ) : null}
                {result.totals.orphans > 0 ? (
                  <Pill warn>{result.totals.orphans} orfane</Pill>
                ) : null}
              </div>
            ) : null}
          </div>
          <ChevronRight
            className={cn(
              'mt-1 h-4 w-4 shrink-0 transition-transform',
              open && 'rotate-90',
            )}
          />
        </button>

        {open ? (
          <div className="mt-4 space-y-4">
            {loading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Analisi cartelle in corso…
              </div>
            ) : !result ? null : !result.ok ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                {result.error}
              </div>
            ) : (
              <>
                {/* Tabella commesse */}
                {result.commesse.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nessuna commessa nel DB.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                          <th className="px-2 py-2 font-medium">Codice</th>
                          <th className="px-2 py-2 font-medium">Cliente</th>
                          <th className="px-2 py-2 font-medium">Stato</th>
                          <th className="px-2 py-2 font-medium">Attesa in</th>
                          <th className="px-2 py-2 font-medium">Cloud</th>
                          <th className="px-2 py-2 text-right font-medium">Azione</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {result.commesse.map((c) => (
                          <tr key={c.id}>
                            <td className="px-2 py-2 font-mono">{c.codice_interno}</td>
                            <td className="px-2 py-2">
                              {c.cliente_ragione_sociale ?? '—'}
                            </td>
                            <td className="px-2 py-2">
                              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                                {labelStato(c.stato, c.assegnata)}
                              </span>
                            </td>
                            <td className="px-2 py-2 font-mono text-[10px] text-muted-foreground">
                              {c.expected_folder}
                            </td>
                            <td className="px-2 py-2">
                              {c.status === 'ok' ? (
                                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                  <CheckCircle2 className="h-3 w-3" />
                                  OK
                                </span>
                              ) : c.status === 'wrong_position' ? (
                                <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                                  <AlertTriangle className="h-3 w-3" />
                                  in {c.found_in}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-destructive">
                                  <XCircle className="h-3 w-3" />
                                  Mancante
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-right">
                              {c.status !== 'ok' ? (
                                <button
                                  type="button"
                                  onClick={() => fixCommessa(c)}
                                  disabled={fixingId === c.id}
                                  className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-50"
                                >
                                  {fixingId === c.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Wrench className="h-3 w-3" />
                                  )}
                                  Sistema
                                </button>
                              ) : (
                                <span className="text-[10px] text-muted-foreground/40">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Sezione orfani */}
                {result.orphans.length > 0 ? (
                  <div>
                    <h3 className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-3 w-3" />
                      Cartelle orfane su cloud ({result.orphans.length})
                    </h3>
                    <p className="mb-2 text-[11px] text-muted-foreground">
                      Cartelle presenti su Nextcloud senza commessa nel DB.
                      Tipicamente residui di test o cancellazioni. Puoi
                      eliminarle — operazione irreversibile.
                    </p>
                    <ul className="divide-y divide-border rounded-md border border-amber-500/30">
                      {result.orphans.map((o) => (
                        <li
                          key={o.path}
                          className="flex items-center gap-2 px-3 py-2 text-xs"
                        >
                          <Folder className="h-3.5 w-3.5 text-muted-foreground" />
                          <code className="flex-1 font-mono">{o.path}</code>
                          <button
                            type="button"
                            onClick={() => deleteOrphan(o)}
                            disabled={deletingPath === o.path}
                            className="inline-flex items-center gap-1 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-destructive hover:bg-destructive/10 disabled:opacity-50"
                          >
                            {deletingPath === o.path ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                            Elimina
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={load}
                    disabled={loading}
                  >
                    <RefreshCw className="h-3 w-3" />
                    Ricarica
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Pill({
  children,
  ok,
  warn,
  bad,
}: {
  children: React.ReactNode;
  ok?: boolean;
  warn?: boolean;
  bad?: boolean;
}) {
  const cls = ok
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
    : warn
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
      : bad
        ? 'border-destructive/30 bg-destructive/10 text-destructive'
        : 'border-border bg-card text-muted-foreground';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider',
        cls,
      )}
    >
      {children}
    </span>
  );
}

function labelStato(stato: string, assegnata: boolean): string {
  // Label umane per gli stati commessa, con sfumatura "non preso" quando
  // lo stato è aperta/bozza e non ci sono tecnici assegnati.
  if ((stato === 'aperta' || stato === 'bozza') && !assegnata) {
    return 'Non preso';
  }
  return (
    {
      bozza: 'Bozza',
      aperta: 'Non presa',
      in_corso: 'In corso',
      collaudo: 'In collaudo',
      completata: 'Completata',
      archiviata: 'Archiviata',
    } as Record<string, string>
  )[stato] ?? stato;
}

void ArrowRight;

function GuidaSetupNextcloud() {
  return (
    <Card>
      <CardContent className="py-4">
        <details className="group">
          <summary className="flex cursor-pointer items-center justify-between">
            <div>
              <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" />
                Guida — configurare Nextcloud per un nuovo tenant
              </h2>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Procedura standard validata sul pilot Bertaiola.
              </p>
            </div>
            <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
          </summary>

          <ol className="mt-4 space-y-3 text-xs leading-relaxed">
            <GuidaStep n={1} titolo="Acquistare un'istanza Nextcloud">
              Per Hetzner: ordine{' '}
              <em>Storage Share</em> (managed) — taglio 1 TB tipicamente
              sufficiente per partire. In ~10 minuti arriva via email l'URL
              dell'istanza (es.{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                nxNNNNN.your-storageshare.de
              </code>
              ) e le credenziali admin. <strong>Login admin = cliente</strong>,
              non noi.
            </GuidaStep>

            <GuidaStep
              n={2}
              titolo="Creare un utente app dedicato (NON l'admin)"
            >
              In Nextcloud → <em>Utenti</em>: crea un utente con username tipo{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                kommessa-app
              </code>
              , gruppo standard, quota appropriata. Conserviamo la password
              iniziale a parte — useremo solo l'app password generata dopo.
              <p className="mt-1 text-muted-foreground">
                <strong>Perché:</strong> separare l'identità dell'app
                dall'admin permette al cliente di revocare l'accesso senza
                rompere la propria utenza, e mostra in audit chi ha scritto cosa.
              </p>
            </GuidaStep>

            <GuidaStep
              n={3}
              titolo="Creare la cartella condivisa nella root admin"
            >
              Login come admin del cliente. Crea una cartella con il nome del
              progetto (es.{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                Bertaiola Impianti
              </code>
              ) e condividila con l'utente app{' '}
              <strong>con permessi pieni</strong> (visualizzare + modificare +
              creare + eliminare + ricondividere).
              <p className="mt-1 text-muted-foreground">
                <strong>Perché:</strong> tutto lo storage di lavoro vive qui
                dentro. Il cliente la vede come "la sua" cartella; l'app vede
                lo stesso percorso ma via WebDAV come utente separato.
              </p>
            </GuidaStep>

            <GuidaStep n={4} titolo="Login come utente app + generare app password">
              Logout → login con l'utente app appena creato. Vai su{' '}
              <em>Impostazioni personali → Sicurezza → Sessioni e
              dispositivi</em>: alla fine della pagina c'è "Nome dispositivo"
              + bottone "Crea nuova app password". Etichetta tipo{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                kommessa-backend
              </code>
              . Nextcloud mostra la password{' '}
              <strong>una sola volta</strong> — copiala subito.
            </GuidaStep>

            <GuidaStep n={5} titolo="Verificare l'accesso WebDAV">
              Comando di prova da terminale:
              <pre className="mt-1.5 overflow-x-auto rounded-md border border-border bg-muted/40 p-2 font-mono text-[10px]">
{`curl -u 'kommessa-app:APP_PWD' \\
  -X PROPFIND -H 'Depth: 1' \\
  https://nxNNNNN.your-storageshare.de/remote.php/dav/files/kommessa-app/`}
              </pre>
              Se ricevi un XML con &lt;d:multistatus&gt; → ok. Tra le entry
              dovresti vedere il nome della cartella condivisa al passo 3.
            </GuidaStep>

            <GuidaStep n={6} titolo="Compilare il form qui sopra">
              <ul className="ml-4 list-disc space-y-1">
                <li>
                  <strong>Base URL</strong>: solo l'origine, es.{' '}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                    https://nxNNNNN.your-storageshare.de
                  </code>{' '}
                  (nessun{' '}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                    /remote.php
                  </code>
                  ).
                </li>
                <li>
                  <strong>User</strong>: l'username app (es.{' '}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                    kommessa-app
                  </code>
                  ).
                </li>
                <li>
                  <strong>App password</strong>: quella generata al passo 4.
                </li>
                <li>
                  <strong>basePath</strong>: usa il pulsante "Cartelle nella
                  home utente app" qui sopra per vederle e cliccare "Imposta
                  come basePath" su quella giusta. Oppure scrivi a mano (es.{' '}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                    /Bertaiola Impianti
                  </code>
                  ).
                </li>
              </ul>
            </GuidaStep>

            <GuidaStep n={7} titolo="Salvare e testare">
              Premi "Salva configurazione" → il test parte automatico. Tutti i
              check verdi nello stato di salute? Pronto. La prima commessa
              creerà lo scaffold (01_…/04_Archivio) dentro basePath.
            </GuidaStep>
          </ol>
        </details>
      </CardContent>
    </Card>
  );
}

function GuidaStep({
  n,
  titolo,
  children,
}: {
  n: number;
  titolo: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
        {n}
      </span>
      <div className="flex-1">
        <p className="font-semibold text-foreground">{titolo}</p>
        <div className="mt-1 text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}

function FaqStorage() {
  const faqs: Array<{ q: string; a: React.ReactNode }> = [
    {
      q: 'Cos\'è il basePath e quando va impostato?',
      a: (
        <>
          È la sotto-cartella della home WebDAV dell'utente app in cui
          scrivere. Va impostato <strong>sempre</strong> quando il cliente
          condivide una cartella dedicata (caso pilot Bertaiola). Lo lasci
          vuoto solo se l'utente app ha la sua home interamente dedicata
          all'app (raro: ti complica la vita lato condivisione col cliente).
        </>
      ),
    },
    {
      q: 'Cosa succede se cambio basePath dopo che ci sono già commesse?',
      a: (
        <>
          Le commesse <em>esistenti</em> continuano a puntare al vecchio path
          assoluto salvato in DB. Le <em>nuove</em> commesse useranno il path
          nuovo. Per migrare quelle vecchie servirebbe una procedura ad-hoc
          (move WebDAV + UPDATE file_refs) — al momento non c'è tooling.
          Imposta il basePath corretto <strong>prima</strong> di creare le
          prime commesse.
        </>
      ),
    },
    {
      q: 'Posso cambiare l\'app password senza rompere niente?',
      a: (
        <>
          Sì: in Nextcloud → Sicurezza → Sessioni: revoca la vecchia, genera
          la nuova, incolla qui sopra e salva. Non interrompe le commesse —
          tutto il pathing è basato sul username + basePath, non sulla
          password.
        </>
      ),
    },
    {
      q: 'Le 4 cartelle di stato vengono create da chi?',
      a: (
        <>
          Dall'app stessa, on-demand: alla prima commessa creata in stato{' '}
          <em>bozza/aperta</em> nasce{' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
            01_Richieste/
          </code>
          ; allo spostamento in <em>in_corso/collaudo</em> nasce{' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
            02_In_Lavorazione/
          </code>
          ; ecc. Non servono pre-create.
        </>
      ),
    },
    {
      q: 'Quanto storage serve per partire?',
      a: (
        <>
          Indicativo: 1 commessa media (foto pre/post + qualche PDF/CAD) sta
          attorno a 50–200 MB. 1 TB regge ~5.000 commesse — più che
          sufficiente per i primi 2 anni del pilot Bertaiola e per i tenant
          tipici. Lo storage Hetzner è espandibile in self-service.
        </>
      ),
    },
    {
      q: 'Cosa vede il cliente nella SUA Nextcloud?',
      a: (
        <>
          La cartella condivisa appare nella root del cliente come una sua
          cartella normale. Dentro vede esattamente la stessa struttura che
          vede l'app (01_/02_/03_/04_ + le commesse). Può aprire foto/PDF,
          rinominare (a suo rischio: l'app perde il tracciamento), scaricare.
          Niente che il cliente faccia su Nextcloud impatta il DB — è
          read-mostly per lui.
        </>
      ),
    },
    {
      q: 'Test connessione fallisce. Da dove parto?',
      a: (
        <ol className="ml-4 list-decimal space-y-0.5">
          <li>
            <strong>"Auth fallito"</strong>: app password sbagliata o user
            disabilitato → rigenera.
          </li>
          <li>
            <strong>"Host irraggiungibile"</strong>: typo nel baseUrl
            (probabile{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
              /remote.php
            </code>{' '}
            di troppo).
          </li>
          <li>
            <strong>"basePath non raggiungibile"</strong>: la cartella non è
            stata condivisa con l'utente app → ricondividila lato admin
            cliente con permessi pieni.
          </li>
        </ol>
      ),
    },
  ];

  return (
    <Card>
      <CardContent className="py-4">
        <details>
          <summary className="flex cursor-pointer items-center justify-between">
            <div>
              <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                <HelpCircle className="h-3.5 w-3.5" />
                FAQ storage
              </h2>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Risposte rapide ai casi che capitano davvero.
              </p>
            </div>
            <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
          </summary>

          <div className="mt-4 space-y-3">
            {faqs.map((f, i) => (
              <details
                key={i}
                className="rounded-md border border-border bg-card/30 px-3 py-2"
              >
                <summary className="cursor-pointer text-sm font-medium">
                  {f.q}
                </summary>
                <div className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {f.a}
                </div>
              </details>
            ))}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

