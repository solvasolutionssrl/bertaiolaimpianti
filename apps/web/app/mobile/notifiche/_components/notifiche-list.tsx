'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Bell,
  BellOff,
  CalendarClock,
  CheckCheck,
  Clock3,
  Loader2,
  MessageSquare,
  PencilRuler,
  Ticket,
  X,
  type LucideIcon,
} from 'lucide-react';

import { segnaNotificaLetta, segnaTutteLette } from '@/app/office/notifiche/actions';
import { Portal } from '@/app/mobile/_components/portal';

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
  ticket_nuovo_portale: { label: 'Nuovo ticket dal cliente', Icon: Ticket },
  fase_zero_foto: { label: 'Fase senza foto', Icon: Bell },
  dico_scadenza: { label: 'DICO in scadenza', Icon: Clock3 },
  commessa_pronta: { label: 'Commessa pronta per chiusura', Icon: Bell },
  commessa_assigned: { label: 'Commessa assegnata', Icon: Bell },
  commessa_completata: { label: 'Commessa completata', Icon: Bell },
  commessa_collaudo: { label: 'Commessa in collaudo', Icon: Bell },
  commessa_archiviata: { label: 'Commessa archiviata', Icon: Bell },
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

/**
 * Testo esplicativo mostrato dentro il popup, sotto il titolo. Serve a dare
 * contesto senza mandare l'utente su un'altra pagina. Ritorna `null` quando il
 * titolo dice già tutto (niente paragrafo vuoto).
 */
function corpo(n: NotificaRow): string | null {
  const p = (n.payload ?? {}) as Record<string, unknown>;
  if (n.type === 'kantiere_modifica_tecnico') {
    const nome = typeof p.dipendenteNome === 'string' ? p.dipendenteNome : 'Il tecnico';
    return `${nome} ha corretto le ore registrate per quella giornata. Apri la giornata per vedere il dettaglio aggiornato (cantieri, orari e pause).`;
  }
  // Per le altre notifiche il testo ricco è nel payload: mostralo per intero
  // (nella lista è troncato, qui no).
  const full =
    typeof p.descrizione === 'string'
      ? p.descrizione
      : typeof p.title === 'string'
        ? p.title
        : null;
  // Evita di ripetere identico il titolo.
  return full && full !== titolo(n) ? full : null;
}

/**
 * Destinazione **in-app** (mobile) per il tasto "Vai". MAI una route `/office/*`
 * (aprirebbe la versione desktop dentro la PWA — era il bug). Rimappa i tipi
 * noti sulle loro controparti mobile; se non c'è una pagina mobile adatta
 * ritorna `null` e il popup mostra solo le informazioni.
 */
function destinazioneMobile(n: NotificaRow): { href: string; label: string } | null {
  const p = (n.payload ?? {}) as Record<string, unknown>;
  if (n.type === 'kantiere_modifica_tecnico' && typeof p.data === 'string') {
    return { href: `/mobile/kantiere/cruscotto?giorno=${p.data}`, label: 'Vedi la giornata' };
  }
  if (typeof p.commessa_id === 'string') {
    return { href: `/mobile/commessa/${p.commessa_id}`, label: 'Apri la commessa' };
  }
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

function fmtDataOra(iso: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function NotificheList({ rows }: { rows: NotificaRow[] }) {
  const router = useRouter();
  const [markingAll, setMarkingAll] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<NotificaRow | null>(null);
  const [navigating, setNavigating] = useState(false);
  const hasUnread = rows.some((r) => !r.read_at && !readIds.has(r.id));

  function isUnread(n: NotificaRow): boolean {
    return !n.read_at && !readIds.has(n.id);
  }

  // Apertura popup: segna letta (best-effort, non blocca la UI) + mostra i
  // dettagli in-app. NIENTE navigazione a route office.
  function apri(n: NotificaRow) {
    if (isUnread(n)) {
      setReadIds((prev) => new Set(prev).add(n.id));
      void segnaNotificaLetta(n.id).catch(() => {
        /* best-effort */
      });
    }
    setDetail(n);
  }

  function chiudi() {
    setDetail(null);
    // Sincronizza il badge della campanella (server component nel layout).
    router.refresh();
  }

  function vai(href: string) {
    setNavigating(true);
    router.push(href);
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
          const unread = isUnread(n);
          const meta = NOTIF_META[n.type] ?? { label: n.type, Icon: Bell };
          const Icon = meta.Icon;
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => apri(n)}
              className={
                'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors active:bg-muted/50 ' +
                (unread ? 'bg-primary/[0.06]' : '')
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

      {detail ? (
        <NotificaDettaglio
          notifica={detail}
          onClose={chiudi}
          onVai={vai}
          navigating={navigating}
        />
      ) : null}
    </div>
  );
}

/**
 * Popup di dettaglio di una singola notifica. Portalizzato su `document.body`
 * (sopra bottom-nav e campanella), foglio ancorato in basso, con crocetta X,
 * safe-area e tap-fuori per chiudere. Sostituisce la vecchia navigazione verso
 * la pagina office desktop.
 */
function NotificaDettaglio({
  notifica,
  onClose,
  onVai,
  navigating,
}: {
  notifica: NotificaRow;
  onClose: () => void;
  onVai: (href: string) => void;
  navigating: boolean;
}) {
  const meta = NOTIF_META[notifica.type] ?? { label: notifica.type, Icon: Bell };
  const Icon = meta.Icon;
  const testo = corpo(notifica);
  const dest = destinazioneMobile(notifica);

  return (
    <Portal>
      <div
        className="animate-content-in fixed inset-0 z-[80] flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label="Dettaglio notifica"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="animate-fade-up relative w-full max-w-md overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl sm:mx-4 sm:rounded-3xl"
          style={{ maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - 1.5rem)' }}
        >
          {/* grabber handle (feel nativo del foglio) */}
          <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden="true">
            <span className="h-1 w-10 rounded-full bg-border" />
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background/80 text-muted-foreground backdrop-blur transition active:scale-95 hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>

          <div
            className="overflow-y-auto px-5 pb-5 pt-4"
            style={{ maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - 9rem)' }}
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                {meta.label}
              </span>
            </div>

            <h2 className="mt-3 text-lg font-semibold leading-snug tracking-tight text-foreground">
              {titolo(notifica)}
            </h2>

            {testo ? (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{testo}</p>
            ) : null}

            <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="first-letter:uppercase">{fmtDataOra(notifica.created_at)}</span>
            </p>
          </div>

          <div
            className="flex flex-col gap-2 border-t border-border bg-muted/20 px-4 pt-3"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
          >
            {dest ? (
              <button
                type="button"
                onClick={() => onVai(dest.href)}
                disabled={navigating}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-70"
              >
                {navigating ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <>
                    {dest.label}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </>
                )}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex w-full items-center justify-center rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground transition active:scale-[0.98]"
            >
              Chiudi
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
