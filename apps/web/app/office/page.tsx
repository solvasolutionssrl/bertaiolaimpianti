import Link from 'next/link';
import { Suspense } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  KpiCard,
  Skeleton,
  StatoBadge,
} from '@impiantixplus/ui';
import {
  Activity,
  ArrowUpRight,
  Briefcase,
  Camera,
  CheckCircle2,
  Clock,
  FileWarning,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { requireTenantContextCached as requireTenantContext } from '../_lib/tenant-cache';
import { SectionHeader } from '../_components/section-header';
import { EmptyState } from '../_components/empty-state';
import { getCommesseARischio, getDashboardKpis, getUltimaAttivita } from './_lib/queries';
import { descriviAuditEvent, fmtData, fmtDataOra, fmtOra } from './_lib/format';

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
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8">
      {/* ===== Hero greeting compatto ===== */}
      <header className="relative flex flex-wrap items-end justify-between gap-3 overflow-hidden rounded-xl border border-border bg-aurora-brand px-5 py-4 shadow-soft">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-0.5 border-brand-line"
        />
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {oggi}
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
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
        </div>
        <p className="max-w-md text-xs text-muted-foreground">
          Commesse, collaudi e attività del team — in un colpo d&apos;occhio.
        </p>
      </header>

      {/* ===== KPI ===== */}
      <section className="space-y-4">
        <SectionEyebrow icon={<Activity className="h-3.5 w-3.5" />}>
          Sintesi operativa
        </SectionEyebrow>
        <Suspense fallback={<KpiSkeleton />}>
          <KpiSection />
        </Suspense>
      </section>

      {/* ===== Risk ===== */}
      <section className="space-y-4 stagger">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionHeader
            eyebrow="Commesse"
            title="Commesse a rischio"
            description="Lavori in corso o in collaudo che richiedono attenzione."
            icon={<ShieldAlert />}
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

      {/* ===== Timeline ===== */}
      <section className="space-y-4">
        <SectionHeader
          eyebrow="Attività"
          title="Ultima attività"
          description="Eventi tracciati nel log audit del tenant, dal più recente."
          icon={<Sparkles />}
        />
        <Suspense fallback={<TimelineSkeleton />}>
          <TimelineSection />
        </Suspense>
      </section>
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
    <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        label="Commesse aperte"
        value={kpi.commesseAperte}
        icon={<Briefcase />}
        tone="default"
        hint="Stati: aperta · in corso · collaudo"
      />
      <KpiCard
        label="Fasi in attesa > 3 giorni"
        value={kpi.fasiInAttesa}
        icon={<Clock />}
        tone={kpi.fasiInAttesa > 0 ? 'warning' : 'default'}
        hint={kpi.fasiInAttesa > 0 ? 'Da rivedere' : 'Tutto in regola'}
      />
      <KpiCard
        label="Foto caricate oggi"
        value={kpi.fotoOggi}
        icon={<Camera />}
        tone="success"
        hint="Dal team in cantiere"
      />
      <KpiCard
        label="DICO in scadenza ≤ 7 gg"
        value={kpi.dicoScadenza}
        icon={<FileWarning />}
        tone={kpi.dicoScadenza > 0 ? 'critical' : 'default'}
        hint={kpi.dicoScadenza > 0 ? 'Verificare priorità' : 'Nessuna urgenza'}
      />
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-36 rounded-xl" />
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
        title="Tutto sotto controllo"
        description="Nessuna commessa risulta a rischio in questo momento. Continua così."
      />
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {rows.map((c: any) => {
        const critica = c.stato === 'collaudo';
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
                (critica ? 'bg-stato-critica' : 'bg-accent')
              }
            />
            <CardContent className="flex items-center justify-between gap-4 py-5 pl-5 sm:pl-6">
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
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-28 rounded-xl" />
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
