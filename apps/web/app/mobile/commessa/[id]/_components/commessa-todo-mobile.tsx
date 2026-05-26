'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Circle,
  Flame,
  Loader2,
  PencilLine,
  User,
} from 'lucide-react';
import { Badge, cn } from '@kommessa/ui';

import {
  aggiungiNotaTodo,
  cambiaTodoStato,
} from '../../../../_actions/commessa-todo';
import { useAlert } from '@/app/_components/confirm-provider';

type Priorita = 'bassa' | 'media' | 'alta' | 'urgente';
type Stato = 'aperto' | 'in_corso' | 'completato' | 'annullato';

export interface TodoMobileRow {
  id: string;
  titolo: string;
  descrizione: string | null;
  stato: Stato;
  priorita: Priorita;
  assegnato_a: string | null;
  assegnato_a_nome: string | null;
  scadenza_at: string | null;
  created_at: string;
  created_by_nome: string | null;
  completato_at: string | null;
  completato_da_nome: string | null;
  note: Array<{ id: string; body: string; created_at: string; author_nome: string | null }>;
}

interface Props {
  todos: TodoMobileRow[];
  currentUserId: string;
}

const META: Record<Priorita, { label: string; chip: string; icon: React.ComponentType<{ className?: string }>; order: number }> = {
  urgente: {
    label: 'Urgente',
    chip: 'bg-red-500/15 text-red-700 border-red-500/40 dark:text-red-400',
    icon: Flame,
    order: 0,
  },
  alta: {
    label: 'Alta',
    chip: 'bg-amber-500/15 text-amber-700 border-amber-500/40 dark:text-amber-400',
    icon: AlertCircle,
    order: 1,
  },
  media: {
    label: 'Media',
    chip: 'bg-blue-500/15 text-blue-700 border-blue-500/40 dark:text-blue-400',
    icon: Circle,
    order: 2,
  },
  bassa: {
    label: 'Bassa',
    chip: 'bg-muted text-muted-foreground border-border',
    icon: Circle,
    order: 3,
  },
};

