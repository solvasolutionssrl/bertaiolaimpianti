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
    // TODO eventi: creato sempre; completato/annullato se applicabile
    for (const t of todos) {
      all.push({ kind: 'todo_creato', ts: t.created_at, todo: t });
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
          return true;
        case 'todo':
          return (
            e.kind === 'todo_creato' ||
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

      {/* Sticky TODO aperti */}
      {todosAperti.length > 0 ? (
        <Card className="border-primary/30">
          <CardContent className="space-y-3 py-4">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <CircleDot className="h-3.5 w-3.5 text-primary" />
              TODO aperti
            </h2>
            <ul className="space-y-2">
              {todosAperti.map((t) => (
                <TodoRow
                  key={t.id}
                  todo={t}
                  isMine={t.assegnato_a === currentUserId}
                  notes={noteByTodo.get(t.id) ?? []}
                  canEdit={canWrite}
                  pending={pending}
                  onComplete={() => onComplete(t.id)}
                  onEdit={() => setTodoInEdit(t)}
                  onDelete={() => onDelete(t)}
                  onNoteAdded={() => router.refresh()}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
            <CircleDot className="h-7 w-7 text-muted-foreground" />
            <p className="text-sm font-medium">Nessun TODO aperto</p>
            <p className="text-xs text-muted-foreground">
              {canWrite
                ? 'Crea il primo TODO o avvia una riunione: il sistema può proporli automaticamente.'
                : 'Quando l\'ufficio aprirà delle attività compariranno qui.'}
            </p>
          </CardContent>
        </Card>
      )}

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
    <li
      className={cn(
        'group rounded-md border bg-card p-3 transition-colors',
        isMine && 'ring-2',
        isMine && meta.ring,
      )}
    >
      <div className="flex items-start gap-3">
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

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
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
            <div className="mt-2 space-y-2 rounded-md bg-muted/40 p-2">
              {todo.descrizione ? (
                <p className="whitespace-pre-wrap text-xs leading-relaxed">
                  {todo.descrizione}
                </p>
              ) : null}
              {notes.length > 0 ? (
                <ul className="space-y-1.5">
                  {notes.map((n) => (
                    <li key={n.id} className="text-xs">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {fmtDataBreve(n.created_at)}
                        {n.author_nome ? ` · ${n.author_nome}` : ''}
                      </span>
                      <p className="whitespace-pre-wrap">{n.body}</p>
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
    </li>
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
        <Row
          icon={<Sparkles className="h-3.5 w-3.5 text-primary" />}
          ts={ts}
          actions={
            canWrite ? (
              <button
                type="button"
                onClick={() => onDeleteRiunione(r)}
                className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-destructive"
              >
                Elimina
              </button>
            ) : null
          }
        >
          <div>
            <span className="text-muted-foreground">
              Riunione del {fmtData(r.data_riunione)}
              {r.created_by_nome ? ` · ${r.created_by_nome}` : ''}
            </span>
            {r.titolo ? (
              <p className="font-medium">{r.titolo}</p>
            ) : null}
            {r.reportino ? (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-primary hover:underline">
                  Mostra reportino
                </summary>
                <div className="mt-1 whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-xs leading-relaxed">
                  {r.reportino}
                </div>
              </details>
            ) : r.corpo_libero || r.trascrizione ? (
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                {(r.corpo_libero || r.trascrizione || '').slice(0, 240)}
              </p>
            ) : null}
          </div>
        </Row>
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
    <div className="flex items-start gap-3 p-3 text-sm">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">{children}</div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
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
