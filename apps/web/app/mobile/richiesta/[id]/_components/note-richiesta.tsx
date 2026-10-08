'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';

import { aggiungiNotaTodo } from '@/app/_actions/commessa-todo';
import { useAlert } from '@/app/_components/confirm-provider';
import { MetaLine } from '../../../_components/blueprint';

/**
 * Quello che si scopre andandoci.
 *
 * Una richiesta nasce da una telefonata, e quello che si trova sul posto quasi
 * mai coincide: «la caldaia è un'altra marca», «non c'era nessuno, richiamare
 * dopo le 18». Finora quelle cose restavano a voce fino al rientro.
 *
 * ⚠️ Stesso meccanismo delle note di una cosa da fare dentro una commessa
 * (`commessa_todo_nota`): è la stessa tabella e la stessa azione, e sarebbe
 * stato facile fare un secondo posto dove scrivere la stessa cosa.
 */
export function NoteRichiesta({
  todoId,
  note,
}: {
  todoId: string;
  note: Array<{ id: string; body: string; created_at: string; autore: string }>;
}) {
  const router = useRouter();
  const mostraAvviso = useAlert();
  const [aperto, setAperto] = React.useState(false);
  const [testo, setTesto] = React.useState('');
  const [inCorso, setInCorso] = React.useState(false);

  const salva = async () => {
    const body = testo.trim();
    if (body.length === 0) return;
    setInCorso(true);
    const res = await aggiungiNotaTodo({ todoId, body });
    setInCorso(false);
    if (!res.ok) {
      await mostraAvviso({ title: 'Nota non salvata', body: res.error });
      return;
    }
    setTesto('');
    setAperto(false);
    router.refresh();
  };

  return (
    <section className="animate-fade-up rounded-xl border border-border bg-card p-4 shadow-soft [animation-delay:120ms]">
      <MetaLine>Note</MetaLine>

      {note.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-2.5">
          {note.map((n) => (
            <li key={n.id} className="rounded-lg bg-muted/40 p-2.5">
              <p className="whitespace-pre-wrap text-sm leading-snug">{n.body}</p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {fmtQuando(n.created_at)} · {n.autore}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Niente, per ora. Quello che scopri sul posto si scrive qui.
        </p>
      )}

      {aperto ? (
        <div className="mt-3">
          <textarea
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Es. caldaia di marca diversa, serve il raccordo da 3/4"
            // ⚠️ `text-base`: sotto i 16px WebKit ingrandisce la pagina da solo
            // appena il campo prende il fuoco.
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-base"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={salva}
              disabled={inCorso || testo.trim().length === 0}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {inCorso ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Salva
            </button>
            <button
              type="button"
              onClick={() => {
                setAperto(false);
                setTesto('');
              }}
              className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-4 text-sm font-medium"
            >
              Annulla
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAperto(true)}
          className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm font-medium text-muted-foreground transition-colors active:bg-muted"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Aggiungi una nota
        </button>
      )}
    </section>
  );
}

function fmtQuando(iso: string): string {
  try {
    return formatta(iso);
  } catch {
    // `Intl.format` su una data non valida **solleva**, e qui siamo nel render
    // di un componente client: la pagina intera finirebbe sull'errore per un
    // timestamp storto.
    return iso;
  }
}

function formatta(iso: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}
