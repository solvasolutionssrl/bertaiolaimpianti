import * as React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ChevronRight,
  ClipboardCheck,
  MapPin,
  Mic,
  TrendingUp,
  Clock,
  Camera,
  Briefcase,
} from 'lucide-react';

import { createServerSupabase } from '@impiantixplus/api/server';
import { StatoLed } from '@impiantixplus/ui';
import type { StatoCommessa } from '@impiantixplus/api/types';
import { getMobileShell } from '@impiantixplus/api/types';

import { guardMobile } from './_lib/guard';
import { SectionNumber, MetaLine, Stagger, CornerTicks } from './_components/blueprint';

export const metadata: Metadata = {
  title: 'impiantiXplus mobile',
};

interface CommessaRow {
  id: string;
  codice_interno: string;
  nome_cartella: string;
  stato: StatoCommessa;
  cliente_indirizzo_cantiere: string | null;
  data_apertura: string;
  cliente: { id: string; ragione_sociale: string } | null;
}

export default async function MobileHomePage() {
  const ctx = await guardMobile();
  const shell = getMobileShell(ctx.role);

  return shell === 'gestione' ? <GestioneDashboard ctx={ctx} /> : <CampoOggi ctx={ctx} />;
}

// ─── GESTIONE DASHBOARD ──────────────────────────────────────────────────────

async function GestioneDashboard({
  ctx,
}: {
  ctx: Awaited<ReturnType<typeof guardMobile>>;
}) {
  const supabase = createServerSupabase();

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const treGiorniFa = new Date(today);
  treGiorniFa.setDate(treGiorniFa.getDate() - 3);

  const [aperte, fasiAttesa, fotoOggi, recenti] = await Promise.all([
    supabase
      .from('commesse')
      .select('id', { count: 'exact', head: true })
      .in('stato', ['aperta', 'in_corso', 'collaudo']),
    supabase
      .from('commessa_voci')
      .select('commessa_id', { count: 'exact', head: true })
      .eq('stato', 'da_iniziare')
      .lt('updated_at', treGiorniFa.toISOString()),
    supabase
      .from('file_refs')
      .select('id', { count: 'exact', head: true })
      .gte('uploaded_at', `${todayIso}T00:00:00Z`)
      .like('mime', 'image/%'),
    supabase
      .from('commesse')
      .select(
        `
          id, codice_interno, nome_cartella, stato,
          cliente_indirizzo_cantiere, data_apertura,
          cliente:clienti ( id, ragione_sociale )
        `,
      )
      .in('stato', ['aperta', 'in_corso', 'collaudo'])
      .order('data_apertura', { ascending: false })
      .limit(5),
  ]);

  const recentRows: CommessaRow[] = ((recenti.data ?? []) as any[]).map((r) => ({
    id: r.id,
    codice_interno: r.codice_interno,
    nome_cartella: r.nome_cartella,
    stato: r.stato as StatoCommessa,
    cliente_indirizzo_cantiere: r.cliente_indirizzo_cantiere,
    data_apertura: r.data_apertura,
    cliente: Array.isArray(r.cliente) ? (r.cliente[0] ?? null) : r.cliente,
  }));

  const roleLabel: Record<string, string> = {
    owner: 'Owner',
    admin: 'Amministratore',
    office: 'Ufficio',
    capo: 'Capo cantiere',
  };

  return (
    <div className="flex min-h-[100dvh] flex-col gap-7 p-4 pb-24">
      {/* Hero */}
      <header className="pt-2 animate-fade-up">
        <MetaLine>
          {greeting()} · {formatToday()}
        </MetaLine>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <h1 className="font-mono text-3xl font-bold leading-none tracking-tightest">
            DASHBOARD
          </h1>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
            {roleLabel[ctx.role] ?? ctx.role}
          </span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Riepilogo operativo del tenant.
        </p>
      </header>

      {/* ── 01 / METRICHE ──────────────────────────────────────────────────── */}
      <section className="space-y-3 animate-fade-up [animation-delay:40ms]">
        <SectionNumber n={1} title="Metriche oggi" />
        <div className="relative overflow-hidden rounded-lg border border-border bg-card p-5 shadow-soft">
          <CornerTicks />
          {/* Grid pattern decorativo sullo sfondo */}
          <div className="pointer-events-none absolute inset-0 bg-grid opacity-[0.4]" aria-hidden="true" />
          <div className="relative grid grid-cols-3 gap-3">
            <MetricCell
              value={aperte.count ?? 0}
              label="Attive"
              icon={<TrendingUp className="h-3 w-3" />}
              tone="primary"
            />
            <MetricCell
              value={fasiAttesa.count ?? 0}
              label="Ferme"
              icon={<Clock className="h-3 w-3" />}
              tone={fasiAttesa.count && fasiAttesa.count > 0 ? 'warn' : 'neutral'}
            />
            <MetricCell
              value={fotoOggi.count ?? 0}
              label="Foto oggi"
              icon={<Camera className="h-3 w-3" />}
              tone="neutral"
            />
          </div>
        </div>
      </section>

      {/* ── 02 / AZIONI RAPIDE ─────────────────────────────────────────────── */}
      <section className="space-y-3 animate-fade-up [animation-delay:80ms]">
        <SectionNumber n={2} title="Azioni rapide" />
        <div className="grid grid-cols-2 gap-2">
          <QuickAction
            href="/mobile/sopralluogo"
            icon={ClipboardCheck}
            label="Sopralluogo"
            hint="7 passi · cliente nuovo"
            tag="NEW"
          />
          <QuickAction
            href="/mobile/voice-intake"
            icon={Mic}
            label="Voce"
            hint="detta nota o ordine"
            tone="primary"
            tag="REC"
          />
        </div>
      </section>

      {/* ── 03 / ULTIME COMMESSE ───────────────────────────────────────────── */}
      <section className="space-y-3 animate-fade-up [animation-delay:120ms]">
        <SectionNumber
          n={3}
          title="Ultime commesse"
          trailing={
            <Link
              href="/mobile/commesse"
              className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary hover:underline"
            >
              Tutte →
            </Link>
          }
        />
        {recentRows.length === 0 ? (
          <EmptyState />
        ) : (
          <Stagger className="flex flex-col gap-2">
            {recentRows.map((c, idx) => (
              <CommessaCard key={c.id} commessa={c} index={idx + 1} />
            ))}
          </Stagger>
        )}
      </section>
    </div>
  );
}

