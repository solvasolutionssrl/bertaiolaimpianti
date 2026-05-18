import { MessageSquare, Building2, User } from 'lucide-react';

import { Card, CardContent } from '@impiantixplus/ui';

export interface ComunicazioneItem {
  id: string;
  body: string;
  createdAt: string;
  /** "ufficio" se mittente è staff del tenant, "cliente" se cliente finale */
  mittente: 'ufficio' | 'cliente';
  /** Etichetta visibile (es. "Mario Rossi", "Ufficio Bertaiola") */
  mittenteLabel: string;
  /** Numero/oggetto del ticket associato (opzionale, per raggruppamento) */
  ticketCodice?: string;
  ticketOggetto?: string;
}

export interface TimelineComunicazioniProps {
  items: ComunicazioneItem[];
}

/**
 * Timeline messaggi ticket → portale cliente.
 *
 * Fonte dati: `ticket_messages` filtrati per ticket della commessa,
 * con `is_internal_note = false` (le note interne **non** sono mai
 * visibili al cliente — la RLS deve garantirlo).
 */
export function TimelineComunicazioni({ items }: TimelineComunicazioniProps) {
  if (items.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <MessageSquare className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">Nessuna comunicazione ancora</p>
          <p className="text-xs text-muted-foreground">
            Le risposte dell&apos;ufficio e i tuoi messaggi compariranno qui.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <ol className="relative flex flex-col gap-4 border-l border-border pl-6">
      {items.map((m) => {
        const fromUfficio = m.mittente === 'ufficio';
        return (
          <li key={m.id} className="relative">
            <span
              className="absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card"
              aria-hidden
            >
              {fromUfficio ? (
                <Building2 className="h-3.5 w-3.5 text-[var(--brand-color,theme(colors.primary.DEFAULT))]" />
              ) : (
                <User className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </span>
            <article
              className={
                'rounded-md border border-border bg-card p-3 ' +
                (fromUfficio ? '' : 'bg-muted/40')
              }
            >
              <header className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="text-sm font-semibold">
                  {m.mittenteLabel}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {fromUfficio ? 'Ufficio' : 'Cliente'}
                  </span>
                </p>
                <time
                  dateTime={m.createdAt}
                  className="text-xs text-muted-foreground tabular-nums"
                >
                  {formatDateTime(m.createdAt)}
                </time>
              </header>
              {m.ticketCodice ? (
                <p className="mb-1 text-xs text-muted-foreground">
                  Ticket{' '}
                  <span className="font-mono">{m.ticketCodice}</span>
                  {m.ticketOggetto ? ` · ${m.ticketOggetto}` : null}
                </p>
              ) : null}
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                {m.body}
              </p>
            </article>
          </li>
        );
      })}
    </ol>
  );
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('it-IT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
