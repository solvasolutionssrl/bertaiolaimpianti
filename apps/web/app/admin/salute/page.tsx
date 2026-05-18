import { HeartPulse, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { Badge, Card, CardContent } from '@impiantixplus/ui';
import { createServiceSupabase } from '@impiantixplus/api/service';
import { requirePlatformAdmin } from '../_lib/guard';
import { SectionHeader } from '../../_components/section-header';

export const metadata = { title: 'Platform · Salute sistema' };
export const dynamic = 'force-dynamic';

type Stato = 'OK' | 'WARN' | 'FAIL';

interface Check {
  id: string;
  label: string;
  descrizione: string;
  stato: Stato;
  dettaglio?: string;
}

export default async function SalutePage() {
  await requirePlatformAdmin();
  const supabase = createServiceSupabase();
  const checks: Check[] = [];

  // ----- 1. Supabase DB ping -----
  const t0 = Date.now();
  const { error: pingErr } = await supabase
    .from('plans')
    .select('id', { count: 'exact', head: true });
  const dbMs = Date.now() - t0;
  checks.push({
    id: 'db',
    label: 'Supabase Postgres',
    descrizione: 'Connessione DB + RLS plans',
    stato: pingErr ? 'FAIL' : dbMs > 800 ? 'WARN' : 'OK',
    dettaglio: pingErr ? pingErr.message : `${dbMs} ms`,
  });

  // ----- 2. Service-role key -----
  checks.push({
    id: 'serviceRole',
    label: 'SUPABASE_SERVICE_ROLE_KEY',
    descrizione: 'Chiave admin per operazioni cross-tenant',
    stato: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'OK' : 'FAIL',
    dettaglio: process.env.SUPABASE_SERVICE_ROLE_KEY
      ? 'Presente'
      : 'Assente — le mutazioni admin falliranno',
  });

  // ----- 3. Resend env -----
  checks.push({
    id: 'resend',
    label: 'Resend',
    descrizione: 'Email transazionali (notifiche + invite SMTP custom)',
    stato: process.env.RESEND_API_KEY ? 'OK' : 'WARN',
    dettaglio: process.env.RESEND_API_KEY
      ? 'API key configurata'
      : 'RESEND_API_KEY assente — fallback su Supabase Auth SMTP',
  });

  // ----- 4. Anthropic env -----
  checks.push({
    id: 'anthropic',
    label: 'Anthropic Claude',
    descrizione: 'Co-pilot AI per descrizioni commesse',
    stato: process.env.ANTHROPIC_API_KEY ? 'OK' : 'WARN',
    dettaglio: process.env.ANTHROPIC_API_KEY
      ? 'API key configurata'
      : 'ANTHROPIC_API_KEY assente — Co-pilot disabilitato',
  });

  // ----- 5. Storage provider per ogni tenant -----
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, slug, nome, storage_provider, storage_config, sospeso')
    .eq('sospeso', false);

  for (const t of tenants ?? []) {
    let stato: Stato = 'OK';
    let dettaglio = '';
    if (t.storage_provider === 'supabase') {
      dettaglio = 'Bucket Supabase (gestito) — nessun probe esterno';
    } else if (t.storage_provider === 'nextcloud') {
      const cfg = (t.storage_config ?? {}) as Record<string, unknown>;
      const hasBase = typeof cfg.baseUrl === 'string' && cfg.baseUrl !== '';
      const hasUser = typeof cfg.user === 'string' && cfg.user !== '';
      const hasPwd =
        typeof cfg.appPassword === 'string' && cfg.appPassword !== '';
      if (!hasBase || !hasUser || !hasPwd) {
        stato = 'WARN';
        dettaglio = `Config incompleta (baseUrl=${hasBase}, user=${hasUser}, appPassword=${hasPwd})`;
      } else {
        // probe WebDAV: PROPFIND su radice (Depth: 0). 5s timeout.
        try {
          const controller = new AbortController();
          const tid = setTimeout(() => controller.abort(), 5000);
          const auth =
            'Basic ' +
            Buffer.from(`${cfg.user}:${cfg.appPassword}`).toString('base64');
          const res = await fetch(String(cfg.baseUrl), {
            method: 'PROPFIND',
            headers: { Authorization: auth, Depth: '0' },
            signal: controller.signal,
          });
          clearTimeout(tid);
          if (res.status >= 200 && res.status < 400) {
            dettaglio = `WebDAV reachable (${res.status})`;
          } else {
            stato = 'FAIL';
            dettaglio = `HTTP ${res.status}`;
          }
        } catch (e) {
          stato = 'FAIL';
          dettaglio = `Errore probe: ${(e as Error).message}`;
        }
      }
    }
    checks.push({
      id: `storage_${t.id}`,
      label: `Storage · ${t.nome}`,
      descrizione: `Provider: ${t.storage_provider}`,
      stato,
      dettaglio,
    });
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Platform"
        title="Salute sistema"
        description="Stato dei servizi esterni e degli storage per tenant attivi."
        icon={<HeartPulse />}
      />
      <Card>
        <CardContent className="divide-y divide-border p-0">
          {checks.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 px-4 py-3"
            >
              <StatoIcona stato={c.stato} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium tracking-tight">{c.label}</p>
                <p className="text-xs text-muted-foreground">{c.descrizione}</p>
              </div>
              <span className="text-right font-mono text-xs text-muted-foreground">
                {c.dettaglio}
              </span>
              <StatoBadge stato={c.stato} />
            </div>
          ))}
        </CardContent>
      </Card>
      <p className="text-right font-mono text-[11px] text-muted-foreground">
        Ultimo check: {new Date().toLocaleString('it-IT')}
      </p>
    </div>
  );
}

function StatoIcona({ stato }: { stato: Stato }) {
  if (stato === 'OK')
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />;
  if (stato === 'WARN')
    return <AlertTriangle className="h-4 w-4 shrink-0 text-accent" />;
  return <XCircle className="h-4 w-4 shrink-0 text-destructive" />;
}

function StatoBadge({ stato }: { stato: Stato }) {
  if (stato === 'OK')
    return (
      <Badge variant="outline" className="border-success/30 text-success">
        OK
      </Badge>
    );
  if (stato === 'WARN')
    return (
      <Badge className="border-transparent bg-accent text-accent-foreground">
        WARN
      </Badge>
    );
  return <Badge variant="destructive">FAIL</Badge>;
}
