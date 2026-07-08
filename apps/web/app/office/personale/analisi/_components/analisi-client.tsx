'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  AreaChart,
  Area,
  PieChart,
  Pie,
} from 'recharts';
import {
  BarChart3,
  CalendarOff,
  Check,
  X,
  Loader2,
  Clock,
  CalendarDays,
  Users,
} from 'lucide-react';
import { Card, CardContent, Badge } from '@kommessa/ui';
import { LABEL_STATO_PERMESSO } from '@kommessa/api/permessi-tipi';
import { useAlert } from '@/app/_components/confirm-provider';
import { decidiPermesso } from '@/app/office/_actions/ferie-permessi';

const C = {
  blue: '#1340A6',
  amber: '#D97706',
  emerald: '#059669',
  rose: '#DC2626',
  slate: '#94A3B8',
  ink: '#334155',
  grid: '#E2E8F0',
};
const tooltipStyle = {
  borderRadius: 8,
  border: '1px solid #E2E8F0',
  fontSize: 12,
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  padding: '6px 10px',
};

type Stato = 'in_attesa' | 'approvato' | 'rifiutato' | 'modifica_richiesta';

export interface SerieMese {
  mese: string;
  key: string;
  valore: number;
}
export interface LatestRow {
  id: string;
  dipendenteNome: string;
  tipoLabel: string;
  dataInizio: string;
  dataFine: string;
  tuttoIlGiorno: boolean;
  oraInizio: string | null;
  oraFine: string | null;
  motivo: string | null;
  stato: Stato;
}

interface Kpi {
  totale: number;
  inAttesa: number;
  approvate: number;
  rifiutate: number;
  giorniFerie: number;
  presenzeMese: number;
  dipendentiAttivi: number;
}

function fmtData(iso: string): string {
  const [Y, M, D] = iso.split('-').map(Number);
  return new Date(Date.UTC(Y!, M! - 1, D!)).toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Rome',
  });
}

const STATO_STYLE: Record<Stato, string> = {
  in_attesa: 'border-amber-200 bg-amber-50 text-amber-700',
  approvato: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  rifiutato: 'border-rose-200 bg-rose-50 text-rose-700',
  modifica_richiesta: 'border-sky-200 bg-sky-50 text-sky-700',
};

