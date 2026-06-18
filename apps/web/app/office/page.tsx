import Link from 'next/link';
import { Suspense } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  StatoBadge,
} from '@kommessa/ui';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  Bell,
  Briefcase,
  Calendar,
  Camera,
  CheckCircle2,
  CircleDot,
  Clock,
  FileWarning,
  Flame,
  Sparkles,
} from 'lucide-react';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContextCached as requireTenantContext } from '../_lib/tenant-cache';
import { SectionHeader } from '../_components/section-header';
import { EmptyState } from '../_components/empty-state';
import { getCommesseARischio, getDashboardKpis, getUltimaAttivita } from './_lib/queries';
import { descriviAuditEvent, fmtData, fmtDataOra, fmtOra } from './_lib/format';
import { computeAlerts } from '../_lib/alerts';

export const metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

function salutoOrario(d: Date): string {
  const h = d.getHours();
  if (h < 6) return 'Buonanotte';
  if (h < 12) return 'Buongiorno';
  if (h < 18) return 'Buon pomeriggio';
  return 'Buonasera';
}

export default async function DashboardPage() {
  const ctx = await requireTenantContext();
  const now = new Date();
  const nome = ctx.email ? ctx.email.split('@')[0] : '';
  const oggi = now.toLocaleDateString('it-IT', {
    timeZone: 'Europe/Rome',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      {/* ===== Hero greeting compatto ===== */}
      <header className="relative flex flex-wrap items-center justify-between gap-2 overflow-hidden rounded-lg border border-border bg-aurora-brand px-4 py-2.5 shadow-soft">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-0.5 border-brand-line"
        />
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h1 className="text-lg font-semibold tracking-tight">
            {salutoOrario(now)}
            {nome ? (
              <>
                ,{' '}
                <span className="text-brand-grad capitalize">{nome}</span>
              </>
            ) : (
              ''
            )}
          </h1>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {oggi}
          </p>
        </div>
        <p className="hidden text-xs text-muted-foreground sm:block">
          Commesse, collaudi e attività del team in un colpo d&apos;occhio.
        </p>
      </header>

      {/* ===== KPI ===== */}
      <section className="space-y-3">
        <SectionEyebrow icon={<Activity className="h-3.5 w-3.5" />}>
          Sintesi operativa
        </SectionEyebrow>
        <Suspense fallback={<KpiSkeleton />}>
          <KpiSection />
        </Suspense>
      </section>

      {/* ===== Riga principale: Commesse in lavorazione (2/3) + TODO (1/3) ===== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="space-y-3 stagger lg:col-span-2">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <SectionHeader
              eyebrow="Commesse"
              title="Commesse in lavorazione"
              description="Lavori in corso o in collaudo da seguire."
              icon={<Briefcase />}
            />
            <Button asChild variant="ghost" size="sm">
              <Link href="/office/commesse">
                Vedi tutte
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
          <Suspense fallback={<RiskSkeleton />}>
            <RiskSection />
          </Suspense>
        </section>

        <section className="space-y-3">
          <SectionHeader
            eyebrow="Lavori"
            title="TODO urgenti aperti"
            description="Priorità alta/urgente o scadute, su tutte le commesse attive."
            icon={<CircleDot />}
          />
          <Suspense fallback={<TodoUrgentiSkeleton />}>
            <TodoUrgentiSection />
          </Suspense>
        </section>
      </div>

      {/* ===== Riga secondaria: Avvisi + Ultima attività affiancati ===== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <SectionHeader
              eyebrow="Avvisi"
              title="Cose da gestire"
              description="Commesse ferme, foto sopralluogo mancanti, TODO scaduti."
              icon={<Bell />}
            />
            <Button asChild variant="ghost" size="sm">
              <Link href="/office/notifiche">
                Tutti
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
          <Suspense fallback={<TodoUrgentiSkeleton />}>
            <AvvisiTopSection />
          </Suspense>
        </section>

        <section className="space-y-3">
          <SectionHeader
            eyebrow="Attività"
            title="Ultima attività"
            description="Eventi recenti del tenant, dal più recente."
            icon={<Sparkles />}
          />
          <Suspense fallback={<TimelineSkeleton />}>
            <TimelineSection />
          </Suspense>
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bits                                                                */
/* ------------------------------------------------------------------ */

function SectionEyebrow({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
        {icon ? <span aria-hidden>{icon}</span> : null}
        {children}
      </p>
      <div aria-hidden className="h-px flex-1 bg-gradient-to-r from-border via-border to-transparent" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* KPI                                                                 */
/* ------------------------------------------------------------------ */

async function KpiSection() {
  const ctx = await requireTenantContext();
  const kpi = await getDashboardKpis(ctx);

  return (
    <div className="stagger grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      <KpiMini
        label="Commesse aperte"
        value={kpi.commesseAperte}
        icon={<Briefcase />}
        tone="default"
        hint="In corso · collaudo"
      />
      <KpiMini
        label="Fasi ferme > 3 gg"
        value={kpi.fasiInAttesa}
        icon={<Clock />}
        tone={kpi.fasiInAttesa > 0 ? 'warning' : 'default'}
        hint={kpi.fasiInAttesa > 0 ? 'Da rivedere' : 'In regola'}
      />
      <KpiMini
        label="Foto oggi"
        value={kpi.fotoOggi}
        icon={<Camera />}
        tone="success"
        hint="Dal cantiere"
      />
      <KpiMini
        label="DICO ≤ 7 gg"
        value={kpi.dicoScadenza}
        icon={<FileWarning />}
        tone={kpi.dicoScadenza > 0 ? 'critical' : 'default'}
        hint={kpi.dicoScadenza > 0 ? 'Da verificare' : 'Nessuna'}
      />
    </div>
  );
}

const KPI_TONE: Record<
  'default' | 'warning' | 'success' | 'critical',
  { bar: string; icon: string; value: string }
> = {
  default: { bar: 'bg-primary', icon: 'bg-primary-soft text-primary', value: 'text-foreground' },
  warning: { bar: 'bg-accent', icon: 'bg-accent-soft text-accent-soft-foreground', value: 'text-foreground' },
  success: { bar: 'bg-success', icon: 'bg-success/10 text-success', value: 'text-foreground' },
  critical: { bar: 'bg-destructive', icon: 'bg-destructive/10 text-destructive', value: 'text-destructive' },
};

/** KPI compatto per la dashboard: una riga, niente blocchi alti. */
function KpiMini({
  label,
  value,
  icon,
  hint,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  hint?: string;
  tone?: keyof typeof KPI_TONE;
}) {
  const t = KPI_TONE[tone];
  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-lg border border-border bg-card px-3 py-2.5 shadow-soft">
      <span aria-hidden className={`absolute inset-y-2 left-0 w-[2px] rounded-full ${t.bar}`} />
      <span
        aria-hidden
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md [&_svg]:h-4 [&_svg]:w-4 ${t.icon}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className={`font-mono text-2xl font-medium leading-none tabular-nums ${t.value}`}>
          {value}
        </p>
        <p className="mt-1 truncate text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
          {hint ? <span className="normal-case tracking-normal"> · {hint}</span> : null}
        </p>
      </div>
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-[4.25rem] rounded-lg" />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Risk                                                                */
/* ------------------------------------------------------------------ */

async function RiskSection() {
  const rows = await getCommesseARischio();
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        tone="primary"
        title="Nessuna commessa in lavorazione"
        description="Non ci sono commesse in corso o in collaudo al momento."
      />
    );
  }
  return (
    <div className="grid grid-cols-1 gap-2.5 2xl:grid-cols-2">
      {rows.map((c: any) => {
        const inCollaudo = c.stato === 'collaudo';
        const cliente = Array.isArray(c.cliente) ? c.cliente[0] : c.cliente;
        const resp = Array.isArray(c.responsabile) ? c.responsabile[0] : c.responsabile;
        return (
          <Card
            key={c.id}
            className="group relative overflow-hidden transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-soft-md"
          >
            <span
              aria-hidden
              className={
                'absolute inset-y-3 left-0 w-[3px] rounded-full ' +
                (inCollaudo ? 'bg-accent' : 'bg-primary')
              }
            />
            <CardContent className="flex items-center justify-between gap-4 py-3.5 pl-5 sm:pl-6">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold">
                    {c.codice_interno}
                  </span>
                  <StatoBadge stato={c.stato as any} />
                </div>
                <p className="truncate text-sm font-medium">
                  {cliente?.ragione_sociale ?? '—'}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {c.cliente_indirizzo_cantiere ?? 'Indirizzo non specificato'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Resp: {resp?.display_name ?? '—'} · aperta il {fmtData(c.data_apertura)}
                </p>
              </div>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="shrink-0 group-hover:border-primary/40 group-hover:text-primary"
              >
                <Link href={`/office/commesse/${c.id}`}>
                  Apri
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function RiskSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-[5.5rem] rounded-lg" />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Timeline                                                            */
/* ------------------------------------------------------------------ */

async function TimelineSection() {
  const events = await getUltimaAttivita(8);
  if (events.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="Nessuna attività recente"
        description="Quando il team inizierà a lavorare comparirà qui il flusso di eventi in tempo reale."
      />
    );
  }
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm uppercase tracking-[0.14em] text-muted-foreground">
          Eventi recenti
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <ol className="relative space-y-5 pl-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-border">
          {events.map((e: any) => (
            <li key={e.id} className="relative">
              <span
                aria-hidden
                className="absolute -left-4 top-1.5 inline-block h-2.5 w-2.5 rounded-full bg-primary-soft ring-2 ring-primary"
              />
              <div className="flex flex-col gap-0.5 text-sm sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <p className="text-foreground">{descriviAuditEvent(e)}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {fmtOra(e.created_at)} · {fmtDataOra(e.created_at)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* TODO urgenti cross-commesse                                         */
/* ------------------------------------------------------------------ */

async function TodoUrgentiSection() {
  const supabase = createServerSupabase();
  // Carica tutti i TODO aperti/in_corso del tenant, sort lato JS per
  // priorità + scadenza. RLS limita al tenant corrente.
  const { data } = await supabase
    .from('commessa_todo' as never)
    .select(
      `id, titolo, priorita, scadenza_at, stato, commessa_id, assegnato_a,
       commessa:commesse!commessa_todo_commessa_id_fkey ( codice_interno, cliente:clienti ( ragione_sociale ) ),
       assegnato:users!commessa_todo_assegnato_a_fkey ( display_name )`,
    )
    .in('stato', ['aperto', 'in_corso'])
    .limit(200);

  const now = Date.now();
  type Row = {
    id: string;
    titolo: string;
    priorita: 'bassa' | 'media' | 'alta' | 'urgente';
    scadenza_at: string | null;
    commessa_id: string;
    codice_interno: string | null;
    cliente_nome: string | null;
    assegnato_nome: string | null;
    isScaduto: boolean;
  };
  const priOrder: Record<Row['priorita'], number> = {
    urgente: 0,
    alta: 1,
    media: 2,
    bassa: 3,
  };
  const rows: Row[] = ((data ?? []) as Array<any>)
    .map((t) => {
      const comm = Array.isArray(t.commessa) ? t.commessa[0] : t.commessa;
      const cli = comm
        ? Array.isArray(comm.cliente)
          ? comm.cliente[0]
          : comm.cliente
        : null;
      const ass = Array.isArray(t.assegnato) ? t.assegnato[0] : t.assegnato;
      return {
        id: t.id as string,
        titolo: t.titolo as string,
        priorita: t.priorita as Row['priorita'],
        scadenza_at: (t.scadenza_at as string | null) ?? null,
        commessa_id: t.commessa_id as string,
        codice_interno: (comm?.codice_interno as string | undefined) ?? null,
        cliente_nome: (cli?.ragione_sociale as string | undefined) ?? null,
        assegnato_nome: (ass?.display_name as string | undefined) ?? null,
        isScaduto: t.scadenza_at
          ? new Date(t.scadenza_at as string).getTime() < now
          : false,
      };
    })
    // Mostriamo solo quelli "urgenti": priorità alta/urgente o scaduti.
    .filter((r) => r.isScaduto || r.priorita === 'alta' || r.priorita === 'urgente')
    .sort((a, b) => {
      if (a.isScaduto !== b.isScaduto) return a.isScaduto ? -1 : 1;
      const pa = priOrder[a.priorita];
      const pb = priOrder[b.priorita];
      if (pa !== pb) return pa - pb;
      return a.titolo.localeCompare(b.titolo, 'it');
    })
    .slice(0, 12);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        tone="primary"
        title="Tutto in ordine"
        description="Nessun TODO urgente o scaduto al momento. Buon lavoro!"
      />
    );
  }

  const META: Record<Row['priorita'], { chip: string; Icon: typeof Flame }> = {
    urgente: {
      chip: 'bg-red-500/15 text-red-700 border-red-500/40 dark:text-red-400',
      Icon: Flame,
    },
    alta: {
      chip: 'bg-amber-500/15 text-amber-700 border-amber-500/40 dark:text-amber-400',
      Icon: AlertCircle,
    },
    media: {
      chip: 'bg-blue-500/15 text-blue-700 border-blue-500/40',
      Icon: Clock,
    },
    bassa: {
      chip: 'bg-muted text-muted-foreground border-border',
      Icon: Clock,
    },
  };

  return (
    <Card>
      <CardContent className="divide-y divide-border p-0">
        {rows.map((r) => {
          const m = META[r.priorita];
          const Icon = m.Icon;
          return (
            <Link
              key={r.id}
              href={`/office/commesse/${r.commessa_id}/lavori`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
            >
              <span
                className={[
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border',
                  m.chip,
                ].join(' ')}
              >
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.titolo}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  {r.codice_interno ? (
                    <span className="font-mono tabular-nums">{r.codice_interno}</span>
                  ) : null}
                  {r.cliente_nome ? <span>· {r.cliente_nome}</span> : null}
                  {r.assegnato_nome ? <span>· {r.assegnato_nome}</span> : null}
                  {r.scadenza_at ? (
                    <span className={r.isScaduto ? 'font-semibold text-destructive' : ''}>
                      <Calendar className="mr-0.5 inline h-3 w-3" />
                      {fmtData(r.scadenza_at)}
                    </span>
                  ) : null}
                </p>
              </div>
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}

function TodoUrgentiSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-3 flex-1 rounded-full" />
            <Skeleton className="h-3 w-24 rounded-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Avvisi top — preview alert computati dal compute helper             */
/* ------------------------------------------------------------------ */

async function AvvisiTopSection() {
  const ctx = await requireTenantContext();
  const alerts = await computeAlerts(ctx.tenantId);
  if (alerts.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        tone="primary"
        title="Nessun avviso attivo"
        description="Commesse seguite, foto sopralluogo presenti, TODO sotto controllo."
      />
    );
  }
  // Mostra i primi 5 (critical → warning → info)
  const top = alerts.slice(0, 5);
  return (
    <Card>
      <CardContent className="divide-y divide-border p-0">
        {top.map((a, i) => {
          const sev = {
            critical: {
              cls: 'text-destructive',
              Icon: AlertCircle,
              pill: 'bg-destructive/15 text-destructive',
            },
            warning: {
              cls: 'text-amber-700 dark:text-amber-400',
              Icon: AlertTriangle,
              pill: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
            },
            info: {
              cls: 'text-blue-700 dark:text-blue-400',
              Icon: Activity,
              pill: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
            },
          }[a.severity];
          const Icon = sev.Icon;
          const body = (
            <div className="flex items-start gap-3 px-4 py-3">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${sev.cls}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {a.title}
                  {a.ref ? (
                    <span className="font-mono text-xs text-muted-foreground">
                      · {a.ref}
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {a.description}
                </p>
              </div>
              {a.href ? (
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : null}
            </div>
          );
          return a.href ? (
            <Link
              key={`${a.type}-${i}`}
              href={a.href}
              className="block transition-colors hover:bg-muted/40"
            >
              {body}
            </Link>
          ) : (
            <div key={`${a.type}-${i}`}>{body}</div>
          );
        })}
        {alerts.length > 5 ? (
          <Link
            href="/office/notifiche"
            className="flex items-center justify-center gap-1 px-4 py-2 text-xs font-medium text-primary hover:bg-muted/40"
          >
            Vedi tutti gli avvisi ({alerts.length})
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TimelineSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-4 py-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-2.5 w-2.5 rounded-full" />
            <Skeleton className="h-3 flex-1 rounded-full" />
            <Skeleton className="h-3 w-24 rounded-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
