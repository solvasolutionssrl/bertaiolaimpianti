import { Suspense } from 'react';
import { Skeleton } from '@kommessa/ui';
import { Activity, Briefcase, Camera, Clock, FileWarning } from 'lucide-react';
import { redirect } from 'next/navigation';
import { requireTenantContextCached as requireTenantContext } from '../_lib/tenant-cache';
import { getAppModeCached } from '../_lib/app-mode';
import { getDashboardKpis } from './_lib/queries';
import {
  TodoDaGestireSection,
  TodoDaGestireSkeleton,
} from './_components/todo-da-gestire-section';
import {
  CommesseAttiveSection,
  CommesseAttiveSkeleton,
} from './_components/commesse-attive-section';

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
  // Tenant puro-Kantiere (app_mode='kantiere'): la dashboard commessa non ha
  // senso → atterra sulla Panoramica Kantiere. Bertaiola ('kommessa') invariata.
  if ((await getAppModeCached()) === 'kantiere') {
    redirect('/office/kantiere');
  }
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
    <div className="w-full space-y-6">
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

      {/* ===== Riga unica: Cose da gestire (2/3) + Commesse in lavorazione (1/3) ===== */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <section className="stagger lg:col-span-2">
          <Suspense fallback={<TodoDaGestireSkeleton />}>
            <TodoDaGestireSection />
          </Suspense>
        </section>
        <section>
          <Suspense fallback={<CommesseAttiveSkeleton />}>
            <CommesseAttiveSection />
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
