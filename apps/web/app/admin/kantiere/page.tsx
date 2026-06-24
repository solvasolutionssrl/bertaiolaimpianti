import Link from 'next/link';
import { HardHat, Users, MapPin, UserCheck, Utensils, Timer, ArrowUpRight } from 'lucide-react';
import { Badge, Card, CardContent } from '@kommessa/ui';

import { requirePlatformAdmin } from '../_lib/guard';
import { SectionHeader } from '../../_components/section-header';
import { statKantierePerTenant } from './_lib/queries';

export const metadata = { title: 'Platform · Kantiere' };
export const dynamic = 'force-dynamic';

function oraRel(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

const APP_MODE_LABEL: Record<string, string> = {
  kommessa: 'Kommessa',
  kantiere: 'Solo Kantiere',
  full: 'Completa',
};

export default async function AdminKantierePage() {
  await requirePlatformAdmin();
  const stats = await statKantierePerTenant();

  const totDip = stats.reduce((a, s) => a + s.nDipendenti, 0);
  const totInCantiere = stats.reduce((a, s) => a + s.inCantiere, 0);
  const totInPausa = stats.reduce((a, s) => a + s.inPausa, 0);
  const totTimbOggi = stats.reduce((a, s) => a + s.timbratureOggi, 0);

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Platform · Kantiere"
        title="Panoramica Kantiere"
        description="Stato live del modulo presenze su tutti i tenant che lo usano."
        icon={<HardHat />}
        actions={
          <Link
            href="/admin/kantiere/timbrature"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium transition-colors hover:bg-muted/50"
          >
            <Timer className="h-3.5 w-3.5" aria-hidden="true" />
            Timbrature live
          </Link>
        }
      />

      {/* KPI aggregati */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiBox label="Tenant Kantiere" value={stats.length} icon={<HardHat />} />
        <KpiBox label="In cantiere ora" value={totInCantiere} icon={<UserCheck />} tone="success" />
        <KpiBox label="In pausa pranzo" value={totInPausa} icon={<Utensils />} tone="amber" />
        <KpiBox label="Timbrature oggi" value={totTimbOggi} icon={<Timer />} />
      </div>

      {stats.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nessun tenant usa il modulo Kantiere. Attivalo dalla scheda tenant → tab Moduli.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {stats.map((s) => (
            <Card key={s.tenantId} className="overflow-hidden">
              <CardContent className="space-y-3 py-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/tenants/${s.tenantId}`}
                      className="flex items-center gap-1 text-sm font-semibold tracking-tight hover:underline"
                    >
                      {s.nome}
                      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    </Link>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Badge variant="outline" className="font-normal">
                        {APP_MODE_LABEL[s.appMode] ?? s.appMode}
                      </Badge>
                      {s.moduloAttivo ? (
                        <Badge variant="outline" className="border-success/30 font-normal text-success">
                          modulo attivo
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-400/40 font-normal text-amber-600">
                          modulo spento
                        </Badge>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                      Ultima oggi
                    </p>
                    <p className="font-mono text-sm tabular-nums">{oraRel(s.ultimaOggi)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Mini label="In cantiere" value={s.inCantiere} tone="success" icon={<UserCheck />} />
                  <Mini label="In pausa" value={s.inPausa} tone="amber" icon={<Utensils />} />
                  <Mini label="Dipendenti" value={s.nDipendenti} icon={<Users />} />
                  <Mini label="Cantieri" value={s.nCantieri} icon={<MapPin />} />
                </div>

                <div className="flex items-center justify-between border-t border-border pt-2">
                  <span className="text-[11px] text-muted-foreground">
                    {s.timbratureOggi} timbrature oggi
                  </span>
                  <Link
                    href={`/admin/kantiere/timbrature?tenant=${s.tenantId}`}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                  >
                    Timbrature
                    <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-right font-mono text-[11px] text-muted-foreground">
        {new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}
      </p>
    </div>
  );
}

function KpiBox({
  label,
  value,
  icon,
  tone = 'default',
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: 'default' | 'success' | 'amber';
}) {
  const toneCls =
    tone === 'success'
      ? 'text-success'
      : tone === 'amber'
        ? 'text-amber-600'
        : 'text-foreground';
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-md bg-muted [&_svg]:h-4 [&_svg]:w-4 ${toneCls}`}>
          {icon}
        </span>
        <div className="min-w-0">
          <p className={`text-2xl font-semibold leading-none tabular-nums ${toneCls}`}>{value}</p>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Mini({
  label,
  value,
  icon,
  tone = 'default',
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: 'default' | 'success' | 'amber';
}) {
  const toneCls =
    tone === 'success' ? 'text-success' : tone === 'amber' ? 'text-amber-600' : 'text-foreground';
  return (
    <div className="rounded-lg border border-border px-2.5 py-2">
      <p className={`flex items-center gap-1 text-lg font-semibold leading-none tabular-nums ${toneCls}`}>
        <span className="[&_svg]:h-3.5 [&_svg]:w-3.5 opacity-70">{icon}</span>
        {value}
      </p>
      <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}