// ─── CAMPO TODAY VIEW ────────────────────────────────────────────────────────

async function CampoOggi({
  ctx,
}: {
  ctx: Awaited<ReturnType<typeof guardMobile>>;
}) {
  const supabase = createServerSupabase();

  const { data, error } = await supabase
    .from('commesse')
    .select(
      `
        id, codice_interno, nome_cartella, stato,
        cliente_indirizzo_cantiere, data_apertura,
        cliente:clienti ( id, ragione_sociale )
      `,
    )
    .eq('responsabile_id', ctx.userId)
    .in('stato', ['aperta', 'in_corso', 'collaudo'])
    .order('data_apertura', { ascending: false })
    .limit(30);

  if (error) {
    return <ErrorState title="Impossibile caricare le commesse" detail={error.message} />;
  }

  const rows: CommessaRow[] = ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    codice_interno: r.codice_interno,
    nome_cartella: r.nome_cartella,
    stato: r.stato as StatoCommessa,
    cliente_indirizzo_cantiere: r.cliente_indirizzo_cantiere,
    data_apertura: r.data_apertura,
    cliente: Array.isArray(r.cliente) ? (r.cliente[0] ?? null) : r.cliente,
  }));

  return (
    <div className="flex min-h-[100dvh] flex-col gap-7 p-4 pb-24">
      {/* Hero */}
      <header className="pt-2 animate-fade-up">
        <MetaLine>
          {greeting()} · {formatToday()}
        </MetaLine>
        <h1 className="mt-2 font-mono text-3xl font-bold leading-none tracking-tightest">
          OGGI
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {rows.length === 0
            ? 'Nessuna commessa attiva.'
            : `${rows.length} ${rows.length === 1 ? 'commessa' : 'commesse'} in carico`}
        </p>
      </header>

      {/* Azioni rapide */}
      <section className="space-y-3 animate-fade-up [animation-delay:40ms]">
        <SectionNumber n={1} title="Azioni rapide" />
        <div className="grid grid-cols-2 gap-2">
          <QuickAction
            href="/mobile/sopralluogo"
            icon={ClipboardCheck}
            label="Sopralluogo"
            hint="cliente nuovo"
            tag="NEW"
            dataTour="sopralluogo"
          />
          <QuickAction
            href="/mobile/voice-intake"
            icon={Mic}
            label="Voce"
            hint="detta nota"
            tone="primary"
            tag="REC"
            dataTour="vocale"
          />
        </div>
      </section>

      {/* Commesse */}
      <section className="space-y-3 animate-fade-up [animation-delay:80ms]">
        <SectionNumber
          n={2}
          title="In carico"
          trailing={
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70">
              {String(rows.length).padStart(2, '0')}
            </span>
          }
        />
        {rows.length === 0 ? (
          <EmptyState />
        ) : (
          <Stagger className="flex flex-col gap-2">
            {rows.map((c, idx) => (
              <CommessaCard key={c.id} commessa={c} index={idx + 1} />
            ))}
          </Stagger>
        )}
      </section>
    </div>
  );
}

