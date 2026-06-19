import { HardDrive, CheckCircle2, XCircle, Server } from 'lucide-react';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  KpiCard,
} from '@kommessa/ui';
import { requirePlatformAdmin } from '../_lib/guard';
import { SectionHeader } from '../../_components/section-header';
import { r2EnvStatus, testR2Connection, listR2Tenants } from '../_actions/storage-r2';
import { RetestButton } from './_components/retest-button';

export const metadata = { title: 'Platform · Storage R2' };
export const dynamic = 'force-dynamic';

export default async function StorageR2Page() {
  await requirePlatformAdmin();

  const [envStatus, connResult, tenants] = await Promise.all([
    r2EnvStatus(),
    testR2Connection(),
    listR2Tenants(),
  ]);

  const envVars = [
    {
      label: 'Account ID',
      env: 'R2_ACCOUNT_ID',
      set: envStatus.accountId.set,
      value: envStatus.accountId.value,
    },
    {
      label: 'Bucket',
      env: 'R2_BUCKET',
      set: envStatus.bucket.set,
      value: envStatus.bucket.value,
    },
    {
      label: 'Endpoint',
      env: 'R2_ENDPOINT',
      set: envStatus.endpoint.set,
      value: envStatus.endpoint.value || '(default derivato da accountId)',
    },
    {
      label: 'Access Key ID',
      env: 'R2_ACCESS_KEY_ID',
      set: envStatus.accessKeyId.set,
      value: envStatus.accessKeyId.value,
    },
    {
      label: 'Secret Access Key',
      env: 'R2_SECRET_ACCESS_KEY',
      set: envStatus.secretAccessKey.set,
      value: undefined,
    },
  ] as const;

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Platform"
        title="Storage R2"
        description="Stato dello storage Cloudflare R2 condiviso e tenant configurati."
        icon={<HardDrive />}
        actions={<RetestButton />}
      />

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          label="Stato connessione"
          value={connResult.ok ? 'Connesso' : 'Errore'}
          tone={connResult.ok ? 'success' : 'critical'}
          icon={connResult.ok ? <CheckCircle2 /> : <XCircle />}
          hint={
            connResult.ok
              ? `Latenza: ${connResult.latencyMs} ms`
              : 'Controllare config env'
          }
        />
        <KpiCard
          label="Bucket"
          value={connResult.ok ? connResult.bucket : (envStatus.bucket.value || '—')}
          tone="default"
          icon={<Server />}
          hint="Bucket condiviso tra i tenant"
        />
        <KpiCard
          label="Tenant su R2"
          value={tenants.length}
          tone="default"
          icon={<HardDrive />}
          hint={tenants.length === 0 ? 'Nessun tenant su R2' : `${tenants.length} tenant con provider R2`}
        />
      </div>

      {/* Error card — only when connection fails */}
      {!connResult.ok && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              Connessione R2 fallita
            </CardTitle>
            <CardDescription className="text-destructive/80">
              Il probe ListObjects non ha avuto successo. Verificare le variabili d&apos;ambiente e le permission del bucket.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 font-mono text-xs text-destructive">
              {connResult.error}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Env config card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configurazione (env)</CardTitle>
          <CardDescription>
            R2 e gestito a livello applicativo tramite variabili d&apos;ambiente. I tenant sono isolati
            per prefisso: <code className="font-mono text-xs">tenants/{'{slug}'}/</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {envVars.map((v) => (
              <div
                key={v.env}
                className="flex items-center gap-3 px-4 py-3"
              >
                {v.set ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium tracking-tight">{v.label}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {v.env}
                  </p>
                </div>
                {v.value !== undefined ? (
                  <span className="max-w-[260px] truncate text-right font-mono text-xs text-muted-foreground">
                    {v.value}
                  </span>
                ) : null}
                <Badge
                  variant={v.set ? 'outline' : 'destructive'}
                  className={
                    v.set
                      ? 'shrink-0 border-success/30 text-success'
                      : 'shrink-0'
                  }
                >
                  {v.set ? 'impostata' : 'mancante'}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tenants card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tenant su R2</CardTitle>
          <CardDescription>
            Tenant con <code className="font-mono text-xs">storage_provider = r2</code>.
            Il conteggio oggetti e best-effort (cap a 1000 per prefisso).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {tenants.length === 0 ? (
            <div className="flex items-center justify-center px-4 py-10 text-sm text-muted-foreground">
              Nessun tenant su R2
            </div>
          ) : (
            <div className="divide-y divide-border">
              {tenants.map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <HardDrive className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium tracking-tight">{t.nome}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {t.prefix}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {t.capped ? '1000+' : t.objects} oggetti
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-right font-mono text-[11px] text-muted-foreground">
        Ultimo aggiornamento:{' '}
        {new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}
      </p>
    </div>
  );
}