export function AnalisiClient({
  kpi,
  perStato,
  perTipo,
  perMese,
  upcoming,
  latest,
  canDecide,
}: {
  kpi: Kpi;
  perStato: { nome: string; valore: number; colore: string }[];
  perTipo: { nome: string; valore: number }[];
  perMese: SerieMese[];
  upcoming: { dipendenteNome: string; tipoLabel: string; dataInizio: string; dataFine: string; tuttoIlGiorno: boolean }[];
  latest: LatestRow[];
  canDecide: boolean;
}) {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <BarChart3 className="h-5 w-5 text-primary" />
          Analisi personale
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Panoramica su ferie, permessi e presenze.
        </p>
      </header>

      {/* KPI compatti */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Richieste" value={kpi.totale} />
        <Kpi label="In attesa" value={kpi.inAttesa} tone="amber" />
        <Kpi label="Approvate" value={kpi.approvate} tone="emerald" />
        <Kpi label="Rifiutate" value={kpi.rifiutate} tone="rose" />
        <Kpi label="Giorni ferie (anno)" value={kpi.giorniFerie} />
        <Kpi label="Presenze (mese)" value={kpi.presenzeMese} />
      </div>

      {/* Grafici */}
      <div className="grid gap-3 lg:grid-cols-3">
        <ChartCard title="Richieste per stato">
          {perStato.length === 0 ? (
            <Vuoto />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={perStato}
                  dataKey="valore"
                  nameKey="nome"
                  innerRadius={48}
                  outerRadius={78}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {perStato.map((s) => (
                    <Cell key={s.nome} fill={s.colore} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          )}
          <Legenda items={perStato.map((s) => ({ nome: s.nome, colore: s.colore, valore: s.valore }))} />
        </ChartCard>

        <ChartCard title="Andamento richieste (6 mesi)">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={perMese} margin={{ left: -18, right: 8, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.blue} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={C.blue} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={C.grid} />
              <XAxis dataKey="mese" tick={{ fontSize: 11, fill: C.slate }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.slate }} width={28} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="valore" stroke={C.blue} strokeWidth={2} fill="url(#gArea)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Richieste per tipo">
          {perTipo.length === 0 ? (
            <Vuoto />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(160, perTipo.length * 26)}>
              <BarChart data={perTipo} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid horizontal={false} stroke={C.grid} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: C.slate }} />
                <YAxis
                  type="category"
                  dataKey="nome"
                  width={110}
                  tick={{ fontSize: 11, fill: C.ink }}
                  tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
                />
                <Tooltip cursor={{ fill: 'rgba(19,64,166,0.06)' }} contentStyle={tooltipStyle} />
                <Bar dataKey="valore" fill={C.blue} radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Ultime richieste + assenze in arrivo */}
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <h2 className="text-sm font-semibold">Ultime richieste</h2>
                <a href="/office/personale/permessi" className="text-xs font-medium text-primary hover:underline">
                  Tutte →
                </a>
              </div>
              {latest.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nessuna richiesta.</p>
              ) : (
                <div className="divide-y divide-border">
                  {latest.map((r) => (
                    <LatestRiga key={r.id} r={r} canDecide={canDecide} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="border-b border-border px-4 py-2.5">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                <CalendarOff className="h-4 w-4 text-rose-500" /> Assenze in arrivo
              </h2>
            </div>
            {upcoming.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Nessuna assenza nei prossimi 30 giorni.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {upcoming.map((u, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 px-4 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{u.dipendenteNome}</p>
                      <p className="text-[11px] text-muted-foreground">{u.tipoLabel}</p>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {u.dataInizio === u.dataFine
                        ? fmtData(u.dataInizio)
                        : `${fmtData(u.dataInizio)} → ${fmtData(u.dataFine)}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" /> {kpi.dipendentiAttivi} dipendenti attivi. Le presenze del
        mese sono le giornate registrate nei rapportini. Il residuo ferie richiede il monte-ore per
        contratto (in arrivo).
      </p>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: 'amber' | 'emerald' | 'rose' }) {
  const color =
    tone === 'amber'
      ? 'text-amber-600'
      : tone === 'emerald'
        ? 'text-emerald-600'
        : tone === 'rose'
          ? 'text-rose-600'
          : 'text-foreground';
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={'mt-0.5 text-2xl font-semibold tabular-nums ' + color}>{value}</p>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="py-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{title}</h2>
        {children}
      </CardContent>
    </Card>
  );
}

function Vuoto() {
  return <p className="py-12 text-center text-sm text-muted-foreground">Nessun dato.</p>;
}

function Legenda({ items }: { items: { nome: string; colore: string; valore: number }[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1">
      {items.map((it) => (
        <span key={it.nome} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: it.colore }} />
          {it.nome} <span className="font-medium text-foreground">{it.valore}</span>
        </span>
      ))}
    </div>
  );
}

function LatestRiga({ r, canDecide }: { r: LatestRow; canDecide: boolean }) {
  const router = useRouter();
  const alert = useAlert();
  const [pending, start] = React.useTransition();
  const attesa = r.stato === 'in_attesa' || r.stato === 'modifica_richiesta';
  const quando =
    !r.tuttoIlGiorno && r.oraInizio && r.oraFine
      ? `${fmtData(r.dataInizio)} · ${r.oraInizio}-${r.oraFine}`
      : r.dataInizio === r.dataFine
        ? fmtData(r.dataInizio)
        : `${fmtData(r.dataInizio)} → ${fmtData(r.dataFine)}`;

  const decidi = (esito: 'approvato' | 'rifiutato') =>
    start(async () => {
      const res = await decidiPermesso({ id: r.id, esito });
      if (!res.ok) {
        await alert({ title: 'Errore', body: res.error });
        return;
      }
      router.refresh();
    });

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2">
          <span className="truncate text-sm font-semibold">{r.dipendenteNome}</span>
          <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[10px] text-slate-700">
            {r.tipoLabel}
          </Badge>
        </div>
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          {r.tuttoIlGiorno ? <CalendarDays className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
          {quando}
          {r.motivo ? ` · ${r.motivo}` : ''}
        </p>
      </div>
      {attesa && canDecide ? (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={pending}
            onClick={() => decidi('approvato')}
            title="Approva"
            className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => decidi('rifiutato')}
            title="Rifiuta"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-rose-300 text-rose-600 hover:bg-rose-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <Badge variant="outline" className={'shrink-0 text-[10px] ' + STATO_STYLE[r.stato]}>
          {LABEL_STATO_PERMESSO[r.stato] ?? r.stato}
        </Badge>
      )}
    </div>
  );
}
