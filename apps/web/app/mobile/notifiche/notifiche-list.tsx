'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BellRing,
  CheckCheck,
  CircleDot,
  AlertTriangle,
  CameraIcon,
  Wrench,
  CalendarClock,
  FileWarning,
  FolderCheck,
  Ticket,
} from 'lucide-react';
import { createBrowserSupabase } from '@impiantixplus/api/client';

export interface NotificaItem {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string | null;
  read_at: string | null;
  created_at: string;
}

/**
 * Design system per i tipi notifica.
 * - color: HSL token o classe Tailwind che dipinge la strip verticale a sinistra
 * - icon: lucide
 * - shorthand: badge in alto a destra (3 lettere)
 */
interface TypeTheme {
  color: string;
  icon: React.ComponentType<{ className?: string }>;
  tag: string;
  tone: 'primary' | 'accent' | 'success' | 'destructive' | 'muted';
}

const TYPE_THEME: Record<string, TypeTheme> = {
  ticket_assigned:        { color: 'bg-accent',        icon: Ticket,        tag: 'TKT', tone: 'accent' },
  ticket_created:         { color: 'bg-primary',       icon: Ticket,        tag: 'TKT', tone: 'primary' },
  fase_target_raggiunto:  { color: 'bg-success',       icon: FolderCheck,   tag: 'FOT', tone: 'success' },
  fase_zero_foto:         { color: 'bg-accent/80',     icon: CameraIcon,    tag: 'FOT', tone: 'accent' },
  dico_mancante:          { color: 'bg-destructive',   icon: FileWarning,   tag: 'DOC', tone: 'destructive' },
  commessa_assegnata:     { color: 'bg-primary',       icon: Wrench,        tag: 'CMM', tone: 'primary' },
  intervento_oggi:        { color: 'bg-primary/80',    icon: CalendarClock, tag: 'INT', tone: 'primary' },
};

const FALLBACK_THEME: TypeTheme = TYPE_THEME.ticket_assigned!;

function fmtTime(iso: string): { date: string; time: string; relative: string } {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  let relative = '';
  if (diff < 60) relative = 'adesso';
  else if (diff < 3600) relative = `${Math.floor(diff / 60)}m`;
  else if (diff < 86400) relative = `${Math.floor(diff / 3600)}h`;
  else if (diff < 7 * 86400) relative = `${Math.floor(diff / 86400)}g`;
  else
    relative = d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
  return {
    date: d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' }),
    time: d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
    relative,
  };
}

export function NotificheList({
  initial,
  userId,
}: {
  initial: NotificaItem[];
  userId: string;
}) {
  const [items, setItems] = React.useState<NotificaItem[]>(initial);
  const router = useRouter();
  const supabase = React.useMemo(() => createBrowserSupabase(), []);

  // Realtime: nuove notifiche per questo user appaiono in cima.
  React.useEffect(() => {
    const channel = supabase
      .channel(`notifiche:${userId}`)
      .on(
        'postgres_changes' as any,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifiche',
          filter: `user_id=eq.${userId}`,
        },
        (msg: any) => {
          const n = msg.new;
          setItems((prev) => [
            {
              id: n.id,
              type: n.type,
              title: n.payload?.title ?? 'Notifica',
              body: n.payload?.body ?? '',
              url: n.payload?.url ?? null,
              read_at: n.read_at,
              created_at: n.created_at,
            },
            ...prev,
          ]);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId]);

  const unreadCount = items.filter((i) => !i.read_at).length;

  async function markRead(ids: string[]) {
    if (ids.length === 0) return;
    setItems((prev) =>
      prev.map((i) =>
        ids.includes(i.id) && !i.read_at
          ? { ...i, read_at: new Date().toISOString() }
          : i,
      ),
    );
    await (supabase as any)
      .from('notifiche')
      .update({ read_at: new Date().toISOString() })
      .in('id', ids);
    router.refresh();
  }

  async function markAllRead() {
    const ids = items.filter((i) => !i.read_at).map((i) => i.id);
    await markRead(ids);
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      {/* HEADER: tipografia display, contatori monospace */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 pb-3 pt-5 backdrop-blur-md">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              · centro notifiche ·
            </p>
            <h1 className="mt-0.5 text-[28px] font-semibold leading-none tracking-tight">
              Inbox
            </h1>
          </div>
          <div className="text-right">
            <div className="font-mono text-2xl font-semibold leading-none tracking-tight text-foreground">
              {unreadCount.toString().padStart(2, '0')}
            </div>
            <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              non lette
            </div>
          </div>
        </div>

        {unreadCount > 0 ? (
          <button
            type="button"
            onClick={markAllRead}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-primary transition-colors hover:bg-primary/10"
          >
            <CheckCheck className="h-3 w-3" /> segna tutte come lette
          </button>
        ) : null}
      </header>

      {/* LISTA */}
      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex flex-col">
          {items.map((n) => (
            <NotificaRow
              key={n.id}
              item={n}
              onRead={() => markRead([n.id])}
            />
          ))}
        </ul>
      )}

      <div className="mt-auto px-4 pb-24 pt-6 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
        — fine inbox · {items.length} eventi —
      </div>
    </div>
  );
}