export function CommessaTodoMobile({ todos, currentUserId }: Props) {
  const aperti = React.useMemo(
    () =>
      todos
        .filter((t) => t.stato === 'aperto' || t.stato === 'in_corso')
        .sort((a, b) => {
          const pa = META[a.priorita].order;
          const pb = META[b.priorita].order;
          if (pa !== pb) return pa - pb;
          const am = a.assegnato_a === currentUserId ? 0 : 1;
          const bm = b.assegnato_a === currentUserId ? 0 : 1;
          if (am !== bm) return am - bm;
          return a.created_at.localeCompare(b.created_at);
        }),
    [todos, currentUserId],
  );

  const completati = React.useMemo(
    () =>
      todos
        .filter((t) => t.stato === 'completato')
        .sort((a, b) =>
          (b.completato_at ?? b.created_at).localeCompare(
            a.completato_at ?? a.created_at,
          ),
        ),
    [todos],
  );

  const miei = aperti.filter((t) => t.assegnato_a === currentUserId);
  const altri = aperti.filter((t) => t.assegnato_a !== currentUserId);

  if (aperti.length === 0 && completati.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Nessun da fare su questa commessa.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {miei.length > 0 ? (
        <section>
          <h3 className="mb-1.5 flex items-center gap-1.5 px-1 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
            <User className="h-3 w-3" /> Assegnati a te ({miei.length})
          </h3>
          <ul className="space-y-1.5">
            {miei.map((t) => (
              <TodoCard key={t.id} todo={t} isMine />
            ))}
          </ul>
        </section>
      ) : null}

      {altri.length > 0 ? (
        <section>
          <h3 className="mb-1.5 px-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Altri sulla commessa ({altri.length})
          </h3>
          <ul className="space-y-1.5">
            {altri.map((t) => (
              <TodoCard key={t.id} todo={t} isMine={false} />
            ))}
          </ul>
        </section>
      ) : null}

      {completati.length > 0 ? (
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 px-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            <CheckCircle2 className="h-3 w-3" /> Completati ({completati.length})
          </h3>
          {/* Vertical rail — il dot è l'unico indicatore, niente icona nel card */}
          <div className="relative pl-5">
            <div className="absolute bottom-1 left-2 top-1 w-px bg-border" aria-hidden="true" />
            {completati.map((t) => (
              <div key={t.id} className="relative mb-2 last:mb-0">
                <span
                  className="absolute -left-4 top-5 z-10 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-card"
                  aria-hidden="true"
                />
                <TodoCard todo={t} isMine={t.assegnato_a === currentUserId} readonly />
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function TodoCard({ todo, isMine, readonly }: { todo: TodoMobileRow; isMine: boolean; readonly?: boolean }) {
  const router = useRouter();
  const showAlert = useAlert();
  const [expanded, setExpanded] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [body, setBody] = React.useState('');
  const meta = META[todo.priorita];
  const Icon = meta.icon;

  const complete = async () => {
    setPending(true);
    const res = await cambiaTodoStato({ id: todo.id, stato: 'completato' });
    setPending(false);
    if (!res.ok) {
      await showAlert({ title: 'Errore', body: res.error });
      return;
    }
    router.refresh();
  };

  const saveNote = async () => {
    if (body.trim().length === 0) return;
    setPending(true);
    const res = await aggiungiNotaTodo({ todoId: todo.id, body: body.trim() });
    setPending(false);
    if (!res.ok) {
      await showAlert({ title: 'Errore', body: res.error });
      return;
    }
    setBody('');
    setNoteOpen(false);
    router.refresh();
  };

  return (
    <li
      className={cn(
        'rounded-lg border bg-card p-3 shadow-soft transition-all',
        readonly ? 'border-border' : isMine ? 'border-primary/40 ring-1 ring-primary/20' : 'border-border',
      )}
    >
      <div className="flex items-start gap-2">
        {/* Nessuna icona cerchio in readonly — il dot del rail è sufficiente */}
        {!readonly && (
          <button
            type="button"
            onClick={complete}
            disabled={pending}
            aria-label="Completa TODO"
            className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-emerald-500/10 active:text-emerald-600 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <Circle className="h-6 w-6" />
            )}
          </button>
        )}
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="min-w-0 flex-1 text-left"
        >
          {/* Data SOPRA il titolo per i completati */}
          {readonly && todo.completato_at ? (
            <p className="mb-0.5 font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
              {fmtDataBreve(todo.completato_at)}
              {todo.completato_da_nome ? ` · ${todo.completato_da_nome}` : ''}
            </p>
          ) : null}
          <div className="flex items-start gap-2">
            <p className="flex-1 text-[13px] font-medium leading-snug">
              {todo.titolo}
            </p>
            <Badge
              variant="outline"
              className={cn(
                'shrink-0 gap-0.5 text-[10px] uppercase',
                meta.chip,
              )}
            >
              <Icon className="h-3 w-3" />
              {meta.label}
            </Badge>
          </div>
          {!readonly ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] text-muted-foreground">
              {todo.assegnato_a_nome ? (
                <span>
                  <User className="mr-0.5 inline h-2.5 w-2.5" />
                  {isMine ? 'Tu' : todo.assegnato_a_nome}
                </span>
              ) : (
                <span className="italic">Non assegnato</span>
              )}
              {todo.scadenza_at ? (
                <span
                  className={cn(
                    new Date(todo.scadenza_at) < new Date() &&
                      'font-semibold text-destructive',
                  )}
                >
                  <Calendar className="mr-0.5 inline h-2.5 w-2.5" />
                  {fmtDataBreve(todo.scadenza_at)}
                </span>
              ) : null}
              {todo.note.length > 0 ? (
                <span>
                  <PencilLine className="mr-0.5 inline h-2.5 w-2.5" />
                  {todo.note.length}
                </span>
              ) : null}
              <ChevronDown
                className={cn(
                  'ml-auto h-3 w-3 transition-transform',
                  expanded && 'rotate-180',
                )}
              />
            </div>
          ) : null}
        </button>
      </div>

      {expanded && !readonly ? (
        <div className="mt-2 space-y-2 rounded-md bg-muted/40 p-2">
          {todo.descrizione ? (
            <p className="whitespace-pre-wrap text-xs leading-relaxed">
              {todo.descrizione}
            </p>
          ) : null}
          {todo.note.length > 0 ? (
            <ul className="space-y-1">
              {todo.note.map((n) => (
                <li key={n.id} className="text-xs">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                    {fmtDataBreve(n.created_at)}
                    {n.author_nome ? ` · ${n.author_nome}` : ''}
                  </span>
                  <p className="whitespace-pre-wrap leading-relaxed">{n.body}</p>
                </li>
              ))}
            </ul>
          ) : null}

          {!noteOpen ? (
            <button
              type="button"
              onClick={() => setNoteOpen(true)}
              className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-border py-1.5 text-xs text-muted-foreground hover:bg-card hover:text-foreground"
            >
              <PencilLine className="h-3 w-3" />
              Aggiungi nota
            </button>
          ) : (
            <div className="space-y-1.5">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={2}
                autoFocus
                placeholder="Scrivi una nota…"
                className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              />
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setNoteOpen(false);
                    setBody('');
                  }}
                  className="rounded-md px-2 py-1 text-xs text-muted-foreground"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={saveNote}
                  disabled={pending || body.trim().length === 0}
                  className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
                >
                  {pending ? '…' : 'Salva'}
                </button>
              </div>
            </div>
          )}

          {todo.stato === 'in_corso' ? (
            <p className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400">
              In corso
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function fmtDataBreve(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameYear = d.getFullYear() === now.getFullYear();
    return d.toLocaleDateString('it-IT', {
      day: '2-digit',
      month: 'short',
      year: sameYear ? undefined : '2-digit',
    });
  } catch {
    return iso;
  }
}
