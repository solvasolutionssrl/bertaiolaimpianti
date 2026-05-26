'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleDot,
  Clock,
  Filter,
  Flame,
  GripVertical,
  Loader2,
  MoreHorizontal,
  PencilLine,
  Plus,
  Sparkles,
  Trash2,
  User,
  UserPlus,
  X,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  cn,
} from '@kommessa/ui';
import {
  aggiungiNotaTodo,
  cambiaTodoStato,
  eliminaTodo,
  riordinaTodo,
} from '../../../../../_actions/commessa-todo';
import { eliminaRiunione } from '../../../../../_actions/commessa-riunione';
import { useAlert, useConfirm } from '@/app/_components/confirm-provider';

import { CreaTodoDialog } from './crea-todo-dialog';
import { CreaRiunioneDialog } from './crea-riunione-dialog';

type Priorita = 'bassa' | 'media' | 'alta' | 'urgente';
type StatoTodo = 'aperto' | 'in_corso' | 'completato' | 'annullato';

interface TodoView {
  id: string;
  titolo: string;
  descrizione: string | null;
  stato: StatoTodo;
  priorita: Priorita;
  assegnato_a: string | null;
  assegnato_a_nome: string | null;
  scadenza_at: string | null;
  sort_order: number;
  metadata: Record<string, unknown> | null;
  created_by: string | null;
  created_by_nome: string | null;
  created_at: string;
  updated_at: string;
  completato_at: string | null;
  completato_da: string | null;
  completato_da_nome: string | null;
}

interface NotaView {
  id: string;
  todo_id: string;
  author_id: string | null;
  author_nome: string | null;
  body: string;
  created_at: string;
}

export interface RiunioneAllegatoView {
  id: string;
  file_ref_id: string;
  filename: string;
  mime: string;
  path: string | null;
  kind: 'foto' | 'pdf_acquisito';
}

interface RiunioneView {
  id: string;
  data_riunione: string;
  titolo: string | null;
  corpo_libero: string | null;
  trascrizione: string | null;
  reportino: string | null;
  reportino_modello: string | null;
  reportino_generato_at: string | null;
  created_by: string | null;
  created_by_nome: string | null;
  created_at: string;
  updated_at: string;
  /** Allegati linkati alla riunione (caricati lato server). */
  allegati: RiunioneAllegatoView[];
}

interface AuditView {
  id: string;
  action: string;
  metadata: Record<string, unknown> | null;
  actor_user_id: string | null;
  actor_nome: string | null;
  actor_role: string | null;
  created_at: string;
}

interface FileView {
  id: string;
  filename: string | null;
  path: string | null;
  taken_at: string | null;
  uploaded_at: string | null;
  uploaded_by: string | null;
  uploader_nome: string | null;
  mime: string | null;
  momento: string | null;
}

interface Props {
  commessaId: string;
  currentUserId: string;
  canWrite: boolean;
  contestoCommessa: string;
  todos: TodoView[];
  note: NotaView[];
  riunioni: RiunioneView[];
  auditEvents: AuditView[];
  filesRecenti: FileView[];
  tecniciTenant: Array<{ id: string; display_name: string | null }>;
}

// ═══════════════════════════════════════════════════════════════════════
// Constants di styling priorità
// ═══════════════════════════════════════════════════════════════════════

const PRIORITA_META: Record<
  Priorita,
  { label: string; chip: string; ring: string; icon: React.ComponentType<{ className?: string }>; order: number }
> = {
  urgente: {
    label: 'Urgente',
    chip: 'bg-red-500/15 text-red-700 border-red-500/40 dark:text-red-400',
    ring: 'ring-red-500/30',
    icon: Flame,
    order: 0,
  },
  alta: {
    label: 'Alta',
    chip: 'bg-amber-500/15 text-amber-700 border-amber-500/40 dark:text-amber-400',
    ring: 'ring-amber-500/30',
    icon: AlertCircle,
    order: 1,
  },
  media: {
    label: 'Media',
    chip: 'bg-blue-500/15 text-blue-700 border-blue-500/40 dark:text-blue-400',
    ring: 'ring-blue-500/20',
    icon: Circle,
    order: 2,
  },
  bassa: {
    label: 'Bassa',
    chip: 'bg-muted text-muted-foreground border-border',
    ring: '',
    icon: Circle,
    order: 3,
  },
};

