import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Info,
  Settings as SettingsIcon,
} from 'lucide-react';

import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import {
  Card,
  CardContent,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from '@kommessa/ui';

import { SectionHeader } from '../../_components/section-header';
import { EmptyState } from '../../_components/empty-state';
import {
  ALERT_DEFAULTS,
  computeAlerts,
  loadAlertSettings,
  type AlertItem,
  type AlertType,
} from '../../_lib/alerts';
import { AlertSettingsForm } from './_components/alert-settings-form';
import { StoricoNotifiche } from './_components/storico-notifiche';

export const metadata = { title: 'Avvisi' };
export const dynamic = 'force-dynamic';

interface SearchParams {
  tab?: 'avvisi' | 'storico' | 'impostazioni';
}

export default async function NotifichePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ctx = await requireTenantContext();
  const tab = searchParams.tab ?? 'avvisi';
  const supabase = createServerSupabase();

  // Carica tutto in parallelo: alert computati, storico notifiche, settings
  const [alerts, notifRes, settings] = await Promise.all([
    computeAlerts(ctx.tenantId),
    supabase
      .from('notifiche')
      .select('id, type, payload, read_at, created_at')
      .eq('user_id', ctx.userId)
      .order('created_at', { ascending: false })
      .limit(100),
    loadAlertSettings(ctx.tenantId),
  ]);

  const storico = (notifRes.data ?? []) as Array<{
    id: string;
    type: string;
    payload: Record<string, unknown> | null;
    read_at: string | null;
    created_at: string;
  }>;

  const alertsBySeverity = {
    critical: alerts.filter((a) => a.severity === 'critical'),
    warning: alerts.filter((a) => a.severity === 'warning'),
    info: alerts.filter((a) => a.severity === 'info'),
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <SectionHeader
        eyebrow="Comunicazioni"
        title="Avvisi e notifiche"
        description="Allerte automatiche su commesse ferme, foto mancanti, TODO scaduti — più lo storico delle notifiche evento."
        icon={<Bell />}
      />

      <Tabs defaultValue={tab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="avvisi">
            Avvisi attivi
            {alerts.length > 0 ? (
              <span className="ml-1.5 rounded-full bg-destructive/10 px-1.5 py-0 font-mono text-[10px] font-semibold text-destructive">
                {alerts.length}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="storico">Storico notifiche</TabsTrigger>
          <TabsTrigger value="impostazioni">
            <SettingsIcon className="h-3.5 w-3.5" />
            Impostazioni
          </TabsTrigger>
        </TabsList>

        {/* ─── Tab AVVISI ────────────────────────────────────────────── */}
        <TabsContent value="avvisi" className="space-y-3">
          {alerts.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              tone="primary"
              title="Tutto in ordine"
              description="Nessun avviso attivo al momento. Buon lavoro!"
            />
          ) : (
            <>
              {alertsBySeverity.critical.length > 0 ? (
                <AlertGroup
                  label="Critici"
                  items={alertsBySeverity.critical}
                  severity="critical"
                />
              ) : null}
              {alertsBySeverity.warning.length > 0 ? (
                <AlertGroup
                  label="Attenzione"
                  items={alertsBySeverity.warning}
                  severity="warning"
                />
              ) : null}
              {alertsBySeverity.info.length > 0 ? (
                <AlertGroup
                  label="Informativi"
                  items={alertsBySeverity.info}
                  severity="info"
                />
              ) : null}
            </>
          )}
        </TabsContent>

        {/* ─── Tab STORICO ──────────────────────────────────────────── */}
        <TabsContent value="storico" className="space-y-2">
          {storico.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="Nessuna notifica"
              description="Quando arriverà un evento (assegnazione ticket, ecc.) lo troverai qui."
            />
          ) : (
            <StoricoNotifiche rows={storico} />
          )}
        </TabsContent>

        {/* ─── Tab IMPOSTAZIONI ─────────────────────────────────────── */}
        <TabsContent value="impostazioni">
          <AlertSettingsForm
            initial={settings}
            canEdit={ctx.role === 'admin' || ctx.role === 'office'}
            defaults={ALERT_DEFAULTS}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AlertGroup({
  label,
  items,
  severity,
}: {
  label: string;
  items: AlertItem[];
  severity: 'critical' | 'warning' | 'info';
}) {
  const sevMeta = {
    critical: {
      border: 'border-destructive/30',
      bg: 'bg-destructive/5',
      Icon: AlertCircle,
      iconCls: 'text-destructive',
      pillCls: 'bg-destructive/15 text-destructive',
    },
    warning: {
      border: 'border-amber-500/30',
      bg: 'bg-amber-500/5',
      Icon: AlertTriangle,
      iconCls: 'text-amber-700 dark:text-amber-400',
      pillCls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    },
    info: {
      border: 'border-blue-500/30',
      bg: 'bg-blue-500/5',
      Icon: Info,
      iconCls: 'text-blue-700 dark:text-blue-400',
      pillCls: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
    },
  }[severity];
  const Icon = sevMeta.Icon;
  return (
    <div className="space-y-2">
      <h2 className="flex items-center gap-1.5 px-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <Icon className={cn('h-3.5 w-3.5', sevMeta.iconCls)} />
        {label}
        <span
          className={cn(
            'rounded-full px-1.5 py-0 font-sans text-[10px] font-semibold',
            sevMeta.pillCls,
          )}
        >
          {items.length}
        </span>
      </h2>
      <Card className={cn(sevMeta.border, sevMeta.bg)}>
        <CardContent className="divide-y divide-border/50 p-0">
          {items.map((a, i) => (
            <AlertRow key={`${a.type}-${i}`} alert={a} sevMeta={sevMeta} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function AlertRow({
  alert,
  sevMeta,
}: {
  alert: AlertItem;
  sevMeta: { iconCls: string };
}) {
  const labelType = ALERT_DEFAULTS[alert.type].label;
  const body = (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{alert.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{alert.description}</p>
        <p className="mt-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {labelType}
          {alert.ref ? <span>· {alert.ref}</span> : null}
        </p>
      </div>
    </div>
  );
  return alert.href ? (
    <Link href={alert.href} className="block transition-colors hover:bg-card/50">
      {body}
    </Link>
  ) : (
    body
  );
}

// suppress unused
void Info;
void cn;
