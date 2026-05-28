import * as React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  AlertCircle,
  Briefcase,
  Calendar,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock,
  Flame,
  MapPin,
  Mic,
  Plus,
  Sparkles,
  TrendingUp,
} from 'lucide-react';

import { createServerSupabase } from '@kommessa/api/server';
import { StatoLed } from '@kommessa/ui';
import type { StatoCommessa } from '@kommessa/api/types';
import { getMobileShell } from '@kommessa/api/types';

import { guardMobile } from './_lib/guard';
import { SectionNumber, MetaLine, Stagger, CornerTicks, Hero, HeroMeta } from './_components/blueprint';

export const metadata: Metadata = {
  title: 'Kommessa mobile',
};

interface CommessaRow {
  id: string;
  codice_interno: string;
  nome_cartella: string;
  stato: StatoCommessa;
  is_critica: boolean;
  cliente_indirizzo_cantiere: string | null;
  data_apertura: string;
  /** Descrizione del lavoro — è IL titolo della commessa, mostrato come h1. */
  titolo: string | null;
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
          id, codice_interno, nome_cartella, stato, is_critica,
          cliente_indirizzo_cantiere, data_apertura,
          descrizione_ai_finale, descrizione_ai_proposta, note_iniziali,
          cliente:clienti ( id, ragione_sociale )
        `,
      )
      .in('stato', ['aperta', 'in_corso', 'collaudo'])
      .order('data_apertura', { ascending: false })
    .order('codice_interno', { ascending: false })
      .limit(5),
  ]);

  const recentRows: CommessaRow[] = ((recenti.data ?? []) as any[]).map((r) => ({
    id: r.id,
    codice_interno: r.codice_interno,
    nome_cartella: r.nome_cartella,
    stato: r.stato as StatoCommessa,
    is_critica: Boolean(r.is_critica),
    cliente_indirizzo_cantiere: r.cliente_indirizzo_cantiere,
    data_apertura: r.data_apertura,
    titolo: pickTitolo(r),
    cliente: Array.isArray(r.cliente) ? (r.cliente[0] ?? null) : r.cliente,
  }));

  const roleLabel: Record<string, string> = {
    admin: 'Amministratore',
    office: 'Ufficio',
    tecnico: 'Tecnico',
  };

  return (
    <div className="flex min-h-[100dvh] flex-col pb-24">
      {/* Hero dark */}
      <Hero>
        <HeroMeta>
          {greeting()} · {formatToday()}
        </HeroMeta>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <h1 className="font-mono text-3xl font-bold leading-none tracking-tightest text-primary-foreground">
            DASHBOARD
          </h1>
          <span className="rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-primary-foreground/90">
            {roleLabel[ctx.role] ?? ctx.role}
          </span>
        </div>
        <p className="mt-2 text-sm text-primary-foreground/70">
          Riepilogo operativo del tenant.
        </p>
      </Hero>

      <div className="flex flex-col gap-7 px-4 pt-4">
        {/* ── 01 / METRICHE ──────── (overlap parziale sull'hero) ────────────── */}
        <section className="-mt-12 space-y-3 animate-fade-up [animation-delay:40ms]">
          <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-card via-card to-primary-soft/45 p-5 shadow-soft-lg">
            <CornerTicks />
            {/* Grid pattern decorativo sullo sfondo */}
            <div className="pointer-events-none absolute inset-0 bg-grid opacity-[0.18]" aria-hidden="true" />
            <div className="relative">
              <SectionNumber
                n={1}
                title="Metriche oggi"
                trailing={
                  <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/50">
                    live
                  </span>
                }
                className="mb-4"
              />
              <div className="grid grid-cols-3 gap-3">
                <MetricCell
                  value={aperte.count ?? 0}
                  label="Attive"
                  icon={<TrendingUp className="h-3 w-3" />}
                  tone="primary"
                />
                <MetricCell
                  value={fasiAttesa.count ?? 0}
                  label="Voci ferme"
                  icon={<Clock className="h-3 w-3" />}
                  tone={fasiAttesa.count && fasiAttesa.count > 0 ? 'warn' : 'neutral'}
                />
                <MetricCell
                  value={fotoOggi.count ?? 0}
                  label="Foto/video"
                  icon={<Camera className="h-3 w-3" />}
                  tone="neutral"
                />
              </div>
            </div>
          </div>
        </section>

      {/* ── 02 / AZIONI RAPIDE ─────────────────────────────────────────────── */}
      <section className="space-y-3 animate-fade-up [animation-delay:80ms]">
        <SectionNumber n={2} title="Azioni rapide" />
        <div className="grid grid-cols-2 gap-2">
          <QuickAction
            href="/mobile/sopralluogo"
            icon={Plus}
            label="Sopralluogo"
            hint="step guidati · foto/video"
            tone="primary"
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

  // Tecnico: vede solo le commesse a cui è assegnato (commessa_tecnici).
  // L'assegnazione è gestita da admin/office via la pagina commessa.
  const { data: assegnazioni } = await supabase
    .from('commessa_tecnici')
    .select('commessa_id')
    .eq('user_id', ctx.userId);
  const assignedIds = (assegnazioni ?? [])
    .map((r) => r.commessa_id as string)
    .filter(Boolean);

  if (assignedIds.length === 0) {
    return (
      <CampoVuoto
        title="Nessuna commessa assegnata"
        body="Quando l'ufficio o l'amministratore ti assegna una commessa, la vedrai qui."
      />
    );
  }

  const [commesseRes, todosRes] = await Promise.all([
    supabase
      .from('commesse')
      .select(
        `
          id, codice_interno, nome_cartella, stato, is_critica,
          cliente_indirizzo_cantiere, data_apertura,
          descrizione_ai_finale, descrizione_ai_proposta, note_iniziali,
          cliente:clienti ( id, ragione_sociale )
        `,
      )
      .in('id', assignedIds)
      .in('stato', ['aperta', 'in_corso', 'collaudo'])
      .order('data_apertura', { ascending: false })
      .order('codice_interno', { ascending: false })
      .limit(30),
    // TODO assegnati al tecnico (cross-commessa) — solo aperti / in_corso.
    // Ordino lato JS per priorità + scadenza.
    supabase
      .from('commessa_todo' as never)
      .select(
        `id, titolo, priorita, scadenza_at, commessa_id,
         commessa:commesse!commessa_todo_commessa_id_fkey ( codice_interno )`,
      )
      .eq('assegnato_a', ctx.userId)
      .in('stato', ['aperto', 'in_corso'])
      .in('commessa_id', assignedIds)
      .limit(50),
  ]);
  const { data, error } = commesseRes;

  if (error) {
    return <ErrorState title="Impossibile caricare le commesse" detail={error.message} />;
  }

  // Ordina TODO: scaduti prima, poi per priorità (urgente→bassa), poi
  // titolo. Limita a 8 in dashboard — i rimanenti sono dentro le commesse.
  type TodoMini = {
    id: string;
    titolo: string;
    priorita: 'bassa' | 'media' | 'alta' | 'urgente';
    scadenza_at: string | null;
    commessa_id: string;
    codice_interno: string | null;
  };
  const priOrder: Record<TodoMini['priorita'], number> = {
    urgente: 0,
    alta: 1,
    media: 2,
    bassa: 3,
  };
  const now = Date.now();
  const myTodos: TodoMini[] = ((todosRes.data ?? []) as Array<any>)
    .map((t) => {
      const comm = Array.isArray(t.commessa) ? t.commessa[0] : t.commessa;
      return {
        id: t.id as string,
        titolo: t.titolo as string,
        priorita: t.priorita as TodoMini['priorita'],
        scadenza_at: (t.scadenza_at as string | null) ?? null,
        commessa_id: t.commessa_id as string,
        codice_interno: (comm?.codice_interno as string | undefined) ?? null,
      };
    })
    .sort((a, b) => {
      const aScaduto = a.scadenza_at && new Date(a.scadenza_at).getTime() < now ? 0 : 1;
      const bScaduto = b.scadenza_at && new Date(b.scadenza_at).getTime() < now ? 0 : 1;
      if (aScaduto !== bScaduto) return aScaduto - bScaduto;
      const pa = priOrder[a.priorita];
      const pb = priOrder[b.priorita];
      if (pa !== pb) return pa - pb;
      return a.titolo.localeCompare(b.titolo, 'it');
    })
    .slice(0, 8);

  const rows: CommessaRow[] = ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    codice_interno: r.codice_interno,
    nome_cartella: r.nome_cartella,
    stato: r.stato as StatoCommessa,
    is_critica: Boolean(r.is_critica),
    cliente_indirizzo_cantiere: r.cliente_indirizzo_cantiere,
    data_apertura: r.data_apertura,
    titolo: pickTitolo(r),
    cliente: Array.isArray(r.cliente) ? (r.cliente[0] ?? null) : r.cliente,
  }));

  return (
    <div className="flex min-h-[100dvh] flex-col pb-24">
      {/* Hero dark */}
      <Hero>
        <HeroMeta>
          {greeting()} · {formatToday()}
        </HeroMeta>
        <h1 className="mt-2 font-mono text-3xl font-bold leading-none tracking-tightest text-primary-foreground">
          OGGI
        </h1>
        <p className="mt-2 text-sm text-primary-foreground/70">
          {rows.length === 0
            ? 'Nessuna commessa attiva.'
            : `${rows.length} ${rows.length === 1 ? 'commessa' : 'commesse'} in carico`}
        </p>
      </Hero>

      <div className="flex flex-col gap-7 px-4 pt-4">
      {/* Azioni rapide */}
      <section className="-mt-12 space-y-3 animate-fade-up [animation-delay:40ms]">
        <div className="rounded-xl border border-border bg-card p-4 shadow-soft-lg">
          <SectionNumber n={1} title="Azioni rapide" className="mb-3" />
        <div className="grid grid-cols-2 gap-2">
          <QuickAction
            href="/mobile/sopralluogo"
            icon={Plus}
            label="Sopralluogo"
            hint="guidato · foto/video"
            tone="primary"
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
        </div>
      </section>

      {/* Cosa fare oggi: TODO assegnati a me */}
      {myTodos.length > 0 ? (
        <section className="space-y-2 animate-fade-up [animation-delay:60ms]">
          <SectionNumber
            n={2}
            title="Cosa fare"
            trailing={
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70">
                {String(myTodos.length).padStart(2, '0')}
              </span>
            }
          />
          <ul className="space-y-1.5">
            {myTodos.map((t) => (
              <TodoMiniCard key={t.id} todo={t} now={now} />
            ))}
          </ul>
        </section>
      ) : null}

      {/* Commesse */}
      <section className="space-y-3 animate-fade-up [animation-delay:80ms]">
        <SectionNumber
          n={myTodos.length > 0 ? 3 : 2}
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
      className="group relative flex items-stretch gap-3 overflow-hidden rounded-lg border border-border bg-card p-3 shadow-soft-md transition-all active:scale-[0.99] active:bg-muted"
    >
      {/* Numerazione laterale */}
      <span
        aria-hidden="true"
        className="flex w-7 shrink-0 flex-col items-center justify-center border-r border-border/60 pr-2 font-mono text-[10px] font-bold tabular-nums text-muted-foreground/60"
      >
        {String(index).padStart(2, '0')}
      </span>

      <div className="min-w-0 flex-1">
        {/* Riga 1: codice + stato + flag critica (meta) */}
        <div className="flex items-center gap-2">
          <StatoLed stato={commessa.stato} />
          <span className="font-mono text-[10px] font-semibold uppercase tabular-nums tracking-wider text-muted-foreground">
            {commessa.codice_interno}
          </span>
          {commessa.is_critica && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-destructive/15 px-1.5 py-px font-mono text-[9px] font-bold uppercase leading-none tracking-wider text-destructive">
              <span aria-hidden="true">●</span> Critica
            </span>
          )}
        </div>
        {/* Riga 2: Cliente (semibold dominante) — lavoro/titolo regular muted.
            Coerente con desktop: il cliente è il primo agganciamento mentale,
            il "lavoro" lo distingue tra più commesse dello stesso cliente. */}
        {(() => {
          const cliente = commessa.cliente?.ragione_sociale?.trim() ?? '';
          const lavoro = (commessa.titolo ?? commessa.nome_cartella ?? '').trim();
          const showBoth =
            cliente && lavoro && cliente.toLowerCase() !== lavoro.toLowerCase();
          return (
            <p className="mt-1 line-clamp-2 text-[15px] leading-snug tracking-tight text-foreground">
              <span className="font-semibold">{cliente || lavoro || '—'}</span>
              {showBoth ? (
                <>
                  <span className="text-muted-foreground/60"> — </span>
                  <span className="font-normal text-muted-foreground">
                    {lavoro}
                  </span>
                </>
              ) : null}
            </p>
          );
        })()}
        {/* Riga 3: indirizzo cantiere (il cliente è ora già nella riga 2). */}
        {commessa.cliente_indirizzo_cantiere ? (
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
            <MapPin className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
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

function TodoMiniCard({
  todo,
  now,
}: {
  todo: {
    id: string;
    titolo: string;
    priorita: 'bassa' | 'media' | 'alta' | 'urgente';
    scadenza_at: string | null;
    commessa_id: string;
    codice_interno: string | null;
  };
  now: number;
}) {
  const meta = {
    urgente: { chip: 'bg-red-500/15 text-red-700 border-red-500/40', icon: Flame },
    alta: { chip: 'bg-amber-500/15 text-amber-700 border-amber-500/40', icon: AlertCircle },
    media: { chip: 'bg-blue-500/15 text-blue-700 border-blue-500/40', icon: Clock },
    bassa: { chip: 'bg-muted text-muted-foreground border-border', icon: Clock },
  }[todo.priorita];
  const Icon = meta.icon;
  const isScaduto =
    todo.scadenza_at && new Date(todo.scadenza_at).getTime() < now;
  return (
    <li>
      <Link
        href={`/mobile/commessa/${todo.commessa_id}#lavori`}
        className="flex items-center gap-2 rounded-md border border-border bg-card p-2.5 shadow-soft transition-colors active:bg-muted"
      >
        <span
          className={[
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border',
            meta.chip,
          ].join(' ')}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight">{todo.titolo}</p>
          <p className="mt-0.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {todo.codice_interno ? (
              <span className="tabular-nums">{todo.codice_interno}</span>
            ) : null}
            {todo.scadenza_at ? (
              <span className={isScaduto ? 'font-semibold text-destructive' : ''}>
                <Calendar className="mr-0.5 inline h-2.5 w-2.5" />
                {fmtScadenza(todo.scadenza_at)}
              </span>
            ) : null}
          </p>
        </div>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}

