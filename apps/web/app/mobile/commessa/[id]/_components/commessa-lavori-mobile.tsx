'use client';

import * as React from 'react';
import {
  CheckCircle2,
  CircleDot,
  Plus,
  Sparkles,
  User,
} from 'lucide-react';
import { Button, cn } from '@kommessa/ui';

import {
  CommessaTodoMobile,
  type TodoMobileRow,
} from './commessa-todo-mobile';
import {
  CommessaRiunioniMobile,
  type RiunioneMobileRow,
} from './commessa-riunioni-mobile';
import { CreaTodoDialog } from '../../../../office/commesse/[id]/lavori/_components/crea-todo-dialog';
import { CreaRiunioneDialog } from '../../../../office/commesse/[id]/lavori/_components/crea-riunione-dialog';

type Filtro =
  | 'tutto'
  | 'todo_aperti'
  | 'todo_miei'
  | 'todo_completati'
  | 'riunioni';

interface Props {
  commessaId: string;
  contestoCommessa: string;
  currentUserId: string;
  canWrite: boolean;
  todos: TodoMobileRow[];
  riunioni: RiunioneMobileRow[];
  tecniciTenant: Array<{ id: string; display_name: string | null }>;
}

/**
 * Container "Lavori" della pagina commessa mobile.
 *
 * Per admin/office: aggiunge i bottoni "Nuovo TODO" + "Nuova riunione"
 * e una barra filtri chip. Per tecnici: solo i filtri (read+complete).
 *
 * I dialog di creazione sono riusati direttamente da quelli office
 * (Radix Dialog responsive su mobile — funziona).
 */
export function CommessaLavoriMobile({
  commessaId,
  contestoCommessa,
  currentUserId,
  canWrite,
  todos,
  riunioni,
  tecniciTenant,
}: Props) {
  const [filtro, setFiltro] = React.useState<Filtro>('tutto');
  const [todoOpen, setTodoOpen] = React.useState(false);
  const [riunOpen, setRiunOpen] = React.useState(false);

  // ─── Conteggi (sempre calcolati su lista completa) ─────────────────
  const todosAperti = todos.filter(
    (t) => t.stato === 'aperto' || t.stato === 'in_corso',
  );
  const todosMiei = todosAperti.filter((t) => t.assegnato_a === currentUserId);
  const todosCompletati = todos.filter((t) => t.stato === 'completato');

  // ─── Filtraggio per la vista ───────────────────────────────────────
  let todosShown: TodoMobileRow[] = [];
  let mostraRiunioni = true;
  switch (filtro) {
    case 'tutto':
      todosShown = todosAperti;
      mostraRiunioni = true;
      break;
    case 'todo_aperti':
      todosShown = todosAperti;
      mostraRiunioni = false;
      break;
    case 'todo_miei':
      todosShown = todosMiei;
      mostraRiunioni = false;
      break;
    case 'todo_completati':
      todosShown = todosCompletati;
      mostraRiunioni = false;
      break;
    case 'riunioni':
      todosShown = [];
      mostraRiunioni = true;
      break;
  }

  const totale = todosAperti.length + riunioni.length;

  return (
    <div className="space-y-4">
      {/* Action bar — solo per admin/office */}
      {canWrite ? (
        <div className="-mx-1 grid grid-cols-2 gap-2">
          <Button
            onClick={() => setTodoOpen(true)}
            className="h-10 justify-center gap-1.5 text-[13px] font-semibold"
          >
            <Plus className="h-4 w-4" />
            TODO
          </Button>
          <Button
            variant="outline"
            onClick={() => setRiunOpen(true)}
            className="h-10 justify-center gap-1.5 border-primary/40 text-[13px] font-semibold text-primary"
          >
            <Sparkles className="h-4 w-4" />
            Riunione
          </Button>
        </div>
      ) : null}

      {/* Filtri chip — scrollabili orizzontalmente */}
      <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1">
        <FiltroChip
          label="Tutto"
          count={totale}
          active={filtro === 'tutto'}
          onClick={() => setFiltro('tutto')}
        />
        <FiltroChip
          label="A me"
          count={todosMiei.length}
          active={filtro === 'todo_miei'}
          onClick={() => setFiltro('todo_miei')}
          Icon={User}
          highlight={todosMiei.length > 0}
        />
        <FiltroChip
          label="TODO"
          count={todosAperti.length}
          active={filtro === 'todo_aperti'}
          onClick={() => setFiltro('todo_aperti')}
          Icon={CircleDot}
        />
        <FiltroChip
          label="Riunioni"
          count={riunioni.length}
          active={filtro === 'riunioni'}
          onClick={() => setFiltro('riunioni')}
          Icon={Sparkles}
        />
        <FiltroChip
          label="Fatti"
          count={todosCompletati.length}
          active={filtro === 'todo_completati'}
          onClick={() => setFiltro('todo_completati')}
          Icon={CheckCircle2}
          muted
        />
      </div>

      {/* TODO list */}
      {todosShown.length > 0 ? (
        <CommessaTodoMobile
          todos={todosShown}
          currentUserId={currentUserId}
        />
      ) : filtro !== 'riunioni' ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {filtro === 'todo_miei' ? (
            <p>Nessun TODO assegnato a te.</p>
          ) : filtro === 'todo_completati' ? (
            <p>Nessun TODO completato di recente.</p>
          ) : filtro === 'tutto' && riunioni.length === 0 ? (
            <p>
              Nessun lavoro tracciato.
              {canWrite ? ' Crea il primo dai bottoni sopra.' : ''}
            </p>
          ) : (
            <p>Nessun TODO aperto.</p>
          )}
        </div>
      ) : null}

      {/* Riunioni list */}
      {mostraRiunioni && riunioni.length > 0 ? (
        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 px-1 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
            <span
              className="inline-block h-1 w-1 rounded-full bg-primary"
              aria-hidden="true"
            />
            Riunioni ({riunioni.length})
          </h3>
          <CommessaRiunioniMobile riunioni={riunioni} />
        </section>
      ) : null}

      {/* Dialogs */}
      {todoOpen ? (
        <CreaTodoDialog
          commessaId={commessaId}
          tecniciTenant={tecniciTenant}
          onClose={() => setTodoOpen(false)}
        />
      ) : null}
      {riunOpen ? (
        <CreaRiunioneDialog
          commessaId={commessaId}
          contestoCommessa={contestoCommessa}
          tecniciTenant={tecniciTenant}
          onClose={() => setRiunOpen(false)}
        />
      ) : null}
    </div>
  );
}

function FiltroChip({
  label,
  count,
  active,
  onClick,
  Icon,
  highlight,
  muted,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  Icon?: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground shadow-md'
          : highlight
            ? 'border-primary/40 bg-primary/5 text-primary'
            : muted
              ? 'border-border bg-card text-muted-foreground'
              : 'border-border bg-card text-foreground hover:bg-muted',
      )}
    >
      {Icon ? <Icon className="h-3 w-3" /> : null}
      <span className="font-medium">{label}</span>
      <span
        className={cn(
          'rounded-full px-1.5 font-mono text-[10px] tabular-nums',
          active ? 'bg-primary-foreground/20' : 'bg-muted',
        )}
      >
        {count}
      </span>
    </button>
  );
}
