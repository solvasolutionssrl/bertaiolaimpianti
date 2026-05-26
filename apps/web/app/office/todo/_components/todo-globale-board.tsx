'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Circle,
  CircleDot,
  Filter,
  Flame,
  Loader2,
  Plus,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  cn,
} from '@kommessa/ui';

import {
  cambiaTodoStato,
} from '../../../_actions/commessa-todo';
import { useAlert } from '@/app/_components/confirm-provider';
import { CreaTodoGlobaleDialog } from './crea-todo-globale-dialog';

type Stato = 'aperto' | 'in_corso' | 'completato' | 'annullato';
type Priorita = 'bassa' | 'media' | 'alta' | 'urgente';

interface Row {
  id: string;
  titolo: string;
  descrizione: string | null;
  stato: Stato;
  priorita: Priorita;
  assegnato_a: string | null;
  assegnato_nome: string | null;
  scadenza_at: string | null;
  sort_order: number;
  metadata: Record<string, unknown> | null;
  commessa_id: string;
  codice_interno: string | null;
  cliente_nome: string | null;
  isScaduto: boolean;
  fonteRiunione: boolean;
}

interface Filtri {
  stato: string | null;
  priorita: Priorita | null;
  assegnato: string | null;
  commessa: string | null;
  q: string;
}

interface Props {
  todos: Row[];
  currentUserId: string;
  canWrite: boolean;
  tecnici: Array<{ id: string; display_name: string | null }>;
  commesseAttive: Array<{ id: string; codice_interno: string; nome_cartella: string }>;
  filtri: Filtri;
}

const PRIORITA_META: Record<
  Priorita,
  { label: string; chip: string; Icon: typeof Flame }
> = {
  urgente: {
    label: 'Urgente',
    chip: 'bg-red-500/15 text-red-700 border-red-500/40 dark:text-red-400',
    Icon: Flame,
  },
  alta: {
    label: 'Alta',
    chip: 'bg-amber-500/15 text-amber-700 border-amber-500/40 dark:text-amber-400',
    Icon: AlertCircle,
  },
  media: {
    label: 'Media',
    chip: 'bg-blue-500/15 text-blue-700 border-blue-500/40',
    Icon: Circle,
  },
  bassa: {
    label: 'Bassa',
    chip: 'bg-muted text-muted-foreground border-border',
    Icon: Circle,
  },
};

