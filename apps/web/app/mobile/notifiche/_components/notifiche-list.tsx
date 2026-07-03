'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  BellOff,
  CheckCheck,
  Clock3,
  Loader2,
  MessageSquare,
  PencilRuler,
  Ticket,
  type LucideIcon,
} from 'lucide-react';

import { segnaNotificaLetta, segnaTutteLette } from '@/app/office/notifiche/actions';

export interface NotificaRow {
  id: string;
  type: string;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

const NOTIF_META: Record<string, { label: string; Icon: LucideIcon }> = {
  ticket_assigned: { label: 'Ticket assegnato', Icon: Ticket },
  ticket_new_message: { label: 'Nuovo messaggio ticket', Icon: MessageSquare },
  fase_zero_foto: { label: 'Fase senza foto', Icon: Bell },
  dico_scadenza: { label: 'DICO in scadenza', Icon: Clock3 },
  commessa_pronta: { label: 'Commessa pronta per chiusura', Icon: Bell },
  voice_note: { label: 'Nota vocale', Icon: Bell },
  kantiere_modifica_tecnico: { label: 'Ore modificate dal tecnico', Icon: PencilRuler },
};

function fmtGiorno(data: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${data}T12:00:00Z`));
}

function titolo(n: NotificaRow): string {
  const p = (n.payload ?? {}) as Record<string, unknown>;
  if (n.type === 'kantiere_modifica_tecnico') {
    const nome = typeof p.dipendenteNome === 'string' ? p.dipendenteNome : 'Un tecnico';
    const data = typeof p.data === 'string' ? fmtGiorno(p.data) : 'una giornata';
    return `${nome} ha modificato le ore del ${data}`;
  }
  if (typeof p.title === 'string') return p.title;
  if (typeof p.descrizione === 'string') return p.descrizione;
  return NOTIF_META[n.type]?.label ?? n.type;
}

function destinazione(n: NotificaRow): string | null {
  const p = (n.payload ?? {}) as Record<string, unknown>;
  if (typeof p.url === 'string') return p.url;
  if (typeof p.href === 'string') return p.href;
  return null;
}

function fmtQuando(iso: string): string {
  const date = new Date(iso);
  const ms = Date.now() - date.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'adesso';
  if (min < 60) return `${min} min fa`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h fa`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}g fa`;
  return date.toLocaleDateString('it-IT', {
    timeZone: 'Europe/Rome',
    day: '2-digit',
    month: '2-digit',
  });
}

export function NotificheList({ rows }: { rows: NotificaRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const hasUnread = rows.some((r) => !r.read_at);

  async function apri(n: NotificaRow) {
    if (busy) return;
    const href = destinazione(n);
    setBusy(n.id);
    if (!n.read_at) {
      try {
        await segnaNotificaLetta(n.id);
      } catch {
        // best-effort
      }
    }
    if (href) router.push(href);
    else router.refresh();
    setBusy(null);
  }

  async function tutteLette() {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      await segnaTutteLette();
    } catch {
      // best-effort
    }
    router.refresh();
    setMarkingAll(false);
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
        <BellOff className="mx-auto mb-2 h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium">Nessuna notifica</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Quando succede qualcosa (ore modificate, ticket, ecc.) lo trovi qui.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {hasUnread ? (
        <button
          type="button"
          onClick={() => void tutteLette()}
          disabled={markingAll}
          className="inline-flex items-center gap-1.5 self-end rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-soft transition-colors hover:text-foreground disabled:opacity-60"
        >
          {markingAll ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Segna tutte lette
        </button>
      ) : null}

      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-soft">
        {rows.map((n) => {
          const unread = !n.read_at;
          const meta = NOTIF_META[n.type] ?? { label: n.type, Icon: Bell };
          const Icon = meta.Icon;
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => void apri(n)}
              disabled={busy === n.id}
              className={
                'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors active:bg-muted/50 ' +
                (unread ? 'bg-primary/[0.06]' : '') +
                (busy === n.id ? ' opacity-60' : '')
              }
            >
              <span
                className={
                  'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ' +
                  (unread
                    ? 'border-primary/30 bg-primary/10 text-primary'
                    : 'border-border bg-muted text-muted-foreground')
                }
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className={'text-sm leading-snug ' + (unread ? 'font-semibold' : 'font-medium')}>
                  {titolo(n)}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                  <span>{meta.label}</span>
                  <span>· {fmtQuando(n.created_at)}</span>
                </p>
              </div>
              {unread ? (
                <span
                  className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary"
                  aria-label="Non letta"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
