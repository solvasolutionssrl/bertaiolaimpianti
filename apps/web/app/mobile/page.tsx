import * as React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ChevronRight, ClipboardCheck, MapPin, Mic, TrendingUp, Clock, Camera } from 'lucide-react';

import { createServerSupabase } from '@impiantixplus/api/server';
import { StatoBadge } from '@impiantixplus/ui';
import type { StatoCommessa } from '@impiantixplus/api/types';
import { getMobileShell } from '@impiantixplus/api/types';

import { guardMobile } from './_lib/guard';

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
  voci_attive: number;
  foto_caricate: number;
  foto_richieste: number;
}

interface VoceRow {
  min_foto_richieste?: number | null;
  foto_caricate_count?: number | null;
  stato?: string;
}

export default async function MobileHomePage() {
  const ctx = await guardMobile();
  const shell = getMobileShell(ctx.role);

  return shell === 'gestione'
    ? <GestioneDashboard ctx={ctx} />
    : <CampoOggi ctx={ctx} />;
}

// ─── GESTIONE DASHBOARD ────────────────────────────────────────────────────

async function GestioneDashboard({ ctx }: { ctx: Awaited<ReturnType<typeof guardMobile>> }) {
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
      .select(`
        id,
        codice_interno,
        nome_cartella,
        stato,
        cliente_indirizzo_cantiere,
        data_apertura,
        cliente:clienti ( id, ragione_sociale ),
        voci:commessa_voci ( min_foto_richieste, foto_caricate_count, stato )
      `)
      .in('stato', ['aperta', 'in_corso', 'collaudo'])
      .order('data_apertura', { ascending: false })
      .limit(5),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recentRows: CommessaRow[] = ((recenti.data ?? []) as any[]).map((r) => {
    const voci: VoceRow[] = Array.isArray(r.voci) ? (r.voci as VoceRow[]) : [];
    return {
      id: r.id,
      codice_interno: r.codice_interno,
      nome_cartella: r.nome_cartella,
      stato: r.stato as StatoCommessa,
      cliente_indirizzo_cantiere: r.cliente_indirizzo_cantiere,
      data_apertura: r.data_apertura,
      cliente: Array.isArray(r.cliente) ? (r.cliente[0] ?? null) : r.cliente,
      voci_attive: voci.filter((v) => v.stato !== 'completata').length,
      foto_caricate: voci.reduce((acc, v) => acc + (v.foto_caricate_count ?? 0), 0),
      foto_richieste: voci.reduce((acc, v) => acc + (v.min_foto_richieste ?? 0), 0),
    };
  });

  const roleLabel: Record<string, string> = {
    owner: 'Owner', admin: 'Amministratore', office: 'Ufficio', capo: 'Capo cantiere',
  };

  return (
    <div className="flex min-h-[100dvh] flex-col gap-5 p-4">
      <header className="pt-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          · {greeting()} · {formatToday()} ·
        </p>
        <div className="mt-1 flex items-baseline gap-2">
          <h1 className="text-[26px] font-semibold leading-none tracking-tight">Dashboard</h1>
          <span className="rounded-md border border-primary/30 bg-primary/8 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary">
            {roleLabel[ctx.role] ?? ctx.role}
          </span>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">Riepilogo operativo del tenant</p>
      </header>

      {/* KPI mini-cards */}
      <div className="grid grid-cols-3 gap-2">
        <MiniKpi
          value={aperte.count ?? 0}
          label="Attive"
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          tone="primary"
        />
        <MiniKpi
          value={fasiAttesa.count ?? 0}
          label="In attesa"
          icon={<Clock className="h-3.5 w-3.5" />}
          tone={fasiAttesa.count && fasiAttesa.count > 0 ? 'warn' : 'neutral'}
        />
        <MiniKpi
          value={fotoOggi.count ?? 0}
          label="Foto oggi"
          icon={<Camera className="h-3.5 w-3.5" />}
          tone="neutral"
        />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-2">
        <QuickAction
          href="/mobile/sopralluogo"
          icon={ClipboardCheck}
          label="Sopralluogo"
          hint="nuovo cliente"
        />
        <QuickAction
          href="/mobile/voice-intake"
          icon={Mic}
          label="Voce"
          hint="detta nota o ordine"
          tone="primary"
        />
      </div>

      {/* Ultime commesse */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Ultime commesse
          </h2>
          <Link
            href="/mobile/commesse"
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary hover:underline"
          >
            Vedi tutte →
          </Link>
        </div>
        {recentRows.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="flex flex-col gap-3">
            {recentRows.map((c) => (
              <li key={c.id}>
                <CommessaCard commessa={c} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ─── CAMPO TODAY VIEW ───────────────────────────────────────────────────────

async function CampoOggi({ ctx }: { ctx: Awaited<ReturnType<typeof guardMobile>> }) {
  const supabase = createServerSupabase();

  const { data, error } = await supabase
    .from('commesse')
    .select(
      `
        id,
        codice_interno,
        nome_cartella,
        stato,
        cliente_indirizzo_cantiere,
        data_apertura,
        cliente:clienti ( id, ragione_sociale ),
        voci:commessa_voci ( min_foto_richieste, foto_caricate_count, stato )
      `,
    )
    .eq('responsabile_id', ctx.userId)
    .in('stato', ['aperta', 'in_corso', 'collaudo'])
    .order('data_apertura', { ascending: false })
    .limit(30);

  if (error) {
    return (
      <ErrorState title="Impossibile caricare le commesse" detail={error.message} />
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: CommessaRow[] = ((data ?? []) as any[]).map((r) => {
    const voci: VoceRow[] = Array.isArray(r.voci) ? (r.voci as VoceRow[]) : [];
    return {
      id: r.id,
      codice_interno: r.codice_interno,
      nome_cartella: r.nome_cartella,
      stato: r.stato as StatoCommessa,
      cliente_indirizzo_cantiere: r.cliente_indirizzo_cantiere,
      data_apertura: r.data_apertura,
      cliente: Array.isArray(r.cliente) ? (r.cliente[0] ?? null) : r.cliente,
      voci_attive: voci.filter((v) => v.stato !== 'completata').length,
      foto_caricate: voci.reduce((acc, v) => acc + (v.foto_caricate_count ?? 0), 0),
      foto_richieste: voci.reduce((acc, v) => acc + (v.min_foto_richieste ?? 0), 0),
    };
  });

  return (
    <div className="flex min-h-[100dvh] flex-col gap-5 p-4">
      <header className="pt-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          · {greeting()} · {formatToday()} ·
        </p>
        <h1 className="mt-1 text-[26px] font-semibold leading-none tracking-tight">Oggi</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {rows.length === 0
            ? 'Nessuna commessa attiva.'
            : `${rows.length} ${rows.length === 1 ? 'commessa attiva' : 'commesse attive'}`}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <QuickAction
          href="/mobile/sopralluogo"
          icon={ClipboardCheck}
          label="Nuovo sopralluogo"
          hint="7 passi · cliente nuovo"
          dataTour="sopralluogo"
        />
        <QuickAction
          href="/mobile/voice-intake"
          icon={Mic}
          label="Voce"
          hint="detta nota o ordine"
          tone="primary"
          dataTour="vocale"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((c) => (
            <li key={c.id}>
              <CommessaCard commessa={c} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── SHARED COMPONENTS ──────────────────────────────────────────────────────

function MiniKpi({
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
  const colors = {
    primary: 'border-primary/20 bg-primary/5 text-primary',
    warn: 'border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400',
    neutral: 'border-border bg-card text-muted-foreground',
  };
  return (
    <div className={`flex flex-col gap-1 rounded-xl border p-3 ${colors[tone]}`}>
      <span className="flex items-center gap-1 opacity-70">{icon}<span className="font-mono text-[9px] uppercase tracking-wider">{label}</span></span>
      <span className="font-mono text-2xl font-bold tabular-nums">{value}</span>
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
  hint,
  tone = 'default',
  dataTour,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint: string;
  tone?: 'default' | 'primary';
  dataTour?: string;
}) {
  return (
    <Link
      href={href}
      data-tour={dataTour}
      className={[
        'group relative flex flex-col gap-1 overflow-hidden rounded-xl border p-3 transition-colors active:scale-[0.99]',
        tone === 'primary'
          ? 'border-primary/30 bg-primary/5 hover:bg-primary/10'
          : 'border-border bg-card hover:bg-muted/40',
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <span
          className={[
            'flex h-9 w-9 items-center justify-center rounded-lg border',
            tone === 'primary'
              ? 'border-primary/30 bg-primary text-primary-foreground'
              : 'border-border bg-background text-foreground',
          ].join(' ')}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span
          aria-hidden="true"
          className={[
            'font-mono text-[9px] uppercase tracking-[0.18em]',
            tone === 'primary' ? 'text-primary' : 'text-muted-foreground/70',
          ].join(' ')}
        >
          {tone === 'primary' ? 'rec' : 'new'}
        </span>
      </div>
      <span className="mt-1 text-sm font-semibold tracking-tight text-foreground">{label}</span>
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{hint}</span>
    </Link>
  );
}

function CommessaCard({ commessa }: { commessa: CommessaRow }) {
  const fotoUnder =
    commessa.foto_richieste > 0 && commessa.foto_caricate < commessa.foto_richieste;

  return (
    <Link
      href={`/mobile/commessa/${commessa.id}`}
      data-tour="commessa-card"
      className="block rounded-xl border border-border bg-card p-4 shadow-sm transition-colors active:bg-muted"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
              {commessa.codice_interno}
            </span>
            <StatoBadge stato={commessa.stato} hideEmoji />
          </div>
          <p className="mt-1 truncate text-base font-medium text-foreground">
            {commessa.cliente?.ragione_sociale ?? '—'}
          </p>
          {commessa.cliente_indirizzo_cantiere ? (
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{commessa.cliente_indirizzo_cantiere}</span>
            </p>
          ) : null}
        </div>
        <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>

      <dl className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
        <div>
          <dt className="sr-only">Voci attive</dt>
          <dd>
            <span className="font-semibold text-foreground">{commessa.voci_attive}</span>{' '}
            {commessa.voci_attive === 1 ? 'fase attiva' : 'fasi attive'}
          </dd>
        </div>
        <div className="flex items-center gap-1">
          <span aria-hidden="true">📸</span>
          <span className={fotoUnder ? 'font-semibold text-stato-collaudo' : 'font-semibold text-foreground'}>
            {commessa.foto_caricate}/{commessa.foto_richieste || '—'}
          </span>
          {fotoUnder ? <span aria-label="Sotto target foto">⚠</span> : null}
        </div>
      </dl>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
      <p className="text-sm text-muted-foreground">Nessuna commessa attiva.</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Le commesse compaiono qui appena vengono aperte.
      </p>
    </div>
  );
}

function ErrorState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="m-4 rounded-xl border border-destructive/30 bg-destructive/10 p-6">
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
  return new Date().toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}