export function TodoGlobaleBoard({
  todos,
  currentUserId,
  canWrite,
  tecnici,
  commesseAttive,
  filtri,
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const showAlert = useAlert();
  const [pending, start] = React.useTransition();
  const [creaOpen, setCreaOpen] = React.useState(false);

  // Search input client-side (commit con debounce sul URL)
  const [qDraft, setQDraft] = React.useState(filtri.q);
  React.useEffect(() => {
    const id = setTimeout(() => {
      if (qDraft !== filtri.q) updateFiltro('q', qDraft || null);
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qDraft]);

  function updateFiltro(key: keyof Filtri, value: string | null) {
    const params = new URLSearchParams(sp?.toString() ?? '');
    if (value === null || value === '') params.delete(key);
    else params.set(key, value);
    router.push(`/office/todo?${params.toString()}`);
  }

  function clearAll() {
    router.push('/office/todo');
    setQDraft('');
  }

  const onComplete = (id: string) =>
    start(async () => {
      const res = await cambiaTodoStato({ id, stato: 'completato' });
      if (!res.ok) await showAlert({ title: 'Errore', body: res.error });
      router.refresh();
    });

  const activeFiltri =
    (filtri.stato ? 1 : 0) +
    (filtri.priorita ? 1 : 0) +
    (filtri.assegnato ? 1 : 0) +
    (filtri.commessa ? 1 : 0) +
    (filtri.q ? 1 : 0);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr] lg:gap-5">
      {/* ─── SIDEBAR FILTRI (sticky desktop) ─────────────────────── */}
      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        {canWrite ? (
          <Button onClick={() => setCreaOpen(true)} className="w-full">
            <Plus className="h-3.5 w-3.5" />
            Nuovo task
          </Button>
        ) : null}

        <FiltroGroup label="Stato">
          <FiltroRadio
            label="Aperti + in corso"
            active={!filtri.stato}
            onClick={() => updateFiltro('stato', null)}
          />
          <FiltroRadio
            label="Solo aperti"
            active={filtri.stato === 'aperto'}
            onClick={() => updateFiltro('stato', 'aperto')}
          />
          <FiltroRadio
            label="In corso"
            active={filtri.stato === 'in_corso'}
            onClick={() => updateFiltro('stato', 'in_corso')}
          />
          <FiltroRadio
            label="Completati"
            active={filtri.stato === 'completato'}
            onClick={() => updateFiltro('stato', 'completato')}
          />
        </FiltroGroup>

        <FiltroGroup label="Priorità">
          <FiltroRadio
            label="Tutte"
            active={!filtri.priorita}
            onClick={() => updateFiltro('priorita', null)}
          />
          {(['urgente', 'alta', 'media', 'bassa'] as const).map((p) => {
            const Icon = PRIORITA_META[p].Icon;
            return (
              <FiltroRadio
                key={p}
                label={PRIORITA_META[p].label}
                icon={<Icon className="h-3 w-3" />}
                active={filtri.priorita === p}
                onClick={() => updateFiltro('priorita', p)}
              />
            );
          })}
        </FiltroGroup>

        <FiltroGroup label="Commessa">
          <select
            value={filtri.commessa ?? ''}
            onChange={(e) => updateFiltro('commessa', e.target.value || null)}
            className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs"
          >
            <option value="">Tutte</option>
            {commesseAttive.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codice_interno} — {c.nome_cartella.slice(0, 30)}
              </option>
            ))}
          </select>
        </FiltroGroup>

        <FiltroGroup label="Assegnato">
          <select
            value={filtri.assegnato ?? ''}
            onChange={(e) => updateFiltro('assegnato', e.target.value || null)}
            className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs"
          >
            <option value="">Chiunque</option>
            <option value="nessuno">Non assegnato</option>
            <option value={currentUserId}>A me</option>
            {tecnici
              .filter((t) => t.id !== currentUserId)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.display_name ?? t.id.slice(0, 8)}
                </option>
              ))}
          </select>
        </FiltroGroup>

        {activeFiltri > 0 ? (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-border bg-card px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3 w-3" />
            Reset filtri ({activeFiltri})
          </button>
        ) : null}
      </aside>

      {/* ─── MAIN CONTENT ────────────────────────────────────────── */}
      <div className="min-w-0 space-y-3">
        <div className="relative">
          <Filter className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            placeholder="Cerca nel titolo o descrizione task…"
            className="pl-9"
          />
        </div>

        {todos.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 opacity-40" />
              <p className="font-medium">Nessun task con questi filtri.</p>
              {activeFiltri > 0 ? (
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Rimuovi tutti i filtri
                </button>
              ) : (
                <p>Crea il primo dal pulsante &quot;Nuovo task&quot;.</p>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {todos.map((t) => (
                <TodoRow
                  key={t.id}
                  row={t}
                  isMine={t.assegnato_a === currentUserId}
                  pending={pending}
                  onComplete={() => onComplete(t.id)}
                />
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {creaOpen ? (
        <CreaTodoGlobaleDialog
          commesseAttive={commesseAttive}
          tecnici={tecnici}
          onClose={() => setCreaOpen(false)}
        />
      ) : null}
    </div>
  );
}

function FiltroGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function FiltroRadio({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-xs transition-colors',
        active
          ? 'border-primary/40 bg-primary/10 text-primary font-semibold'
          : 'border-transparent bg-transparent text-foreground hover:bg-muted',
      )}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span className="truncate">{label}</span>
    </button>
  );
}

// ─── Sub components ───────────────────────────────────────────────────

function TodoRow({
  row,
  isMine,
  pending,
  onComplete,
}: {
  row: Row;
  isMine: boolean;
  pending: boolean;
  onComplete: () => void;
}) {
  const meta = PRIORITA_META[row.priorita];
  const Icon = meta.Icon;
  const completed = row.stato === 'completato' || row.stato === 'annullato';

  return (
    <div className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30">
      {!completed ? (
        <button
          type="button"
          onClick={onComplete}
          disabled={pending}
          aria-label="Completa TODO"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-emerald-500/10 hover:text-emerald-600 disabled:opacity-50"
        >
          <Circle className="h-4 w-4" />
        </button>
      ) : (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
      )}

      <Link
        href={`/office/commesse/${row.commessa_id}/lavori`}
        className="min-w-0 flex-1"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Icon className={cn('h-3.5 w-3.5 shrink-0', meta.chip.split(' ')[1])} />
          <p
            className={cn(
              'flex-1 truncate text-sm font-medium',
              completed && 'text-muted-foreground line-through',
            )}
          >
            {row.titolo}
          </p>
          <Badge
            variant="outline"
            className={cn('text-[10px] uppercase tracking-wide', meta.chip)}
          >
            {meta.label}
          </Badge>
          {row.stato === 'in_corso' ? (
            <Badge variant="outline" className="text-[10px] uppercase">
              In corso
            </Badge>
          ) : null}
          {row.fonteRiunione ? (
            <Badge
              variant="outline"
              className="border-primary/30 bg-primary/5 text-[10px] uppercase text-primary"
              title="TODO generato dal report di una riunione"
            >
              <Sparkles className="mr-0.5 h-2.5 w-2.5" />
              Da riunione
            </Badge>
          ) : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          {row.codice_interno ? (
            <span className="font-mono">{row.codice_interno}</span>
          ) : null}
          {row.cliente_nome ? <span>· {row.cliente_nome}</span> : null}
          {row.assegnato_nome ? (
            <span className={isMine ? 'text-primary' : ''}>
              <User className="mr-0.5 inline h-3 w-3" />
              {isMine ? 'Tu' : row.assegnato_nome}
            </span>
          ) : (
            <span className="italic">Non assegnato</span>
          )}
          {row.scadenza_at ? (
            <span className={row.isScaduto ? 'font-semibold text-destructive' : ''}>
              <Calendar className="mr-0.5 inline h-3 w-3" />
              {fmtDataBreve(row.scadenza_at)}
            </span>
          ) : null}
        </div>
      </Link>
      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </div>
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

void Loader2;
void CircleDot;