function NotificaRow({
  item,
  onRead,
}: {
  item: NotificaItem;
  onRead: () => void;
}) {
  const theme: TypeTheme = TYPE_THEME[item.type] ?? FALLBACK_THEME;
  const Icon = theme.icon;
  const t = fmtTime(item.created_at);
  const unread = !item.read_at;

  // Le url salvate dal backend usano path office (es. /commesse/abc).
  // Sul mobile rimappiamo verso /mobile/<...> quando possibile.
  const href = item.url
    ? item.url.startsWith('/mobile')
      ? item.url
      : `/mobile${item.url}`
    : null;

  const content = (
    <div
      className={[
        'relative flex gap-3 border-b border-border/60 px-3 py-3.5 transition-colors',
        unread ? 'bg-card' : 'bg-card/40',
      ].join(' ')}
    >
      {/* STRIP verticale colorata */}
      <div
        aria-hidden="true"
        className={[
          'absolute left-0 top-0 h-full w-1',
          theme.color,
          unread ? 'opacity-100' : 'opacity-30',
        ].join(' ')}
      />

      {/* ICONA dentro un quadratino mono con tag */}
      <div className="flex w-12 shrink-0 flex-col items-center">
        <div
          className={[
            'flex h-10 w-10 items-center justify-center rounded-md border',
            unread ? 'border-border bg-background shadow-sm' : 'border-border/50 bg-muted/30',
          ].join(' ')}
        >
          <Icon
            className={[
              'h-4 w-4',
              theme.tone === 'accent' && 'text-accent',
              theme.tone === 'primary' && 'text-primary',
              theme.tone === 'success' && 'text-success',
              theme.tone === 'destructive' && 'text-destructive',
              theme.tone === 'muted' && 'text-muted-foreground',
            ]
              .filter(Boolean)
              .join(' ')}
          />
        </div>
        <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
          {theme.tag}
        </div>
      </div>

      {/* CORPO */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <h3
            className={[
              'truncate text-[15px] leading-tight tracking-tight',
              unread ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground',
            ].join(' ')}
          >
            {item.title}
          </h3>
          {unread ? (
            <CircleDot
              aria-label="non letta"
              className="h-2.5 w-2.5 shrink-0 animate-pulse text-accent"
            />
          ) : null}
        </div>
        {item.body ? (
          <p
            className={[
              'mt-1 line-clamp-2 text-[13px] leading-snug',
              unread ? 'text-muted-foreground' : 'text-muted-foreground/70',
            ].join(' ')}
          >
            {item.body}
          </p>
        ) : null}

        {/* META */}
        <div className="mt-2 flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80">
          <span>{t.date} · {t.time}</span>
          <span
            className={[
              'rounded px-1.5 py-0.5',
              unread ? 'bg-accent/10 text-accent' : 'bg-muted text-muted-foreground/60',
            ].join(' ')}
          >
            {t.relative}
          </span>
        </div>
      </div>
    </div>
  );

  if (href) {
    return (
      <li>
        <Link
          href={href}
          onClick={onRead}
          className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {content}
        </Link>
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        onClick={onRead}
        className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {content}
      </button>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-20 text-center">
      <div className="relative">
        <div
          aria-hidden="true"
          className="absolute -inset-6 rounded-full bg-primary/5 blur-2xl"
        />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-card shadow-sm">
          <BellRing className="h-7 w-7 text-primary" />
        </div>
      </div>
      <h2 className="mt-6 text-lg font-semibold tracking-tight">
        Tutto in ordine
      </h2>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">
        Nessuna notifica al momento. Le novità sui tuoi interventi appaiono qui
        in tempo reale.
      </p>
      <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
        — silent line —
      </p>
    </div>
  );
}