// ─── SHARED COMPONENTS ───────────────────────────────────────────────────────

function MetricCell({
  value,
  label,
  icon,
  tone,
}: {
  value: number;
  label: string;
  icon: React.ReactNode;
  tone: 'primary' | 'warn' | 'neutral';
}) {
  const accent = {
    primary: 'text-primary',
    warn: 'text-stato-collaudo',
    neutral: 'text-foreground',
  }[tone];

  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className={`font-mono text-3xl font-bold tabular-nums leading-none ${accent}`}>
        {String(value).padStart(2, '0')}
      </span>
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
  hint,
  tone = 'default',
  tag,
  dataTour,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint: string;
  tone?: 'default' | 'primary';
  tag?: string;
  dataTour?: string;
}) {
  return (
    <Link
      href={href}
      data-tour={dataTour}
      className={[
        'group relative flex flex-col gap-2 overflow-hidden rounded-lg border p-3 transition-all active:scale-[0.98]',
        tone === 'primary'
          ? 'border-primary/30 bg-primary/5 hover:bg-primary/10'
          : 'border-border bg-card hover:bg-muted/40',
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <span
          className={[
            'flex h-9 w-9 items-center justify-center rounded-md border',
            tone === 'primary'
              ? 'border-primary/30 bg-primary text-primary-foreground'
              : 'border-border bg-background text-foreground',
          ].join(' ')}
        >
          <Icon className="h-4 w-4" />
        </span>
        {tag ? (
          <span
            aria-hidden="true"
            className={[
              'font-mono text-[9px] font-bold uppercase tracking-[0.2em]',
              tone === 'primary' ? 'text-primary' : 'text-muted-foreground/60',
            ].join(' ')}
          >
            {tag}
          </span>
        ) : null}
      </div>
      <div className="space-y-0.5">
        <span className="block text-sm font-semibold tracking-tight text-foreground">{label}</span>
        <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {hint}
        </span>
      </div>
    </Link>
  );
}

function CommessaCard({ commessa, index }: { commessa: CommessaRow; index: number }) {
  return (
    <Link
      href={`/mobile/commessa/${commessa.id}`}
      data-tour={index === 1 ? 'commessa-card' : undefined}
      className="group relative flex items-stretch gap-3 overflow-hidden rounded-lg border border-border bg-card p-3 shadow-soft transition-all active:scale-[0.99] active:bg-muted"
    >
      {/* Numerazione laterale */}
      <span
        aria-hidden="true"
        className="flex w-7 shrink-0 flex-col items-center justify-center border-r border-border/60 pr-2 font-mono text-[10px] font-bold tabular-nums text-muted-foreground/60"
      >
        {String(index).padStart(2, '0')}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <StatoLed stato={commessa.stato} />
          <span className="font-mono text-xs font-semibold tabular-nums text-muted-foreground">
            {commessa.codice_interno}
          </span>
        </div>
        <p className="mt-1.5 truncate text-base font-semibold tracking-tight text-foreground">
          {commessa.cliente?.ragione_sociale ?? '—'}
        </p>
        {commessa.cliente_indirizzo_cantiere ? (
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{commessa.cliente_indirizzo_cantiere}</span>
          </p>
        ) : null}
      </div>

      <ChevronRight
        className="self-center h-4 w-4 shrink-0 text-muted-foreground transition-transform group-active:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center">
      <span className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Briefcase className="h-4 w-4" aria-hidden="true" />
      </span>
      <p className="text-sm font-medium text-foreground">Nessuna commessa attiva</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Le commesse compaiono qui appena vengono aperte
      </p>
    </div>
  );
}

function ErrorState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/10 p-6">
      <p className="font-semibold text-destructive">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Buongiorno';
  if (h < 18) return 'Buon pomeriggio';
  return 'Buonasera';
}

function formatToday() {
  return new Date()
    .toLocaleDateString('it-IT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
    .toUpperCase();
}
