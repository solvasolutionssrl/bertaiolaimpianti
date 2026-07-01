'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Clock3,
  MessageSquare,
  PencilRuler,
  Ticket,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, cn } from '@kommessa/ui';

import { fmtDataOra } from '../../_lib/format';
import { segnaNotificaLetta } from '../actions';

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

/** Titolo leggibile della notifica, con caso dedicato per la modifica tecnico. */
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

/**
 * Lista dello storico notifiche dell'ufficio. Il tap marca la notifica come
 * letta (campanella -1) e naviga al deep-link della notifica (`payload.url`).
 */
export function StoricoNotifiche({ rows }: { rows: NotificaRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function apri(n: NotificaRow) {
    if (busy) return;
    const href = destinazione(n);
    setBusy(n.id);
    if (!n.read_at) {
      try {
        await segnaNotificaLetta(n.id);
      } catch {
        // best-effort: non blocca la navigazione
      }
    }
    if (href) router.push(href);
    else router.refresh();
    setBusy(null);
  }

  return (
    <Card>
      <CardContent className="divide-y divide-border p-0">
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
              className={cn(
                'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40',
                unread && 'bg-primary/5',
                busy === n.id && 'opacity-60',
              )}
            >
              <Icon
                className={cn(
                  'mt-0.5 h-4 w-4 shrink-0',
                  unread ? 'text-primary' : 'text-muted-foreground',
                )}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={cn('flex-1 text-sm', unread && 'font-semibold')}>{titolo(n)}</p>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {fmtDataOra(n.created_at)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{meta.label}</p>
              </div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