function fmtScadenza(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('it-IT', {
      day: '2-digit',
      month: 'short',
    });
  } catch {
    return iso;
  }
}

function CampoVuoto({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <Hero>
        <HeroMeta>il tuo lavoro di oggi</HeroMeta>
        <h1 className="mt-1 font-mono text-3xl font-bold leading-none tracking-tightest text-primary-foreground">
          OGGI
        </h1>
      </Hero>
      <div className="px-4 pt-6">
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center">
          <span className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Briefcase className="h-4 w-4" aria-hidden="true" />
          </span>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>
        </div>
      </div>
    </div>
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

/**
 * Estrae il "titolo" di una commessa per il display nella lista:
 *  1. descrizione_ai_finale (set quando la commessa è creata via voice
 *     intake con AI extraction)
 *  2. descrizione_ai_proposta (proposta AI non rivista)
 *  3. note_iniziali (nota originale del capo)
 *  4. null → il chiamante usa nome_cartella o "—"
 *
 * Tronca la prima riga / prima frase per evitare titoli con 3 paragrafi.
 */
function pickTitolo(r: Record<string, unknown>): string | null {
  const raw =
    (r.descrizione_ai_finale as string | null | undefined) ??
    (r.descrizione_ai_proposta as string | null | undefined) ??
    (r.note_iniziali as string | null | undefined) ??
    null;
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Primo a-capo o prima frase
  const firstLine = trimmed.split(/\r?\n/)[0]!;
  // Se primo "punto" è troppo presto (<10 char), prendiamo prima riga intera
  const firstPeriod = firstLine.indexOf('. ');
  if (firstPeriod > 10) return firstLine.slice(0, firstPeriod).trim();
  return firstLine;
}