// ═══════════════════════════════════════════════════════════════════════

export function LavoriBoard({
  commessaId,
  currentUserId,
  canWrite,
  contestoCommessa,
  todos,
  note,
  riunioni,
  auditEvents,
  filesRecenti,
  tecniciTenant,
}: Props) {
  const router = useRouter();
  const showAlert = useAlert();
  const askConfirm = useConfirm();
  const [pending, start] = React.useTransition();
  const [filtro, setFiltro] = React.useState<
    'tutto' | 'todo' | 'riunioni' | 'foto' | 'stato'
  >('tutto');
  const [todoOpen, setTodoOpen] = React.useState(false);
  const [riunioneOpen, setRiunioneOpen] = React.useState(false);
  const [todoInEdit, setTodoInEdit] = React.useState<TodoView | null>(null);

  // ─── separa todos aperti/chiusi ─────────────────────────────────────
  const todosAperti = React.useMemo(
    () =>
      todos
        .filter((t) => t.stato === 'aperto' || t.stato === 'in_corso')
        .sort((a, b) => {
          const pa = PRIORITA_META[a.priorita].order;
          const pb = PRIORITA_META[b.priorita].order;
          if (pa !== pb) return pa - pb;
          return a.sort_order - b.sort_order;
        }),
    [todos],
  );

  const todosCompletati = React.useMemo(
    () =>
      todos.filter(
        (t) => t.stato === 'completato' || t.stato === 'annullato',
      ),
    [todos],
  );

  const noteByTodo = React.useMemo(() => {
    const m = new Map<string, NotaView[]>();
    for (const n of note) {
      const list = m.get(n.todo_id) ?? [];
      list.push(n);
      m.set(n.todo_id, list);
    }
    return m;
  }, [note]);

  // ─── costruisci timeline ─────────────────────────────────────────────
  const timeline = React.useMemo(() => {
    type Entry =
      | { kind: 'todo_completato'; ts: string; todo: TodoView }
      | { kind: 'todo_annullato'; ts: string; todo: TodoView }
      | { kind: 'todo_creato'; ts: string; todo: TodoView }
      | { kind: 'todo_nota'; ts: string; todo: TodoView; nota: NotaView }
      | { kind: 'riunione'; ts: string; riunione: RiunioneView }
      | { kind: 'stato'; ts: string; audit: AuditView }
      | { kind: 'critica'; ts: string; audit: AuditView }
      | { kind: 'file'; ts: string; file: FileView };

    const all: Entry[] = [];
    // TODO: solo completato/annullato — i "creato" sono rumore nella cronologia
    for (const t of todos) {
      if (t.completato_at && t.stato === 'completato')
        all.push({ kind: 'todo_completato', ts: t.completato_at, todo: t });
      if (t.stato === 'annullato')
        all.push({ kind: 'todo_annullato', ts: t.updated_at, todo: t });
    }
    // Note
    for (const n of note) {
      const t = todos.find((x) => x.id === n.todo_id);
      if (!t) continue;
      all.push({ kind: 'todo_nota', ts: n.created_at, todo: t, nota: n });
    }
    // Riunioni
    for (const r of riunioni) {
      all.push({ kind: 'riunione', ts: r.created_at, riunione: r });
    }
    // Audit
    for (const a of auditEvents) {
      if (a.action === 'commessa.stato.cambiato')
        all.push({ kind: 'stato', ts: a.created_at, audit: a });
      else if (a.action === 'commessa.critica.toggle')
        all.push({ kind: 'critica', ts: a.created_at, audit: a });
    }
    // File
    for (const f of filesRecenti) {
      if (f.uploaded_at) all.push({ kind: 'file', ts: f.uploaded_at, file: f });
    }

    return all.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  }, [todos, note, riunioni, auditEvents, filesRecenti]);

  const timelineFiltrata = React.useMemo(() => {
    return timeline.filter((e) => {
      switch (filtro) {
        case 'tutto':
          // note interne escluse dal default: troppo granulari per la cronologia
          return e.kind !== 'todo_nota';
        case 'todo':
          return (
            e.kind === 'todo_completato' ||
            e.kind === 'todo_annullato' ||
            e.kind === 'todo_nota'
          );
        case 'riunioni':
          return e.kind === 'riunione';
        case 'foto':
          return e.kind === 'file';
        case 'stato':
          return e.kind === 'stato' || e.kind === 'critica';
      }
    });
  }, [timeline, filtro]);

  // ─── handlers ────────────────────────────────────────────────────────

  const onComplete = (id: string) =>
    start(async () => {
      const res = await cambiaTodoStato({ id, stato: 'completato' });
      if (!res.ok) await showAlert({ title: 'Errore', body: res.error });
      router.refresh();
    });

  const onReopen = (id: string) =>
    start(async () => {
      const res = await cambiaTodoStato({ id, stato: 'aperto' });
      if (!res.ok) await showAlert({ title: 'Errore', body: res.error });
      router.refresh();
    });

  const onDelete = (todo: TodoView) =>
    start(async () => {
      if (
        !(await askConfirm({
          title: 'Eliminare il TODO?',
          description: `"${todo.titolo}" — l'azione cancella anche le note e gli allegati associati.`,
          destructive: true,
          confirmLabel: 'Elimina',
        }))
      )
        return;
      const res = await eliminaTodo({ id: todo.id });
      if (!res.ok) await showAlert({ title: 'Errore', body: res.error });
      router.refresh();
    });

  const onDeleteRiunione = (r: RiunioneView) =>
    start(async () => {
      if (
        !(await askConfirm({
          title: 'Eliminare la riunione?',
          description: r.titolo
            ? `"${r.titolo}" del ${fmtData(r.data_riunione)} — cancellazione definitiva.`
            : `Riunione del ${fmtData(r.data_riunione)} — cancellazione definitiva.`,
          destructive: true,
          confirmLabel: 'Elimina',
        }))
      )
        return;
      const res = await eliminaRiunione({ id: r.id });
      if (!res.ok) await showAlert({ title: 'Errore', body: res.error });
      router.refresh();
    });

  // ─── render ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header azioni */}
      {canWrite ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {todosAperti.length} TODO aperti · {todosCompletati.length} completati ·{' '}
            {riunioni.length} riunioni
          </p>
          <div className="flex gap-2">
            <Button onClick={() => setRiunioneOpen(true)} variant="outline">
              <Sparkles className="h-3.5 w-3.5" />
              Nuova riunione
            </Button>
            <Button onClick={() => setTodoOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Nuovo TODO
            </Button>
          </div>
        </div>
      ) : null}

      {/* ── ZONA DA FARE ─────────────────────────────────────────────── */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <CircleDot className="h-3.5 w-3.5" />
            </span>
            <h2 className="text-sm font-semibold tracking-tight">Da fare</h2>
            <span className={cn(
              'rounded-full px-2 py-0.5 font-mono text-xs font-semibold',
              todosAperti.length > 0 ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
            )}>
              {todosAperti.length}
            </span>
          </div>
          {canWrite && todosAperti.length > 1 ? (
            <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground/50">
              <GripVertical className="h-3 w-3" /> Trascina per riordinare
            </span>
          ) : null}
        </div>

        {todosAperti.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-primary/20 bg-primary/[0.025] ring-1 ring-primary/10">
            <div className="p-3">
              <TodoDraggableList
                commessaId={commessaId}
                todos={todosAperti}
                currentUserId={currentUserId}
                noteByTodo={noteByTodo}
                canWrite={canWrite}
                pending={pending}
                onComplete={onComplete}
                onEdit={(t) => setTodoInEdit(t)}
                onDelete={onDelete}
                onNoteAdded={() => router.refresh()}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/60 py-8 text-center">
            <CircleDot className="h-6 w-6 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground/70">Nessun TODO aperto</p>
            <p className="text-xs text-muted-foreground">
              {canWrite
                ? 'Crea il primo TODO o avvia una riunione: il sistema può proporli automaticamente.'
                : "Quando l'ufficio aprirà delle attività compariranno qui."}
            </p>
          </div>
        )}
      </div>

      {/* ── STORICO divider ──────────────────────────────────────────── */}
      <div className="flex items-center gap-3 pt-1">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/60">
          Storico
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* Filtri timeline */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <Filter className="h-3 w-3 shrink-0 text-muted-foreground" />
        {(
          [
            ['tutto', 'Tutto'],
            ['todo', 'TODO'],
            ['riunioni', 'Riunioni'],
            ['foto', 'Foto/File'],
            ['stato', 'Stato'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFiltro(key)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1 text-xs transition-colors',
              filtro === key
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Timeline cronologica */}
      {timelineFiltrata.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <span>Nessun evento per questo filtro.</span>
            {filtro !== 'tutto' && timeline.length > 0 ? (
              <button
                type="button"
                onClick={() => setFiltro('tutto')}
                className="text-xs font-medium text-primary hover:underline"
              >
                Rimuovi filtro
              </button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {timelineFiltrata.map((e, idx) => (
              <TimelineEntry
                key={`${e.kind}-${idx}`}
                entry={e}
                canWrite={canWrite}
                onDeleteRiunione={onDeleteRiunione}
                onReopenTodo={onReopen}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      {todoOpen ? (
        <CreaTodoDialog
          commessaId={commessaId}
          tecniciTenant={tecniciTenant}
          onClose={() => setTodoOpen(false)}
        />
      ) : null}
      {todoInEdit ? (
        <CreaTodoDialog
          commessaId={commessaId}
          tecniciTenant={tecniciTenant}
          editing={todoInEdit}
          onClose={() => setTodoInEdit(null)}
        />
      ) : null}
      {riunioneOpen ? (
        <CreaRiunioneDialog
          commessaId={commessaId}
          contestoCommessa={contestoCommessa}
          tecniciTenant={tecniciTenant}
          onClose={() => setRiunioneOpen(false)}
        />
      ) : null}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// TodoDraggableList — wrapper con HTML5 drag-and-drop + keyboard a11y
// ═══════════════════════════════════════════════════════════════════════

function TodoDraggableList({
  commessaId,
  todos,
  currentUserId,
  noteByTodo,
  canWrite,
  pending,
  onComplete,
  onEdit,
  onDelete,
  onNoteAdded,
}: {
  commessaId: string;
  todos: TodoView[];
  currentUserId: string;
  noteByTodo: Map<string, NotaView[]>;
  canWrite: boolean;
  pending: boolean;
  onComplete: (id: string) => void;
  onEdit: (t: TodoView) => void;
  onDelete: (t: TodoView) => void;
  onNoteAdded: () => void;
}) {
  // Stato locale = ordine corrente in UI. Sincronizzato con `todos` quando
  // arriva un refresh dal server. Durante un drag, lavoriamo su questo.
  const [orderedIds, setOrderedIds] = React.useState<string[]>(
    todos.map((t) => t.id),
  );
  React.useEffect(() => {
    setOrderedIds(todos.map((t) => t.id));
  }, [todos]);

  const byId = React.useMemo(() => {
    const m = new Map<string, TodoView>();
    for (const t of todos) m.set(t.id, t);
    return m;
  }, [todos]);

  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = React.useState<string | null>(null);
  const router = useRouter();
  const showAlert = useAlert();

  const persistOrder = React.useCallback(
    async (nextIds: string[]) => {
      // Optimistic update già fatto
      const res = await riordinaTodo({
        commessaId,
        idsOrdinati: nextIds,
      });
      if (!res.ok) {
        await showAlert({ title: 'Errore riordino', body: res.error });
        // Rollback: rileggi
        router.refresh();
      } else {
        router.refresh();
      }
    },
    [commessaId, router, showAlert],
  );

  const moveBy = (id: string, delta: -1 | 1) => {
    setOrderedIds((curr) => {
      const idx = curr.indexOf(id);
      if (idx < 0) return curr;
      const targetIdx = idx + delta;
      if (targetIdx < 0 || targetIdx >= curr.length) return curr;
      const next = [...curr];
      [next[idx], next[targetIdx]] = [next[targetIdx]!, next[idx]!];
      void persistOrder(next);
      return next;
    });
  };

  const onDragStart =
    (id: string): React.DragEventHandler<HTMLButtonElement> =>
    (e) => {
      setDraggingId(id);
      e.dataTransfer.effectAllowed = 'move';
      try {
        e.dataTransfer.setData('text/plain', id);
      } catch {
        /* alcuni browser strict */
      }
    };

  const onLiDragOver =
    (targetId: string): React.DragEventHandler<HTMLLIElement> =>
    (e) => {
      if (!draggingId || draggingId === targetId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDropTargetId(targetId);
    };

  const onLiDrop =
    (targetId: string): React.DragEventHandler<HTMLLIElement> =>
    (e) => {
      e.preventDefault();
      const fromId = draggingId;
      setDraggingId(null);
      setDropTargetId(null);
      if (!fromId || fromId === targetId) return;
      setOrderedIds((curr) => {
        const fromIdx = curr.indexOf(fromId);
        const toIdx = curr.indexOf(targetId);
        if (fromIdx < 0 || toIdx < 0) return curr;
        const next = [...curr];
        next.splice(fromIdx, 1);
        next.splice(toIdx, 0, fromId);
        void persistOrder(next);
        return next;
      });
    };

  const onDragEnd: React.DragEventHandler = () => {
    setDraggingId(null);
    setDropTargetId(null);
  };

  return (
    <ul className="space-y-2" role="list">
      {orderedIds.map((id) => {
        const t = byId.get(id);
        if (!t) return null;
        const dragProps =
          canWrite && orderedIds.length > 1
            ? {
                draggable: true,
                onDragStart: onDragStart(id),
                onDragEnd,
                onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    moveBy(id, 1);
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    moveBy(id, -1);
                  }
                },
              }
            : undefined;
        return (
          <li
            key={id}
            onDragOver={canWrite ? onLiDragOver(id) : undefined}
            onDrop={canWrite ? onLiDrop(id) : undefined}
            onDragLeave={() => setDropTargetId(null)}
            className="list-none"
          >
            <TodoRow
              todo={t}
              isMine={t.assegnato_a === currentUserId}
              notes={noteByTodo.get(t.id) ?? []}
              canEdit={canWrite}
              pending={pending}
              onComplete={() => onComplete(t.id)}
              onEdit={() => onEdit(t)}
              onDelete={() => onDelete(t)}
              onNoteAdded={onNoteAdded}
              dragHandleProps={dragProps}
              isDragging={draggingId === id}
              isDropTarget={dropTargetId === id && draggingId !== id}
            />
          </li>
        );
      })}
    </ul>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// TodoRow
// ═══════════════════════════════════════════════════════════════════════

function TodoRow({
  todo,
  isMine,
  notes,
  canEdit,
  pending,
  onComplete,
  onEdit,
  onDelete,
  onNoteAdded,
  dragHandleProps,
  isDragging,
  isDropTarget,
}: {
  todo: TodoView;
  isMine: boolean;
  notes: NotaView[];
  canEdit: boolean;
  pending: boolean;
  onComplete: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onNoteAdded: () => void;
  /** Props da spreadare sull'handle del drag (solo se canEdit). */
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  /** True mentre questa riga è quella trascinata. */
  isDragging?: boolean;
  /** True quando questa è la riga su cui rilasceremo. */
  isDropTarget?: boolean;
}) {
  const fonteRiunione =
    todo.metadata && typeof todo.metadata === 'object'
      ? typeof (todo.metadata as { fonte?: unknown }).fonte === 'string'
        ? ((todo.metadata as { fonte: string }).fonte.startsWith('riunione:')
          ? 'riunione'
          : null)
        : null
      : null;
  const showAlert = useAlert();
  const [expanded, setExpanded] = React.useState(false);
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [noteBody, setNoteBody] = React.useState('');
  const [submittingNote, setSubmittingNote] = React.useState(false);

  const meta = PRIORITA_META[todo.priorita];
  const Icon = meta.icon;

  const submitNote = async () => {
    if (noteBody.trim().length === 0) return;
    setSubmittingNote(true);
    const res = await aggiungiNotaTodo({ todoId: todo.id, body: noteBody.trim() });
    setSubmittingNote(false);
    if (!res.ok) {
      await showAlert({ title: 'Errore', body: res.error });
      return;
    }
    setNoteBody('');
    setNoteOpen(false);
    onNoteAdded();
  };

  return (
    <div
      className={cn(
        'group rounded-md border bg-card p-3 transition-all',
        isMine && 'ring-2',
        isMine && meta.ring,
        isDragging && 'opacity-40',
        isDropTarget && 'border-primary ring-2 ring-primary/30',
      )}
    >
      <div className="flex items-start gap-3">
        {dragHandleProps ? (
          <button
            type="button"
            {...dragHandleProps}
            aria-label="Trascina per riordinare"
            className="-m-1 flex h-8 w-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground/40 transition-colors hover:text-foreground active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={onComplete}
          disabled={pending}
          aria-label="Completa TODO"
          // Tap target ~44px (h-10 + padding) per touch-friendliness
          className="-m-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-emerald-500/10 hover:text-emerald-600 disabled:opacity-50"
        >
          <Circle className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Icon className={cn('h-3.5 w-3.5 shrink-0')} />
            <p className="flex-1 truncate text-sm font-medium">{todo.titolo}</p>
            <Badge
              variant="outline"
              className={cn('text-[10px] uppercase tracking-wide', meta.chip)}
            >
              {meta.label}
            </Badge>
            {todo.stato === 'in_corso' ? (
              <Badge variant="outline" className="text-[10px] uppercase">
                In corso
              </Badge>
            ) : null}
            {fonteRiunione ? (
              <Badge
                variant="outline"
                className="border-primary/30 bg-primary/5 text-[10px] uppercase text-primary"
                title="TODO generato automaticamente dal report di una riunione"
              >
                <Sparkles className="mr-0.5 h-2.5 w-2.5" />
                Da riunione
              </Badge>
            ) : null}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {todo.assegnato_a_nome ? (
              <span className="flex items-center gap-0.5">
                <User className="h-3 w-3" /> {todo.assegnato_a_nome}
                {isMine ? (
                  <span className="ml-1 rounded bg-primary/10 px-1 text-[9px] font-semibold uppercase text-primary">
                    Tu
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="flex items-center gap-0.5 italic">
                <UserPlus className="h-3 w-3" /> Non assegnato
              </span>
            )}
            {todo.scadenza_at ? (
              <span
                className={cn(
                  'flex items-center gap-0.5',
                  new Date(todo.scadenza_at) < new Date() && 'text-destructive',
                )}
              >
                <Calendar className="h-3 w-3" /> Scade {fmtDataBreve(todo.scadenza_at)}
              </span>
            ) : null}
            <span className="flex items-center gap-0.5">
              <Clock className="h-3 w-3" /> Creato {fmtDataBreve(todo.created_at)}
              {todo.created_by_nome ? ` da ${todo.created_by_nome}` : ''}
            </span>
            {notes.length > 0 ? (
              <span className="flex items-center gap-0.5">
                <PencilLine className="h-3 w-3" /> {notes.length} note
              </span>
            ) : null}
          </div>

          {(todo.descrizione || notes.length > 0) && expanded ? (
            <div className="mt-2 space-y-2 rounded-md bg-muted/40 p-2.5">
              {todo.descrizione ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {todo.descrizione}
                </p>
              ) : null}
              {notes.length > 0 ? (
                <ul className="space-y-2">
                  {notes.map((n) => (
                    <li key={n.id} className="text-xs">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {fmtDataBreve(n.created_at)}
                        {n.author_nome ? ` · ${n.author_nome}` : ''}
                      </span>
                      <p className="whitespace-pre-wrap text-sm">{n.body}</p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {noteOpen ? (
            <div className="mt-2 space-y-2 rounded-md border border-border bg-card p-2">
              <textarea
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                placeholder="Aggiungi una nota datata…"
                rows={2}
                className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              />
              <div className="flex justify-end gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setNoteOpen(false);
                    setNoteBody('');
                  }}
                >
                  Annulla
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={submittingNote || noteBody.trim().length === 0}
                  onClick={submitNote}
                >
                  {submittingNote ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Salva nota
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Espandi"
          >
            <ChevronDown
              className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')}
            />
          </button>
          <button
            type="button"
            onClick={() => setNoteOpen((o) => !o)}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Aggiungi nota"
          >
            <PencilLine className="h-3.5 w-3.5" />
          </button>
          {canEdit ? (
            <>
              <button
                type="button"
                onClick={onEdit}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Modifica"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label="Elimina"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Timeline entry
// ═══════════════════════════════════════════════════════════════════════

function TimelineEntry({
  entry,
  canWrite,
  onDeleteRiunione,
  onReopenTodo,
}: {
  entry: any;
  canWrite: boolean;
  onDeleteRiunione: (r: RiunioneView) => void;
  onReopenTodo: (id: string) => void;
}) {
  const ts = entry.ts as string;

  switch (entry.kind) {
    case 'todo_creato': {
      const t = entry.todo as TodoView;
      const meta = PRIORITA_META[t.priorita];
      return (
        <Row icon={<Plus className="h-3.5 w-3.5 text-muted-foreground" />} ts={ts}>
          <span className="text-muted-foreground">
            {t.created_by_nome ?? '—'} ha creato il TODO{' '}
          </span>
          <span className="font-medium">{t.titolo}</span>
          <Badge variant="outline" className={cn('ml-1.5 text-[9px]', meta.chip)}>
            {meta.label}
          </Badge>
        </Row>
      );
    }
    case 'todo_completato': {
      const t = entry.todo as TodoView;
      return (
        <Row
          icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
          ts={ts}
          actions={
            canWrite ? (
              <button
                type="button"
                onClick={() => onReopenTodo(t.id)}
                className="text-[10px] uppercase tracking-wider text-primary hover:underline"
              >
                Riapri
              </button>
            ) : null
          }
        >
          <span className="text-muted-foreground">
            {t.completato_da_nome ?? '—'} ha completato{' '}
          </span>
          <span className="line-through">{t.titolo}</span>
        </Row>
      );
    }
    case 'todo_annullato': {
      const t = entry.todo as TodoView;
      return (
        <Row icon={<X className="h-3.5 w-3.5 text-muted-foreground" />} ts={ts}>
          <span className="text-muted-foreground">TODO annullato:</span>{' '}
          <span className="line-through">{t.titolo}</span>
        </Row>
      );
    }
    case 'todo_nota': {
      const t = entry.todo as TodoView;
      const n = entry.nota as NotaView;
      return (
        <Row icon={<PencilLine className="h-3.5 w-3.5 text-muted-foreground" />} ts={ts}>
          <span className="text-muted-foreground">
            {n.author_nome ?? '—'} ha aggiunto una nota a{' '}
          </span>
          <span className="font-medium">{t.titolo}</span>
          <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
            {n.body}
          </p>
        </Row>
      );
    }
    case 'riunione': {
      const r = entry.riunione as RiunioneView;
      return (
        <RiunioneTimelineEntry
          r={r}
          ts={ts}
          canWrite={canWrite}
          onDelete={() => onDeleteRiunione(r)}
        />
      );
    }
    case 'stato': {
      const a = entry.audit as AuditView;
      const md = (a.metadata ?? {}) as { from_stato?: string; to_stato?: string };
      return (
        <Row icon={<CircleDot className="h-3.5 w-3.5 text-muted-foreground" />} ts={ts}>
          <span className="text-muted-foreground">
            {a.actor_nome ?? '—'} ha cambiato lo stato:{' '}
          </span>
          <span className="font-mono text-xs">
            {md.from_stato ?? '?'} → {md.to_stato ?? '?'}
          </span>
        </Row>
      );
    }
    case 'critica': {
      const a = entry.audit as AuditView;
      const md = (a.metadata ?? {}) as { is_critica?: boolean };
      return (
        <Row icon={<Flame className="h-3.5 w-3.5 text-destructive" />} ts={ts}>
          <span className="text-muted-foreground">
            {a.actor_nome ?? '—'} ha {md.is_critica ? 'marcato' : 'rimosso'} la
            commessa come <strong>critica</strong>.
          </span>
        </Row>
      );
    }
    case 'file': {
      const f = entry.file as FileView;
      const filename = f.filename ?? f.path?.split('/').pop() ?? f.id;
      return (
        <Row icon={<Plus className="h-3.5 w-3.5 text-muted-foreground" />} ts={ts}>
          <span className="text-muted-foreground">
            {f.uploader_nome ?? '—'} ha caricato{' '}
          </span>
          <span className="font-mono text-xs">{filename}</span>
          {f.momento ? (
            <span className="ml-1 text-[10px] uppercase text-muted-foreground">
              · {f.momento}
            </span>
          ) : null}
        </Row>
      );
    }
    default:
      return null;
  }
}

function RiunioneTimelineEntry({
  r,
  ts,
  canWrite,
  onDelete,
}: {
  r: RiunioneView;
  ts: string;
  canWrite: boolean;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const hasReport = !!(r.reportino?.trim());
  const previewText = hasReport
    ? r.reportino!
    : (r.corpo_libero || r.trascrizione || '');

  return (
    <div className="flex items-start gap-3 px-4 py-4 text-sm">
      <div className="mt-1 shrink-0">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => setExpanded((o) => !o)}
          className="flex w-full items-start gap-2 text-left"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[15px] font-semibold leading-snug">
                {r.titolo || `Riunione ${fmtData(r.data_riunione)}`}
              </span>
              {r.titolo ? (
                <span className="text-xs text-muted-foreground">
                  {fmtData(r.data_riunione)}
                </span>
              ) : null}
              {hasReport ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-primary">
                  <Sparkles className="h-2 w-2" />
                  AI
                </span>
              ) : null}
              {r.allegati.length > 0 ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-400">
                  {r.allegati.length} allegati
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {r.created_by_nome ?? '—'}
            </p>
          </div>
          <ChevronDown
            className={cn(
              'mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
              expanded && 'rotate-180',
            )}
          />
        </button>

        {expanded ? (
          <div className="mt-3 space-y-3 rounded-lg border border-border bg-muted/30 p-4">
            {hasReport ? (
              <div>
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
                  Report AI
                </p>
                <div className="whitespace-pre-wrap text-sm leading-relaxed">
                  {r.reportino}
                </div>
              </div>
            ) : (r.corpo_libero || r.trascrizione) ? (
              <div>
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Verbale
                </p>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                  {r.corpo_libero || r.trascrizione}
                </div>
              </div>
            ) : null}

            {r.allegati.length > 0 ? (
              <div>
                <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                  Allegati ({r.allegati.length})
                </p>
                <div className="grid grid-cols-6 gap-1 sm:grid-cols-8">
                  {r.allegati.slice(0, 8).map((al) => {
                    const isFoto =
                      al.kind === 'foto' || (al.mime ?? '').startsWith('image/');
                    return isFoto ? (
                      <a
                        key={al.id}
                        href={`/api/photo/${al.file_ref_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="aspect-square overflow-hidden rounded border border-border bg-card"
                        title={al.filename}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/photo/${al.file_ref_id}`}
                          alt={al.filename}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </a>
                    ) : (
                      <a
                        key={al.id}
                        href={
                          al.path
                            ? `/api/cloud/file?path=${encodeURIComponent(al.path)}`
                            : '#'
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        title={al.filename}
                        className="flex aspect-square items-center justify-center rounded border border-border bg-card text-muted-foreground"
                      >
                        <span className="font-mono text-[9px] font-bold">PDF</span>
                      </a>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {canWrite ? (
              <div className="border-t border-border pt-2">
                <button
                  type="button"
                  onClick={onDelete}
                  className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-destructive"
                >
                  Elimina riunione
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="shrink-0 text-right">
        <p className="font-mono text-xs text-muted-foreground">
          {fmtDataOra(ts)}
        </p>
      </div>
    </div>
  );
}

function Row({
  icon,
  ts,
  children,
  actions,
}: {
  icon: React.ReactNode;
  ts: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5 text-sm">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1 leading-snug">{children}</div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-xs text-muted-foreground">
          {fmtDataOra(ts)}
        </p>
        {actions ? <div className="mt-0.5">{actions}</div> : null}
      </div>
    </div>
  );
}

// ─── utils ─────────────────────────────────────────────────────────────

function fmtData(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('it-IT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
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
function fmtDataOra(iso: string): string {
  try {
    return new Date(iso).toLocaleString('it-IT', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
